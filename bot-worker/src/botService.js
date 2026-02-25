const { chromium } = require('playwright');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const storageService = require('./services/storageService');
const transcriptionService = require('./services/transcriptionService');
const dbService = require('./services/dbService');
const mm = require('music-metadata');
const IORedis = require('ioredis');

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

class BotService {
    constructor() {
        this.activeBots = new Map();
        this.browserPool = [];
        this.poolSize = 2;
        this.sessionsDir = path.resolve(process.cwd(), 'bot_profiles');
        if (!fs.existsSync(this.sessionsDir)) fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    async initBrowserPool() {
        console.log(`[BotService] Initializing ${this.poolSize} persistent bot browsers...`);
        for (let i = 0; i < this.poolSize; i++) {
            const profileDir = path.join(this.sessionsDir, `bot-${i}`);
            const context = await chromium.launchPersistentContext(profileDir, {
                headless: false,
                args: [
                    '--use-fake-ui-for-media-stream',
                    '--use-fake-device-for-media-stream',
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-infobars',
                    '--mute-audio',
                ],
                viewport: { width: 1280, height: 720 },
                permissions: ['microphone', 'camera'],
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                bypassCSP: true,
                ignoreHTTPSErrors: true
            });

            const page = context.pages()[0] || await context.newPage();
            await page.goto('https://meet.google.com', { waitUntil: 'domcontentloaded' });

            const needsLogin = await page.evaluate(() => {
                const hasAvatar = !!document.querySelector('[aria-label*="Google Account"], img[src*="googleusercontent.com"]');
                const hasNewMeeting = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('New meeting'));
                return !hasAvatar && !hasNewMeeting;
            });

            if (needsLogin) {
                console.log(`[BotService] ⚠️  Bot ${i} needs authentication!`);
                let loginAttempts = 0;
                while (loginAttempts < 120) {
                    try {
                        await new Promise(r => setTimeout(r, 5000));
                        if (page.isClosed()) break;
                        const stillNeeds = await page.evaluate(() => {
                            return !document.querySelector('[aria-label*="Google Account"], img[src*="googleusercontent.com"]');
                        }).catch(() => true);
                        if (!stillNeeds) {
                            console.log(`[BotService] ✓ Bot ${i} authenticated!`);
                            break;
                        }
                    } catch (e) { break; }
                    loginAttempts++;
                }
            } else {
                console.log(`[BotService] ✓ Bot ${i} already authenticated`);
            }

            let activePage = page;
            let activeContext = context;
            if (page.isClosed()) {
                activeContext = await chromium.launchPersistentContext(profileDir, {
                    headless: false,
                    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox', '--mute-audio'],
                    viewport: { width: 1280, height: 720 },
                    permissions: ['microphone', 'camera']
                });
                activePage = activeContext.pages()[0] || await activeContext.newPage();
            }

            // REGISTER FUNCTIONS ONCE PER PAGE
            await activePage.exposeFunction('sendAudioChunk', (base64) => {
                const bot = this.browserPool.find(b => b.id === i);
                if (!bot || !bot.currentMeetingUrl) return;
                const active = this.activeBots.get(bot.currentMeetingUrl);
                if (!base64 || !active || !active.fileStream) return;

                const buffer = Buffer.from(base64, 'base64');
                active.fileStream.write(buffer);
                active.chunksReceived++;
                if (active.chunksReceived % 5 === 0) {
                    console.log(`[Bot ${i}] 🎙️  Recording active... (${active.chunksReceived}s)`);
                }
            });

            await activePage.exposeFunction('onMeetingEnd', async () => {
                const bot = this.browserPool.find(b => b.id === i);
                if (bot && bot.currentMeetingUrl) {
                    console.log(`[Bot ${i}] Signal: Meeting Ended`);
                    await this.stopMeeting(bot.currentMeetingUrl);
                }
            });

            this.browserPool.push({
                context: activeContext,
                page: activePage,
                inUse: false,
                id: i,
                currentMeetingUrl: null
            });
        }
        console.log(`[BotService] ✓ ${this.poolSize} bots ready`);
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
        const { page, id: botId } = bot;

        try {
            const recordingId = Date.now();
            const recordingsDir = path.resolve(process.cwd(), 'recordings', userEmail);
            if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
            const recordingPath = path.join(recordingsDir, `meeting-${recordingId}.webm`);
            const fileStream = fs.createWriteStream(recordingPath);

            this.activeBots.set(meetingUrl, {
                botId, page, fileStream, recordingPath, userEmail,
                status: 'joining', stopSignal: false, chunksReceived: 0
            });

            await page.goto(meetingUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            for (let attempt = 0; attempt < 30; attempt++) {
                const current = this.activeBots.get(meetingUrl);
                if (!current || current.stopSignal) return await this.stopMeeting(meetingUrl);

                await page.waitForTimeout(3000);
                const state = await page.evaluate(() => {
                    if (document.querySelector('[aria-label*="Leave call"], [aria-label*="Leave meeting"]')) return 'IN_MEETING';
                    const txt = document.body.innerText.toLowerCase();
                    if (txt.includes("you can't join") || txt.includes('not found')) return 'BLOCKED';
                    if (txt.includes('waiting for') || txt.includes('let you in soon')) return 'WAITING_ADMIT';
                    const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
                    const hasJoin = btns.some(b => (b.innerText || '').toLowerCase().includes('join') || (b.getAttribute('aria-label') || '').toLowerCase().includes('join'));
                    return hasJoin ? 'READY' : 'LOADING';
                });

                console.log(`[Bot ${botId}] State: ${state}`);
                if (state === 'IN_MEETING') break;
                if (state === 'BLOCKED') throw new Error('Meeting blocked');
                if (state === 'READY') {
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
                        btns.forEach(b => {
                            const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
                            if ((lbl.includes('camera') || lbl.includes('microphone')) && lbl.includes('turn off')) b.click();
                        });
                    });
                    await page.waitForTimeout(1000);
                    const joinBtn = page.locator('button, [role="button"]').filter({ hasText: /Join now|Ask to join|Join meeting/i }).first();
                    if (await joinBtn.isVisible()) await joinBtn.click();
                    else await page.keyboard.press('Enter');
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
        console.log(`[Bot ${botId}] ✓ Recording started`);
        this.updateBotStatus(meetingUrl, 'recording');
        const active = this.activeBots.get(meetingUrl);
        if (active) active.startTime = Date.now();

        await page.evaluate(() => {
            // UI Overlay
            const ui = document.createElement('div');
            Object.assign(ui.style, { position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh', background: '#f1efd8', zIndex: '99999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', pointerEvents: 'none' });

            const card = document.createElement('div');
            card.style.textAlign = 'center';
            const title = document.createElement('h1');
            title.style.cssText = 'font-size:36px;font-weight:900;color:#01114f;';
            title.textContent = 'MeetingMind AI Notetaker';
            const subtitle = document.createElement('p');
            subtitle.style.color = '#01114f';
            subtitle.textContent = 'Capturing meeting audio...';

            card.appendChild(title);
            card.appendChild(subtitle);
            ui.appendChild(card);
            document.body.appendChild(ui);

            // Audio Logic
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const dest = ctx.createMediaStreamDestination();
            const link = () => {
                if (ctx.state === 'suspended') ctx.resume();
                document.querySelectorAll('audio, video').forEach(el => {
                    if (el._linked) return;
                    try {
                        const stream = el.srcObject || (el.captureStream ? el.captureStream() : null);
                        if (stream && stream.getAudioTracks().length > 0) {
                            ctx.createMediaStreamSource(stream).connect(dest);
                            el._linked = true;
                        }
                    } catch (e) { }
                });
            };
            setInterval(link, 1000);

            const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
            rec.ondataavailable = e => {
                if (e.data.size > 0) {
                    const reader = new FileReader();
                    reader.onload = () => window.sendAudioChunk(reader.result.split(',')[1]);
                    reader.readAsDataURL(e.data);
                }
            };
            rec.start(1000);

            // Auto-Leave
            setInterval(() => {
                const participants = Math.max(document.querySelectorAll('[data-participant-id]').length, document.querySelectorAll('video').length, 1);
                const isLeft = document.body.innerText.includes('You left') || !document.querySelector('[aria-label*="Leave"]');
                if (isLeft || participants <= 1) window.onMeetingEnd();
            }, 5000);
        });
    }

    async stopMeeting(meetingUrl) {
        const active = this.activeBots.get(meetingUrl);
        if (!active) return;
        const { botId, fileStream, recordingPath, userEmail } = active;
        console.log(`[Bot ${botId}] Stopping and saving...`);
        this.updateBotStatus(meetingUrl, 'saving');

        if (fileStream) {
            fileStream.end();
            if (active.chunksReceived > 0) {
                (async () => {
                    try {
                        let duration = active.startTime ? Math.round((Date.now() - active.startTime) / 1000) : 0;
                        const id = await dbService.saveRecording({ meeting_url: meetingUrl, user_email: userEmail, file_path: recordingPath, status: 'local', duration });
                        const cloudUrl = await storageService.uploadRecording(recordingPath, userEmail);
                        await dbService.saveRecording({ id, s3_url: cloudUrl, status: 'uploaded' });
                        const bundle = await transcriptionService.transcribe(cloudUrl, userEmail, recordingPath);
                        if (bundle && id) {
                            await dbService.updateTranscriptId(id, bundle.id || 'sync');
                            const res = await transcriptionService.waitForCompletion(bundle);
                            if (res) {
                                const s3Url = await storageService.uploadText(res.formatted, `transcript-${id}.txt`, userEmail);
                                await dbService.saveTranscriptResult(id, res.formatted, s3Url, res.words || null);
                            }
                        }
                    } catch (e) { console.error(`[Bot ${botId}] Save Error:`, e.message); }
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
