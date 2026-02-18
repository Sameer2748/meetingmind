const axios = require('axios');
const fs = require('fs');

class DeepgramService {
    constructor() {
        // API key will be read from process.env.DEEPGRAM_API_KEY
    }

    async transcribe(localPath) {
        const apiKey = process.env.DEEPGRAM_API_KEY;

        if (!apiKey) {
            console.warn('[DeepgramService] [WARN] DEEPGRAM_API_KEY is missing in .env.');
            return null;
        }

        console.log(`[DeepgramService] Sending ${localPath} to Deepgram...`);

        try {
            const audioData = fs.readFileSync(localPath);

            const response = await axios.post(
                'https://api.deepgram.com/v1/listen?smart_format=true&diarize=true&model=nova-2&detect_language=true&punctuate=true&paragraphs=true',
                audioData,
                {
                    headers: {
                        'Authorization': `Token ${apiKey}`,
                        'Content-Type': 'application/octet-stream'
                    }
                }
            );

            const result = response.data;
            return {
                text: result.results.channels[0].alternatives[0].transcript,
                formatted: this.formatTranscript(result),
                raw: result
            };

        } catch (err) {
            console.error('[DeepgramService] [ERROR] Error:', err.response ? err.response.data : err.message);
            return null;
        }
    }

    formatTranscript(data) {
        const words = data.results.channels[0].alternatives[0].words;
        if (!words || words.length === 0) return "";

        let currentSpeaker = words[0].speaker;
        let transcript = `MEETING TRANSCRIPT — PROCESSED BY DEEPGRAM AI\n`;
        transcript += `==============================================\n\n`;
        transcript += `[00:00] Speaker ${currentSpeaker}: `;

        words.forEach(word => {
            if (word.speaker !== currentSpeaker) {
                currentSpeaker = word.speaker;
                const m = Math.floor(word.start / 60);
                const s = Math.floor(word.start % 60);
                const timestamp = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
                transcript += `\n\n${timestamp} Speaker ${currentSpeaker}: `;
            }
            transcript += word.punctuated_word || word.word + " ";
        });

        return transcript;
    }
}

module.exports = new DeepgramService();
