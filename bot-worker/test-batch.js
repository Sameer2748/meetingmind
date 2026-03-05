require('dotenv').config({ path: '../.env' });
const transcriptionService = require('./src/services/transcriptionService');
const path = require('path');
const fs = require('fs');

async function testAll() {
    const dir = path.join(__dirname, 'recordings', 'mrao27488@gmail.com');
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.webm'))
        .map(f => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size }))
        .filter(f => f.size > 200000)
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 5);

    for (const testFile of files) {
        console.log(`\n[TEST] File: ${testFile.name} (${Math.round(testFile.size / 1024)} KB)`);
        try {
            const bundle = await transcriptionService.transcribe(null, null, testFile.path);
            const result = await transcriptionService.waitForCompletion(bundle);
            const lang = result.raw?.results?.channels[0]?.detected_language || 'unknown';
            console.log(`Detected Language: ${lang}`);
            console.log(`Preview: ${result.text.substring(0, 100)}...`);
        } catch (e) {
            console.error(`Error on ${testFile.name}: ${e.message}`);
        }
    }
}

testAll();
