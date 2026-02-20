const express = require('express');
const path = require('path');
const app = express();
const botService = require('./src/bot/botService');

// Serve the Landing/Onboarding Page
app.get('/onboarding', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Activate MeetingMind</title>
            <style>
                body { background: #0f172a; color: white; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 40px; border-radius: 20px; text-align: center; max-width: 400px; border: 1px solid #334155; }
                h1 { font-size: 24px; margin-bottom: 10px; }
                p { color: #94a3b8; margin-bottom: 30px; }
                .btn { background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block; cursor: pointer; transition: 0.3s; }
                .btn:hover { background: #2563eb; transform: translateY(-2px); }
                .status { margin-top: 20px; font-size: 14px; color: #10b981; display: none; }
            </style>
        </head>
        <body>
            <div class="card">
                <div style="font-size: 50px; margin-bottom: 20px;">🤖</div>
                <h1>Connect Your Account</h1>
                <p>To let the AI join your meetings automatically, we need to authorize a recording session.</p>
                <div class="btn" onclick="startSetup()">Authorize Recording Bot</div>
                <div id="status" class="status">✅ Authorization Window Opened!</div>
            </div>
            <script>
                function startSetup() {
                    fetch('/api/bot/setup');
                    document.getElementById('status').style.display = 'block';
                }
            </script>
        </body>
        </html>
    `);
});

// The actual setup route that opens the login window
app.get('/api/bot/setup', async (req, res) => {
    botService.setupSession();
    res.json({ success: true });
});
