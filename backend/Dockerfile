# backend/Dockerfile
FROM node:20-slim

# Install dependencies for Puppeteer (even though bot logic moved, some deps might be shared or needed for potential fallbacks)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5001

CMD ["npm", "run", "dev"]
