const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const dbService = require('../services/dbService');
const jwt = require('jsonwebtoken');
const { eq, desc } = require('drizzle-orm');

let razorpay;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
} else {
    console.error('[Razorpay] ❌ Keys missing in .env! Payments will fail.');
}

// Middleware to verify JWT and attach user to request
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// 1. Create Order
router.post('/create-order', authenticate, async (req, res) => {
    if (!razorpay) {
        return res.status(500).json({ error: 'Razorpay is not configured on the server.' });
    }
    const { planId } = req.body;

    // Plan prices in INR (multiplied by 100 for paise)
    const PLANS = {
        pro: 500,        // ₹5
        enterprise: 4900 // ₹49
    };

    const amount = PLANS[planId] || 8500;

    const options = {
        amount: amount,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error('[Razorpay Order Error]', err);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

// 2. Verify Payment
router.post('/verify-payment', authenticate, async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest("hex");

    if (razorpay_signature === expectedSign) {
        // Payment is verified
        try {
            await dbService.upgradeUserPlan(req.user.email, planId || 'pro');

            // Log payment details in DB
            try {
                // Fetch order details from Razorpay to get accurate amount/currency
                const order = await razorpay.orders.fetch(razorpay_order_id);
                await dbService.savePayment({
                    user_email: req.user.email,
                    order_id: razorpay_order_id,
                    payment_id: razorpay_payment_id,
                    amount: order.amount / 100, // Store in Rupees, not Paise
                    currency: order.currency,
                    plan: planId || 'pro'
                });
            } catch (pErr) {
                console.warn('[Razorpay] Payment verified but log failed:', pErr.message);
            }

            res.json({ success: true, message: "Payment verified and plan upgraded" });
        } catch (err) {
            console.error('[Verify Payment DB Error]', err);
            res.status(500).json({ error: "Payment verified but failed to update plan" });
        }
    } else {
        res.status(400).json({ error: "Invalid payment signature" });
    }
});

// 3. Get Payment History
router.get('/history', authenticate, async (req, res) => {
    try {
        const history = await dbService.db.select()
            .from(require('../db/schema').payments)
            .where(eq(require('../db/schema').payments.user_email, req.user.email))
            .orderBy(desc(require('../db/schema').payments.created_at));
        res.json(history);
    } catch (err) {
        console.error('[Payment History Error]', err);
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

module.exports = router;
