require('dotenv').config({ path: '../.env' });
const transcriptionService = require('./src/services/transcriptionService');
const path = require('path');
const fs = require('fs');

async function testTranscription() {
    // Pick the latest non-zero file
    const dir = path.join(__dirname, 'recordings', 'mrao27488@gmail.com');
    if (!fs.existsSync(dir)) {
        console.error('Recordings directory not found');
        return;
    }

    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.webm'))
        .map(f => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size }))
        .filter(f => f.size > 500000) // Increase threshold to 500KB
        .sort((a, b) => b.size - a.size); // Sort by size to get best sample

    if (files.length === 0) {
        console.error('No valid audio files found for testing');
        return;
    }

    const testFile = files[0];
    console.log(`[TEST] Using file: ${testFile.name} (${Math.round(testFile.size / 1024)} KB)`);

    try {
        console.log('[TEST] Starting transcription process...');
        const bundle = await transcriptionService.transcribe('http://fake-s3-url.com', 'test@user.com', testFile.path);

        console.log(`[TEST] Bundle received: ${JSON.stringify(bundle)}`);

        const result = await transcriptionService.waitForCompletion(bundle);

        console.log('\n================ TRANSCRIPTION RESULT ================');
        console.log(`Detected Length: ${result.text ? result.text.length : 0} characters`);
        console.log('--- START PREVIEW (First 500 chars) ---');
        console.log(result.text ? result.text.substring(0, 500) + '...' : 'NO TEXT PRODUCED');
        console.log('--- END PREVIEW ---');

        if (result.raw && result.raw.results && result.raw.results.channels[0].detected_language) {
            console.log(`\nDetected Language: ${result.raw.results.channels[0].detected_language}`);
        } else {
            console.log('\nLanguage detection info not found in raw results.');
        }
        console.log('======================================================');

    } catch (err) {
        console.error('[TEST] Error during test:', err);
    }
}

testTranscription();
