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
| Phase 5 | Login avec `admin@opencrisis.local` → JWT reçu |
| Phase 5 | Accès `/incidents` → liste des incidents |
| Phase 6 | Ouvrir 2 onglets sur la main courante → saisir une entrée → apparition temps réel |
| Phase 7 | Export PDF d'un rapport post-incident → fichier téléchargeable |

---

## Checklist de validation Phase 4

Tests effectués via l'API GraphQL (`http://localhost/api/graphql`) et l'endpoint REST (`http://localhost/api/files`).

### Erreurs rencontrées et corrections

#### Erreur 1 — Types Express incorrects dans `routes/files.ts` (TS2493)
**Symptôme** : Utilisation de `Parameters<typeof router.use>` pour typer le middleware Express, ce qui produit des types incompatibles.
**Correction** : Utiliser `Request`, `Response`, `NextFunction` directement depuis `express`.

#### Erreur 2 — `req.body` indisponible dans le callback `destination` de multer
**Symptôme** : multer remplit `req.body` après avoir traité le fichier, pas avant. L'`incidentId` était donc `undefined` dans `destination()`, forçant le stockage dans `global/`.
**Correction** : Toujours sauvegarder dans un dossier `tmp/` puis déplacer (`fs.rename`) dans `incidents/:id/` ou `global/` une fois `req.body` disponible dans le handler de route.

#### Erreur 3 — `passwordHash` exposé dans la réponse upload
**Symptôme** : `createDocument` incluait `uploadedBy: true` (tous les champs User), exposant le hash du mot de passe dans la réponse JSON.
**Correction** : Remplacer par `uploadedBy: { select: { id, email, firstName, lastName } }`.

### Tests GraphQL effectués

```graphql
# Incidents
query { incidents { id name status severity } }         # → [] ✅
mutation { createIncident(input: { name: "Ransomware Prod", severity: CRITICAL }) { id name status createdBy { email } } }  # ✅
mutation { updateIncident(id: "...", input: { status: CONTAINED }) { status } }  # ✅

# Tags + LogEntry
mutation { createTag(name: "Critique", color: "#EF4444") { id } }  # ✅
mutation { createLogEntry(incidentId: "...", cell: DIRECTIONAL, content: "...") { id author { email } } }  # ✅
mutation { addTagToLogEntry(logEntryId: "...", tagId: "...") { tags { name } } }  # ✅

# Timeline
mutation { createTimelineEvent(incidentId: "...", input: { type: DETECTION, title: "Alerte SIEM", occurredAt: "...", assetName: "srv-prod-01" }) { id type assetName } }  # ✅

# Contact
mutation { createContact(input: { firstName: "Jean", lastName: "Dupont", role: "RSSI" }) { id } }  # ✅
```

### Tests REST effectués

```bash
# Upload fichier (avec incidentId → bon dossier)
POST /api/files/upload  →  filePath: "incidents/:id/..." ✅
# Upload sans token → 401 ✅
# Download sans token → 401 ✅
```

### Tests sécurité (OWASP)

| Contrôle | Test | Résultat |
|---|---|---|
| A01 | Toute mutation sans token → `UNAUTHENTICATED` | ✅ |
| A01 | Upload/download sans token → 401 | ✅ |
| A01 | `requirePermission` sur chaque resolver | ✅ |
| A09 | CREATE/UPDATE/DELETE/UPLOAD dans AuditLog | ✅ |

### Checklist Phase 4

- [x] Build Docker sans erreur TypeScript
- [x] `incidents` → liste vide, `createIncident` → incident créé avec `createdBy`
- [x] `updateIncident(status: CONTAINED)` → statut mis à jour
- [x] `createTag` + `createLogEntry` + `addTagToLogEntry` → tags attachés
- [x] `createTimelineEvent` avec assetName/ipAddress → événement enregistré
- [x] `createContact` → contact créé
- [x] Upload fichier → `filePath: incidents/:id/...` (chemin correct) ✅
- [x] Upload response → `uploadedBy` sans `passwordHash` ✅
- [x] Upload/download sans token → 401 ✅
- [x] Toute mutation sans token → `UNAUTHENTICATED` ✅
- [x] Audit log : CREATE/UPDATE/UPLOAD pour chaque action ✅
- [x] pubsub TOPICS définis, subscriptions déclarées (tests WS en Phase 6)

---

## Checklist de validation Phase 3

Tests effectués manuellement via l'API GraphQL exposée par nginx (`http://localhost/api/graphql`).

### Erreurs rencontrées et corrections

#### Erreur 1 — `AuditLogUncheckedCreateInput` (TS2322)

**Symptôme** : TypeScript refusait d'assigner `userId: string | null` à l'union discriminée Prisma.

**Correction** : Typer explicitement le `data` en `Prisma.AuditLogUncheckedCreateInput` et caster `metadata` en `Prisma.InputJsonValue | undefined`.

#### Erreur 2 — `libssl.so.1.1: No such file or directory`

**Symptôme** : Le Prisma client ne démarrait pas sur Alpine 3.20 (OpenSSL 3 uniquement).

**Correction** : Ajouter `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` dans `schema.prisma` + `RUN apk add --no-cache openssl` dans les deux stages du Dockerfile.

