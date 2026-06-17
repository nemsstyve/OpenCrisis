# Installation

## Prérequis

| Outil | Version minimale | Vérification |
|---|---|---|
| Docker Desktop | 25.x | `docker --version` |
| Docker Compose | 2.x (inclus dans Docker Desktop) | `docker compose version` |
| Git | Toute version récente | `git --version` |
| OpenSSL | 1.1+ | `openssl version` |

> En mode production, **Node.js n'est pas nécessaire** sur la machine hôte — tout tourne dans Docker (sauf pour la génération initiale des secrets JWT).
> En mode développement uniquement, Node.js 20+ et pnpm sont nécessaires pour le frontend.

---

## Démarrage en production

### 1. Cloner le dépôt

```bash
git clone <url-du-repo> opencrisis
cd opencrisis
```

### 2. Générer les certificats TLS

```bash
bash scripts/generate-certs.sh
```

Le script produit `certs/cert.pem` et `certs/key.pem` (validité 365 jours, RSA 2048, SAN pour `localhost` et `127.0.0.1`).

Le dossier `certs/` est exclu de Git via `.gitignore` — chaque environnement génère ses propres certificats. Ne **jamais** committer ni partager une clé privée TLS.

> Pour un déploiement réel (interne entreprise ou public), remplacer les certificats auto-signés par ceux émis par une CA d'entreprise ou Let's Encrypt. Les emplacements `certs/cert.pem` et `certs/key.pem` restent les mêmes.

### 3. Configurer l'environnement

```bash
cp .env.example .env
```

Ouvrir `.env` et renseigner au minimum :

```bash
POSTGRES_PASSWORD=un_mot_de_passe_fort
DATABASE_URL=postgresql://opencrisis:LE_MEME_MOT_DE_PASSE@postgres:5432/opencrisis
JWT_SECRET=<généré avec la commande ci-dessous>
JWT_REFRESH_SECRET=<généré avec la commande ci-dessous>
CORS_ORIGIN=https://localhost
```

**Important** : le mot de passe dans `DATABASE_URL` doit être strictement identique à `POSTGRES_PASSWORD`. Sinon le backend ne peut pas se connecter à la base.

Générer des secrets JWT sécurisés :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Lancer cette commande deux fois pour obtenir deux secrets distincts (`JWT_SECRET` et `JWT_REFRESH_SECRET`).

Pour un mot de passe PostgreSQL fort :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+/=]/g,''))"
```

Génération complète automatisée (à coller dans le terminal depuis le dossier projet) :

```bash
PG_PASS=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+/=]/g,''))")
JWT_S=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
JWT_R=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

cat > .env <<EOF
POSTGRES_USER=opencrisis
POSTGRES_PASSWORD=${PG_PASS}
POSTGRES_DB=opencrisis
DATABASE_URL="postgresql://opencrisis:${PG_PASS}@postgres:5432/opencrisis"
JWT_SECRET=${JWT_S}
JWT_REFRESH_SECRET=${JWT_R}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
REDIS_URL=redis://redis:6379
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://localhost
OPENCTI_ENABLED=false
OPENCTI_URL=
OPENCTI_TOKEN=
EOF
```

> Voir [02-configuration.md](02-configuration.md) pour la description complète de chaque variable.

### 4. Démarrer les services

```bash
docker compose up --build
```

La première exécution prend quelques minutes (téléchargement des images, build des conteneurs). Les démarrages suivants sont plus rapides :

```bash
docker compose up        # sans rebuild
docker compose up -d     # en arrière-plan (daemon)
```

### 5. Initialiser la base de données

À réaliser **une seule fois**, lors du premier démarrage :

```bash
docker compose exec backend npx prisma db seed
```

Le seed crée :
- Les 5 rôles système (Administrateur, Pilote de crise, Cellule Directionnelle, Cellule Opérationnelle, Observateur)
- Un compte administrateur initial : `admin@opencrisis.local` / `Admin1234!`

> Le compte admin par défaut est en `mustChangePassword: true`. Au premier login, l'application exige le changement du mot de passe par défaut.

### 6. Vérifier que tout fonctionne

```bash
docker compose ps
```

Les 5 services doivent être en état `Up` (et `healthy` pour ceux qui ont un healthcheck) :

| Service | État attendu | Port exposé sur l'hôte |
|---|---|---|
| nginx | `Up` | **80, 443** (point d'entrée unique) |
| frontend | `Up (healthy)` | aucun |
| backend | `Up (healthy)` | aucun |
| postgres | `Up (healthy)` | aucun |
| redis | `Up (healthy)` | aucun |

Ouvrir **https://localhost** dans un navigateur. Un avertissement de sécurité s'affichera (certificat auto-signé) — l'accepter pour la démo.

Tout trafic HTTP (port 80) est automatiquement redirigé vers HTTPS (port 443).

---

## Tests de validation post-installation

Vérifier rapidement que le durcissement est actif :

```bash
# Redirection HTTP → HTTPS
curl -I http://localhost
# Attendu : HTTP/1.1 301 Moved Permanently + Location: https://...

