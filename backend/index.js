require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Start express
const app = express();
const PORT = process.env.PORT || 5001;

// Global Error Handling Setup
process.on('unhandledRejection', (err) => {
    console.error('[Server] [WARN] Unhandled Promise Rejection:', err.message || err);
});
process.on('uncaughtException', (err) => {
    console.error('[Server] [WARN] Uncaught Exception:', err.message || err);
});

// Regular Middlewares
app.use(cors());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// Main Routes
app.use('/api/auth', require('./src/routes/authRoutes'));
app.use('/api/recordings', require('./src/routes/recordingRoutes'));
app.use('/api/bot', require('./src/routes/botRoutes'));

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'MeetingMind Backend is running' });
});

app.listen(PORT, () => {
    console.log(`MeetingMind Backend listening at http://localhost:${PORT}`);
    console.log(`[Redis] Using: ${process.env.REDIS_URL ? 'Cloud (Upstash)' : 'Local (localhost)'}`);
});
