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
                    'Content-Type': 'audio/webm',
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'audio/webm' });
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

module.exports = router;
