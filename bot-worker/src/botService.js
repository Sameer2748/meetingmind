const puppeteer = require('puppeteer-extra');
require('dotenv').config();
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const storageService = require('./services/storageService');
const transcriptionService = require('./services/transcriptionService');
const dbService = require('./services/dbService');
const mm = require('music-metadata');
const IORedis = require('ioredis');

// Setup Redis for Status
const redisOptions = process.env.REDIS_URL || {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
};

const tlsConfig = (typeof redisOptions === 'string' && redisOptions.startsWith('rediss://')) ? { tls: {} } : {};

const redis = new IORedis(redisOptions, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...tlsConfig
});

puppeteer.use(StealthPlugin());

class BotService {
    constructor() {
        this.activeBots = new Map();
        this.sessionsDir = path.resolve(process.cwd(), 'bot_sessions');
        if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // joinMeeting
    // FIX: botName default is hardcoded here — never pass meeting URL/code as name
    // ─────────────────────────────────────────────────────────────────────────
    async joinMeeting(meetingUrl, botName = 'MeetingMind Notetaker', userEmail = 'anonymous') {
        // SAFETY: If whatever was passed as botName looks like a URL or meeting code, override it
        if (!botName || botName.includes('meet.google.com') || botName.includes('http') || /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(botName)) {
            console.warn(`[BotService] [WARN] Invalid botName detected ("${botName}"). Overriding with default.`);
            botName = 'MeetingMind Notetaker';
        }

        process.env.PUPPETEER_DISABLE_HEADLESS_WARNING = 'true';
        console.log(`[BotService] Launching bot for: ${meetingUrl} | Name: "${botName}" | User: ${userEmail}`);

        // Fresh session dir every time — prevents Google profile fingerprinting
        const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        const userDataDir = path.join(process.cwd(), 'bot_chrome_data');
        if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

        try {
            const browser = await puppeteer.launch({
                executablePath: fs.existsSync(chromePath) ? chromePath : (process.env.PUPPETEER_EXECUTABLE_PATH || null),
                headless: false,
                userDataDir: userDataDir,
                ignoreDefaultArgs: ['--enable-automation'],
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--window-size=1280,720',
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                    '--mute-audio',
                    '--disable-default-apps',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--password-store=basic',
                    '--use-mock-keychain',
                    '--lang=en-US,en',
                    // NOTE: do NOT add --disable-web-security or --disable-features=IsolateOrigins
                    // They cause a completely black screen on Google Meet
                ]
            });

            const page = (await browser.pages())[0];

            // Pipe browser console to backend
            page.on('console', msg => {
                const text = msg.text();
                if (text.includes('[Bot')) console.log(`[Bot-Browser] ${text}`);
            });

            page.on('pageerror', err => {
                // Silence noisy minified Meet errors that are not actionable
                const msg = err.message || '';
                if (msg.includes('_.') || msg.includes('Error') || msg.includes('Illegal invocation')) return;
                console.error(`[Bot-PageError] ${err.message}`);
            });

            await page.setUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            );

            // ── LOAD COOKIES IF PRESENT ──────────────────────────────────────
            const cookiePath = path.join(process.cwd(), 'google_cookies.json');
            if (fs.existsSync(cookiePath)) {
                try {
                    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
                    await page.setCookie(...cookies);
                    console.log(`[BotService] [AUTH] Loaded cookies from ${cookiePath}`);
                } catch (e) {
                    console.error(`[BotService] [WARN] Failed to load cookies:`, e.message);
                }
            }

            // Deep stealth masking
            await page.evaluateOnNewDocument(() => {
                // Hide webdriver flag
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                // Fake plugins (empty = headless signal)
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

                // Fake languages
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

                // Mock chrome object (missing in headless)
                window.chrome = {
                    runtime: {},
                    loadTimes: function () { },
                    csi: function () { },
                    app: {}
                };

                // NOTE: Do NOT override navigator.permissions.query
                // It causes "Illegal invocation" errors that crash Meet's audio engine

                // Remove CDP artifact keys
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            });

            // Setup recording paths
            const recordingId = Date.now();
            const recordingsDir = path.resolve(process.cwd(), 'recordings', userEmail);
            const recordingPath = path.join(recordingsDir, `meeting-${recordingId}.webm`);
            if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

            const fileStream = fs.createWriteStream(recordingPath);

            await page.exposeFunction('sendAudioChunk', (base64) => {
                const bot = this.activeBots.get(meetingUrl);
                if (!base64 || !bot) return;
                const buffer = Buffer.from(base64, 'base64');
                if (buffer.length > 0) {
                    fileStream.write(buffer);
                    bot.chunksReceived++;
                    if (bot.chunksReceived % 5 === 0) {
                        console.log(`[BotService] [REC] ${bot.chunksReceived} chunks received for ${recordingPath.split('/').pop()}`);
                    }
                }
            });

            // Register bot early so STOP signals are caught during join phase
            this.activeBots.set(meetingUrl, {
                browser,
                page,
                fileStream,
                recordingPath,
                userEmail,
                userDataDir,
                isPersistent: userDataDir.includes('bot_chrome_data'),
                status: 'joining',
                stopSignal: false,
                chunksReceived: 0,
                startTime: null,
            });

            console.log(`[BotService] Navigating to meeting...`);
            // networkidle2 ensures Meet's JS fully loads — domcontentloaded is too early
            // and causes the black screen you see in the browser
            await page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for Meet to finish rendering after network settles
            await new Promise(r => setTimeout(r, 2500));
            await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 200);
            await new Promise(r => setTimeout(r, 500));

