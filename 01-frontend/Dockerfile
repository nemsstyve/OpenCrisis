# ─── Stage 1 : Build Vite ─────────────────────────────────────────────────────
FROM node:20.19.0-alpine AS builder
WORKDIR /app

# Installation de pnpm (le template utilise pnpm)
RUN npm install -g pnpm

# Dépendances en premier pour profiter du cache Docker
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# Code source
COPY . .
RUN pnpm build

# ─── Stage 2 : Serveur de fichiers statiques (nginx-unprivileged) ─────────────
# nginx-unprivileged tourne SANS DROITS ROOT nativement, écoute sur 8080
# (port non-privilégié > 1024), et écrit PID/temp dans /tmp.
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runner

# wget nécessaire pour le healthcheck Docker (busybox wget présent mais expliciter la dépendance)
RUN apk add --no-cache wget

# Config nginx pour SPA (fallback sur index.html pour le routing React)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Fichiers buildés par Vite
COPY --from=builder /app/dist /usr/share/nginx/html

# Port non-privilégié — pas besoin de NET_BIND_SERVICE
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080 || exit 1
