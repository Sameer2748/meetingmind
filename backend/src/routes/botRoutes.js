const express = require('express');
const router = express.Router();
const botService = require('../bot/botService');
const authenticate = require('../middlewares/auth');

// Endpoint for the extension to trigger the bot
router.post('/join', authenticate, async (req, res) => {
    const { meetingUrl, userName } = req.body;
    const userEmail = req.user.email;

    if (!meetingUrl) {
        return res.status(400).json({ error: 'meetingUrl is required' });
    }

    console.log(`[Server] Request to join meeting: ${meetingUrl} from user: ${userEmail || 'anonymous'}`);

    try {
        botService.joinMeeting(meetingUrl, userName || 'MeetingMind Notetaker', userEmail)
            .catch(err => console.error('[Server] [WARN] Bot async error:', err.message));

        res.json({
            success: true,
            message: 'Bot is attempting to join the meeting. Please admit the bot when it arrives.',
            user: userEmail || 'anonymous'
        });
    } catch (err) {
        console.error('[Server] Bot join trigger failed:', err);
        res.status(500).json({ error: 'Failed to trigger bot' });
    }
});

router.get('/status', authenticate, async (req, res) => {
    const { meetingUrl } = req.query;
    if (!meetingUrl) return res.status(400).json({ error: 'meetingUrl is required' });

    const status = botService.getBotStatus(meetingUrl);
    res.json({ success: true, status });
});

router.post('/stop', authenticate, async (req, res) => {
    const { meetingUrl } = req.body;
    try {
        await botService.stopMeeting(meetingUrl);
        res.json({ success: true, message: 'Bot stopped successfully' });
    } catch (err) {
        console.error('[Server] Bot stop failed:', err);
        res.status(500).json({ error: 'Failed to stop bot' });
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
