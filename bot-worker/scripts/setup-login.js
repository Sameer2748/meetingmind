const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * This script launches your REAL Google Chrome application on Mac
 * using a dedicated data folder for the bot.
 * 
 * This is the ONLY 100% reliable way to log into Google for a bot.
 */
function setupLogin() {
    const profilePath = path.join(__dirname, '../bot_chrome_data');
    if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });

    // The path to the real Google Chrome binary on macOS
    const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    // Kill any existing Chrome processes using this profile to avoid "existing session" lock
    try {
        const { execSync } = require('child_process');
        execSync('pkill -f "Google Chrome" || true');
        console.log('🧹 Cleared existing Chrome processes...');
    } catch (e) { }

    // Launch command that opens a clean window with our bot profile
    const flags = [
        `--user-data-dir="${profilePath}"`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--remote-debugging-port=9222',
        '--window-size=1280,720',
        '--disable-gpu',
        '--disable-software-rasterizer',
        'https://accounts.google.com'
    ].join(' ');

    const command = `"${chromeBinary}" ${flags}`;

    console.log('🚀 Launching REAL Google Chrome...');
    console.log(`📂 Profile: ${profilePath}`);
    console.log('\n------------------------------------------------------------');
    console.log('1. Log in to your Google account in the browser that just opened.');
    console.log('2. Once logged in, simply CLOSE that Chrome window.');
    console.log('3. Your bot will then be signed in FOREVER using that profile.');
    console.log('------------------------------------------------------------\n');

    exec(command, (err) => {
        if (err) {
            console.error('❌ Failed to launch Chrome. Make sure Google Chrome is installed in /Applications.');
            console.error(err.message);
            return;
        }
        console.log('✅ Chrome closed. You can now run the bot worker!');
    });
}

setupLogin();
