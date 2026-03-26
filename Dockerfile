FROM node:20-slim

WORKDIR /app

# Install Python for exec-python handler
RUN apt-get update && apt-get install -y python3 curl --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --production

COPY . .

# Create data directory
RUN mkdir -p .data/files && chown -R node:node .data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:3000/v1/health || exit 1

CMD ["node", "server-v2.js"]