# Headers de sécurité
curl -kI https://localhost
# Attendu : Strict-Transport-Security, X-Frame-Options, CSP…

# Postgres isolé d'internet
docker compose exec postgres wget -O- https://www.google.com 2>&1 | head -3
# Attendu : "bad address" ou network unreachable

# Utilisateurs non-root
docker compose exec frontend whoami    # → nginx
docker compose exec backend whoami     # → node
```

Voir [11-securite-infrastructure.md](../fonctionnement/11-securite-infrastructure.md#tests-de-validation) pour la batterie complète de tests.

---

## Mode développement

En développement, seuls PostgreSQL et Redis tournent dans Docker. Le frontend et le backend se lancent localement avec hot-reload.

### Prérequis supplémentaires

- Node.js 20+
- pnpm : `npm install -g pnpm`

### Démarrer PostgreSQL et Redis

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres redis
```

Les ports sont exposés sur l'hôte :
- PostgreSQL : `localhost:5432`
- Redis : `localhost:6379`

### Démarrer le backend

```bash
cd 02-backend
npm install
npm run dev        # nodemon avec rechargement automatique
```

Le backend est accessible sur **http://localhost:4000**.

### Démarrer le frontend

```bash
cd 01-frontend
pnpm install
pnpm dev           # Vite avec HMR
```

Le frontend est accessible sur **http://localhost:5173**.

> En mode développement, les requêtes du frontend vers `/api/graphql` sont proxifiées vers `http://localhost:4000/api/graphql` par Vite (voir `vite.config.ts`). Pas de TLS, pas de reverse proxy nginx en local — c'est uniquement pour le développement.

---

## Commandes de maintenance

### Migrations de base de données

Après modification du fichier `02-backend/prisma/schema.prisma` :

```bash
docker compose exec backend npx prisma migrate dev --name <nom-de-la-migration>
```

En mode développement (backend local) :

```bash
cd 02-backend
npx prisma migrate dev --name <nom-de-la-migration>
```

### Prisma Studio (interface graphique BDD)

```bash
docker compose exec backend npx prisma studio
# Accessible sur http://localhost:5555
```

### Générer les types GraphQL (frontend)

Après modification des schémas GraphQL du backend :

```bash
cd 01-frontend
pnpm codegen
```

Cela régénère `src/types/generated.ts` à partir du schéma GraphQL du backend. **Ne jamais éditer ce fichier manuellement.**

### Régénérer les certificats TLS

Si les certificats arrivent à expiration ou doivent être renouvelés :

```bash
rm -f certs/*.pem
bash scripts/generate-certs.sh
docker compose restart nginx
```

### Arrêter les services

```bash
docker compose down          # arrêt sans suppression des données
docker compose down -v       # arrêt + suppression de tous les volumes (données perdues)
```

### Voir les logs

```bash
docker compose logs -f backend    # logs du backend en temps réel
docker compose logs -f            # tous les services
```

### Relancer un service

```bash
docker compose restart backend
docker compose up --build backend  # rebuild + restart
```

---

## Résolution de problèmes au démarrage

| Erreur observée | Cause | Solution |
|---|---|---|
| `Variable "X" not set` au `docker compose up` | Fichier `.env` absent ou incomplet | Suivre la section "Configurer l'environnement" ci-dessus |
| `docker-credential-desktop.exe not found` (WSL) | Helper Docker Windows référencé côté Linux | `echo '{}' > ~/.docker/config.json` |
| `frontend: unhealthy` | Healthcheck IPv6 qui échoue | Vérifier que le compose utilise `http://127.0.0.1:8080` (pas `localhost`) |
| `redis: Permission denied` sur appendonlydir | Volume créé avec d'autres droits avant durcissement | `docker volume rm opencrisis_redis_data` puis redémarrer |
| `Cannot connect to database` au backend | `POSTGRES_PASSWORD` et mot de passe dans `DATABASE_URL` différents | Vérifier que les deux sont strictement identiques dans `.env` |
| `Network unreachable` au build | Réseaux Docker corrompus | `docker network prune -f` puis relancer |

Plus de détails dans [11-securite-infrastructure.md](../fonctionnement/11-securite-infrastructure.md#résolution-de-problèmes-courants).
