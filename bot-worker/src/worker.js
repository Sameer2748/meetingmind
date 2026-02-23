const path = require('path');
// Load environment variables from .env if it exists (for local dev)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config(); // Also check local dir
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

console.log(`[Redis] Worker connecting to: ${typeof redisOptions === 'string' ? 'Cloud (Upstash)' : 'Local'}`);

subscriber.subscribe('bot-commands', (err) => {
    if (err) console.error('[Bot-Worker] Pub/Sub Error:', err.message);
    else console.log('[Bot-Worker] Subscribed to bot-commands channel');
});

subscriber.on('message', async (channel, message) => {
    if (channel === 'bot-commands') {
        try {
            const { action, meetingUrl } = JSON.parse(message);
            if (action === 'STOP') {
                console.log(`[Bot-Worker] Received STOP signal for ${meetingUrl}`);
                await botService.stopMeeting(meetingUrl);
            }
        } catch (e) {
            console.error('[Bot-Worker] Pub/Sub Message Error:', e.message);
        }
    }
});

console.log('[Bot-Worker] Waiting for meeting jobs...');

const worker = new Worker('meeting-jobs', async job => {
    const { meetingUrl, userName, userEmail } = job.data;
    console.log(`[Bot-Worker] [JOB ${job.id}] Processing join for ${meetingUrl} (User: ${userEmail})`);

    try {
        // Inject status update capability if needed, but botService should handle its own DB updates
        await botService.joinMeeting(meetingUrl, userName, userEmail);
        return { success: true };
    } catch (err) {
        console.error(`[Bot-Worker] [JOB ${job.id}] Failed:`, err.message);
        throw err;
    }
}, { connection });

worker.on('completed', job => {
    console.log(`[Bot-Worker] [JOB ${job.id}] Completed successfully`);
});

worker.on('failed', (job, err) => {
    console.error(`[Bot-Worker] [JOB ${job.id}] Failed with error: ${err.message}`);
});
