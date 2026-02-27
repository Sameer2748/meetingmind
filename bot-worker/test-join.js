const IORedis = require('ioredis');
const path = require('path');
require('dotenv').config();

// Try to load from root .env if local one is empty/missing
const fs = require('fs');
if (!process.env.REDIS_URL && fs.existsSync('../.env')) {
    require('dotenv').config({ path: '../.env' });
}

async function trigger() {
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

    const jobData = {
        meetingUrl: 'https://meet.google.com/szj-yrbj-nbc',
        userName: 'Local Docker Test',
        userEmail: 'mrao27488@gmail.com'
    };

    console.log('Pushing job to meeting-jobs queue...');

    // Manual BullMQ job push (roughly)
    const jobId = Date.now();
    await connection.hset('bull:meeting-jobs:wait', jobId, JSON.stringify(jobData));
    await connection.lpush('bull:meeting-jobs:wait', jobId);

    // Or just use BullMQ if we want to be proper, but simple redis list might work depending on version
    // Actually, BullMQ uses a specific format. Let's just use a script that uses bullmq.
}

const { Queue } = require('bullmq');

async function triggerProper() {
    console.log('Using BullMQ to trigger...');
    const redisUrl = process.env.REDIS_URL;
    console.log(`Connecting to Redis: ${redisUrl ? 'REMOTE' : 'LOCAL'}`);

    const connection = new IORedis(redisUrl || 'redis://127.0.0.1:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(redisUrl?.startsWith('rediss://') ? { tls: {} } : {})
    });

    const queue = new Queue('meeting-jobs', { connection });

    await queue.add('test-join', {
        meetingUrl: 'https://meet.google.com/iea-kyki-fdu',
        userName: 'MeetingMind Debug Bot',
        userEmail: 'mrao27488@gmail.com'
    });

    console.log('✓ Job added to queue');
    await connection.quit();
    process.exit(0);
}

triggerProper().catch(err => {
    console.error(err);
    process.exit(1);
});
