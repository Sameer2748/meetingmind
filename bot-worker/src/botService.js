const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const storageService = require('./services/storageService');
const transcriptionService = require('./services/transcriptionService');
const dbService = require('./services/dbService');
const mm = require('music-metadata');

puppeteer.use(StealthPlugin());

class BotService {
    constructor() {
        this.activeBots = new Map();
        this.sessionsDir = path.resolve(process.cwd(), 'bot_sessions');
        if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    async joinMeeting(meetingUrl, botName = 'MeetingMind AI', userEmail = 'anonymous') {
        process.env.PUPPETEER_DISABLE_HEADLESS_WARNING = 'true';
        console.log(`[BotService] Launching Deep-Stealth Bot for: ${meetingUrl} (User: ${userEmail})`);

        // Fresh session dir every time — prevents Google profile fingerprinting
        const sessionId = Date.now();
        const sessionDir = path.resolve(this.sessionsDir, `session_${sessionId}`);
        fs.mkdirSync(sessionDir, { recursive: true });

        try {
            const browser = await puppeteer.launch({
                executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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
                if (!base64) return;
                const buffer = Buffer.from(base64, 'base64');
                if (buffer.length > 0) {
                    fileStream.write(buffer);
                    chunksReceived++;
                    if (chunksReceived % 5 === 0) {
                        console.log(`[BotService] [REC] Recording: Received ${chunksReceived} chunks for ${recordingPath.split('/').pop()}`);
                    }
                }
            });

            console.log(`[BotService] Navigating with Human-Timing...`);
            await page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });

            // Simulate human arriving on page
            await new Promise(r => setTimeout(r, 1500));
            await page.mouse.move(640, 360);
            await new Promise(r => setTimeout(r, 300));
            await page.mouse.move(640 + Math.random() * 100, 360 + Math.random() * 100);
            await new Promise(r => setTimeout(r, 500));

            let blockCount = 0;
            let hasTypedName = false;
            let hasClickedJoin = false;

            for (let i = 0; i < 30; i++) {
                const state = await page.evaluate(() => {
                    // 1. Already in meeting?
                    if (document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]')) return 'IN_MEETING';

                    const txt = document.body.innerText;

                    // 2. Page still loading? Don't misclassify as blocked
                    if (document.title === '' || txt.trim().length < 50) return 'LOADING';

                    // 3. Blocked by Google? (Only very specific text)
                    if (txt.includes("You can't join this video call") ||
                        txt.includes('Invalid video call name')) return 'BLOCKED';

                    // 4. Needs Login?
                    if (txt.includes('Sign in') && !document.querySelector('input')) return 'NEEDS_LOGIN';

                    // 5. Check for Join button FIRST — this takes priority over admit text
                    const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
                    const hasJoin = btns.some(b => {
                        const lbl = ((b.innerText || '') + (b.getAttribute('aria-label') || '')).toLowerCase();
                        return lbl.includes('join now') || lbl.includes('ask to join') || lbl.includes('join meeting');
                    });
                    if (hasJoin) return 'READY';

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
                    blockCount++;
                    const delay = Math.min(4000 * blockCount, 20000);
                    console.log(`[BotService] [RETRY] Block detected (#${blockCount}). Navigating away first, then retrying in ${Math.round(delay / 1000)}s...`);
                    await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
                    await new Promise(r => setTimeout(r, delay));
                    await page.goto(meetingUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                    // Reset flags — fresh page needs re-entry
                    hasTypedName = false;
                    hasClickedJoin = false;
                    continue;
                }

                if (state === 'LOADING') {
                    console.log(`[BotService] [WAIT] Page still loading... (${i + 1}/30)`);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }

                // ═══════════════════════════════════════════
                // STATE: READY — Lobby is visible with Join button.
                // Type name once, click join once, then transition.
                // ═══════════════════════════════════════════
                if (state === 'READY') {
                    console.log(`[BotService] Lobby Ready.`);
                    blockCount = 0;

                    // STEP 0: Dismiss "Got it" popup if present (Google sign-in suggestion)
                    try {
                        const gotItBtn = await page.$x('//button[contains(., "Got it")]');
                        if (gotItBtn.length > 0) {
                            await gotItBtn[0].click();
                            console.log(`[BotService] Dismissed "Got it" popup.`);
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    } catch (e) { /* no popup, continue */ }

                    // STEP 0.5: Turn off camera AND microphone on lobby
                    try {
                        // Turn off camera
                        const camOff = await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('[aria-label*="camera" i], [aria-label*="video" i], [data-tooltip*="camera" i]'));
                            const camBtn = btns.find(b => b.tagName === 'BUTTON' || b.getAttribute('role') === 'button');
                            if (camBtn && !camBtn.getAttribute('aria-label')?.toLowerCase().includes('turn on')) {
                                camBtn.click();
                                return true;
                            }
                            return false;
                        });
                        if (camOff) console.log(`[BotService] Camera turned OFF.`);

                        // Turn off microphone
                        const micOff = await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('[aria-label*="microphone" i], [aria-label*="mic" i], [data-tooltip*="microphone" i]'));
                            const micBtn = btns.find(b => b.tagName === 'BUTTON' || b.getAttribute('role') === 'button');
                            if (micBtn && !micBtn.getAttribute('aria-label')?.toLowerCase().includes('turn on')) {
                                micBtn.click();
                                return true;
                            }
                            return false;
                        });
                        if (micOff) console.log(`[BotService] Microphone turned OFF.`);

                        await new Promise(r => setTimeout(r, 500));
                    } catch (e) { /* toggle not found, continue */ }

