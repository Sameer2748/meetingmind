const { db, pool } = require('../db');
const { users, recordings } = require('../db/schema');
const { eq, desc, and } = require('drizzle-orm');

class DatabaseService {
    constructor() {
        this.db = db;
        this.pool = pool;
        this.init();
    }

    async init() {
        try {
            console.log('[Database] Connected to PostgreSQL via Drizzle');
        } catch (err) {
            console.error('[Database] [ERROR] Connection Error:', err.message);
        }
    }

    async findOrCreateUser(email) {
        try {
            const existingUser = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
            if (existingUser.length > 0) return existingUser[0];

            const newUser = await this.db.insert(users).values({ email }).returning();
            return newUser[0];
        } catch (err) {
            console.error('[Database] [ERROR] Failed to find/create user:', err.message);
            return null;
        }
    }

    async saveRecording(data) {
        const { id, meeting_url, user_email, file_path, s3_url, status, duration } = data;
        try {
            if (id) {
                // Mimic COALESCE by only updating defined fields
                const updateData = {};
                if (s3_url !== undefined) updateData.s3_url = s3_url;
                if (status !== undefined) updateData.status = status;
                if (duration !== undefined) updateData.duration = duration;
                if (file_path !== undefined) updateData.file_path = file_path;

                await this.db.update(recordings)
                    .set(updateData)
                    .where(eq(recordings.id, id));
                return id;
            } else {
                // Insert new
                const newRecording = await this.db.insert(recordings).values({
                    meeting_url,
                    user_email,
                    file_path,
                    s3_url,
                    status: status || 'saved',
                    duration: duration || 0
                }).returning({ id: recordings.id });

                return newRecording[0].id;
            }
        } catch (err) {
            console.error('[Database] [ERROR] Failed to save/update recording:', err.message);
            return null;
        }
    }

    async updateTranscriptId(recordingId, transcriptId) {
        try {
            await this.db.update(recordings)
                .set({
                    transcript_id: transcriptId,
                    status: 'transcribing'
                })
                .where(eq(recordings.id, recordingId));
        } catch (err) {
            console.error('[Database] [ERROR] Failed to update transcript ID:', err.message);
        }
    }

    async saveTranscriptResult(recordingId, text, transcriptUrl, words = null) {
        try {
            const updateData = {
                transcript_text: text,
                transcript_url: transcriptUrl,
                status: 'completed'
            };
            if (words) {
                updateData.transcript_words = words;
            }
            await this.db.update(recordings)
                .set(updateData)
                .where(eq(recordings.id, recordingId));
            console.log(`[Database] Transcript results saved for recording ID: ${recordingId}${words ? ` (${words.length} words with timestamps)` : ''}`);
        } catch (err) {
            console.error('[Database] [ERROR] Failed to save transcript result:', err.message);
        }
    }

    async getRecordingsByUser(email) {
        try {
            return await this.db.select()
                .from(recordings)
                .where(eq(recordings.user_email, email))
                .orderBy(desc(recordings.created_at));
        } catch (err) {
            console.error('[Database] [ERROR] Failed to fetch recordings:', err.message);
            return [];
        }
    }

    async deleteRecording(id) {
        try {
            await this.db.delete(recordings).where(eq(recordings.id, id));
            return true;
        } catch (err) {
            console.error('[Database] [ERROR] Failed to delete recording:', err.message);
            return false;
        }
    }
}

module.exports = new DatabaseService();
