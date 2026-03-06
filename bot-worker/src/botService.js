const { chromium } = require('playwright');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const storageService = require('./services/storageService');
const transcriptionService = require('./services/transcriptionService');
const dbService = require('./services/dbService');
const mm = require('music-metadata');
const IORedis = require('ioredis');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

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

// Prevent ioredis unhandled error crashes (e.g. ECONNRESET)
redis.on('error', (err) => {
    console.error('[BotService] Redis error:', err.message);
});

class BotService {
    constructor() {
        this.activeBots = new Map();
        this.browserPool = [];
        this.poolSize = 2;
        this.sessionsDir = path.resolve(process.cwd(), 'bot_profiles');
        if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    isVideoRecordingEnabled() {
        return process.env.RECORD_VIDEO === 'true';
    }

    isMergeVideoAudioEnabled() {
        return process.env.MERGE_VIDEO_AUDIO === 'true';
    }

    shouldShowOverlay() {
        // If Playwright video recording is enabled, an overlay would cover the entire capture.
        return process.env.SHOW_BOT_OVERLAY !== 'false' && !this.isVideoRecordingEnabled();
    }

    async registerPageBindings(page, botId) {
        if (page.__mmBindingsRegistered) return;

        // Register functions ONCE per page
        await page.exposeFunction('sendAudioChunk', (base64) => {
            const bot = this.browserPool.find(b => b.id === botId);
            if (!bot || !bot.currentMeetingUrl) return;
            const active = this.activeBots.get(bot.currentMeetingUrl);
            if (!base64 || !active || !active.fileStream) return;

            const buffer = Buffer.from(base64, 'base64');
            active.fileStream.write(buffer);
            active.chunksReceived++;
            if (active.chunksReceived % 10 === 0) {
                console.log(`[Bot ${botId}] 🎙️  Recording active... (${active.chunksReceived}s)`);
            }
        });

        await page.exposeFunction('onMeetingEnd', async () => {
            const bot = this.browserPool.find(b => b.id === botId);
            if (bot && bot.currentMeetingUrl) {
                console.log(`[Bot ${botId}] Signal: Meeting Ended`);
                await this.stopMeeting(bot.currentMeetingUrl);
            }
        });

        // Pipe browser console to node console for debugging
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (text.includes('[MeetingMind]')) {
                console.log(`[Bot ${botId} Browser] ${text}`);
            }
        });

