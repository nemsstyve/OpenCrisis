# Guide de démarrage

## Prérequis

| Outil | Version minimale | Vérification |
|---|---|---|
| **Docker Desktop** | 4.x | `docker --version` |
| **Docker Compose** | Intégré à Docker Desktop | `docker compose version` |
| **Git** | 2.x | `git --version` |
| **Node.js** *(dev uniquement)* | 20.x LTS | `node --version` |
| **pnpm** *(dev frontend uniquement)* | 8.x | `pnpm --version` |

---

## Démarrage en mode production (recommandé)

### 1. Cloner le dépôt

```bash
git clone <url-du-depot>
cd "OpenCrisis - Pierre"
```

### 2. Créer le fichier de configuration

```powershell
# Copier le modèle
Copy-Item ".env.example" ".env"
```

Éditer `.env` et renseigner au minimum :
- `POSTGRES_PASSWORD` : choisir un mot de passe fort
- `DATABASE_URL` : remplacer `changeme` par le même mot de passe
- `JWT_SECRET` et `JWT_REFRESH_SECRET` : générer des secrets aléatoires (voir ci-dessous)

**Générer les secrets JWT sous PowerShell** :
```powershell
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
$bytes = New-Object byte[] 64; $rng.GetBytes($bytes)
[System.BitConverter]::ToString($bytes).Replace("-","").ToLower()
# Relancer pour obtenir un second secret pour JWT_REFRESH_SECRET
```

### 3. Démarrer les services

```powershell
docker compose up --build --detach
```

Ce que fait cette commande :
1. Télécharge les images Docker (`postgres:16-alpine`, `redis:7-alpine`, `nginx:alpine`, `node:20-alpine`)
2. Build les images `frontend` et `backend` depuis leurs Dockerfiles
3. Crée le réseau interne `opencrisis`
4. Crée les volumes `postgres_data`, `redis_data`, `uploads_data`
5. Démarre les 5 containers dans l'ordre défini par les healthchecks

**Premier démarrage** : compter 3 à 5 minutes (téléchargement des images).  
**Démarrages suivants** : 30 à 60 secondes (images en cache).

### 4. Vérifier que tout fonctionne

```powershell
# État de tous les containers (tous doivent être "healthy")
docker compose ps

# Tester le backend
Invoke-RestMethod -Uri "http://localhost/api/health"
# Réponse attendue : { status: "ok", service: "opencrisis-backend" }

# Tester le frontend
Invoke-WebRequest -Uri "http://localhost" -UseBasicParsing | Select-Object StatusCode
# Réponse attendue : StatusCode 200
```

### 5. Accéder à l'application

Ouvrir un navigateur et aller sur : **http://localhost**

> À ce stade (Phase 1), la page affiche "OpenCrisis — Infrastructure opérationnelle — Phase 2 en cours."
> L'interface complète sera disponible à partir de la Phase 5.

---

## Mode développement

En développement, seuls PostgreSQL et Redis tournent dans Docker. Le frontend et le backend tournent sur l'hôte avec **hot-reload**.

### Démarrer les services d'infrastructure

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --detach
```

PostgreSQL est accessible sur `localhost:5432`, Redis sur `localhost:6379`.

### Configurer le `.env` pour le développement local

Créer un `.env` dans `02-backend/` avec :
```env
DATABASE_URL="postgresql://opencrisis:opencrisis_dev@localhost:5432/opencrisis"
REDIS_URL=redis://localhost:6379
JWT_SECRET=<votre_secret>
JWT_REFRESH_SECRET=<votre_second_secret>
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Démarrer le backend

```powershell
cd backend
npm install
npx prisma migrate dev    # Applique les migrations
npx prisma db seed        # Peuple les données initiales (rôles + admin)
npm run dev               # Démarre avec nodemon (hot-reload)
```

Le backend est disponible sur `http://localhost:4000`.

### Démarrer le frontend

```powershell
cd frontend
pnpm install
pnpm dev
```

