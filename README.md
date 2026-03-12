# 🧠 MeetingMind 

MeetingMind is an open-source, fully-automated AI Meeting Assistant. It acts as your personal invisible notetaker: automatically joining your Google Meets using a headless bot, recording the session, generating word-level transcripts with speaker diarization, and giving you an interactive "Spotify-like" dashboard to playback and query your meetings using AI.

Think of it as an open-source alternative to Fathom, Fireflies.ai, or Otter.ai.

---

## 🚀 Core Features

- **🤖 Automated Bot Worker**: A headless Puppeteer-based worker that silently joins your Google Meets when invited via the Chrome Extension.
- **🎙️ High-Fidelity Recording**: Direct audio/video stream capturing uploaded securely and reliably to AWS S3.
- **📝 Blazing Fast Transcripts**: Powered by Deepgram AI, delivering highly accurate speaker-diarized text with exact word-level timestamping.
- **🎵 Synced Video Playback UI**: A premium dashboard featuring a custom video player. Click any word in the transcript to jump the video to that exact moment.
- **💬 Context-Aware AI Chat**: Ask questions, generate summaries, or pull action items from your meeting transcript directly inside the dashboard using Gemini/OpenAI.
- **🔗 1-Click Chrome Extension**: A custom extension injected into your Google Meet UI allows you to invite the bot with a single button press.

---

## 🏗️ Architecture

MeetingMind is composed of four distinct microservices, communicating via PostgreSQL and Redis for robust distributed queuing.

1. **`/frontend`** (Next.js 14, React, Tailwind CSS): The beautiful, premium user dashboard. Features the complex synced video player, shareable links, and AI Chat UI.
2. **`/backend`** (Node.js, Express, Drizzle ORM): The central nervous system. Manages authentication, database operations, securely signs URLs for AWS S3 fetching, and hosts the REST API.
3. **`/bot-worker`** (Node.js, Puppeteer): The heavy lifter. A scalable consumer that reads from a Redis queue. It opens Google Chrome headlessly, joins the Meet, records the DOM/Canvas, processes the `.webm` file, and talks to Deepgram for transcripts.
4. **`/meetingmind-extension`** (Manifest v3, Vanilla JS): A lightweight browser extension that reads your active Google Meet URL and sends a payload to the backend to add a job to the Redis queue.

---

## 🛠️ Quick Start & Local Development

### Prerequisites
- **Node.js**: v18 or higher
- **PostgreSQL**: A running instance (local or cloud like Supabase/Neon).
- **Redis**: A running instance for BullMQ queues (local or cloud like Upstash).
- **AWS S3**: An S3 bucket with proper IAM write credentials configured.
- **Deepgram API Key**: For transcription.
- **Google OAuth Credentials**: For the user Sign-In system.

### 1. Database & Backend Setup
Navigate to the `/backend` folder.

```bash
cd backend
npm install
```

Create a `.env` file in the `/backend` directory:
```env
PORT=5000
DATABASE_URL="postgresql://user:pass@localhost:5432/meetingmind"
FRONTEND_URL="http://localhost:3000"
JWT_SECRET="your_secret_string"

AWS_ACCESS_KEY_ID="your_aws_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret"
AWS_REGION="us-east-1"
AWS_BUCKET_NAME="your-bucket-name"

REDIS_HOST="127.0.0.1"
REDIS_PORT=6379

GOOGLE_CLIENT_ID="your_google_id.apps.googleusercontent.com"
```

Push the database schema using Drizzle and start the server:
```bash
npx drizzle-kit push --config=drizzle.config.js
npm run dev
```

### 2. Frontend Setup
Navigate to the `/frontend` folder.

```bash
cd frontend
npm install
```

Create a `.env.local` file in the `/frontend` directory:
```env
NEXT_PUBLIC_API_URL="http://localhost:5000"
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your_google_id.apps.googleusercontent.com"
```

Start the Next.js application:
```bash
npm run dev
```
The dashboard is now running on `http://localhost:3000`.

### 3. Bot Worker Setup
Navigate to the `/bot-worker` folder.

```bash
cd bot-worker
npm install
```

Create a `.env` file in the `/bot-worker` directory:
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/meetingmind"

AWS_ACCESS_KEY_ID="your_aws_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret"
AWS_REGION="us-east-1"
AWS_BUCKET_NAME="your-bucket-name"

REDIS_HOST="127.0.0.1"
REDIS_PORT=6379

DEEPGRAM_API_KEY="your_deepgram_key"
GEMINI_API_KEY="your_gemini_key"
```

Start the headless bot worker:
```bash
npm run dev
```

### 4. Chrome Extension Installation
To easily invite the bot to your meetings:
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Turn on **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the `/meetingmind-extension` folder.
5. Make sure the `config.js` file inside the extension points to your local backend (`http://localhost:5000`).

---

## 🚢 Deploying the Bot Worker

Deploying the frontend (Vercel) and backend (Render/Heroku) is standard. However, deploying the **Bot Worker** requires specific dependencies because it runs a full headless Chrome browser instance via Puppeteer.

If you are deploying the bot worker to a Linux VPS (like DigitalOcean, AWS EC2, or Hetzner), you **must** install the necessary OS-level dependencies for Chrome.

### Ubuntu/Debian Deployment Instructions for Bot:
1. SSH into your server.
2. Install Node.js, Redis, and clone the repository.
3. Install the required Chrome dependencies:
```bash
sudo apt-get update
sudo apt-get install -yq \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
    libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
    libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
    libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
    libxtst6 ca-certificates fonts-liberation libnss3 lsb-release \
    xdg-utils wget
```
4. Navigate to `/bot-worker`, run `npm install`, populate your `.env` file, and start the process using a manager like `pm2`:
```bash
npm install -g pm2
pm2 start src/index.js --name "meetingmind-bot"
```

Alternatively, you can Dockerize the bot worker using a base image that already contains Puppeteer dependencies (e.g., `ghcr.io/puppeteer/puppeteer:latest`).

---

## 🤝 Contributing

Contributions are welcome! If you find a bug, want to add styling updates, or want to expand the AI integration (e.g., adding Anthropic support), feel free to open a Pull Request.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
