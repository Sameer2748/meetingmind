# MeetingMind

MeetingMind is a high-fidelity, distributed AI notetaker designed for Google Meet. It seamlessly captures, transcribes, and analyzes your meetings, providing a central dashboard to manage and review all your conversations.

## ✨ Key Features
- **Integrated Video Capturing**: High-quality audio and video capture directly from Google Meet.
- **Distributed Architecture**: Scalable worker-based system using Redis for handling multiple concurrent recordings.
- **Chrome Extension**: Direct injection into the Google Meet UI for one-click recording.
- **Real-time Transcription**: Powered by Deepgram for lightning-fast and accurate transcripts.
- **Intuitive Dashboard**: Next.js powered interface to search, playback, and review all meeting recordings.
- **Automatic Cloud Sync**: Reliable storage for all meeting assets on AWS S3.

---

## 🏗️ Architecture

MeetingMind is built on a modern, distributed stack designed for reliability and scale:

- **Frontend**: Next.js Dashboard + React components (TailwindCSS/Shadcn UI).
- **Backend API**: Node.js/Express.js gateway for session management and user authentication.
- **Bot Worker**: Standalone Puppeteer-based recording engine with intelligent meeting navigation.
- **Task Queue**: BullMQ (Redis) for managing recording jobs and inter-service communication.
- **Database**: PostgreSQL (Drizzle ORM) for structured data and transcript storage.
- **Cloud Storage**: AWS S3 for hosting raw media and final artifacts.

---

## 🎥 Product Walkthrough

Watch MeetingMind in action! This video covers the entire flow from extension setup to reviewing transcripts in the dashboard.

> **Note:** Please add your video demonstration link here to give users a live view of the platform.

<div align="center">
  <video src="YOUR_VIDEO_URL_HERE" width="100%" controls></video>
</div>

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18+)
- Docker & Docker Compose
- AWS Credentials (S3)
- Deepgram API Key

### 2. Environment Setup
Create a `.env` file in the root directory based on the following template:
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5433/meetingmind

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=your_region
S3_BUCKET_NAME=your_bucket

# AI Services
DEEPGRAM_API_KEY=your_key
```

### 3. Start with Docker (Recommended)
Launch the entire infrastructure with a single command:
```bash
docker-compose up -d
```
This starts PostgreSQL, Redis, and the Bot Worker.

### 4. Start Development Services
Run the Backend and Frontend locally:
```bash
# Room 1: Backend
cd backend && npm run dev

# Room 2: Frontend
cd frontend && npm run dev
```

### 5. Install Chrome Extension
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer Mode**.
3. Click **Load Unpacked** and select the `meetingmind-extension` folder.
4. Refresh your Google Meet page!

---

## 🔧 Project Structure
- `/frontend`: Next.js web application.
- `/backend`: Core API and database management.
- `/bot-worker`: Recording service and Puppeteer engine.
- `/meetingmind-extension`: Chrome extension for Google Meet integration.
- `/assets`: Documentation screenshots and branding assets.

---

© 2026 MeetingMind. Built with ❤️ for better collaboration.