        page.__mmBindingsRegistered = true;
    }

    async initBrowserPool() {
        console.log(`[BotService] Initializing ${this.poolSize} persistent bot browsers...`);
        this.browserPool = [];

        const localProfiles = fs.existsSync(this.sessionsDir) ? fs.readdirSync(this.sessionsDir).filter(f => !f.startsWith('.')) : [];
        const hasProfiles = localProfiles.length > 0;

        // 1. INSTANCE MODE: Just take from S3 and use it.
        if (process.env.SERVER_MODE === 'true' || process.env.FORCE_SYNC === 'true') {
            console.log('[BotService] 🔄 Sync Mode: Pulling authenticated sessions from S3...');
            await storageService.downloadProfilesFromS3(this.sessionsDir);
        }
        // 2. LOCAL MODE: Just use existing local profiles.
        else {
            const localProfiles = fs.existsSync(this.sessionsDir) ? fs.readdirSync(this.sessionsDir).filter(f => !f.startsWith('.')) : [];
            console.log(`[BotService] ✓ Running in Local Mode with ${localProfiles.length} profiles.`);
        }

        for (let i = 0; i < this.poolSize; i++) {
            await this.launchBot(i);
        }
        console.log(`[BotService] ✓ ${this.poolSize} bots ready`);
    }

    async launchBot(botId) {
        const profileDir = path.join(this.sessionsDir, `bot-${botId}`);
        const launchArgs = [
            '--use-fake-ui-for-media-stream',  // auto-grant permission dialogs (no green fake camera)
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-infobars',
            '--enable-usermedia-screen-capturing',    // allow getDisplayMedia without dialog
            '--auto-select-desktop-capture-source=Tab', // auto-pick current tab, no picker UI
            '--use-fake-device-for-media-stream',
            '--allow-http-screen-capture'
        ];

        // Always mute the system audio — the in-browser canvas+audio recorder captures
        // meeting sound via AudioContext directly, so we don't need the OS to play it.
        launchArgs.push('--mute-audio');

        const launchOptions = {
            headless: process.env.HEADLESS === 'true',
            args: launchArgs,
            viewport: { width: 1280, height: 720 },
            permissions: ['microphone', 'camera'],
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            bypassCSP: true,
            ignoreHTTPSErrors: true
        };

        let context;
        try {
            context = await chromium.launchPersistentContext(profileDir, launchOptions);
        } catch (e) {
            const isHeaded = process.env.HEADLESS !== 'true';
            if (!isHeaded) throw e;

            // Headed launches are more sensitive to corrupted/old profile state.
            // Preserve the existing profile for debugging, then retry with a fresh one
            // so the UI can open and you can re-auth/sync.
            const backupDir = `${profileDir}-backup-${Date.now()}`;
            try {
                if (fs.existsSync(profileDir)) {
                    fs.renameSync(profileDir, backupDir);
                    console.log(`[BotService] ⚠️  Bot ${botId} profile crashed in headed mode. Backed up to: ${backupDir}`);
                }
                fs.mkdirSync(profileDir, { recursive: true });
            } catch (moveErr) {
                console.error(`[BotService] Failed to backup/recreate profile dir for Bot ${botId}:`, moveErr.message);
            }

            context = await chromium.launchPersistentContext(profileDir, launchOptions);
        }

        const page = context.pages()[0] || await context.newPage();

        await this.registerPageBindings(page, botId);

        console.log(`[BotService] ✓ Bot ${botId} ready`);

        // UI Mode: Optional local sync to S3 (Only if FORCE_SYNC or explicitly enabled)
        if (process.env.HEADLESS !== 'true' && process.env.SERVER_MODE !== 'true' && process.env.FORCE_SYNC === 'true') {
            await page.goto('https://meet.google.com', { waitUntil: 'domcontentloaded' }).catch(e => console.log(`[Bot ${botId}] Initial navigation failed: ${e.message}`));

            if (!process.env.SYNCED_ONCE) {
                console.log(`[BotService] ⬆️  Force Sync: Monitoring Bot ${botId} for S3 upload...`);

                const checkAuth = async () => {
                    try {
                        return await page.evaluate(() => {
                            const isLoginPage = window.location.hostname.includes('accounts.google.com');
                            if (isLoginPage) return false;

                            // 1. Check for the Google Account Circle (usually has your initials or picture)
                            const hasAvatar = !!document.querySelector('a[href*="accounts.google.com/SignOutOptions"], [aria-label*="Google Account"]');

                            // 2. Check for the actual "New meeting" button which only appears when signed in on Meet
                            const hasMeetingButtons = Array.from(document.querySelectorAll('button')).some(b =>
                                (b.innerText || '').includes('New meeting') || (b.innerText || '').includes('Join')
                            );

                            // 3. Check for the "Enter a code" input field
                            const hasInput = !!document.querySelector('input[placeholder*="code or link"]');

                            // We need a combination of these to be sure we are logged in and ready
                            return hasAvatar && (hasMeetingButtons || hasInput);
                        });
                    } catch (e) { return false; }
                };

                let authenticated = await checkAuth();
                if (!authenticated) {
                    console.log('[BotService] ⚠️  Authentication NOT detected. Waiting for manual login...');
                    console.log('[BotService] ℹ️  Please sign in to Google in the browser window.');

                    // Wait for manual login (up to 10 mins)
                    for (let i = 0; i < 120; i++) {
                        await new Promise(r => setTimeout(r, 5000));
                        if (await checkAuth()) {
                            // Verify stability for 3 seconds
                            await new Promise(r => setTimeout(r, 3000));
                            if (await checkAuth()) {
                                authenticated = true;
                                console.log('[BotService] ✨ Verified: Authenticated session detected!');
                                break;
                            }
                        }
                    }
                }

                if (authenticated) {
                    console.log('[BotService] ✓ Session detected. Syncing to S3...');
                    process.env.SYNCED_ONCE = 'true';
                    await context.close();
                    await storageService.syncProfilesToS3(this.sessionsDir);
                    if (!process.env.RELAUNCHED) {
                        process.env.RELAUNCHED = 'true';
                        return this.launchBot(botId);
                    }
                } else {
                    console.log('[BotService] ❌ Authentication not detected. Proceeding anyway.');
                }
            }
        }

        this.browserPool.push({ context, page, inUse: false, id: botId, currentMeetingUrl: null, videoStartTime: Date.now() });
    }

    getAvailableBot() {
        return this.browserPool.find(bot => !bot.inUse);
    }

    releaseBot(botId) {
        const bot = this.browserPool.find(b => b.id === botId);
        if (bot) {
            bot.inUse = false;
            bot.currentMeetingUrl = null;
            bot.page.goto('https://meet.google.com').catch(() => { });
        }
    }

    async joinMeeting(meetingUrl, botName = 'MeetingMind Notetaker', userEmail = 'anonymous') {
        console.log(`[BotService] Joining: ${meetingUrl}`);
        const bot = this.getAvailableBot();
        if (!bot) throw new Error('All bots busy');

        bot.inUse = true;
        bot.currentMeetingUrl = meetingUrl;
        const { id: botId } = bot;
        let { page } = bot;

        try {
            const recordingId = Date.now();
            const recordingsDir = path.resolve(process.cwd(), 'recordings', userEmail);
            if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
            const recordingPath = path.join(recordingsDir, `meeting-${recordingId}.webm`);
            const fileStream = fs.createWriteStream(recordingPath);

            this.activeBots.set(meetingUrl, {
                botId, page, fileStream, recordingPath, userEmail, recordingId, recordingsDir,
                status: 'joining', stopSignal: false, chunksReceived: 0
            });

            await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            for (let attempt = 0; attempt < 30; attempt++) {
                const current = this.activeBots.get(meetingUrl);
                if (!current || current.stopSignal) return await this.stopMeeting(meetingUrl);

                await page.waitForTimeout(3000);
                const pageData = await page.evaluate(() => {
                    // Check for redirect to marketing page
                    if (window.location.href.includes('workspace.google.com/products/meet')) return { state: 'REDIRECTED', url: window.location.href };

                    // Dismiss common popups (Check your audio, etc.)
                    const dismissBtn = Array.from(document.querySelectorAll('button')).find(b =>
                        b.innerText?.includes('Dismiss') || b.innerText?.includes('Got it') || b.innerText?.includes('Close')
                    );
                    if (dismissBtn) {
                        dismissBtn.click();
                        return { state: 'POPUP_DISMISSED', url: window.location.href };
                    }

                    if (document.querySelector('[aria-label*="Leave call"], [aria-label*="Leave meeting"]')) return { state: 'IN_MEETING', url: window.location.href };

                    const txt = document.body.innerText.toLowerCase();
                    if (txt.includes("you can't join") || txt.includes('not found')) return { state: 'BLOCKED', url: window.location.href };
                    if (txt.includes('waiting for') || txt.includes('let you in soon')) return { state: 'WAITING_ADMIT', url: window.location.href };

                    // Check for guest name input
                    const nameInput = document.querySelector('input[placeholder*="Your name"], input[aria-label*="Your name"]');
                    if (nameInput && !nameInput.value) return { state: 'NAME_NEEDED', url: window.location.href };

                    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
                    const enabledJoin = btns.find(b => {
                        const text = (b.innerText || '').toLowerCase();
                        const label = (b.getAttribute('aria-label') || '').toLowerCase();
                        const looksLikeJoin = (text.includes('join') || label.includes('join')) && !text.includes('joining');
                        return looksLikeJoin && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
                    });

                    if (enabledJoin) return { state: 'READY', url: window.location.href };

                    const anyJoinText = btns.filter(b => (b.innerText || '').toLowerCase().includes('join') || (b.getAttribute('aria-label') || '').toLowerCase().includes('join'))
                        .map(b => `["${b.innerText}", disabled:${b.disabled}]`).join(', ');

                    const hasAnyJoin = btns.some(b => (b.innerText || '').toLowerCase().includes('join') || (b.getAttribute('aria-label') || '').toLowerCase().includes('join'));
                    return {
                        state: hasAnyJoin ? 'PREPARING' : 'LOADING',
                        url: window.location.href,
                        debug: hasAnyJoin ? `Buttons: ${anyJoinText}` : `No join buttons. URL: ${window.location.href}`
                    };
                });

                const { state, debug, url } = pageData;
                console.log(`[Bot ${botId}] Status: ${state}`);

                if (state === 'NAME_NEEDED') {
                    console.log(`[Bot ${botId}] Guest mode detected, typing name...`);
                    await page.fill('input[placeholder*="Your name"], input[aria-label*="Your name"]', botName);
                    await page.waitForTimeout(1000);
                    continue;
                }

                if (state === 'PREPARING') {
                    console.log(`[Bot ${botId}] Debug: ${debug}`);
                    // Take a screenshot after 5 attempts to see why it's stuck
                    if (attempt === 5) {
                        const debugPath = path.join(recordingsDir, `debug-stuck-${botId}.png`);
                        await page.screenshot({ path: debugPath });
                        console.log(`[Bot ${botId}] 📸 Screenshot saved to see why we are stuck: ${debugPath}`);
                    }
                }

                if (state === 'IN_MEETING') break;
                if (state === 'BLOCKED' || state === 'REDIRECTED') {
                    throw new Error(state === 'REDIRECTED' ? `Redirected to marketing page. Link might be invalid or account restricted.` : 'Meeting blocked');
                }

                if (state === 'READY') {
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
                        btns.forEach(b => {
                            const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
                            if ((lbl.includes('camera') || lbl.includes('microphone')) && lbl.includes('turn off')) b.click();
                        });
                    });
                    await page.waitForTimeout(2000);
                    try {
                        const joinBtn = page.locator('button, [role="button"]').filter({ hasText: /Join now|Ask to join|Join meeting/i }).first();
                        await joinBtn.click({ timeout: 10000 });
                    } catch (e) {
                        console.log(`[Bot ${botId}] Click failed, trying Enter...`);
                        await page.keyboard.press('Enter');
                    }
                }
            }

            await this.handleRecording(page, meetingUrl, botId);

            // WAIT until meeting ends or stop signal
            while (this.activeBots.has(meetingUrl)) {
                await new Promise(r => setTimeout(r, 5000));
            }

            console.log(`[Bot ${botId}] Job finished for ${meetingUrl}`);

        } catch (err) {
            console.error(`[Bot ${botId}] Join Error:`, err.message);
            await this.stopMeeting(meetingUrl);
            throw err;
        }
    }

    async handleRecording(page, meetingUrl, botId) {
        console.log(`[Bot ${botId}] ✓ Combined video+audio recording started`);
        this.updateBotStatus(meetingUrl, 'recording');
        const active = this.activeBots.get(meetingUrl);
        if (active) active.startTime = Date.now();

        await page.evaluate(async () => {
            // ── 1. AUDIO: mix all meeting participants' audio via AudioContext ───────────
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const audioDest = audioCtx.createMediaStreamDestination();
            const linkAudio = () => {
                if (audioCtx.state === 'suspended') audioCtx.resume();
                document.querySelectorAll('audio, video').forEach(el => {
                    if (el._linked) return;
                    try {
                        const stream = el.srcObject || (el.captureStream ? el.captureStream() : null);
                        if (stream && stream.getAudioTracks().length > 0) {
                            audioCtx.createMediaStreamSource(stream).connect(audioDest);
                            el._linked = true;
                        }
                    } catch (e) { }
                });
            };
            setInterval(linkAudio, 1000);
            linkAudio();

            // ── 2. VIDEO: capture the full browser tab (complete Google Meet UI) ────────
            let videoTrack = null;
            try {
                // getDisplayMedia captures the full rendered tab — full UI, all participants.
                // Chrome flags --enable-usermedia-screen-capturing +
                // --auto-select-desktop-capture-source=Tab auto-approve this without a dialog.
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { frameRate: 15, displaySurface: 'browser' },
                    audio: false, // audio comes from AudioContext above (more reliable)
                });
                videoTrack = displayStream.getVideoTracks()[0];
                console.log('[MeetingMind] ✅ Tab screen capture started');
            } catch (e) {
                console.warn('[MeetingMind] ❌ getDisplayMedia failed:', e.message);
                console.warn('[MeetingMind] falling back to canvas grid...');
            }

            // ── 2b. FALLBACK: canvas grid of all participant video elements ──────────
            if (!videoTrack) {
                const canvas = document.createElement('canvas');
                canvas.width = 1280; canvas.height = 720;
                const ctx2d = canvas.getContext('2d');
                ctx2d.fillStyle = '#202124';
                ctx2d.fillRect(0, 0, 1280, 720);

                const drawFrame = () => {
                    const vids = Array.from(document.querySelectorAll('video'))
                        .filter(v => v.readyState >= 2 && v.videoWidth > 0 && !v.paused);
                    ctx2d.fillStyle = '#202124';
                    ctx2d.fillRect(0, 0, 1280, 720);
                    if (vids.length === 0) return;
                    const cols = vids.length === 1 ? 1 : vids.length <= 4 ? 2 : 3;
                    const rows = Math.ceil(vids.length / cols);
                    const cellW = Math.floor(1280 / cols), cellH = Math.floor(720 / rows), gap = 4;
                    vids.forEach((v, i) => {
                        const col = i % cols, row = Math.floor(i / cols);
                        const x = col * cellW + gap / 2, y = row * cellH + gap / 2;
                        const w = cellW - gap, h = cellH - gap;
                        const vA = v.videoWidth / v.videoHeight, cA = w / h;
                        let dx = x, dy = y, dw = w, dh = h;
                        if (vA > cA) { dh = w / vA; dy = y + (h - dh) / 2; }
                        else { dw = h * vA; dx = x + (w - dw) / 2; }
                        ctx2d.fillStyle = '#3c4043';
                        ctx2d.fillRect(x, y, w, h);
                        ctx2d.drawImage(v, dx, dy, dw, dh);
                    });
                };
                drawFrame();
                setInterval(drawFrame, Math.floor(1000 / 15));
                videoTrack = canvas.captureStream(15).getVideoTracks()[0];
            }

            // ── 3. COMBINE: one MediaRecorder = full screen video + meeting audio ────
            const combined = new MediaStream([
                videoTrack,
                ...audioDest.stream.getAudioTracks(),
            ]);

            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                ? 'video/webm;codecs=vp8,opus' : 'video/webm';

            const rec = new MediaRecorder(combined, {
                mimeType,
                videoBitsPerSecond: 400_000,
                audioBitsPerSecond: 64_000,
            });

            rec.ondataavailable = e => {
                if (e.data.size > 0) {
                    const reader = new FileReader();
                    reader.onload = () => window.sendAudioChunk(reader.result.split(';base64,')[1]);
                    reader.readAsDataURL(e.data);
                }
            };
            setTimeout(() => rec.start(2000), 300);

            // ── 4. AUTO-LEAVE ─────────────────────────────────────────────
            let joinedAt = Date.now();
            setInterval(() => {
                const now = Date.now();
                if (now - joinedAt < 30000) return;
                const participants = Math.max(
                    document.querySelectorAll('[data-participant-id]').length,
                    document.querySelectorAll('video').length,
                    Array.from(document.querySelectorAll('button'))
                        .filter(b => b.innerText?.includes('people') || b.getAttribute('aria-label')?.includes('people')).length
                );
                const leaveBtn = document.querySelector('[aria-label*="Leave call"], [aria-label*="Leave meeting"]');
                const isLeft = document.body.innerText.includes('You left') || (!leaveBtn && (now - joinedAt > 60000));
                if (isLeft || (participants <= 1 && (now - joinedAt > 120000))) {
                    console.log(`Auto-leaving: participants=${participants}`);
                    window.onMeetingEnd();
                }
            }, 10000);
        });
    }

    async stopMeeting(meetingUrl) {
        const active = this.activeBots.get(meetingUrl);
        if (!active) return;
        const { botId, fileStream, recordingPath, userEmail, recordingsDir } = active;
        console.log(`[Bot ${botId}] Stopping and saving...`);
        this.updateBotStatus(meetingUrl, 'saving');

        const waitForFileStreamToFinish = async () => {
            if (!fileStream) return;
            const finished = new Promise((resolve) => {
                fileStream.once('finish', resolve);
                fileStream.once('close', resolve);
                fileStream.once('error', resolve);
            });
            await Promise.race([finished, new Promise(r => setTimeout(r, 5000))]);
        };

        if (fileStream) {
            try { fileStream.end(); } catch (e) { }
            if (active.chunksReceived > 0) {
                (async () => {
                    try {
                        await waitForFileStreamToFinish();

                        const duration = active.startTime ? Math.round((Date.now() - active.startTime) / 1000) : 0;
                        const id = await dbService.saveRecording({ meeting_url: meetingUrl, user_email: userEmail, file_path: recordingPath, status: 'local', duration });

                        const cloudUrl = await storageService.uploadRecording(recordingPath, userEmail);
                        await dbService.saveRecording({ id, s3_url: cloudUrl, status: 'uploaded' });

                        const bundle = await transcriptionService.transcribe(cloudUrl, userEmail, recordingPath);
                        if (bundle && id) {
                            await dbService.updateTranscriptId(id, bundle.id || 'sync');
                            const tr = await transcriptionService.waitForCompletion(bundle);
                            if (tr) {
                                const s3Url = await storageService.uploadText(tr.formatted, `transcript-${id}.txt`, userEmail);
                                await dbService.saveTranscriptResult(id, tr.formatted, s3Url, tr.words || null);
                            }
                        }

                        if (process.env.DEBUG_KEEP_LOCAL !== 'true') {
                            if (fs.existsSync(recordingPath)) {
                                fs.unlinkSync(recordingPath);
                                console.log(`[Bot ${botId}] Local file deleted: ${path.basename(recordingPath)}`);
                            }
                        } else {
                            console.log(`[Bot ${botId}] DEBUG_KEEP_LOCAL=true — file kept at: ${recordingPath}`);
                        }
                    } catch (e) {
                        console.error(`[Bot ${botId}] Save/Cleanup Error:`, e.message);
                    }
                })();
            }
        }
        active.stopSignal = true;
        this.activeBots.delete(meetingUrl);
        this.releaseBot(botId);
    }

    async updateBotStatus(meetingUrl, status) {
        try { await redis.set(`bot-status:${meetingUrl}`, status, 'EX', 3600); } catch (e) { }
    }
}

module.exports = new BotService();
