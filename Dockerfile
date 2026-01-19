# ---- Base (Alpine) ----
    FROM node:20-alpine AS base
    WORKDIR /app
    
    # Prisma needs OpenSSL compatibility on Alpine
    RUN apk add --no-cache openssl libc6-compat
    
    # ---- deps: install prod deps + generate prisma client ----
    FROM base AS deps
    COPY package.json package-lock.json ./
    RUN npm ci --omit=dev
    
    # Copy prisma schema so we can generate client in this stage
    COPY prisma ./prisma
    
    # Generate Prisma Client into node_modules/.prisma
    RUN npx prisma generate
    
    # ---- builder: install all deps + build ----
    FROM base AS builder
    COPY package.json package-lock.json ./
    RUN npm ci
    
    COPY tsconfig.json ./
    COPY src ./src
    COPY prisma ./prisma
    
    RUN npx prisma generate
    RUN npm run build
    
    # ---- runner ----
    FROM base AS runner
    WORKDIR /app
    ENV NODE_ENV=production
    ENV PORT=4000
    
    # Bring prod deps INCLUDING generated prisma client from deps stage
    COPY --from=deps /app/node_modules ./node_modules
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/prisma ./prisma
    COPY package.json ./
    
    EXPOSE 4000
    
    CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
    