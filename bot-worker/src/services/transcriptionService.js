const axios = require('axios');
const fs = require('fs');
const path = require('path');
const deepgramService = require('./deepgramService');

class TranscriptionService {
    constructor() { }

    async transcribe(fileUrl, userEmail, localPath = null) {
        // Priority 1: Deepgram (Fastest & Handles .webm best)
        if (process.env.DEEPGRAM_API_KEY && localPath && fs.existsSync(localPath)) {
            console.log(`[TranscriptionService] Using DEEPGRAM for high-velocity transcription...`);
            // We return a special object that indicates we use Deepgram
            // Since Deepgram is "one-shot", we can actually do it here or skip the polling phase
            return { type: 'deepgram', localPath };
        }

        // Priority 2: AssemblyAI
        const apiKey = process.env.ASSEMBLY_AI_API_KEY;
        if (!apiKey || apiKey === 'your_api_key_here') {
            console.warn('[TranscriptionService] [WARN] No valid API Key for Deepgram or AssemblyAI found.');
            return null;
        }

        try {
            let assemblyUrl = fileUrl;
            if (localPath && fs.existsSync(localPath)) {
                const stats = fs.statSync(localPath);
                if (stats.size < 5000) return null;

                console.log(`[TranscriptionService] Uploading to AssemblyAI...`);
                const fileData = fs.readFileSync(localPath);
                const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', fileData, {
                    headers: { 'Authorization': apiKey, 'Content-Type': 'application/octet-stream' }
                });
                assemblyUrl = uploadRes.data.upload_url;
            }

            const response = await axios.post('https://api.assemblyai.com/v2/transcript', {
                audio_url: assemblyUrl,
                speaker_labels: true,
                language_detection: true,
                speech_models: ["universal-3-pro"]
            }, {
                headers: { 'authorization': apiKey }
            });

            return { type: 'assemblyai', id: response.data.id };
        } catch (err) {
            console.error('[TranscriptionService] [ERROR] AssemblyAI Error:', err.message);
            return null;
        }
    }

    async waitForCompletion(transcriptBundle) {
        if (!transcriptBundle) return null;

        // 1. Handle Deepgram with fallback to AssemblyAI
        if (transcriptBundle.type === 'deepgram') {
            const result = await deepgramService.transcribe(transcriptBundle.localPath);
            if (result && result.text && result.text.length > 5) return result;

            // Fallback to AssemblyAI
            console.log(`[TranscriptionService] Deepgram results poor/empty. Falling back to AssemblyAI for better quality...`);
            const fallbackBundle = await this.transcribe(null, null, transcriptBundle.localPath);
            if (fallbackBundle && fallbackBundle.type === 'assemblyai') {
                return this.waitForCompletion(fallbackBundle);
            }
            return result; // Return the poor result if AssemblyAI also not available
        }

        // 2. Handle AssemblyAI (Polling)
        if (transcriptBundle.type === 'assemblyai') {
            const transcriptId = transcriptBundle.id;
            const apiKey = process.env.ASSEMBLY_AI_API_KEY;

            const maxAttempts = 120;
            let attempts = 0;

            while (attempts < maxAttempts) {
                attempts++;
                await new Promise(r => setTimeout(r, 5000));

                try {
                    const res = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
                        headers: { 'authorization': apiKey }
                    });
                    const data = res.data;

                    if (data.status === 'completed') {
                        return {
                            text: data.text,
                            formatted: this.formatTranscript(data),
                            utterances: data.utterances
                        };
                    }

                    if (data.status === 'error') throw new Error(data.error);
                } catch (err) {
                    console.error(`[TranscriptionService] [ERROR] AssemblyAI Polling error:`, err.message);
                }
            }
        }

        throw new Error('Transcription failed or timed out');
    }

    formatTranscript(data) {
        if (!data.utterances) return data.text || 'No transcript available';

        let output = `MEETING TRANSCRIPT — PROCESSED BY MEETINGMIND AI\n`;
        output += `Date: ${new Date().toLocaleString()}\n`;
        output += `==============================================\n\n`;

        data.utterances.forEach(u => {
            const startSec = Math.floor(u.start / 1000);
            const m = Math.floor(startSec / 60);
            const s = startSec % 60;
            const timestamp = `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
            output += `${timestamp} Speaker ${u.speaker}:\n${u.text}\n\n`;
        });

        return output;
    }
}

module.exports = new TranscriptionService();
