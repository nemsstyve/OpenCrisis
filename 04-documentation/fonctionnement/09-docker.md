# Docker

> Pour une description détaillée du durcissement sécurité de l'infrastructure (capabilities, no-new-privileges, TLS, rate limiting, etc.), voir [11-securite-infrastructure.md](11-securite-infrastructure.md).

## Services

L'application est composée de 5 services définis dans `docker-compose.yml`.

| Service | Image | Port interne | Port hôte | Rôle |
|---|---|---|---|---|
| **nginx** | `nginx:alpine` | 80 / 443 | **80, 443** | Reverse proxy HTTPS, point d'entrée unique |
| **frontend** | Build local (`nginxinc/nginx-unprivileged:alpine`) | 8080 | — | Serveur de fichiers statiques React, non-root |
| **backend** | Build local (`node:alpine`) | 4000 | — | API Node.js + GraphQL + WebSocket |
| **postgres** | `postgres:alpine` | 5432 | — | Base de données PostgreSQL |
| **redis** | `redis:alpine` | 6379 | — | Pub/sub pour les subscriptions temps réel |

**Seul nginx est exposé sur l'hôte** (ports 80 et 443). Tous les autres services sont accessibles uniquement depuis l'intérieur du réseau Docker.

Toutes les versions d'images sont pinnées précisément (pas de `:latest`) pour garantir des builds reproductibles.

---

## Réseaux

Deux réseaux Docker isolés sont créés automatiquement :

```yaml
networks:
  frontend-network:
    driver: bridge
  backend-network:
    driver: bridge
    internal: true   # Aucun accès internet sortant
```

| Réseau | Services | Accès internet |
|---|---|---|
| `frontend-network` | nginx, frontend, backend | Oui |
| `backend-network` | backend, postgres, redis | **Non** (`internal: true`) |

Le **backend** est le seul service présent sur les deux réseaux : il fait le pont entre nginx (côté frontend) et postgres/redis (côté backend isolé).

