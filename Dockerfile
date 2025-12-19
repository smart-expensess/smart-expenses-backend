FROM node:20-alpine AS base

WORKDIR /app

# Install OS dependencies (if you later need 'sharp' or similar, add build tools here)
RUN apk add --no-cache bash

# Only install prod deps at runtime, keep dev deps in builder
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma

# Generate Prisma client and build TypeScript
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production

WORKDIR /app

# Copy node_modules (prod only) and built files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose API port
EXPOSE 4000

# Default runtime env vars
ENV PORT=4000
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/smart_expense

CMD ["node", "dist/server.js"]


