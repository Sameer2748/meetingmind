const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const dbService = require('../services/dbService');

// Login Route
router.post('/login', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        // Find or create user in DB
        const user = await dbService.findOrCreateUser(email);
        if (!user) throw new Error('Failed to identify user');

        // Generate token
        const token = jwt.sign({ email, userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user });
    } catch (err) {
        console.error('[Auth Error]', err.message);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

module.exports = router;
