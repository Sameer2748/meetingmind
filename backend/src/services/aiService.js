const axios = require('axios');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

/**
 * Chat with the AI about a meeting transcript.
 * @param {string} transcript - The full meeting transcript text
 * @param {string} userMessage - The user's question
 * @param {Array}  history     - Previous messages [{role:'user'|'ai', text:'...'}]
 */
async function chatWithTranscript(transcript, userMessage, history = []) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not set in environment');

    // Build conversation messages
    const messages = [
        {
            role: 'system',
            content: `You are MeetingMind AI, an expert assistant that helps users understand their meeting recordings.
You have been given the full transcript of a meeting below. Answer questions based ONLY on the transcript content.
Be concise, helpful, and accurate. If something is not mentioned in the transcript, say so clearly.

MEETING TRANSCRIPT:
---
${transcript ? transcript.substring(0, 12000) : 'No transcript available.'}
---`
        },
        // Inject conversation history (last 10 turns)
        ...history.slice(-10).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.text
        })),
        {
            role: 'user',
            content: userMessage
        }
    ];

    const response = await axios.post(
        GROQ_API_URL,
        {
            model: MODEL,
            messages,
            max_tokens: 1024,
            temperature: 0.7,
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) throw new Error('Empty response from Groq API');
    return reply.trim();
}

module.exports = { chatWithTranscript };
