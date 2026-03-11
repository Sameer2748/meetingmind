const express = require('express');
const router = express.Router();
const fs = require('fs');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const dbService = require('../services/dbService');
const storageService = require('../services/storageService');
const authenticate = require('../middlewares/auth');
const aiService = require('../services/aiService');

// Get User Recordings
router.get('/', authenticate, async (req, res) => {
    try {
        const recordings = await dbService.getRecordingsByUser(req.user.email);
        res.json({ success: true, recordings });
    } catch (err) {
        console.error('[Fetch Error]', err.message);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

// Delete Recording
router.delete('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userEmail = req.user.email;

        const recordings = await dbService.getRecordingsByUser(userEmail);
        const recording = recordings.find(r => r.id === parseInt(id));

        if (!recording) {
            return res.status(404).json({ error: 'Recording not found or unauthorized' });
        }

        await dbService.deleteRecording(id);
        res.json({ success: true, message: 'Recording deleted successfully' });
    } catch (err) {
        console.error('[Delete Error]', err.message);
        res.status(500).json({ error: 'Failed to delete recording' });
    }
});

// Stream Recording Audio
router.get('/:id/audio', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const userEmail = req.user.email;

        const recordings = await dbService.getRecordingsByUser(userEmail);
        const recording = recordings.find(r => r.id === parseInt(id));

        if (!recording) return res.status(404).json({ error: 'Recording not found' });

        const filePath = recording.file_path;

        if (filePath && fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': (end - start) + 1,
                    'Content-Type': 'video/webm',
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/webm' });
                fs.createReadStream(filePath).pipe(res);
            }
            return;
        }

        if (recording.s3_url) {
            const s3Url = new URL(recording.s3_url);
            const key = decodeURIComponent(s3Url.pathname.substring(1));

            const command = new GetObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
            });

            const signedUrl = await getSignedUrl(storageService.client, command, { expiresIn: 3600 });
            return res.redirect(signedUrl);
        }

        res.status(404).json({ error: 'Audio source not found' });
    } catch (err) {
        console.error('[Stream Error]', err.message);
        res.status(500).json({ error: 'Failed' });
    }
});

// AI Chat about a recording's transcript
router.post('/:id/chat', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { message, history = [] } = req.body;
        const userEmail = req.user.email;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const recordings = await dbService.getRecordingsByUser(userEmail);
        const recording = recordings.find(r => r.id === parseInt(id));

        if (!recording) {
            return res.status(404).json({ error: 'Recording not found or unauthorized' });
        }

        const transcript = recording.transcript_text || '';
        const reply = await aiService.chatWithTranscript(transcript, message.trim(), history);

        res.json({ success: true, response: reply });
    } catch (err) {
        console.error('[Chat Error]', err.message);
        res.status(500).json({ error: err.message || 'Failed to get AI response' });
    }
});

const crypto = require('crypto');
const { eq, and, gt } = require('drizzle-orm');
const schema = require('../db/schema');

// ... (keep existing imports above)

// Share Recording (Generate/Update Share Link)
router.post('/:id/share', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { days = 0, hours = 0, seconds = 0 } = req.body;
        const userEmail = req.user.email;

        const recordings = await dbService.getRecordingsByUser(userEmail);
        const recording = recordings.find(r => r.id === parseInt(id));

        if (!recording) return res.status(404).json({ error: 'Recording not found' });

        // Calculate expiration
        const totalSeconds = (parseInt(days) * 86400) + (parseInt(hours) * 3600) + parseInt(seconds);
        const expiresAt = new Date(Date.now() + (totalSeconds * 1000));

        // Generate token if not exists
        const token = recording.share_token || crypto.randomBytes(32).toString('hex');

        await dbService.db.update(schema.recordings)
            .set({
                share_token: token,
                share_expires_at: expiresAt
            })
            .where(eq(schema.recordings.id, parseInt(id)));

        res.json({
            success: true,
            share_token: token,
            expires_at: expiresAt
        });
    } catch (err) {
        console.error('[Share Error]', err.message);
        res.status(500).json({ error: 'Failed' });
    }
});

// Get Shared Recording (Public Route)
router.get('/shared/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const shared = await dbService.db.select()
            .from(schema.recordings)
            .where(and(
                eq(schema.recordings.share_token, token),
                gt(schema.recordings.share_expires_at, new Date())
            ))
            .limit(1);

        if (!shared.length) return res.status(404).json({ error: 'Shared link expired or invalid' });

        const recording = shared[0];
        // Don't leak private fields
        const { user_email, file_path, s3_url, ...publicData } = recording;

        res.json({ success: true, recording: publicData });
    } catch (err) {
        console.error('[Shared Fetch Error]', err.message);
        res.status(500).json({ error: 'Failed' });
    }
});

// Stream Shared Audio (Public Route)
router.get('/shared/:token/stream', async (req, res) => {
    try {
        const { token } = req.params;

        const shared = await dbService.db.select()
            .from(schema.recordings)
            .where(and(
                eq(schema.recordings.share_token, token),
                gt(schema.recordings.share_expires_at, new Date())
            ))
            .limit(1);

        if (!shared.length) return res.status(404).json({ error: 'Shared link expired or invalid' });

        const recording = shared[0];
        const filePath = recording.file_path;

        if (filePath && fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': (end - start) + 1,
                    'Content-Type': 'video/webm',
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/webm' });
                fs.createReadStream(filePath).pipe(res);
            }
            return;
        }

        res.status(404).json({ error: 'Resource not available' });
    } catch (err) {
        console.error('[Shared Stream Error]', err.message);
        res.status(500).json({ error: 'Failed' });
    }
});

module.exports = router;
