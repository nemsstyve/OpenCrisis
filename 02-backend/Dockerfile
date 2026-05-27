# ─── Stage 1 : Build TypeScript ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

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
FROM node:20-alpine AS runner
WORKDIR /app

# Dépendances de production uniquement
COPY package*.json ./
RUN npm install --omit=dev

# Client Prisma généré
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Code compilé
COPY --from=builder /app/dist ./dist

# Schéma Prisma (nécessaire pour les migrations au runtime)
COPY prisma/ ./prisma/

# Répertoire des fichiers uploadés
RUN mkdir -p /app/uploads

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/server.js"]
