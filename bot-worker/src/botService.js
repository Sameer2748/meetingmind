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

    async joinMeeting(meetingUrl, botName = 'MeetingMind Notetaker', userEmail = 'anonymous') {
        process.env.PUPPETEER_DISABLE_HEADLESS_WARNING = 'true';
        console.log(`[BotService] Launching Deep-Stealth Bot for: ${meetingUrl} (User: ${userEmail})`);

        // Fresh session dir every time — prevents Google profile fingerprinting
        const sessionId = Date.now();
        const sessionDir = path.resolve(this.sessionsDir, `session_${sessionId}`);
        fs.mkdirSync(sessionDir, { recursive: true });

        try {
            const browser = await puppeteer.launch({
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
                headless: false,
                userDataDir: sessionDir,
                ignoreDefaultArgs: ['--enable-automation'],
                args: [
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-infobars',
                    '--window-size=1280,720',
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                    '--mute-audio',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--disable-web-security',
                    '--allow-running-insecure-content',
                    '--disable-default-apps',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--password-store=basic',
                    '--use-mock-keychain',
                ]
            });

            const page = (await browser.pages())[0];

            // PIPE CONSOLE FROM BROWSER TO BACKEND
            page.on('console', msg => {
                const text = msg.text();
                if (text.includes('[Bot')) {
                    console.log(`[Bot-Browser] ${text}`);
                }
            });

            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

            // Deep stealth masking
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            });

            const recordingId = Date.now();
            const recordingsDir = path.resolve(process.cwd(), 'recordings', userEmail);
            const recordingPath = path.join(recordingsDir, `meeting-${recordingId}.webm`);
            if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

            const fileStream = fs.createWriteStream(recordingPath);
            let chunksReceived = 0;

            await page.exposeFunction('sendAudioChunk', (base64) => {
                const bot = this.activeBots.get(meetingUrl);
                if (!base64 || !bot) return;
                const buffer = Buffer.from(base64, 'base64');
                if (buffer.length > 0) {
                    fileStream.write(buffer);
                    bot.chunksReceived++;
                    if (bot.chunksReceived % 5 === 0) {
                        console.log(`[BotService] [REC] Recording: Received ${bot.chunksReceived} chunks for ${recordingPath.split('/').pop()}`);
                    }
                }
            });

            // Register bot early so it can catch STOP signals while joining
            this.activeBots.set(meetingUrl, {
                browser,
                page,
                fileStream,
                recordingPath,
                userEmail,
                sessionDir,
                status: 'joining',
                stopSignal: false,
                chunksReceived: 0
            });

            console.log(`[BotService] Navigating to meeting...`);
            await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 500));

            let blockCount = 0;
            let hasTypedName = false;
            let hasClickedJoin = false;
            let joinAttempted = false; // tracks if we EVER clicked join this session
            let lobbyRetryCount = 0;  // how many times lobby reappeared after clicking join

            for (let i = 0; i < 30; i++) {
                // Check for stop signal
                const currentBot = this.activeBots.get(meetingUrl);
                if (!currentBot || currentBot.stopSignal) {
                    console.log(`[BotService] Join loop aborted: ${currentBot ? 'STOP signal received' : 'Bot cleared'}`);
                    await this.stopMeeting(meetingUrl);
                    return;
                }

                const state = await page.evaluate(() => {
                    // 0. Wrong page? (Google redirected to marketing site)
                    if (!window.location.href.includes('meet.google.com')) return 'WRONG_PAGE';

                    // 1. Already in meeting?
                    if (document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]')) return 'IN_MEETING';

                    const txt = document.body.innerText;

                    // 2. Page still loading? Don't misclassify as blocked
                    if (document.title === '' || txt.trim().length < 50) return 'LOADING';

                    // Declare btns early — used by both BLOCKED check and READY check
                    const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));

                    // 3. Blocked by Google? Only if blocker text visible AND no join button/input visible
                    const hasJoinBtn = btns.some(b => {
                        const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                        const isJoin = lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                        if (!isJoin) return false;
                        const rect = b.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(b).display !== 'none';
                    });
                    const trueBlock = (
                        txt.includes("You can't join this video call") ||
                        txt.includes('Invalid video call name')
                    ) && !document.querySelector('input') && !hasJoinBtn;
                    if (trueBlock) return 'BLOCKED';

                    // 4. Needs Login?
                    if (txt.includes('Sign in') && !document.querySelector('input')) return 'NEEDS_LOGIN';

                    // 5. Check for Join button — takes priority over admit text
                    if (hasJoinBtn) return 'READY';

                    // 6. Waiting for host to admit? (ONLY if no join button)
                    if (txt.includes("You'll be let in soon") ||
                        txt.includes('waiting for the host') ||
                        txt.includes('Someone will let you in') ||
                        txt.includes('Waiting to be let in')) {
                        return 'WAITING_ADMIT';
                    }

                    return 'WAITING';
                });

                console.log(`[BotService] [STATE] State: ${state} (Attempt ${i + 1}/30)`);

                // ═══════════════════════════════════════════
                // STATE: IN_MEETING — We're in! Break out.
                // ═══════════════════════════════════════════
                if (state === 'IN_MEETING') {
                    console.log(`[BotService] [SUCCESS] IN MEETING! Breaking loop.`);
                    break;
                }

                // ═══════════════════════════════════════════
                // STATE: WAITING_ADMIT — Host hasn't let us in yet.
                // Just wait. Do NOT re-type name or re-click.
                // ═══════════════════════════════════════════
                if (state === 'WAITING_ADMIT') {
                    console.log(`[BotService] [WAIT] In lobby — waiting for host to admit... (${i + 1}/30)`);
                    this.updateBotStatus(meetingUrl, 'waiting_admit');
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }

                // ═══════════════════════════════════════════
                // STATE: BLOCKED — Google blocked the page.
                // Use exponential backoff and reload.
                // ═══════════════════════════════════════════
                if (state === 'BLOCKED') {
                    // If we've already sent a join request, NEVER reload — that kills admission.
                    // Just wait for the host to admit us.
                    if (joinAttempted) {
                        console.log(`[BotService] [WAIT] Post-click block — waiting for host admission (not reloading)...`);
                        await new Promise(r => setTimeout(r, 3000));
                        continue;
                    }
                    blockCount++;
                    const delay = Math.min(1000 * blockCount, 3000);
                    console.log(`[BotService] [RETRY] Block detected (#${blockCount}). Reloading in ${Math.round(delay / 1000)}s...`);
                    await new Promise(r => setTimeout(r, delay));
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 500));
                    hasTypedName = false;
                    hasClickedJoin = false;
                    joinAttempted = false;
                    blockCount = 0;
                    continue;
                }

                if (state === 'LOADING') {
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                if (state === 'WRONG_PAGE') {
                    console.log(`[BotService] [REDIRECT] Redirected away from Meet. Re-navigating to ${meetingUrl}...`);
                    await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 500));
                    hasTypedName = false;
                    hasClickedJoin = false;
                    joinAttempted = false;
                    blockCount = 0;
                    continue;
                }


                // ═══════════════════════════════════════════
                // STATE: READY — Lobby is visible with Join button.
                // Type name once, click join once, then transition.
                // ═══════════════════════════════════════════
                if (state === 'READY') {
                    console.log(`[BotService] Lobby Ready. Waiting 2s before setup...`);
                    blockCount = 0;
                    await new Promise(r => setTimeout(r, 2000));

                    // STEP 0: Dismiss "Got it" popup if present
                    try {
                        const gotItBtn = await page.$x('//button[contains(., "Got it")]');
                        if (gotItBtn.length > 0) {
                            await gotItBtn[0].click();
                            await new Promise(r => setTimeout(r, 300));
                        }
                    } catch (e) { }

                    // STEP 0.5: Turn off camera AND microphone
                    try {
                        await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('[aria-label*="camera" i], [aria-label*="video" i], [data-tooltip*="camera" i]'));
                            const camBtn = btns.find(b => b.tagName === 'BUTTON' || b.getAttribute('role') === 'button');
                            if (camBtn && !camBtn.getAttribute('aria-label')?.toLowerCase().includes('turn on')) camBtn.click();

                            const micBtns = Array.from(document.querySelectorAll('[aria-label*="microphone" i], [aria-label*="mic" i], [data-tooltip*="microphone" i]'));
                            const micBtn = micBtns.find(b => b.tagName === 'BUTTON' || b.getAttribute('role') === 'button');
                            if (micBtn && !micBtn.getAttribute('aria-label')?.toLowerCase().includes('turn on')) micBtn.click();
                        });
                        console.log(`[BotService] Camera + Mic turned OFF.`);
                    } catch (e) { }

                    // STEP 1: Type name instantly (ONLY ONCE per page load)
                    if (!hasTypedName) {
                        const inputEl = await page.evaluateHandle(() => {
                            const inputs = Array.from(document.querySelectorAll('input[aria-label*="name"], input[placeholder*="name"], input[type="text"]'));
                            return inputs.find(i => {
                                const rect = i.getBoundingClientRect();
                                return rect.width > 0 && rect.height > 0 && window.getComputedStyle(i).display !== 'none';
                            });
                        });

                        if (inputEl && inputEl.asElement()) {
                            const el = inputEl.asElement();
                            await el.click({ clickCount: 3 });
                            await el.press('Backspace');
                            // Type with slight delay per character (looks human)
                            await page.keyboard.type(botName, { delay: 40 });
                            hasTypedName = true;
                            console.log(`[BotService] Name typed: ${botName}`);
                            // Wait 2s before clicking join — let Meet enable the button + looks human
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    }

                    // STEP 2: Click the Join button
                    if (!hasClickedJoin) {
                        // Bail early if we've retried too many times on this meeting
                        if (lobbyRetryCount >= 5) {
                            console.log(`[BotService] [GIVE UP] Lobby retry limit reached. This meeting won't admit the bot.`);
                            await this.stopMeeting(meetingUrl);
                            return;
                        }

                        let clicked = false;

                        // Strategy 1: Direct evaluate click (most reliable across Meet versions)
                        try {
                            clicked = await page.evaluate(() => {
                                const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                                const joinBtn = allBtns.find(b => {
                                    const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                                    const isJoin = lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                                    if (!isJoin) return false;
                                    const rect = b.getBoundingClientRect();
                                    return rect.width > 0 && rect.height > 0;
                                });
                                if (joinBtn) { joinBtn.click(); return true; }
                                return false;
                            });
                            if (clicked) console.log(`[BotService] Clicked join button via evaluate.`);
                        } catch (e) { }

                        // Strategy 2: XPath click
                        if (!clicked) {
                            const btnXPaths = [
                                '//button[contains(., "Ask to join")]',
                                '//button[contains(., "Join now")]',
                                '//button[contains(., "Join meeting")]',
                                '//div[@role="button"][contains(., "Ask to join")]',
                                '//div[@role="button"][contains(., "Join now")]',
                            ];
                            for (const xpath of btnXPaths) {
                                try {
                                    const [btn] = await page.$x(xpath);
                                    if (btn) {
                                        const box = await btn.boundingBox();
                                        if (box) {
                                            await btn.hover();
                                            await new Promise(r => setTimeout(r, 200));
                                            await btn.click();
                                            clicked = true;
                                            console.log(`[BotService] Clicked join button via XPath: ${xpath}`);
                                            break;
                                        }
                                    }
                                } catch (e) { }
                            }
                        }

                        // Strategy 3: Enter key fallback
                        if (!clicked) {
                            await page.keyboard.press('Enter');
                            clicked = true;
                            console.log(`[BotService] Fallback: pressed Enter to join.`);
                        }

                        hasClickedJoin = true;
                        joinAttempted = true;
                        // Give the page 1.5s to navigate away from lobby before polling
                        await new Promise(r => setTimeout(r, 1500));
                    }

                    // STEP 3: After clicking, enter dedicated admission-wait loop.
                    // Poll every 2s for up to 90s. Never reload — reloading kills the admission request.
                    console.log(`[BotService] [ADMIT] Waiting for admission (up to 90s)...`);
                    const admitStart = Date.now();
                    let admitted = false;
                    let rejectedBack = false;

                    while (Date.now() - admitStart < 90000) {
                        await new Promise(r => setTimeout(r, 2000));

                        const admitState = await page.evaluate(() => {
                            // WRONG PAGE: Google redirected us away from meet
                            if (!window.location.href.includes('meet.google.com')) return 'WRONG_PAGE';

                            // SUCCESS: Leave button appeared = we're in!
                            if (document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]')) return 'IN_MEETING';

                            const txt = document.body.innerText;

                            // DENIED: "You can't join this video call" with countdown to home screen
                            // This means our join request was rejected by the host (or meeting ended)
                            if (txt.includes("You can't join this video call") ||
                                txt.includes('Return to home screen') ||
                                txt.includes('Returning to home screen')) return 'DENIED';

                            // LOBBY REAPPEARED: request was denied, or we need to re-click
                            const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                            const lobbyBack = allBtns.some(b => {
                                const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                                const isJoin = lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                                if (!isJoin) return false;
                                const rect = b.getBoundingClientRect();
                                return rect.width > 0 && rect.height > 0;
                            });
                            if (lobbyBack) return 'LOBBY';

                            // All other states = still waiting
                            return 'WAITING';
                        });

                        if (admitState === 'IN_MEETING') {
                            console.log(`[BotService] [SUCCESS] Successfully joined!`);
                            admitted = true;
                            break;
                        }
                        if (admitState === 'LOBBY') {
                            lobbyRetryCount++;
                            console.log(`[BotService] [RETRY] Lobby reappeared (#${lobbyRetryCount}) — waiting 3s before re-click...`);
                            await new Promise(r => setTimeout(r, 3000));
                            hasClickedJoin = false;
                            break;
                        }
                        if (admitState === 'DENIED' || admitState === 'WRONG_PAGE') {
                            console.log(`[BotService] [DENIED] Join request denied or redirected. Re-navigating to meeting...`);
                            await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await new Promise(r => setTimeout(r, 1000));
                            hasTypedName = false;
                            hasClickedJoin = false;
                            joinAttempted = false;
                            blockCount = 0;
                            rejectedBack = true; // skip the 90s-timeout reload at end
                            break;
                        }
                        // WAITING — log occasionally
                        const elapsed = Math.round((Date.now() - admitStart) / 1000);
                        if (elapsed % 10 < 2) console.log(`[BotService] [ADMIT] Still waiting... ${elapsed}s`);
                    }

                    if (admitted) break; // exit outer loop — we're in!
                    if (!rejectedBack) {
                        // 90s timeout — reload and try fresh
                        console.log(`[BotService] [TIMEOUT] 90s admission wait expired. Reloading...`);
                        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
                        await new Promise(r => setTimeout(r, 500));
                        hasTypedName = false;
                        hasClickedJoin = false;
                        joinAttempted = false;
                        blockCount = 0;
                    }

                    continue;
                }

                // STATE: WAITING / NEEDS_LOGIN
                console.log(`[BotService] [WAIT] Page loading... (${state})`);
                await new Promise(r => setTimeout(r, 2000));
            }

            // Start the actual recording handler if we broke out of loop successfully
            this.handleRecording(page, meetingUrl);

        } catch (err) {
            console.error('[BotService] Error:', err.message);
            // Ensure cleanup on crash during join
            await this.stopMeeting(meetingUrl);
            throw err;
        }
    }

    async handleRecording(page, meetingUrl) {
        try {
            await page.waitForSelector('[aria-label="Leave call"], [aria-label="Leave meeting"]', { timeout: 600000 });
            console.log('[BotService] [SUCCESS] ADMITTED! Recording active.');
            this.updateBotStatus(meetingUrl, 'recording');

            // Mark start time for duration calculation fallback
            for (const [url, bot] of this.activeBots.entries()) {
                if (bot.page === page) {
                    bot.startTime = Date.now();
                    break;
                }
            }

            // Listen for meeting end signal from browser
            await page.exposeFunction('onMeetingEnd', async () => {
                console.log(`[BotService] [END] Meeting ended/Bot removed. Cleaning up...`);
                await this.stopMeeting(page.url());
            });

            await page.evaluate(() => {
                const ui = document.createElement('div');
                Object.assign(ui.style, {
                    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                    background: '#f1efd8', zIndex: '99999', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                    fontFamily: 'sans-serif', color: '#01114f', pointerEvents: 'none'
                });

                const cardRef = document.createElement('div');
                Object.assign(cardRef.style, {
                    background: '#ffffff', padding: '60px', borderRadius: '40px',
                    border: '1px solid #d4d2bb', textAlign: 'center', shadow: '0 30px 60px rgba(1, 17, 79, 0.1)'
                });

                const logoContainer = document.createElement('div');
                Object.assign(logoContainer.style, {
                    width: '120px', height: '120px', background: '#e07155', borderRadius: '30px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '30px',
                    boxShadow: '0 20px 40px rgba(224, 113, 85, 0.3)'
                });

                const svgNamespace = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(svgNamespace, "svg");
                svg.setAttribute("width", "60");
                svg.setAttribute("height", "60");
                svg.setAttribute("viewBox", "0 0 24 24");
                svg.setAttribute("fill", "none");
                svg.setAttribute("stroke", "white");
                svg.setAttribute("stroke-width", "2");
                svg.setAttribute("stroke-linecap", "round");
                svg.setAttribute("stroke-linejoin", "round");

                const paths = [
                    "M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .52 8.588A4 4 0 0 0 12 18.75a4 4 0 0 0 7.003-3.267 4 4 0 0 0 .52-8.588 4 4 0 0 0-2.527-5.77A3 3 0 1 0 12 5z",
                    "M12 11h.01",
                    "M12 13h.01",
                    "M12 15h.01",
                    "M12 17h.01",
                    "M12 9h.01"
                ];

                paths.forEach(d => {
                    const path = document.createElementNS(svgNamespace, "path");
                    path.setAttribute("d", d);
                    svg.appendChild(path);
                });

                logoContainer.appendChild(svg);
                cardRef.appendChild(logoContainer);

                const title = document.createElement('h1');
                title.textContent = 'MeetingMind AI Notetaker';
                Object.assign(title.style, {
                    fontSize: '36px', fontWeight: '900', margin: '0',
                    color: '#01114f', letterSpacing: '-0.5px'
                });
                cardRef.appendChild(title);

                const sub = document.createElement('p');
                sub.textContent = 'Capturing and recording high-fidelity audio...';
                Object.assign(sub.style, { color: '#01114f', opacity: '0.6', fontSize: '16px', marginTop: '10px' });
                cardRef.appendChild(sub);

                const badge = document.createElement('div');
                Object.assign(badge.style, {
                    marginTop: '40px', display: 'inline-flex', gap: '12px', alignItems: 'center',
                    background: 'rgba(224, 113, 85, 0.1)', padding: '10px 25px', borderRadius: '100px',
                    border: '1px solid rgba(224, 113, 85, 0.2)'
                });

                const dot = document.createElement('div');
                Object.assign(dot.style, { width: '10px', height: '10px', background: '#e07155', borderRadius: '50%' });
                badge.appendChild(dot);

                const liveTxt = document.createElement('span');
                liveTxt.textContent = 'LIVE RECORDING';
                Object.assign(liveTxt.style, { color: '#e07155', fontWeight: 'bold', letterSpacing: '1px', fontSize: '14px' });
                badge.appendChild(liveTxt);

                cardRef.appendChild(badge);
                ui.appendChild(cardRef);
                document.body.appendChild(ui);

                const ctx = new (window.AudioContext || window.webkitAudioContext)();

                // Add silent oscillator to keep AudioContext alive even if silent
                const silence = ctx.createOscillator();
                const gain = ctx.createGain();
                gain.gain.value = 0;
                silence.connect(gain);
                gain.connect(ctx.destination);
                silence.start();

                const dest = ctx.createMediaStreamDestination();
                console.log('[Bot-Setup] Audio capture engine starting...');

                const linkAudio = () => {
                    if (ctx.state === 'suspended') ctx.resume();

                    const sources = Array.from(document.querySelectorAll('audio, video'));
                    sources.forEach(s => {
                        if (!s._linked) {
                            try {
                                const stream = s.srcObject || s.captureStream?.();
                                if (stream && stream.getAudioTracks().length > 0) {
                                    const source = ctx.createMediaStreamSource(stream);
                                    source.connect(dest);
                                    s._linked = true;
                                    console.log('[Bot-Audio] Linked participant:', s.tagName);
                                }
                            } catch (e) { }
                        }
                    });
                };

                setInterval(linkAudio, 2000);

                const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
                rec.ondataavailable = e => {
                    if (e.data.size > 0) {
                        const r = new FileReader();
                        r.onload = () => window.sendAudioChunk(r.result.split(',')[1]);
                        r.readAsDataURL(e.data);
                    }
                };
                rec.start(1000); // 1 second chunks
                console.log('[Bot-Status] MediaRecorder started');

                // AUTO-STOP DETECTION
                let aloneTicks = 0;
                const checkEnd = setInterval(() => {
                    const hasLeaveBtn = !!document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]');
                    const isLeftScreen = document.body.innerText.includes('You left') ||
                        document.body.innerText.includes('rejoin') ||
                        document.body.innerText.includes('home screen');

                    // Count meeting tiles/participants + active video elements (excluding our own if possible)
                    const participantTiles = document.querySelectorAll('[data-participant-id], [data-initial-participant-id]').length;
                    const videoElements = document.querySelectorAll('video').length;
                    const participants = Math.max(participantTiles, videoElements);

                    if (!hasLeaveBtn || isLeftScreen) {
                        console.log('[Bot-Status] [END] UI disappeared or Left Screen detected. Stopping...');
                        clearInterval(checkEnd);
                        window.onMeetingEnd();
                    } else if (participants <= 1) {
                        aloneTicks++;
                        if (aloneTicks > 6) { // 30 seconds alone (6 ticks * 5s)
                            console.log('[Bot-Status] [END] Bot is alone in the room (30s threshold). Stopping...');
                            clearInterval(checkEnd);
                            window.onMeetingEnd();
                        }
                    } else {
                        aloneTicks = 0;
                    }
                }, 5000);
            });
        } catch (err) {
            console.error('[BotService] Recording Crash:', err.message);
        }
    }

    async stopMeeting(meetingUrl) {
        const bot = this.activeBots.get(meetingUrl);
        if (!bot) return;

        const { fileStream, recordingPath, userEmail, browser, sessionDir, page } = bot;

        // Immediately update status to 'stopping' to prevent duplicate triggers
        bot.status = 'stopping';
        this.updateBotStatus(meetingUrl, 'saving');

        if (fileStream) {
            fileStream.end();

            // Only save to DB/S3 if we actually got audio!
            if (bot.chunksReceived > 0) {
                console.log(`[BotService] Recording finalized: ${recordingPath} (${bot.chunksReceived} chunks)`);

                // Trigger Background Tasks
                (async () => {
                    try {
                        // 1. Calculate Duration
                        let duration = 0;
                        try {
                            const metadata = await mm.parseFile(recordingPath);
                            duration = Math.round(metadata.format.duration || 0);

                            if (duration <= 0 && bot.startTime) {
                                duration = Math.round((Date.now() - bot.startTime) / 1000);
                            }
                        } catch (e) {
                            if (bot.startTime) duration = Math.round((Date.now() - bot.startTime) / 1000);
                        }

                        // 2. Save to Database (Initial State)
                        const recordingId = await dbService.saveRecording({
                            meeting_url: meetingUrl,
                            user_email: userEmail,
                            file_path: recordingPath,
                            status: 'local',
                            duration: duration
                        });

                        // 3. Upload to S3
                        const cloudUrl = await storageService.uploadRecording(recordingPath, userEmail);

                        // 4. Update DB with S3 URL
                        await dbService.saveRecording({ id: recordingId, s3_url: cloudUrl, status: 'uploaded' });

                        // 5. Trigger Transcription
                        const transcriptBundle = await transcriptionService.transcribe(cloudUrl, userEmail, recordingPath);

                        if (transcriptBundle && recordingId) {
                            const identifier = transcriptBundle.id || 'deepgram-sync';
                            await dbService.updateTranscriptId(recordingId, identifier);

                            // 6. Wait for Completion (Background)
                            const result = await transcriptionService.waitForCompletion(transcriptBundle);

                            if (result) {
                                // 7. Upload Transcript Text to S3
                                const transcriptFileName = `transcript-${recordingId}.txt`;
                                const transcriptS3Url = await storageService.uploadText(result.formatted, transcriptFileName, userEmail);

                                // 8. Update DB with Final Text & URL + Word Timestamps
                                await dbService.saveTranscriptResult(recordingId, result.formatted, transcriptS3Url, result.words || null);

                                // 9. Optional: Update duration if Deepgram has a more accurate measure
                                if (result.raw?.metadata?.duration) {
                                    const finalDuration = Math.round(result.raw.metadata.duration);
                                    await dbService.saveRecording({ id: recordingId, duration: finalDuration });
                                }
                            }
                        }
                    } catch (err) {
                        console.error('[BotService] Post-processing failed:', err.message);
                    }
                })();
            } else {
                console.log(`[BotService] Skipping S3/DB save: No audio chunks received.`);
                if (fs.existsSync(recordingPath)) {
                    try { fs.unlinkSync(recordingPath); } catch (e) { }
                }
            }
        }

        // Signal the join loop to stop if it's still running
        bot.stopSignal = true;

        if (browser) {
            console.log(`[BotService] Closing browser for ${meetingUrl}`);
            try {
                // Try clean exit via UI if possible
                if (page && !page.isClosed()) {
                    await page.evaluate(() => {
                        const leaveBtn = document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]');
                        if (leaveBtn) leaveBtn.click();
                    }).catch(() => { });
                    await new Promise(r => setTimeout(r, 1000));
                }

                // Force close
                const browserProcess = browser.process();
                await browser.close().catch(() => { });

                // Nuclear option: if process still exists, kill it
                if (browserProcess && browserProcess.pid) {
                    try { process.kill(browserProcess.pid, 'SIGKILL'); } catch (e) { }
                }
            } catch (e) {
                console.error('[BotService] Browser close error:', e.message);
            }
        }

        // Clean up temp Chrome session directory
        if (sessionDir && fs.existsSync(sessionDir)) {
            try {
                // Give OS a moment to release file handles
                await new Promise(r => setTimeout(r, 500));
                fs.rmSync(sessionDir, { recursive: true, force: true });
                console.log(`[BotService] [CLEANUP] Session dir cleaned: ${sessionDir}`);
            } catch (e) {
                console.error(`[BotService] [ERROR] Session cleanup failed:`, e.message);
            }
        }

        this.activeBots.delete(meetingUrl);
    }

    async updateBotStatus(meetingUrl, status) {
        const bot = this.activeBots.get(meetingUrl);
        if (bot) {
            bot.status = status;
            console.log(`[BotService] [STATUS] Updated bot status for ${meetingUrl} to ${status}`);

            // Write to Redis for Backend to read
            try {
                await redis.set(`bot-status:${meetingUrl}`, status, 'EX', 3600); // 1 hour expiry
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