                    // Move mouse randomly for stealth
                    await page.mouse.move(100 + Math.random() * 500, 100 + Math.random() * 300);
                    await new Promise(r => setTimeout(r, 500));

                    // STEP 1: Type name (ONLY ONCE per page load)
                    if (!hasTypedName) {
                        const inputEl = await page.$('input[aria-label*="name"], input[placeholder*="name"], input[type="text"], input');
                        if (inputEl) {
                            await inputEl.click({ clickCount: 3 });
                            await new Promise(r => setTimeout(r, 200));
                            await inputEl.press('Backspace');
                            await new Promise(r => setTimeout(r, 400));
                            await page.keyboard.type(botName, { delay: 80 + Math.random() * 60 });
                            hasTypedName = true;
                            console.log(`[BotService] Name typed: ${botName}`);
                            await new Promise(r => setTimeout(r, 1500));
                        } else {
                            console.log(`[BotService] [WARN] No name input found on page.`);
                        }
                    }

                    // STEP 2: Click the Join button (native Puppeteer XPath)
                    if (!hasClickedJoin) {
                        let clicked = false;
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
                                        await new Promise(r => setTimeout(r, 300));
                                        await btn.click();
                                        clicked = true;
                                        hasClickedJoin = true;
                                        console.log(`[BotService] Clicked join button via XPath: ${xpath}`);
                                        break;
                                    }
                                }
                            } catch (e) { /* try next selector */ }
                        }

                        if (!clicked) {
                            await page.keyboard.press('Enter');
                            hasClickedJoin = true;
                            console.log(`[BotService] Fallback: pressed Enter to join.`);
                        }
                    }

                    // STEP 3: Wait and check result
                    await new Promise(r => setTimeout(r, 5000));

                    const postClickState = await page.evaluate(() => {
                        if (document.querySelector('[aria-label="Leave call"], [aria-label="Leave meeting"]')) return 'IN_MEETING';
                        const txt = document.body.innerText;
                        // Very specific checks — avoid matching popup text like "Instead of waiting to be let in"
                        if (txt.includes("You'll be let in soon") ||
                            txt.includes('Someone will let you in') ||
                            txt.includes('Waiting to be let in') ||
                            txt.includes('want to join this call')) return 'WAITING_ADMIT';
                        return 'UNKNOWN';
                    });

                    if (postClickState === 'IN_MEETING') {
                        console.log(`[BotService] [SUCCESS] Successfully joined!`);
                        break;
                    } else if (postClickState === 'WAITING_ADMIT') {
                        console.log(`[BotService] [WAIT] In lobby — waiting for host to admit...`);
                        await new Promise(r => setTimeout(r, 5000));
                    } else {
                        console.log(`[BotService] [RETRY] Post-click: still on lobby page. Will retry...`);
                        // Reset so we try again on next loop
                        hasTypedName = false;
                        hasClickedJoin = false;
                    }

                    continue;
                }

                // ═══════════════════════════════════════════
                // STATE: WAITING / NEEDS_LOGIN — Still loading or needs auth.
                // ═══════════════════════════════════════════
                console.log(`[BotService] [WAIT] Page loading... (${state})`);
                await new Promise(r => setTimeout(r, 4000));
            }

            this.activeBots.set(meetingUrl, {
                browser,
                page,
                fileStream,
                recordingPath,
                userEmail,
                sessionDir,
                status: 'joining'
            });
            this.handleRecording(page, meetingUrl);

        } catch (err) {
            console.error('[BotService] Error:', err.message);
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

                const emoji = document.createElement('div');
                emoji.textContent = '🤖';
                emoji.style.fontSize = '80px';
                emoji.style.marginBottom = '20px';
                cardRef.appendChild(emoji);

                const title = document.createElement('h1');
                title.textContent = 'MeetingMind AI';
                Object.assign(title.style, {
                    fontSize: '36px', fontWeight: '900', margin: '0',
                    color: '#01114f'
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
        if (bot) {
            const { fileStream, recordingPath, userEmail, browser, sessionDir } = bot;

            if (fileStream) {
                fileStream.end();
                console.log(`[BotService] Recording finalized: ${recordingPath}`);

                // Trigger Background Tasks
                (async () => {
                    try {
                        // 1. Calculate Duration
                        let duration = 0;
                        try {
                            const metadata = await mm.parseFile(recordingPath);
                            duration = Math.round(metadata.format.duration || 0);

                            // Metadata often fails for raw WebM from MediaRecorder
                            if (duration <= 0 && bot.startTime) {
                                duration = Math.round((Date.now() - bot.startTime) / 1000);
                                console.log(`[BotService] [INFO] Metadata duration missing. Calculated from start time: ${duration}s`);
                            } else {
                                console.log(`[BotService] [INFO] Extracted duration: ${duration}s`);
                            }
                        } catch (e) {
                            if (bot.startTime) {
                                duration = Math.round((Date.now() - bot.startTime) / 1000);
                                console.log(`[BotService] [INFO] Calculated fallback duration: ${duration}s`);
                            } else {
                                console.error('[BotService] [ERROR] Duration extraction failed:', e.message);
                            }
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
                        await dbService.saveRecording({
                            id: recordingId,
                            s3_url: cloudUrl,
                            status: 'uploaded'
                        });

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

                                // 8. Update DB with Final Text & URL
                                await dbService.saveTranscriptResult(recordingId, result.text, transcriptS3Url);

                                // 9. Optional: Update duration if Deepgram has a more accurate measure
                                if (result.raw?.metadata?.duration) {
                                    const finalDuration = Math.round(result.raw.metadata.duration);
                                    await dbService.saveRecording({
                                        id: recordingId,
                                        duration: finalDuration
                                    });
                                    console.log(`[BotService] [INFO] Updated duration from Deepgram tech: ${finalDuration}s`);
                                }
                            }
                        }

                        // ── STORAGE CLEANUP ──
                        if (fs.existsSync(recordingPath)) {
                            console.log(`[BotService] [CLEANUP] Local cleanup: (Preserved for internal streaming) ${recordingPath}`);
                        }
                    } catch (err) {
                        console.error('[BotService] Post-processing failed:', err.message);
                    }
                })();
            }

            if (browser) await browser.close();

            // Clean up temp Chrome session directory
            if (sessionDir && fs.existsSync(sessionDir)) {
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    console.log(`[BotService] [CLEANUP] Session dir cleaned: ${sessionDir}`);
                } catch (e) {
                    console.error(`[BotService] [ERROR] Session cleanup failed:`, e.message);
                }
            }

            this.activeBots.delete(meetingUrl);
        }
    }
    updateBotStatus(meetingUrl, status) {
        const bot = this.activeBots.get(meetingUrl);
        if (bot) {
            bot.status = status;
            console.log(`[BotService] [STATUS] Updated bot status for ${meetingUrl} to ${status}`);
        }
    }

    getBotStatus(meetingUrl) {
        const bot = this.activeBots.get(meetingUrl);
        return bot ? bot.status : 'not_found';
    }
}

module.exports = new BotService();
