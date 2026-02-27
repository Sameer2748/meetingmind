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

            let transcriptUrl = 'https://api.deepgram.com/v1/listen?smart_format=true&diarize=true&model=nova-2&punctuate=true&paragraphs=true&filler_words=true&detect_language=true';

            let response = await axios.post(transcriptUrl, audioData, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/octet-stream'
                }
            });

            let result = response.data;
            let alternative = result.results.channels[0].alternatives[0];
            let detectedLang = result.results.channels[0].detected_language || 'en';

            // SMART RETRY: If transcript is empty, try forcing Hindi (common for this project)
            if ((!alternative.transcript || alternative.transcript.trim().length === 0) && result.metadata.duration > 3) {
                console.log(`[DeepgramService] [RETRY] Detected ${detectedLang} but transcript is empty. Retrying with forced Hindi (hi)...`);
                const retryUrl = 'https://api.deepgram.com/v1/listen?smart_format=true&diarize=true&model=nova-2&punctuate=true&paragraphs=true&filler_words=true&language=hi';
                const retryRes = await axios.post(retryUrl, audioData, {
                    headers: {
                        'Authorization': `Token ${apiKey}`,
                        'Content-Type': 'application/octet-stream'
                    }
                }).catch(() => null);

                if (retryRes && retryRes.data.results.channels[0].alternatives[0].transcript) {
                    result = retryRes.data;
                    alternative = result.results.channels[0].alternatives[0];
                    console.log(`[DeepgramService] [SUCCESS] Retry with Hindi worked!`);
                }
            }

            if (!alternative.transcript || alternative.transcript.trim().length === 0) {
                console.log(`[DeepgramService] Result still empty after retry. Falling back to AssemblyAI...`);
                return null;
            }

            const words = alternative.words || [];

            return {
                text: alternative.transcript || "",
                formatted: words.length > 0 ? this.formatTranscript(result) : (alternative.transcript || ""),
                words: words.map(w => ({
                    word: w.punctuated_word || w.word,
                    start: w.start,
                    end: w.end,
                    speaker: w.speaker,
                    confidence: w.confidence
                })),
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
            transcript += (word.punctuated_word || word.word) + " ";
        });

        return transcript;
    }
}

module.exports = new DeepgramService();
