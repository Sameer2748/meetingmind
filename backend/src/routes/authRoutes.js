const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dbService = require('../services/dbService');

// Google Identity Setup Route (Method 1)
router.post('/setup', async (req, res) => {
    const { accessToken, userInfo, cookies, timestamp } = req.body;

    if (!accessToken || !userInfo?.email) {
        return res.status(400).json({ error: 'OAuth token and user info required' });
    }

    try {
        // Find or create user
        let user = await dbService.findOrCreateUser(userInfo.email);
        if (!user) throw new Error('User creation failed');

        // Store tokens, profile and cookies
        user = await dbService.setupUser(userInfo.email, {
            name: userInfo.name,
            avatar: userInfo.picture,
            googleAccessToken: accessToken,
            cookies: cookies
        });

        // Generate our backend JWT for the extension to use
        const token = jwt.sign({ email: user.email, userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatar: user.avatar
            }
        });
    } catch (err) {
        console.error('[Auth Setup Error]', err.message);
        res.status(500).json({ error: 'Auth setup failed' });
    }
});

// Original Login Route (Keep for backward compatibility)
router.post('/login', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const user = await dbService.findOrCreateUser(email);
        if (!user) throw new Error('Failed to identify user');

        const token = jwt.sign({ email, userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user });
    } catch (err) {
        console.error('[Auth Error]', err.message);
        res.status(500).json({ error: 'Authentication failed' });
    }
});
// Get User Status (Plan, Count, etc)
router.get('/status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Auth header missing' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(`[Auth] Checking status for: ${decoded.email}`);

        // Ensure user exists (e.g. after DB reset)
        const user = await dbService.findOrCreateUser(decoded.email);
        if (!user) {
            console.error(`[Auth] [ERROR] Could not find or create user: ${decoded.email}`);
            return res.status(500).json({ error: 'User initialization failed' });
        }

        const stats = await dbService.getUserStats(decoded.email);
        if (!stats) {
            console.error(`[Auth] [ERROR] Stats returned null for: ${decoded.email}`);
            return res.status(500).json({ error: 'Failed to fetch stats' });
        }

        res.json(stats);
    } catch (err) {
        console.error('[Auth] [ERROR] Token verification failed:', err.message);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Upgrade User (Mock purchase)
router.post('/upgrade', async (req, res) => {
    const { email, plan } = req.body;
    if (!email || !plan) return res.status(400).json({ error: 'Email and plan required' });

    try {
        await dbService.upgradeUserPlan(email, plan);
        res.json({ success: true, message: `Upgraded to ${plan}` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upgrade plan' });
    }
});

module.exports = router;
