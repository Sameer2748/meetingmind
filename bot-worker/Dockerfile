# bot-worker/Dockerfile
FROM mcr.microsoft.com/playwright:v1.50.1-noble

# Install system dependencies for audio/video processing if needed
RUN apt-get update && apt-get install -y \
    procps \
    xvfb \
    xauth \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Environment variables
ENV HEADLESS=true
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DISPLAY=:99

# Ensure the start script is executable
RUN chmod +x start.sh

# Run start script which handles Xvfb and npm start
CMD ["./start.sh"]
