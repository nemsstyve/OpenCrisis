# Installation

## Prérequis

| Outil | Version minimale | Vérification |
|---|---|---|
| Docker Desktop | 25.x | `docker --version` |
| Docker Compose | 2.x (inclus dans Docker Desktop) | `docker compose version` |
| Git | Toute version récente | `git --version` |

> En mode production, **Node.js n'est pas nécessaire** sur la machine hôte — tout tourne dans Docker.
> En mode développement uniquement, Node.js 20+ et pnpm sont nécessaires pour le frontend.

---

## Démarrage en production

### 1. Cloner le dépôt

```bash
git clone <url-du-repo> opencrisis
cd opencrisis
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Ouvrir `.env` et renseigner au minimum :

```bash
POSTGRES_PASSWORD=un_mot_de_passe_fort
JWT_SECRET=<généré avec la commande ci-dessous>
JWT_REFRESH_SECRET=<généré avec la commande ci-dessous>
```

Générer des secrets JWT sécurisés :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

> Voir [02-configuration.md](02-configuration.md) pour la description complète de chaque variable.

### 3. Démarrer les services

```bash
docker compose up --build
```

La première exécution prend quelques minutes (téléchargement des images, build des conteneurs). Les démarrages suivants sont plus rapides :

```bash
docker compose up        # sans rebuild
docker compose up -d     # en arrière-plan (daemon)
```

### 4. Initialiser la base de données

À réaliser **une seule fois**, lors du premier démarrage :

```bash
docker exec opencrisis-backend-1 npx prisma db seed
```

Le seed crée :
- Les 5 rôles système (Administrateur, Pilote de crise, Cellule Directionnelle, Cellule Opérationnelle, Observateur)
- Un compte administrateur initial

### 5. Vérifier que tout fonctionne

```bash
docker compose ps
```

Les 5 services doivent être en état `healthy` :

| Service | Port exposé |
|---|---|
| nginx | 80 (point d'entrée unique) |
| frontend | 80 (interne uniquement) |
| backend | 4000 (interne uniquement) |
| postgres | aucun (interne uniquement) |
| redis | aucun (interne uniquement) |

Ouvrir **http://localhost** dans un navigateur.

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

> En mode développement, les requêtes du frontend vers `/api/graphql` sont proxifiées vers `http://localhost:4000/api/graphql` par Vite (voir `vite.config.ts`).

---

## Commandes de maintenance

### Migrations de base de données

Après modification du fichier `02-backend/prisma/schema.prisma` :

```bash
docker exec -it opencrisis-backend-1 npx prisma migrate dev --name <nom-de-la-migration>
```

En mode développement (backend local) :

```bash
cd 02-backend
npx prisma migrate dev --name <nom-de-la-migration>
```

### Prisma Studio (interface graphique BDD)

```bash
docker exec opencrisis-backend-1 npx prisma studio
# Accessible sur http://localhost:5555
```

### Générer les types GraphQL (frontend)

Après modification des schémas GraphQL du backend :

```bash
cd 01-frontend
pnpm codegen
```

Cela régénère `src/types/generated.ts` à partir du schéma GraphQL du backend. **Ne jamais éditer ce fichier manuellement.**

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
