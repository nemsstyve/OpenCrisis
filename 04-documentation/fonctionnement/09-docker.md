# Docker

## Services

L'application est composée de 5 services définis dans `docker-compose.yml`.

| Service | Image | Port interne | Port hôte | Rôle |
|---|---|---|---|---|
| **nginx** | `nginx:alpine` | 80 | **80** | Reverse proxy, point d'entrée unique |
| **frontend** | Build local | 80 | — | Serveur de fichiers statiques React |
| **backend** | Build local | 4000 | — | API Node.js + GraphQL |
| **postgres** | `postgres:16-alpine` | 5432 | — | Base de données PostgreSQL |
| **redis** | `redis:7-alpine` | 6379 | — | Pub/sub pour les subscriptions temps réel |

Seul **nginx** est exposé sur l'hôte (port 80). Tous les autres services communiquent uniquement sur le réseau interne Docker `opencrisis`.

---

## Réseau

Un réseau bridge nommé `opencrisis` isole tous les services entre eux et de l'extérieur.

```yaml
networks:
  opencrisis:
    driver: bridge
```

Les services se référencent par leur nom de service (ex : `postgres`, `redis`, `backend`).

---

## Volumes

| Volume | Monté dans | Contenu |
|---|---|---|
| `postgres_data` | `/var/lib/postgresql/data` | Données PostgreSQL |
| `redis_data` | `/data` | Persistance Redis (AOF activée) |
| `uploads_data` | `/app/uploads` (backend) | Fichiers uploadés par les utilisateurs |

Les volumes sont créés automatiquement lors du premier `docker compose up`.

> `docker compose down` ne supprime **pas** les volumes. Utiliser `docker compose down -v` pour tout effacer (données perdues).

---

## Healthchecks

Tous les services ont un healthcheck. Les services en aval attendent que leurs dépendances soient `healthy` avant de démarrer :

```
nginx dépend de → frontend (healthy) + backend (healthy)
backend dépend de → postgres (healthy) + redis (healthy)
```

| Service | Commande de check | Délai | Intervalle |
|---|---|---|---|
| nginx | `wget -qO- http://localhost:80` | 30s | 10s |
| frontend | `wget -qO- http://localhost:80` | 30s | 10s |
| backend | `wget -qO- http://localhost:4000/health` | 30s | 10s |
| postgres | `pg_isready -U opencrisis -d opencrisis` | — | 10s |
| redis | `redis-cli ping` | — | 10s |

---

## Configuration Nginx

Le fichier `03-nginx/nginx.conf` configure le reverse proxy :

- `location /api/` → proxy vers `http://backend:4000`
- `location /` → proxy vers `http://frontend:80`
- Support WebSocket sur `/api/graphql` (headers `Upgrade`, `Connection`)
- Timeout WebSocket augmenté pour maintenir les connexions longues durée

---

## Builds Docker

### Frontend (`01-frontend/Dockerfile`)

Build multi-étapes :
1. `node:20-alpine` — `pnpm install` + `pnpm build` (génère les assets statiques dans `dist/`)
2. `nginx:alpine` — copie les assets et sert sur le port 80

### Backend (`02-backend/Dockerfile`)

Build multi-étapes :
1. `node:20-alpine` — `npm install` + `npx tsc` (compile TypeScript → JavaScript dans `dist/`)
2. `node:20-alpine` slim — copie uniquement les dépendances de production + le `dist/`

---

## Mode développement (`docker-compose.dev.yml`)

Le fichier `docker-compose.dev.yml` est une surcharge à utiliser avec :

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres redis
```

Il désactive nginx, frontend et backend via un profil `donotstart`, et expose les ports de postgres et redis sur l'hôte :

| Service | Port hôte exposé |
|---|---|
| postgres | `localhost:5432` |
| redis | `localhost:6379` |

Le frontend et le backend se lancent alors directement en local (voir [Installation](../utilisation/01-installation.md)).

---

## Commandes utiles

```bash
# État des services
docker compose ps

# Logs en temps réel
docker compose logs -f
docker compose logs -f backend

# Redémarrer un service sans rebuild
docker compose restart backend

# Rebuild et restart d'un service
docker compose up --build backend

# Arrêt sans suppression des données
docker compose down

# Arrêt + suppression de tous les volumes
docker compose down -v

# Exécuter une commande dans un conteneur
docker exec opencrisis-backend-1 npx prisma migrate status
docker exec opencrisis-backend-1 npx prisma db seed
```
