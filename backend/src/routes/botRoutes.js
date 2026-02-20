const express = require('express');
const router = express.Router();
const botService = require('../bot/botService');
const authenticate = require('../middlewares/auth');
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Setup Queue & Pub/Sub
const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null,
});

const meetingQueue = new Queue('meeting-jobs', { connection });
const publisher = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
});

// Endpoint for the extension to trigger the bot
router.post('/join', authenticate, async (req, res) => {
    const { meetingUrl, userName } = req.body;
    const userEmail = req.user.email;

    if (!meetingUrl) {
        return res.status(400).json({ error: 'meetingUrl is required' });
    }

    console.log(`[Server] Request to join meeting: ${meetingUrl} from user: ${userEmail || 'anonymous'}`);

    try {
        // ADD TO QUEUE - Worker will pick it up
        await meetingQueue.add('join-meeting', {
            meetingUrl,
            userName: userName || 'MeetingMind Notetaker',
            userEmail
        });

        res.json({
            success: true,
            message: 'Bot has been queued. Please admit the bot when it arrives.',
            user: userEmail
        });
    } catch (err) {
        console.error('[Server] Failed to queue bot:', err);
        res.status(500).json({ error: 'System busy, please try again later' });
    }
});

router.get('/status', authenticate, async (req, res) => {
    const { meetingUrl } = req.query;
    if (!meetingUrl) return res.status(400).json({ error: 'meetingUrl is required' });

    // In a scalable arch, status comes from the shared database
    const status = await botService.getBotStatus(meetingUrl);
    res.json({ success: true, status });
});

router.post('/stop', authenticate, async (req, res) => {
    const { meetingUrl } = req.body;
    try {
        // Broadcast STOP signal via Pub/Sub - all workers listen, the one with the bot handles it
        await publisher.publish('bot-commands', JSON.stringify({
            action: 'STOP',
            meetingUrl
        }));

        res.json({ success: true, message: 'Stop signal broadcasted' });
    } catch (err) {
        console.error('[Server] Bot stop signal failed:', err);
        res.status(500).json({ error: 'Failed to broadcast stop' });
    }
});

// Dedicated setup route for manual login
router.get('/setup', async (req, res) => {
    try {
        botService.setupSession();
        res.send('<h1>Bot Setup Started</h1><p>A Chrome window has opened. Please log into Google in that window, then close it. Once done, your bot will be "authenticated" for all future meetings!</p>');
    } catch (err) {
        res.status(500).send('Failed to start setup');
    }
});

module.exports = router;