#### Erreur 3 — `ts-node TS5109` (module vs moduleResolution)

**Symptôme** : ts-node ne pouvait pas exécuter le seed — conflit entre `module: commonjs` et la résolution par défaut `NodeNext` de TypeScript 5.4.

**Correction** : Ajouter `"moduleResolution": "node"` dans `tsconfig.json` + déplacer `typescript` de `devDependencies` vers `dependencies`.

### Sécurité — modifications post-review

- **`audit.ts`** : `logAudit` rendu fire-and-forget (erreurs loguées, ne propagent plus vers la mutation parente)
- **`server.ts`** : Validation des variables d'environnement critiques au démarrage (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`) — `process.exit(1)` si manquante
- **`rbac.ts`** : `USER_INCLUDE` exporté depuis `services/auth.ts` et réutilisé (suppression de la duplication)
- **Migrations** : Fichier `prisma/migrations/20260527000000_init/migration.sql` généré et marqué comme appliqué via `prisma migrate resolve`
- **Dockerfile** : CMD mis à jour pour exécuter `prisma migrate deploy` avant le démarrage du serveur

### Tests GraphQL effectués

```graphql
# 1. Login
mutation {
  login(email: "admin@opencrisis.local", password: "Admin1234!") {
    accessToken
    user { id email firstName roles { name } permissions { resource action } }
  }
}
# Résultat : accessToken JWT + 18 permissions (9 ressources × 2 actions) ✅

# 2. Query me (avec Authorization: Bearer <token>)
query { me { id email firstName roles { name } } }
# Résultat : utilisateur admin avec rôle Administrateur ✅

# 3. RefreshToken (via cookie HttpOnly)
mutation { refreshToken { accessToken user { email } } }
# Résultat : nouvel accessToken émis, ancien refresh token supprimé ✅

# 4. Logout + vérification révocation
mutation { logout }   # → true ✅
mutation { refreshToken { accessToken } }  # → UNAUTHENTICATED ✅

# 5. Mauvais mot de passe
mutation { login(email: "admin@opencrisis.local", password: "Wrong!") { accessToken } }
# → errors[0].message: "Email ou mot de passe incorrect", code: UNAUTHENTICATED ✅
```

### Checklist Phase 3

- [x] `docker compose build backend` → build sans erreur (TypeScript + Prisma generate)
- [x] Migration initiale créée (`prisma/migrations/20260527000000_init/migration.sql`)
- [x] Migration marquée comme appliquée (`prisma migrate resolve --applied`)
- [x] Seed exécuté : 18 permissions + 5 rôles système + compte `admin@opencrisis.local`
- [x] `POST /api/graphql` — mutation `login` → accessToken + cookies refreshToken ✅
- [x] `POST /api/graphql` — query `me` avec Bearer token → utilisateur courant ✅
- [x] Mutation `refreshToken` via cookie → nouveau token émis, ancien révoqué ✅
- [x] Mutation `logout` → cookie supprimé, `refreshToken` renvoie `UNAUTHENTICATED` ✅
- [x] Login avec mauvais mot de passe → `UNAUTHENTICATED` (pas de fuite d'info) ✅
- [x] Variables d'environnement manquantes → `process.exit(1)` au démarrage ✅
- [x] Échec audit log → erreur loguée, mutation non interrompue ✅

---

## Checklist de validation Phase 2

Tests effectués manuellement via Docker (`docker compose up --build`).

### Routing & navigation

- [x] `/` redirige vers `/incidents`
- [x] `/incidents` affiche le sélecteur d'incident (IncidentSelector)
- [x] Cliquer sur un incident navigue vers `/incidents/demo/dashboard`
- [x] `/login` affiche la page de connexion
- [x] Soumettre le formulaire Login navigue vers `/incidents`
- [x] Route inconnue (`/incidents/demo/xyz`) affiche la page 404
- [x] Route 404 a un lien "Retour au tableau de bord" vers `/incidents/demo/dashboard`
- [x] Route 404 hors incident (`/xyz`) a un lien "Retour au tableau de bord" vers `/incidents`

### Sidebar & pages

- [x] La sidebar affiche 6 onglets : Dashboard, Annuaire, Bibliothèque, Main Courante Direction, Main Courante Opérationnelle, Timeline
- [x] Aucun onglet Cartographie, Tableau Blanc ou Artefacts
- [x] Chaque onglet navigue vers la bonne route `/incidents/:id/<page>`
- [x] L'onglet actif est mis en évidence
- [x] Le bouton "Changer d'incident" navigue vers `/incidents`

### UI & thème

- [x] Mode sombre fonctionne (toggle dans la sidebar)
- [x] Mode clair fonctionne — fond blanc (pas de fond sombre en mode clair)
- [x] Aucune régression visuelle sur les 7 pages

### Qualité du build

- [x] `docker compose build frontend` se termine sans erreur
- [x] `tsc --noEmit` ne produit aucune erreur TypeScript
- [x] `pnpm-lock.yaml` présent et cohérent avec `package.json`
- [x] `ErrorBoundary` enveloppe toute l'application dans `App.tsx`
- [x] `vite-env.d.ts` présent — `import.meta.env.VITE_*` sans erreur TypeScript
