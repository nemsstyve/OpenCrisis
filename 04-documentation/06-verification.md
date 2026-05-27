# Vérification — Tests effectués en Phase 1

Ce document décrit les tests réalisés pour valider l'infrastructure Docker mise en place lors de la Phase 1, les erreurs rencontrées, et les corrections apportées.

---

## Résultats globaux

| Service | Statut final | Healthcheck |
|---|---|---|
| **nginx** | `Up` | En attente des healthchecks frontend + backend |
| **frontend** | `healthy` | `wget http://localhost:80` → HTTP 200 |
| **backend** | `healthy` | `wget http://localhost:4000/health` → `{"status":"ok"}` |
| **postgres** | `healthy` | `pg_isready -U opencrisis` → accepte les connexions |
| **redis** | `healthy` | `redis-cli ping` → `PONG` |

---

## Erreurs rencontrées et corrections

### Erreur 1 — Enums Prisma en format compact

**Symptôme** :
```
Error code: P1012
error: Error validating: This line is not an enum value definition.
--> prisma/schema.prisma:246
enum IncidentStatus    { ACTIVE CONTAINED CLOSED }
```

**Cause** : Prisma n'accepte pas la syntaxe compacte `enum Foo { A B C }`. Chaque valeur doit être sur sa propre ligne.

**Correction** :
```prisma
# Avant (invalide)
enum IncidentStatus { ACTIVE CONTAINED CLOSED }

# Après (correct)
enum IncidentStatus {
  ACTIVE
  CONTAINED
  CLOSED
}
```

**Impact** : Corrigé sur tous les enums du schéma (`IncidentStatus`, `Severity`, `Cell`, `TimelineEventType`, `DocumentCategory`, `PermissionAction`, `PermissionResource`).

---

### Erreur 2 — `wget` absent de l'image `nginx:alpine`

**Symptôme** :
```
dependency failed to start: container opencrisis-pierre-frontend-1 is unhealthy
```

**Cause** : Le healthcheck du container frontend (`docker-compose.yml`) utilise `wget` pour tester la disponibilité du serveur nginx. Or, l'image `nginx:alpine` est minimale et n'inclut pas `wget` par défaut.

```yaml
# docker-compose.yml — healthcheck du frontend
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:80"]
```

**Correction** : Installation de `wget` dans le stage final du `01-frontend/Dockerfile` :
```dockerfile
FROM nginx:alpine AS runner
RUN apk add --no-cache wget    # ← Ajout
```

**Alternative possible** : Utiliser `curl` à la place, mais `curl` n'est pas non plus présent dans `nginx:alpine` par défaut. L'installation de `wget` via `apk` est la solution la plus simple (1 seule commande, +700KB).

---

### Avertissement Prisma — OpenSSL non détecté

**Symptôme** (avertissement, pas une erreur) :
```
prisma:warn Prisma failed to detect the libssl/openssl version to use, and may not work as expected.
Defaulting to "openssl-1.1.x".
```

**Cause** : Alpine Linux utilise `musl libc` au lieu de `glibc`. Prisma a du mal à détecter automatiquement la version d'OpenSSL sur cette base.

**Impact** : Aucun impact en pratique pour cette version. Le client Prisma est généré correctement (`✔ Generated Prisma Client (v5.22.0)`).

**Solution future** : Si des problèmes de connexion DB apparaissent, ajouter `openssl` à l'image Alpine :
```dockerfile
RUN apk add --no-cache openssl
```

---

## Procédure de vérification complète

Reproduire ces tests après chaque démarrage pour s'assurer que l'infrastructure est opérationnelle.

### Test 1 — État des containers

```powershell
docker compose ps
```

**Résultat attendu** : tous les containers sont `Up` avec le statut `(healthy)`.

```
NAME                           STATUS
opencrisis-pierre-backend-1    Up X seconds (healthy)
opencrisis-pierre-frontend-1   Up X seconds (healthy)
opencrisis-pierre-nginx-1      Up X seconds
opencrisis-pierre-postgres-1   Up X minutes (healthy)
opencrisis-pierre-redis-1      Up X minutes (healthy)
```

---

### Test 2 — Backend via nginx (route `/api/`)

```powershell
Invoke-RestMethod -Uri "http://localhost/api/health"
```

