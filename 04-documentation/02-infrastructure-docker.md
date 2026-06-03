# Infrastructure Docker

## Vue d'ensemble

L'application est découpée en **5 services Docker** isolés, orchestrés par Docker Compose. Chaque service a une responsabilité unique et communique avec les autres via un réseau interne privé.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Réseau : opencrisis (bridge)                  │
│                                                                  │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  nginx   │──▶│   frontend   │   │        backend          │ │
│  │  :80     │   │   :80        │   │        :4000            │ │
│  └────┬─────┘   └──────────────┘   └────────┬────────────────┘ │
│       │                                      │                  │
│       └──────────────────────────────────────┘                  │
│                                              │                  │
│                               ┌──────────────┴──────────────┐  │
│                               │                             │  │
│                    ┌──────────▼──────┐     ┌───────────────▼┐ │
│                    │    postgres     │     │     redis      │ │
│                    │    :5432        │     │     :6379      │ │
│                    └─────────────────┘     └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

Volumes persistants : postgres_data | redis_data | uploads_data
Port exposé au host : 80 (nginx uniquement)
```

---

## Description de chaque service

### nginx — Reverse Proxy

**Image** : `nginx:alpine`  
**Port exposé** : `80:80` (seul port accessible depuis l'extérieur)

Le reverse proxy est le **point d'entrée unique** de l'application. Il reçoit toutes les requêtes HTTP et WebSocket et les redirige vers le bon service interne selon le chemin :

| Chemin | Destination | Remarque |
|---|---|---|
| `/api/graphql` | `backend:4000` | WebSocket activé (subscriptions temps réel) |
| `/api/*` | `backend:4000` | Routes REST (auth, téléchargement de fichiers) |
| `/*` | `frontend:80` | SPA React — fallback vers `index.html` |

**Pourquoi un reverse proxy ?**
- **Pas de CORS** : frontend et backend partagent le même domaine (`localhost`) — pas de header `Access-Control-Allow-Origin` à gérer
- **WebSocket transparent** : le browser se connecte en HTTP et nginx gère l'upgrade WebSocket vers le backend
- **Point HTTPS unique** : en production, le certificat SSL est configuré une seule fois sur nginx

**Configuration WebSocket** (extrait de `03-nginx/nginx.conf`) :
```nginx
location /api/graphql {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # Upgrade HTTP → WebSocket
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;                    # Connexion persistante 1h
}
```

---

### frontend — Interface React

**Image** : Build multi-stage (`node:20-alpine` → `nginx:alpine`)  
**Port interne** : `80`

Le frontend est une **Single Page Application (SPA)** construite avec Vite. Le build Docker se déroule en deux étapes :

**Étape 1 — Build Vite** (image `node:20-alpine`) :
```
pnpm install → tsc → vite build → dist/
```

**Étape 2 — Serveur statique** (image `nginx:alpine`) :
```
Copie de dist/ → /usr/share/nginx/html/
```

Le nginx interne du frontend est configuré pour le routing SPA :
```nginx
location / {
    try_files $uri $uri/ /index.html;  # Toute route inconnue → React Router
}
```

Sans ce `try_files`, un utilisateur qui recharge la page sur `/incidents/abc/dashboard` obtiendrait une erreur 404 nginx car le fichier n'existe pas — React Router n'aurait pas eu l'occasion de gérer la route.

**Optimisation des assets** : les fichiers JS/CSS générés par Vite portent un hash dans leur nom (`index-BrdzOaiK.js`). Ces fichiers sont mis en cache 1 an par le navigateur (`Cache-Control: public, immutable`).

---

### backend — API GraphQL

**Image** : Build multi-stage (`node:20-alpine` → `node:20-alpine`)  
**Port interne** : `4000`

Le backend expose :
- **`POST /api/graphql`** — endpoint GraphQL principal (queries et mutations)
- **`GET /api/graphql`** — WebSocket upgrade pour les subscriptions
- **`GET /api/health`** — health check (utilisé par Docker et nginx)
- **`GET /api/files/:path`** — téléchargement de fichiers (protégé par JWT)

**Build multi-stage** : L'image de production ne contient pas le compilateur TypeScript ni les devDependencies (nodemon, ts-node, etc.), ce qui réduit la taille de l'image finale.

```dockerfile
# Stage 1 (builder) : ~500MB avec tous les outils de dev
FROM node:20-alpine AS builder
RUN npm install               # Installe TOUTES les dépendances
RUN npx prisma generate       # Génère le client Prisma typé
RUN npm run build             # Compile TypeScript → JavaScript

# Stage 2 (runner) : ~150MB — image de production légère
FROM node:20-alpine AS runner
RUN npm install --omit=dev    # Dépendances de production uniquement
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
```

**Volume uploads** : Le répertoire `/app/uploads` est monté depuis le volume Docker `uploads_data`. Les fichiers survivent aux redémarrages et rebuilds du container.

---

### postgres — Base de données

**Image** : `postgres:16-alpine`  
**Port interne** : `5432` (non exposé au host en production)

PostgreSQL stocke toutes les données applicatives. La base `opencrisis` est créée automatiquement au premier démarrage via les variables d'environnement.

**Persistence** : Le volume `postgres_data` monte `/var/lib/postgresql/data` — toutes les données sont conservées entre les redémarrages Docker.

**Healthcheck** :
```yaml
test: ["CMD-SHELL", "pg_isready -U opencrisis -d opencrisis"]
```
Le backend ne démarre que lorsque PostgreSQL est prêt à accepter des connexions. Sans ce healthcheck, le backend pourrait démarrer avant que la base ne soit disponible et crasher.

---

### redis — Pub/Sub temps réel

**Image** : `redis:7-alpine`  
**Port interne** : `6379` (non exposé au host en production)

Redis est utilisé exclusivement pour le **mécanisme de pub/sub** des subscriptions GraphQL (`graphql-redis-subscriptions`).

**Pourquoi Redis pour les subscriptions ?**

Sans Redis, les subscriptions GraphQL ne fonctionnent que sur un seul processus Node.js. Exemple du problème :

```
Utilisateur A  ──► backend instance 1 ──► publie logEntry
Utilisateur B  ──► backend instance 1 ──► reçoit la notification ✅

Utilisateur A  ──► backend instance 1 ──► publie logEntry
Utilisateur C  ──► backend instance 2 ──► ne reçoit rien ❌
```

Avec Redis pub/sub, toutes les instances backend partagent le même canal de messages :

```
backend instance 1  ──PUBLISH──►  Redis  ◄──SUBSCRIBE──  backend instance 2
```

Même avec une seule instance (cas actuel), Redis est en place pour ne pas avoir à refactoriser si on scale.

**Persistence** : `redis-server --appendonly yes` — le journal AOF (Append-Only File) garantit que les messages ne sont pas perdus si Redis redémarre.

---

## Volumes Docker

```yaml
volumes:
  postgres_data:    # /var/lib/postgresql/data — données PostgreSQL
  redis_data:       # /data — journal AOF Redis
  uploads_data:     # /app/uploads — fichiers uploadés par les utilisateurs
```

**Règle** : les volumes nommés survivent à `docker compose down` mais sont supprimés par `docker compose down --volumes`.

**Backup des données** :
```bash
# Dump de la base PostgreSQL
docker compose exec postgres pg_dump -U opencrisis opencrisis > backup.sql

# Restauration
docker compose exec -T postgres psql -U opencrisis opencrisis < backup.sql

# Copie du volume uploads
docker cp opencrisis-pierre-backend-1:/app/uploads ./uploads-backup/
```

---

## Réseau interne

Le réseau `opencrisis` (driver `bridge`) isole les containers :
- Seul **nginx** expose un port vers l'extérieur (`80:80`)
- PostgreSQL et Redis ne sont **pas accessibles depuis l'hôte** en configuration production
- Les containers se référencent par leur **nom de service** (`backend`, `postgres`, `redis`, `frontend`)

En mode développement (`docker-compose.dev.yml`), PostgreSQL et Redis exposent leurs ports pour permettre aux outils locaux (Prisma Studio, Redis CLI, TablePlus...) de s'y connecter directement.

---

## Ordre de démarrage et dépendances

```
postgres ─────► backend ─────► nginx
redis    ──────┘             ┘
frontend ────────────────────┘
```

Docker Compose attend le healthcheck de chaque dépendance avant de démarrer le service suivant :

```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy   # Attend pg_isready ✓
    redis:
      condition: service_healthy   # Attend redis-cli ping ✓

nginx:
  depends_on:
    frontend:
      condition: service_healthy   # Attend wget http://localhost:80 ✓
    backend:
      condition: service_healthy   # Attend wget http://localhost:4000/health ✓
```

---

## Fichiers Docker

| Fichier | Rôle |
|---|---|
| `docker-compose.yml` | Configuration production de tous les services |
| `docker-compose.dev.yml` | Surcharge développement (expose ports DB, désactive nginx/frontend/backend) |
| `03-nginx/nginx.conf` | Configuration du reverse proxy principal |
| `01-frontend/Dockerfile` | Build multi-stage de l'interface React |
| `01-frontend/nginx.conf` | Serveur de fichiers statiques interne au container frontend |
| `02-backend/Dockerfile` | Build multi-stage de l'API Node.js |
