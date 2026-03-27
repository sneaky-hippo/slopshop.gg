FROM node:20-slim

WORKDIR /app

# Install Python + CA certificates for outbound HTTPS
RUN apt-get update && apt-get install -y python3 curl ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/* && update-ca-certificates

COPY package*.json ./
RUN npm ci --production

COPY . .

# Create data directories (both possible mount points)
RUN mkdir -p .data/files data && chmod 777 .data data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:3000/v1/health || exit 1

# Fix volume permissions at runtime then start server
CMD ["sh", "-c", "chmod -R 777 /app/data 2>/dev/null; exec node server-v2.js"]
