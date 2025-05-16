FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code and static files
COPY dist/ ./dist/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Create data directory for client database
RUN mkdir -p /app/data

# Expose WebSocket server port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV OLLAMA_API_URL=http://ollama:11434

# Start the server
CMD ["node", "dist/index.js"]
