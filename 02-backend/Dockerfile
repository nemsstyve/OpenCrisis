# ─── Stage 1 : Build TypeScript ───────────────────────────────────────────────
FROM node:20.19.0-alpine AS builder
WORKDIR /app

# OpenSSL requis pour que Prisma génère le bon binary (linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
COPY prisma/ ./prisma/

# Générer le client Prisma
RUN npx prisma generate

# Compiler TypeScript → JavaScript
RUN npm run build

# ─── Stage 2 : Image de production ────────────────────────────────────────────
FROM node:20.19.0-alpine AS runner
WORKDIR /app

# OpenSSL requis au runtime par le Prisma Client
RUN apk add --no-cache openssl

# Dépendances de production uniquement
COPY package*.json ./
RUN npm install --omit=dev

# Client Prisma généré
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Code compilé
COPY --from=builder /app/dist ./dist

# Schéma Prisma + tsconfig (ts-node en a besoin pour le seed)
COPY prisma/ ./prisma/
COPY tsconfig.json ./

# Répertoire des fichiers uploadés + exécution en utilisateur non privilégié
# (l'utilisateur "node" est fourni par l'image officielle)
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