Conséquences :
- PostgreSQL et Redis **ne peuvent pas sortir vers internet** (pas d'exfiltration possible si compromis)
- Le frontend ne peut pas parler directement à PostgreSQL — il doit nécessairement passer par le backend (qui applique l'auth, le RBAC et l'audit log)

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

Tous les services applicatifs ont un healthcheck. Les services en aval attendent que leurs dépendances soient `healthy` avant de démarrer :

```
nginx dépend de → frontend (healthy) + backend (healthy)
backend dépend de → postgres (healthy) + redis (healthy)
```

| Service | Commande de check | Délai | Intervalle |
|---|---|---|---|
| frontend | `wget -qO- http://127.0.0.1:8080` | 30s | 10s |
| backend | `wget -qO- http://localhost:4000/health` | 30s | 10s |
| postgres | `pg_isready -U opencrisis -d opencrisis` | 20s | 10s |
| redis | `redis-cli ping` | — | 10s |

> Le healthcheck du frontend utilise `127.0.0.1` (et non `localhost`) pour forcer la résolution IPv4. L'image `nginxinc/nginx-unprivileged` n'écoute en IPv6 que si son script d'auto-config détecte une config non modifiée.

---

## Sécurité par service

Chaque service est durci avec les mêmes principes : utilisateur non-root, `no-new-privileges`, `cap_drop: ALL` puis `cap_add` sélectif, limites CPU/RAM.

| Service | Utilisateur | `cap_add` |
|---|---|---|
| nginx | nginx (workers) | `NET_BIND_SERVICE` `CHOWN` `SETUID` `SETGID` |
| frontend | nginx (101) | aucune |
| backend | node | aucune |
| postgres | postgres | `CHOWN` `SETUID` `SETGID` `DAC_READ_SEARCH` `FOWNER` |
| redis | redis | `SETUID` `SETGID` |

| Service | CPU | RAM |
|---|---|---|
| nginx | 0.5 | 256M |
| frontend | 0.5 | 256M |
| backend | 1.0 | 1G |
| postgres | 1.0 | 1G |
| redis | 0.25 | 256M |

Détails et justifications dans [11-securite-infrastructure.md](11-securite-infrastructure.md).

---

## Configuration Nginx

Le reverse proxy `03-nginx/nginx.conf` configure :

- **Redirection HTTP → HTTPS** (301 sur le port 80)
- **HTTPS sur le port 443** avec TLS 1.2/1.3, ciphers ECDHE, HSTS
- **Routes** :
  - `location /api/auth/login` → backend (rate limit login 10 req/min)
  - `location /api/files/` → backend (rate limit upload 20 req/min, timeout 300s)
  - `location /api/graphql` → backend (support WebSocket pour subscriptions)
  - `location /api/` → backend (REST génériques)
  - `location /` → frontend (assets statiques + fallback SPA)
- **Headers de sécurité** : HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy, etc.
- **Blocage des fichiers sensibles** (`.env`, `.log`, `.sh`, `.sql`, fichiers cachés)
- **Rate limiting général** 200 req/min sur toute la zone HTTPS
- `server_tokens off` + `proxy_hide_header X-Powered-By`

Voir [11-securite-infrastructure.md](11-securite-infrastructure.md) pour le détail de chaque mesure.

---

## Certificats TLS

Le dossier `certs/` est attendu à la racine du projet avec deux fichiers :

```
certs/
├── cert.pem    # Certificat public (644)
└── key.pem     # Clé privée (600)
```

Pour générer des certificats auto-signés (dev / démo interne) :

```bash
bash scripts/generate-certs.sh
```

Le script produit un certificat valide 365 jours avec SubjectAltName pour `localhost` et `127.0.0.1`. Le dossier `certs/` est exclu de Git via `.gitignore`.

> **Important** : chaque environnement doit régénérer ses propres certificats. Une clé privée TLS ne doit jamais être partagée entre machines ou commitée sur un dépôt.

Pour la production, remplacer les certificats auto-signés par ceux d'une CA d'entreprise ou Let's Encrypt — les chemins `certs/cert.pem` et `certs/key.pem` restent identiques.

---

## Builds Docker

### Frontend (`01-frontend/Dockerfile`)

Build multi-étapes :
1. `node:20.19.0-alpine` — `pnpm install` + `pnpm build` (génère les assets statiques dans `dist/`)
2. `nginxinc/nginx-unprivileged:1.28-alpine` — copie uniquement `dist/` et sert sur le port 8080 (jamais root)

### Backend (`02-backend/Dockerfile`)

Build multi-étapes :
1. `node:20.19.0-alpine` — `npm install` + `npx tsc` (compile TypeScript → JavaScript dans `dist/`)
2. `node:20.19.0-alpine` slim — copie uniquement les dépendances de production + le `dist/` + `USER node`

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

> En mode dev, les contraintes réseau (`backend-network` internal:true) restent actives pour les conteneurs postgres et redis, mais les ports exposés sur l'hôte permettent à un backend local de s'y connecter via `localhost`.

---

## Commandes utiles

```bash
# État des services (avec leur état healthy/unhealthy)
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

# Vérifier les capabilities d'un conteneur
docker inspect opencrisis-postgres-1 \
  --format '{{.HostConfig.CapDrop}} / {{.HostConfig.CapAdd}}'
```

---

## Résolution de problèmes courants

| Problème | Cause | Solution |
|---|---|---|
| `frontend: unhealthy` au démarrage | Healthcheck `wget` sur `localhost` résout en IPv6 | Le healthcheck utilise déjà `127.0.0.1` dans le compose actuel ; si modifié, restaurer cette valeur |
| `redis: Permission denied` sur `appendonlydir` | Volume `redis_data` créé avant durcissement des capabilities | `docker volume rm opencrisis_redis_data` puis redémarrer |
| `docker-credential-desktop.exe not found` (WSL) | Le helper Windows n'existe pas côté Linux | `echo '{}' > ~/.docker/config.json` |
| Network unreachable au build | Réseaux Docker corrompus après plusieurs cycles | `docker network prune -f` |
| `Variable "X" not set. Defaulting to a blank string` | Fichier `.env` absent ou incomplet | Créer `.env` à partir de `.env.example` et remplir toutes les valeurs |

Plus de détails dans [11-securite-infrastructure.md](11-securite-infrastructure.md#résolution-de-problèmes-courants).
