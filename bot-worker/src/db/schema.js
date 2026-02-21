const { pgTable, serial, text, integer, timestamp, jsonb } = require('drizzle-orm/pg-core');

const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').unique().notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

const recordings = pgTable('recordings', {
    id: serial('id').primaryKey(),
    meeting_url: text('meeting_url'),
    user_email: text('user_email'),
    file_path: text('file_path'),
    s3_url: text('s3_url'),
    transcript_id: text('transcript_id'),
    transcript_text: text('transcript_text'),
    transcript_url: text('transcript_url'),
    transcript_words: jsonb('transcript_words'),
    status: text('status').default('pending'),
    duration: integer('duration').default(0),
    created_at: timestamp('created_at').defaultNow(),
});

module.exports = {
    users,
    recordings,
};
