# Stage 1: Build dependencies
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Production image
FROM node:18-alpine

WORKDIR /app

# Install runtime tools required for health checks
RUN apk add --no-cache curl

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV NODE_ENV=production
ENV PORT=3006

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -sf http://localhost:3006/health || exit 1

CMD ["node", "src/server.js"]
