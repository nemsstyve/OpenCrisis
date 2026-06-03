# ─── Stage 1 : Build Vite ─────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Installation de pnpm (le template utilise pnpm)
RUN npm install -g pnpm

# Dépendances en premier pour profiter du cache Docker
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# Code source
COPY . .
RUN pnpm build

# ─── Stage 2 : Serveur de fichiers statiques ──────────────────────────────────
FROM nginx:alpine AS runner

RUN apk add --no-cache wget

# Config nginx pour SPA (fallback sur index.html pour le routing React)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Fichiers buildés par Vite
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1