            let blockCount = 0;
            let hasTypedName = false;
            let hasClickedJoin = false;
            let joinAttempted = false;
            let lobbyRetryCount = 0;

            // ─────────────────────────────────────────────────────────────────
            // MAIN JOIN LOOP
            // ─────────────────────────────────────────────────────────────────
            for (let i = 0; i < 40; i++) {
                // Check for stop signal on every iteration
                const currentBot = this.activeBots.get(meetingUrl);
                if (!currentBot || currentBot.stopSignal) {
                    console.log(`[BotService] Join loop aborted: ${currentBot ? 'STOP signal' : 'Bot cleared'}`);
                    await this.stopMeeting(meetingUrl);
                    return;
                }

                // ── Detect current page state ──────────────────────────────
                const state = await page.evaluate(() => {
                    const url = window.location.href;

                    // Redirected away from Meet entirely
                    if (!url.includes('meet.google.com')) return 'WRONG_PAGE';

                    // Already inside the call
                    if (document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]')) return 'IN_MEETING';

                    const txt = document.body.innerText;

                    // Page still loading (blank or tiny content)
                    if (document.title === '' || txt.trim().length < 50) return 'LOADING';

                    // True block: explicit error text with no lobby UI
                    const hasInput = !!document.querySelector('input');
                    const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                    const hasJoinBtn = allBtns.some(b => {
                        const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                        const isJoin = lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                        if (!isJoin) return false;
                        const rect = b.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(b).display !== 'none';
                    });

                    if (
                        (txt.includes("You can't join this video call") || txt.includes('Invalid video call name'))
                        && !hasInput && !hasJoinBtn
                    ) return 'BLOCKED';

                    // Login wall
                    if (txt.includes('Sign in') && !hasInput) return 'NEEDS_LOGIN';

                    // Lobby with join button — READY to click
                    if (hasJoinBtn) return 'READY';

                    // Admit lobby: we clicked join and are waiting for host
                    const lower = txt.toLowerCase();
                    if (
                        lower.includes("let in soon") ||
                        lower.includes('waiting for the host') ||
                        lower.includes('someone will let you in') ||
                        lower.includes('waiting to be let in') ||
                        lower.includes('asking to join') ||
                        lower.includes('about to join') ||
                        lower.includes('joining...')
                    ) return 'WAITING_ADMIT';

                    return 'WAITING';
                });

                console.log(`[BotService] [STATE] ${state} (Attempt ${i + 1}/40)`);

                // ── IN_MEETING ─────────────────────────────────────────────
                if (state === 'IN_MEETING') {
                    console.log(`[BotService] [SUCCESS] In meeting! Starting recorder.`);
                    break;
                }

                // ── WAITING_ADMIT ──────────────────────────────────────────
                if (state === 'WAITING_ADMIT') {
                    this.updateBotStatus(meetingUrl, 'waiting_admit');
                    console.log(`[BotService] [WAIT] Waiting for host to admit... (${i + 1}/40)`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }

                // ── BLOCKED ────────────────────────────────────────────────
                if (state === 'BLOCKED') {
                    // If we already clicked join, DON'T reload — just wait
                    if (joinAttempted) {
                        console.log(`[BotService] [WAIT] Post-join block screen — not reloading, waiting...`);
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    blockCount++;
                    const delay = Math.min(1500 * blockCount, 6000);
                    console.log(`[BotService] [RETRY] Block #${blockCount} — reloading in ${Math.round(delay / 1000)}s...`);
                    await new Promise(r => setTimeout(r, delay));
                    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
                    await new Promise(r => setTimeout(r, 1500));
                    hasTypedName = false;
                    hasClickedJoin = false;
                    joinAttempted = false;
                    continue;
                }

                // ── LOADING ────────────────────────────────────────────────
                if (state === 'LOADING') {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                // ── WRONG_PAGE ─────────────────────────────────────────────
                if (state === 'WRONG_PAGE') {
                    console.log(`[BotService] [REDIRECT] Off Meet — re-navigating...`);
                    await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 800));
                    hasTypedName = false;
                    hasClickedJoin = false;
                    joinAttempted = false;
                    blockCount = 0;
                    continue;
                }

                // ── NEEDS_LOGIN ────────────────────────────────────────────
                if (state === 'NEEDS_LOGIN') {
                    console.log(`[BotService] [WARN] Google sign-in wall detected. Bot cannot proceed without auth.`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }

                // ── READY — Lobby visible, fill in and click join ──────────
                if (state === 'READY') {
                    console.log(`[BotService] Lobby ready.`);
                    blockCount = 0;

                    // Give Meet UI a moment to fully settle
                    await new Promise(r => setTimeout(r, 1000));

                    // Dismiss "Got it" / cookie popups if present
                    try {
                        const gotIt = await page.$x('//button[contains(., "Got it") or contains(., "Accept") or contains(., "Dismiss")]');
                        if (gotIt.length > 0) {
                            await gotIt[0].click();
                            await new Promise(r => setTimeout(r, 400));
                        }
                    } catch (e) { }

                    // Turn off camera + mic in lobby (so bot joins muted/no-cam)
                    try {
                        await page.evaluate(() => {
                            // Camera off
                            const camBtns = Array.from(document.querySelectorAll(
                                '[aria-label*="camera" i], [aria-label*="video" i], [data-tooltip*="camera" i]'
                            ));
                            const camBtn = camBtns.find(b =>
                                (b.tagName === 'BUTTON' || b.getAttribute('role') === 'button') &&
                                !b.getAttribute('aria-label')?.toLowerCase().includes('turn on')
                            );
                            if (camBtn) camBtn.click();

                            // Mic off
                            const micBtns = Array.from(document.querySelectorAll(
                                '[aria-label*="microphone" i], [aria-label*="mic" i], [data-tooltip*="microphone" i]'
                            ));
                            const micBtn = micBtns.find(b =>
                                (b.tagName === 'BUTTON' || b.getAttribute('role') === 'button') &&
                                !b.getAttribute('aria-label')?.toLowerCase().includes('turn on')
                            );
                            if (micBtn) micBtn.click();
                        });
                        console.log(`[BotService] Camera + Mic turned OFF.`);
                    } catch (e) { }

                    // ── STEP 1: Type bot name (once per page load) ─────────
                    if (!hasTypedName) {
                        try {
                            // Get a proper element handle (not just evaluate)
                            const inputHandle = await page.evaluateHandle(() => {
                                const candidates = Array.from(document.querySelectorAll(
                                    'input[aria-label*="name" i], input[placeholder*="name" i], input[type="text"]'
                                ));
                                return candidates.find(el => {
                                    const rect = el.getBoundingClientRect();
                                    return rect.width > 0 && rect.height > 0 &&
                                        window.getComputedStyle(el).display !== 'none';
                                }) || null;
                            });

                            const inputEl = inputHandle.asElement();
                            if (inputEl) {
                                // Clear existing value fully
                                await inputEl.click({ clickCount: 3 });
                                await new Promise(r => setTimeout(r, 150));
                                await page.keyboard.down('Control');
                                await page.keyboard.press('A');
                                await page.keyboard.up('Control');
                                await page.keyboard.press('Backspace');
                                await new Promise(r => setTimeout(r, 200));

                                // Type with human-like speed
                                await inputEl.type(botName, { delay: 45 });
                                hasTypedName = true;
                                console.log(`[BotService] Name typed: "${botName}"`);

                                // Wait for Meet to validate name & enable the join button
                                await new Promise(r => setTimeout(r, 1800));
                            } else {
                                console.log(`[BotService] [WARN] No name input found — may already be signed in.`);
                                hasTypedName = true; // Skip typing, try clicking join anyway
                            }
                        } catch (e) {
                            console.error(`[BotService] [ERROR] Name typing failed:`, e.message);
                            hasTypedName = true; // Don't get stuck — try join anyway
                        }
                    }

                    // ── STEP 2: Click join button (once per page load) ─────
                    if (!hasClickedJoin) {
                        if (lobbyRetryCount >= 5) {
                            console.log(`[BotService] [GIVE UP] Too many lobby retries. Stopping.`);
                            await this.stopMeeting(meetingUrl);
                            return;
                        }

                        let clicked = false;

                        // Strategy 1: evaluateHandle → native Puppeteer click (most reliable)
                        // This is MUCH better than .evaluate(() => btn.click()) which React ignores
                        try {
                            const btnHandle = await page.evaluateHandle(() => {
                                const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                                return allBtns.find(b => {
                                    const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                                    const isJoin = lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                                    if (!isJoin) return false;
                                    const rect = b.getBoundingClientRect();
                                    return rect.width > 0 && rect.height > 0 &&
                                        window.getComputedStyle(b).display !== 'none';
                                }) || null;
                            });

                            const btnEl = btnHandle.asElement();
                            if (btnEl) {
                                await btnEl.hover();
                                await new Promise(r => setTimeout(r, 200));
                                await btnEl.click();
                                clicked = true;
                                console.log(`[BotService] Clicked join button via native Puppeteer click.`);
                            }
                        } catch (e) { }

                        // Strategy 2: XPath native click
                        if (!clicked) {
                            const xpaths = [
                                '//button[contains(., "Ask to join")]',
                                '//button[contains(., "Join now")]',
                                '//button[contains(., "Join meeting")]',
                                '//div[@role="button"][contains(., "Ask to join")]',
                                '//div[@role="button"][contains(., "Join now")]',
                            ];
                            for (const xpath of xpaths) {
                                try {
                                    const [btn] = await page.$x(xpath);
                                    if (btn) {
                                        const box = await btn.boundingBox();
                                        if (box) {
                                            await btn.hover();
                                            await new Promise(r => setTimeout(r, 200));
                                            await btn.click();
                                            clicked = true;
                                            console.log(`[BotService] Clicked join via XPath: ${xpath}`);
                                            break;
                                        }
                                    }
                                } catch (e) { }
                            }
                        }

                        // Strategy 3: Tab to button + Enter (keyboard navigation)
                        if (!clicked) {
                            try {
                                await page.keyboard.press('Tab');
                                await new Promise(r => setTimeout(r, 300));
                                await page.keyboard.press('Tab');
                                await new Promise(r => setTimeout(r, 300));
                                await page.keyboard.press('Enter');
                                clicked = true;
                                console.log(`[BotService] Clicked join via Tab+Enter keyboard nav.`);
                            } catch (e) { }
                        }

                        // Strategy 4: Plain Enter (last resort)
                        if (!clicked) {
                            await page.keyboard.press('Enter');
                            clicked = true;
                            console.log(`[BotService] Fallback: pressed Enter.`);
                        }

                        hasClickedJoin = true;
                        joinAttempted = true;

                        // Let the page react to the click
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    // ── STEP 3: Admission wait loop (up to 90s) ────────────
                    console.log(`[BotService] [ADMIT] Waiting for admission (up to 90s)...`);
                    const admitStart = Date.now();
                    let admitted = false;
                    let shouldBreakOuter = false;

                    while (Date.now() - admitStart < 90000) {
                        await new Promise(r => setTimeout(r, 2000));

                        // Check stop signal inside admit loop too
                        const botCheck = this.activeBots.get(meetingUrl);
                        if (!botCheck || botCheck.stopSignal) {
                            await this.stopMeeting(meetingUrl);
                            return;
                        }

                        const admitState = await page.evaluate(() => {
                            if (!window.location.href.includes('meet.google.com')) return 'WRONG_PAGE';
                            if (document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]')) return 'IN_MEETING';

                            const txt = document.body.innerText;
                            const lower = txt.toLowerCase();

                            // Confirmed denial or session errors
                            if (
                                lower.includes("you can't join this video call") ||
                                lower.includes('return to home screen') ||
                                lower.includes('returning to home screen') ||
                                lower.includes('credentials might have changed') ||
                                lower.includes('sign-in credentials')
                            ) return 'DENIED';

                            // Lobby join button reappeared (denied or timeout)
                            const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                            const lobbyBack = allBtns.some(b => {
                                const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                                const isJoin = lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                                if (!isJoin) return false;
                                const rect = b.getBoundingClientRect();
                                return rect.width > 0 && rect.height > 0;
                            });
                            if (lobbyBack) return 'LOBBY';

                            // Still waiting for host
                            if (
                                lower.includes('let in soon') ||
                                lower.includes('waiting for the host') ||
                                lower.includes('let you in') ||
                                lower.includes('waiting to be let in') ||
                                lower.includes('asking to join')
                            ) return 'WAITING_ADMIT';

                            return 'WAITING';
                        });

                        const elapsed = Math.round((Date.now() - admitStart) / 1000);

                        if (admitState === 'IN_MEETING') {
                            console.log(`[BotService] [SUCCESS] Admitted after ${elapsed}s!`);
                            admitted = true;
                            break;
                        }

                        if (admitState === 'LOBBY') {
                            // Lobby reappeared — could be denied or re-request needed
                            lobbyRetryCount++;
                            console.log(`[BotService] [RETRY] Lobby reappeared (#${lobbyRetryCount}) after ${elapsed}s. Will re-click...`);
                            await new Promise(r => setTimeout(r, 2000));
                            hasClickedJoin = false; // allow re-click on next outer loop iteration
                            break;
                        }

                        if (admitState === 'DENIED') {
                            // Double-check it's a real denial (not a flash during transition)
                            await new Promise(r => setTimeout(r, 1500));
                            const recheck = await page.evaluate(() =>
                                document.body.innerText.includes("You can't join") ||
                                document.body.innerText.includes('Return to home screen')
                            );
                            if (recheck) {
                                console.log(`[BotService] [DENIED] Host denied or meeting ended. Re-navigating...`);
                                await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                                await new Promise(r => setTimeout(r, 800));
                                hasTypedName = false;
                                hasClickedJoin = false;
                                joinAttempted = false;
                                blockCount = 0;
                                break;
                            }
                            // Was a false alarm — keep waiting
                            continue;
                        }

                        if (admitState === 'WRONG_PAGE') {
                            console.log(`[BotService] [REDIRECT] Redirected during admission. Re-navigating...`);
                            await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await new Promise(r => setTimeout(r, 800));
                            hasTypedName = false;
                            hasClickedJoin = false;
                            joinAttempted = false;
                            blockCount = 0;
                            break;
                        }

                        // WAITING or WAITING_ADMIT — just log occasionally
                        if (elapsed % 10 < 2) {
                            console.log(`[BotService] [ADMIT] Still waiting... ${elapsed}s elapsed`);
                        }
                    }

                    if (admitted) break; // Exit outer loop — we're in!

                    // 90s timeout — reload and start fresh
                    if (!admitted && Date.now() - admitStart >= 90000) {
                        console.log(`[BotService] [TIMEOUT] 90s admission timeout. Reloading...`);
                        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                        await new Promise(r => setTimeout(r, 800));
                        hasTypedName = false;
                        hasClickedJoin = false;
                        joinAttempted = false;
                        blockCount = 0;
                    }

                    continue;
                }

                // ── WAITING (generic) ──────────────────────────────────────
                console.log(`[BotService] [WAIT] Page loading... (${state})`);
                await new Promise(r => setTimeout(r, 2000));
            }

            // Start recording handler
            this.handleRecording(page, meetingUrl);

        } catch (err) {
            console.error('[BotService] [ERROR] joinMeeting crashed:', err.message);
            await this.stopMeeting(meetingUrl);
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // handleRecording
    // ─────────────────────────────────────────────────────────────────────────
    async handleRecording(page, meetingUrl) {
        try {
            await page.waitForSelector(
                '[aria-label="Leave call"], [aria-label="Leave meeting"]',
                { timeout: 600000 }
            );
            console.log('[BotService] [SUCCESS] Recording active.');
            this.updateBotStatus(meetingUrl, 'recording');

            // Track start time for duration fallback
            const bot = this.activeBots.get(meetingUrl);
            if (bot) bot.startTime = Date.now();

            // Expose meeting-end callback (guard against double-expose)
            try {
                await page.exposeFunction('onMeetingEnd', async () => {
                    console.log(`[BotService] [END] Meeting ended. Cleaning up...`);
                    await this.stopMeeting(meetingUrl);
                });
            } catch (e) { /* already exposed — ignore */ }

            // Inject recording UI + audio capture
            await page.evaluate(() => {
                // ── Recording UI overlay ───────────────────────────────────
                const ui = document.createElement('div');
                Object.assign(ui.style, {
                    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                    background: '#f1efd8', zIndex: '99999', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                    fontFamily: 'sans-serif', color: '#01114f', pointerEvents: 'none'
                });

                const card = document.createElement('div');
                Object.assign(card.style, {
                    background: '#ffffff', padding: '60px', borderRadius: '40px',
                    border: '1px solid #d4d2bb', textAlign: 'center'
                });

                const logoBox = document.createElement('div');
                Object.assign(logoBox.style, {
                    width: '100px', height: '100px', background: '#e07155',
                    borderRadius: '28px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', marginBottom: '28px',
                    boxShadow: '0 20px 40px rgba(224,113,85,0.3)', margin: '0 auto 28px'
                });
                logoBox.textContent = '🤖';
                logoBox.style.fontSize = '52px';
                card.appendChild(logoBox);

                const title = document.createElement('h1');
                title.textContent = 'MeetingMind AI Notetaker';
                Object.assign(title.style, {
                    fontSize: '32px', fontWeight: '900', margin: '0 0 8px',
                    color: '#01114f', letterSpacing: '-0.5px'
                });
                card.appendChild(title);

                const sub = document.createElement('p');
                sub.textContent = 'Capturing and recording high-fidelity audio...';
                Object.assign(sub.style, { color: '#01114f', opacity: '0.6', fontSize: '15px', margin: '0 0 32px' });
                card.appendChild(sub);

                const badge = document.createElement('div');
                Object.assign(badge.style, {
                    display: 'inline-flex', gap: '10px', alignItems: 'center',
                    background: 'rgba(224,113,85,0.1)', padding: '10px 24px',
                    borderRadius: '100px', border: '1px solid rgba(224,113,85,0.25)'
                });
                const dot = document.createElement('div');
                Object.assign(dot.style, { width: '10px', height: '10px', background: '#e07155', borderRadius: '50%' });
                const lbl = document.createElement('span');
                lbl.textContent = 'LIVE RECORDING';
                Object.assign(lbl.style, { color: '#e07155', fontWeight: 'bold', letterSpacing: '1px', fontSize: '13px' });
                badge.appendChild(dot);
                badge.appendChild(lbl);
                card.appendChild(badge);
                ui.appendChild(card);
                document.body.appendChild(ui);

                // ── Audio capture engine ───────────────────────────────────
                const ctx = new (window.AudioContext || window.webkitAudioContext)();

                // Keep AudioContext alive with silent oscillator
                const silence = ctx.createOscillator();
                const gain = ctx.createGain();
                gain.gain.value = 0;
                silence.connect(gain);
                gain.connect(ctx.destination);
                silence.start();

                const dest = ctx.createMediaStreamDestination();
                console.log('[Bot-Setup] Audio capture engine starting...');

                const linkedSources = new WeakSet();

                const linkAudio = () => {
                    if (ctx.state === 'suspended') ctx.resume();
                    Array.from(document.querySelectorAll('audio, video')).forEach(el => {
                        if (linkedSources.has(el)) return;
                        try {
                            const stream = el.srcObject || el.captureStream?.();
                            if (stream && stream.getAudioTracks().length > 0) {
                                ctx.createMediaStreamSource(stream).connect(dest);
                                linkedSources.add(el);
                                console.log('[Bot-Audio] Linked participant:', el.tagName);
                            }
                        } catch (e) { }
                    });
                };

                setInterval(linkAudio, 2000);
                linkAudio(); // run immediately too

                const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
                rec.ondataavailable = e => {
                    if (e.data.size > 0) {
                        const r = new FileReader();
                        r.onload = () => window.sendAudioChunk(r.result.split(',')[1]);
                        r.readAsDataURL(e.data);
                    }
                };
                rec.start(1000);
                console.log('[Bot-Status] MediaRecorder started');

                // ── Auto-stop detection ────────────────────────────────────
                let aloneTicks = 0;
                setInterval(() => {
                    const hasLeaveBtn = !!document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]');
                    const leftScreen =
                        document.body.innerText.includes('You left') ||
                        document.body.innerText.includes('rejoin') ||
                        document.body.innerText.includes('home screen');

                    const tiles = document.querySelectorAll('[data-participant-id], [data-initial-participant-id]').length;
                    const videos = document.querySelectorAll('video').length;
                    const participants = Math.max(tiles, videos);

                    if (!hasLeaveBtn || leftScreen) {
                        console.log('[Bot-Status] [END] Meeting ended or left screen detected.');
                        window.onMeetingEnd();
                    } else if (participants <= 1) {
                        aloneTicks++;
                        if (aloneTicks > 6) {
                            console.log('[Bot-Status] [END] Bot alone for 30s. Stopping.');
                            window.onMeetingEnd();
                        }
                    } else {
                        aloneTicks = 0;
                    }
                }, 5000);
            });

        } catch (err) {
            console.error('[BotService] [ERROR] handleRecording crashed:', err.message);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // stopMeeting
    // ─────────────────────────────────────────────────────────────────────────
    async stopMeeting(meetingUrl) {
        const bot = this.activeBots.get(meetingUrl);
        if (!bot) return;

        // Prevent duplicate stop calls
        if (bot.status === 'stopping') return;
        bot.status = 'stopping';
        bot.stopSignal = true;

        this.updateBotStatus(meetingUrl, 'saving');

        const { fileStream, recordingPath, userEmail, browser, userDataDir, isPersistent, page } = bot;

        if (fileStream) {
            fileStream.end();

            if (bot.chunksReceived > 0) {
                console.log(`[BotService] Recording finalized: ${recordingPath} (${bot.chunksReceived} chunks)`);

                (async () => {
                    try {
                        // 1. Duration
                        let duration = 0;
                        try {
                            const meta = await mm.parseFile(recordingPath);
                            duration = Math.round(meta.format.duration || 0);
                            if (duration <= 0 && bot.startTime) {
                                duration = Math.round((Date.now() - bot.startTime) / 1000);
                            }
                        } catch (e) {
                            if (bot.startTime) duration = Math.round((Date.now() - bot.startTime) / 1000);
                        }
                        console.log(`[BotService] Duration: ${duration}s`);

                        // 2. Save initial DB record
                        const recordingId = await dbService.saveRecording({
                            meeting_url: meetingUrl,
                            user_email: userEmail,
                            file_path: recordingPath,
                            status: 'local',
                            duration,
                        });

                        // 3. Upload to S3
                        const cloudUrl = await storageService.uploadRecording(recordingPath, userEmail);

                        // 4. Update DB with S3 URL
                        await dbService.saveRecording({ id: recordingId, s3_url: cloudUrl, status: 'uploaded' });

                        // 5. Transcribe
                        const transcriptBundle = await transcriptionService.transcribe(cloudUrl, userEmail, recordingPath);

                        if (transcriptBundle && recordingId) {
                            await dbService.updateTranscriptId(recordingId, transcriptBundle.id || 'deepgram-sync');

                            const result = await transcriptionService.waitForCompletion(transcriptBundle);

                            if (result) {
                                const transcriptFileName = `transcript-${recordingId}.txt`;
                                const transcriptUrl = await storageService.uploadText(result.formatted, transcriptFileName, userEmail);
                                await dbService.saveTranscriptResult(recordingId, result.formatted, transcriptUrl, result.words || null);

                                if (result.raw?.metadata?.duration) {
                                    const finalDuration = Math.round(result.raw.metadata.duration);
                                    await dbService.saveRecording({ id: recordingId, duration: finalDuration });
                                    console.log(`[BotService] Final duration from Deepgram: ${finalDuration}s`);
                                }
                            }
                        }

                        console.log(`[BotService] [DONE] Post-processing complete for recording ${recordingId}`);
                    } catch (err) {
                        console.error('[BotService] Post-processing failed:', err.message);
                    }
                })();
            } else {
                console.log(`[BotService] No audio received — skipping S3/DB save.`);
                if (fs.existsSync(recordingPath)) {
                    try { fs.unlinkSync(recordingPath); } catch (e) { }
                }
            }
        }

        // Close browser
        if (browser) {
            console.log(`[BotService] Closing browser for ${meetingUrl}`);
            try {
                if (page && !page.isClosed()) {
                    await page.evaluate(() => {
                        const leaveBtn = document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]');
                        if (leaveBtn) leaveBtn.click();
                    }).catch(() => { });
                    await new Promise(r => setTimeout(r, 800));
                }
                const proc = browser.process();
                await browser.close().catch(() => { });
                if (proc?.pid) {
                    try { process.kill(proc.pid, 'SIGKILL'); } catch (e) { }
                }
            } catch (e) {
                console.error('[BotService] Browser close error:', e.message);
            }
        }

        // Clean up session dir (only if not persistent)
        if (userDataDir && !isPersistent && fs.existsSync(userDataDir)) {
            try {
                await new Promise(r => setTimeout(r, 500));
                fs.rmSync(userDataDir, { recursive: true, force: true });
                console.log(`[BotService] [CLEANUP] Temporary session dir removed: ${userDataDir}`);
            } catch (e) {
                console.error(`[BotService] [CLEANUP] Failed to remove session dir:`, e.message);
            }
        } else if (isPersistent) {
            console.log(`[BotService] [CLEANUP] Persistent profile preserved: ${userDataDir}`);
        }

        this.activeBots.delete(meetingUrl);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────
    async updateBotStatus(meetingUrl, status) {
        const bot = this.activeBots.get(meetingUrl);
        if (bot) {
            bot.status = status;
            console.log(`[BotService] [STATUS] ${meetingUrl} → ${status}`);
            try {
                await redis.set(`bot-status:${meetingUrl}`, status, 'EX', 3600);
            } catch (e) {
                console.error('[BotService] Redis status update failed:', e.message);
            }
        }
    }

    getBotStatus(meetingUrl) {
        const bot = this.activeBots.get(meetingUrl);
        return bot ? bot.status : 'not_found';
    }
}

module.exports = new BotService();