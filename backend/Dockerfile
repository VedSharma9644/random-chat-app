FROM node:18-alpine

WORKDIR /app

# Install all dependencies including devDependencies for building
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Remove devDependencies and keep only production dependencies
RUN npm ci --only=production

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Add health check with increased timeout and retries
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/status || exit 1

# Expose the port
EXPOSE 8080

# Start the server with proper error handling and logging
CMD ["sh", "-c", "node dist/server.js 2>&1 | tee -a /proc/1/fd/1 || exit 1"]
