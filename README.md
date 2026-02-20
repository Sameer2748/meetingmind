# MeetingMind 🤖

MeetingMind is a high-fidelity AI notetaker for Google Meet. it uses a scalable, distributed architecture to capture, transcribe, and analyze meetings.

## 🏗️ Architecture

- **Frontend**: Next.js Dashboard for viewing and managing recordings.
- **Backend**: Express.js API for authentication and session management.
- **Bot Worker**: Standalone Puppeteer-based service for meeting recording.
- **Redis**: Task queue (BullMQ) and Pub/Sub for distributed control.
- **PostgreSQL**: Centralized meeting and transcript storage.
- **AWS S3**: Cloud storage for raw audio and final transcripts.

## 🚀 Setup Instructions

### 1. Prerequisites
- Node.js & npm
- PostgreSQL
- **Redis** (Required for the new scalable worker logic)
- AWS Account (S3)

### 2. Install Redis (Mac)
```bash
brew install redis
brew services start redis
```

### 3. Start Services

#### Room 1: Backend API
```bash
cd backend
npm install
npm run dev
```

#### Room 2: Bot Worker (New ✨)
```bash
cd bot-worker
npm install
npm run dev
```

#### Room 3: Frontend
```bash
cd frontend
npm install
npm run dev
```

### 4. Browser Extension
- Open Chrome -> `chrome://extensions`
- Enable **Developer Mode**
- Click **Load Unpacked** -> Select the `meetingmind-extension` folder.
