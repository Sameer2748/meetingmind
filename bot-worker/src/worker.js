const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const botService = require('./botService');

const redisOptions = process.env.REDIS_URL || {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
};

const tlsConfig = (typeof redisOptions === 'string' && redisOptions.startsWith('rediss://')) ? { tls: {} } : {};

const connection = new IORedis(redisOptions, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...tlsConfig
});

const subscriber = new IORedis(redisOptions, {
    ...tlsConfig,
    enableReadyCheck: false,
    maxRetriesPerRequest: null
});

// Initialize browser pool and start worker
(async () => {
    console.log('[Bot-Worker] Initializing browser pool...');
    try {
        await botService.initBrowserPool();
        console.log('[Bot-Worker] ✓ Browser pool ready');

        subscriber.subscribe('bot-commands', (err) => {
            if (err) console.error('[Bot-Worker] Pub/Sub Error:', err.message);
            else console.log('[Bot-Worker] Subscribed to bot-commands');
        });

        subscriber.on('message', async (channel, message) => {
            if (channel === 'bot-commands') {
                try {
                    const { action, meetingUrl } = JSON.parse(message);
                    if (action === 'STOP') {
                        console.log(`[Bot-Worker] Stopping ${meetingUrl}`);
                        await botService.stopMeeting(meetingUrl);
                    }
                } catch (e) {
                    console.error('[Bot-Worker] Pub/Sub Error:', e.message);
                }
            }
        });

        console.log('[Bot-Worker] Starting meeting job worker...');
        const worker = new Worker('meeting-jobs', async job => {
            const { meetingUrl, userName, userEmail } = job.data;
            console.log(`[Bot-Worker] [JOB ${job.id}] Join: ${meetingUrl}`);

            try {
                await botService.joinMeeting(meetingUrl, userName, userEmail);
                return { success: true };
            } catch (err) {
                console.error(`[Bot-Worker] [JOB ${job.id}] Failed: ${err.message}`);
                throw err;
            }
        }, {
            connection,
            concurrency: 2,
            lockDuration: 30000,          // Reduce frequency of lock renewals
            stalledInterval: 30000,       // Reduce frequency of stalled job checks
            maxStalledCount: 1,           // Don't retry stalled jobs too many times
            drainDelay: 5                 // Add delay when queue is empty to save requests
        });

        worker.on('completed', job => {
            console.log(`[Bot-Worker] [JOB ${job.id}] ✓ Completed`);
        });

        worker.on('failed', (job, err) => {
            console.log(`[Bot-Worker] [JOB ${job.id}] ✗ Failed: ${err.message}`);
        });

        console.log('[Bot-Worker] Waiting for meeting jobs...');
    } catch (err) {
        console.error('[Bot-Worker] Failed to initialize bot worker:', err.message);
        process.exit(1);
    }
})();