Le frontend est disponible sur `http://localhost:5173` avec HMR (rechargement instantané).

### GraphQL Playground

En mode développement, Apollo Server expose un playground interactif :  
**http://localhost:4000/api/graphql**

Il permet d'explorer le schéma GraphQL et de tester les queries/mutations directement.

---

## Commandes courantes

### Gestion des containers

```powershell
# Voir l'état et les ports de tous les containers
docker compose ps

# Voir les logs en temps réel de tous les services
docker compose logs --follow

# Voir les logs d'un service spécifique
docker compose logs backend --follow
docker compose logs postgres

# Redémarrer un service sans rebuild
docker compose restart backend

# Rebuild et redémarrer un service spécifique
docker compose up --build --detach backend

# Arrêter tous les services (données conservées dans les volumes)
docker compose down

# Arrêter et supprimer les volumes (DESTRUCTIF — perd toutes les données)
docker compose down --volumes
```

### Base de données

```powershell
# Ouvrir un shell PostgreSQL
docker compose exec postgres psql -U opencrisis -d opencrisis

# Lister les tables
docker compose exec postgres psql -U opencrisis -d opencrisis -c "\dt"

# Vérifier les derniers audit logs
docker compose exec postgres psql -U opencrisis -d opencrisis -c `
  'SELECT action, resource, "createdAt" FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 10;'

# Dump complet de la base
docker compose exec postgres pg_dump -U opencrisis opencrisis > backup-$(Get-Date -Format "yyyyMMdd").sql

# Restaurer un dump
Get-Content backup.sql | docker compose exec -T postgres psql -U opencrisis opencrisis
```

### Redis

```powershell
# Tester la connexion
docker compose exec redis redis-cli ping
# Attendu : PONG

# Voir les clés actives (subscriptions en cours)
docker compose exec redis redis-cli keys "*"

# Vider Redis (uniquement en développement)
docker compose exec redis redis-cli flushall
```

### Backend — Prisma

```powershell
# Créer et appliquer une nouvelle migration
docker compose exec backend npx prisma migrate dev --name description_de_la_migration

# Appliquer les migrations existantes (après un git pull)
docker compose exec backend npx prisma migrate deploy

# Ouvrir Prisma Studio (interface graphique)
docker compose exec backend npx prisma studio
# → Disponible sur http://localhost:5555

# Régénérer le client Prisma (après modification du schéma)
docker compose exec backend npx prisma generate
```

---

## Résolution des problèmes courants

### Un container ne démarre pas

```powershell
# Voir les logs du container en erreur
docker compose logs <nom-du-service>

# Vérifier les healthchecks
docker compose ps   # La colonne STATUS indique (healthy) ou (unhealthy)

# Inspecter un container arrêté
docker inspect opencrisis-pierre-backend-1
```

### Erreur "port 80 already in use"

Un autre service utilise le port 80 (IIS, Apache, autre Docker container).

```powershell
# Trouver le process utilisant le port 80
netstat -ano | findstr ":80 "

# Soit arrêter le service, soit changer le port dans docker-compose.yml :
# ports:
#   - "8080:80"
```

### La base de données est inaccessible depuis le backend

1. Vérifier que `POSTGRES_PASSWORD` dans `.env` correspond au mot de passe dans `DATABASE_URL`
2. Vérifier que le container postgres est `healthy` : `docker compose ps`
3. Tester la connexion directement : `docker compose exec postgres psql -U opencrisis -d opencrisis -c "SELECT 1;"`

### Rebuild complet (si les images sont corrompues)

```powershell
# Arrêter tout et supprimer les images buildées localement
docker compose down
docker rmi opencrisis-pierre-frontend opencrisis-pierre-backend

# Rebuild complet
docker compose up --build --detach
```

### Accéder aux fichiers dans le volume uploads

```powershell
# Lister les fichiers uploadés
docker compose exec backend ls -la /app/uploads/

# Copier un fichier depuis le container
docker cp opencrisis-pierre-backend-1:/app/uploads/incidents/ ./uploads-export/
```