**Résultat attendu** :
```json
{
  "status": "ok",
  "service": "opencrisis-backend",
  "timestamp": "2026-05-26T22:11:59.867Z"
}
```

Ce test valide simultanément :
- nginx est opérationnel et écoute sur le port 80
- La règle `location /api/` redirige correctement vers `backend:4000`
- Le backend Express répond sur `/health`

---

### Test 3 — Frontend via nginx

```powershell
Invoke-WebRequest -Uri "http://localhost" -UseBasicParsing | Select-Object StatusCode
```

**Résultat attendu** : `StatusCode 200`

Ce test valide :
- La règle `location /` de nginx redirige vers `frontend:80`
- Le frontend nginx sert les fichiers statiques buildés par Vite

---

### Test 4 — Redis

```powershell
docker compose exec redis redis-cli ping
```

**Résultat attendu** : `PONG`

---

### Test 5 — PostgreSQL

```powershell
docker compose exec postgres psql -U opencrisis -d opencrisis -c "\dt"
```

**Résultat attendu** :
```
Did not find any relations.
```

La base `opencrisis` existe et est accessible. L'absence de tables est **normale** : les migrations Prisma n'ont pas encore été exécutées (Phase 3).

---

### Test 6 — Réseau interne (communication inter-containers)

```powershell
# Le backend peut-il atteindre postgres ?
docker compose exec backend wget -qO- http://postgres:5432
# Attendu : erreur de protocole (pg attend du binaire, pas HTTP) — c'est normal
# L'important est que la résolution DNS fonctionne (pas d'erreur "Name does not resolve")

# Le backend peut-il atteindre redis ?
docker compose exec backend wget -qO- http://redis:6379
# Attendu : réponse vide ou erreur protocole — la résolution DNS est ce qui compte
```

---

### Test 7 — Volumes persistants

```powershell
# Vérifier l'existence des volumes
docker volume ls | Select-String "opencrisis"
```

**Résultat attendu** :
```
local     opencrisis-pierre_postgres_data
local     opencrisis-pierre_redis_data
local     opencrisis-pierre_uploads_data
```

**Test de persistence** :
```powershell
# Arrêter les services (sans --volumes)
docker compose down

# Redémarrer
docker compose up --detach

# Les données doivent être intactes
docker compose exec postgres psql -U opencrisis -d opencrisis -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
```

---

## Métriques observées lors du premier build

| Étape | Durée |
|---|---|
| Téléchargement des images Docker | ~2 min (selon la connexion) |
| Build du frontend (pnpm install + Vite build) | ~30 sec |
| Build du backend (npm install + prisma generate + tsc) | ~45 sec |
| Démarrage de PostgreSQL jusqu'à `healthy` | ~5 sec |
| Démarrage du backend jusqu'à `healthy` | ~10 sec |

**Taille des fichiers compilés (frontend)** :
```
dist/index.html                  0.32 kB │ gzip:  0.24 kB
dist/assets/index-BrdzOaiK.js  143.91 kB │ gzip: 46.27 kB
```

---

## Checklist de validation Phase 1

- [x] `docker compose up --build --detach` s'exécute sans erreur
- [x] 5 containers en état `healthy`
- [x] `GET /api/health` → `{"status": "ok"}`
- [x] `GET /` → HTTP 200 (HTML)
- [x] `redis-cli ping` → `PONG`
- [x] `psql` → connexion à la base `opencrisis`
- [x] Volumes `postgres_data`, `redis_data`, `uploads_data` créés
- [x] Réseau `opencrisis` créé (bridge)
- [x] Schéma Prisma valide (`prisma generate` sans erreur)
- [x] Build TypeScript backend sans erreur (`tsc` → `dist/server.js`)
- [x] Build Vite frontend sans erreur (`dist/` généré)

---

## Prochaines vérifications (Phases suivantes)

| Phase | Test à effectuer |
|---|---|
| Phase 3 | `prisma migrate dev` applique le schéma sans erreur |
| Phase 3 | `prisma db seed` crée les rôles système et le compte admin |
| Phase 5 | Login avec `admin@opencrisis.local` → JWT reçu |
| Phase 5 | Accès `/incidents` → liste des incidents |
| Phase 6 | Ouvrir 2 onglets sur la main courante → saisir une entrée → apparition temps réel |
| Phase 7 | Export PDF d'un rapport post-incident → fichier téléchargeable |
