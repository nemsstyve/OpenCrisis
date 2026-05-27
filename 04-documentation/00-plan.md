# Plan — OpenCrisis : Application de gestion de crise cyber

---

## Contexte & objectif

Application web de gestion de crise (principalement cyber) pour une **seule organisation**. Elle réunit la cellule directionnelle et la cellule opérationnelle sur une interface unique : partage de ressources, collaboration en temps réel, et traçabilité complète de chaque incident.

**Concept central — sélecteur d'incident (modèle "workspace") :**
À la connexion, l'utilisateur choisit sur quelle crise travailler (comme un workspace Slack). Il peut basculer d'un incident à un autre sans se déconnecter, ce qui permet de gérer plusieurs crises simultanément et de consulter l'historique.

**Bases existantes :**
- `Front - Template/` — 9 pages React construites, adaptées en Phase 2 (dossier supprimé après migration)
- Schéma DB initial fourni — trop incomplet, entièrement refondu en Prisma

---

## Décisions techniques validées

| Sujet | Décision |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind v4 + shadcn/ui (template existant) |
| Backend | Node.js 20 + Express + Apollo Server (GraphQL) |
| ORM | **Prisma** (migrations versionnées, types TS auto-générés) |
| Base de données | PostgreSQL 16 |
| Temps réel | GraphQL Subscriptions via WebSocket + **Redis** pub/sub |
| Fichiers | Volume Docker nommé `uploads`, servi par Express avec auth JWT |
| Reverse proxy | **Nginx** (évite CORS, prépare HTTPS) |
| Types front/back | **GraphQL Code Generator** (source unique de vérité) |
| État global | **Zustand** (`currentUser`, `currentIncident`, permissions) |
| Auth | Login/mot de passe + JWT (access token) + **refresh token** (cookie HttpOnly) |
| Rôles | RBAC granulaire, rôles système + rôles personnalisables par l'admin |
| Audit | **Audit log automatique** sur toutes les mutations |
| OpenCTI | Intégration optionnelle (activable par `.env`) pour la timeline |
| Stockage objet | Volume Docker dédié `uploads_data` (pas de MinIO) |

---

## Architecture Docker — 5 services

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│  nginx   │───▶│ frontend │    │  redis   │
│ :80/:443 │    │  (Vite)  │    │  :6379   │
└────┬─────┘    └──────────┘    └────┬─────┘
     │                               │
     ▼                               ▼
┌──────────────────────────────────────────┐
│              backend :4000               │
│   Express + Apollo Server + multer       │
└──────────────────┬───────────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │   postgres :5432 │
          │   PostgreSQL 16  │
          └─────────────────┘
```

| Service | Image de base | Rôle |
|---|---|---|
| `nginx` | `nginx:alpine` | Reverse proxy — `/api/*` → backend, `/` → frontend |
| `frontend` | `node:20-alpine` + Nginx | Build Vite, SPA servie statiquement |
| `backend` | `node:20-alpine` | API GraphQL, WebSocket, upload/download fichiers |
| `postgres` | `postgres:16-alpine` | Base de données principale |
| `redis` | `redis:7-alpine` | Pub/sub pour subscriptions GraphQL temps réel |

**Volumes Docker :**
```yaml
volumes:
  postgres_data:    # Données PostgreSQL
  uploads_data:     # Fichiers uploadés — monté dans backend : uploads_data:/app/uploads
```

**Flux fichiers :**
- Upload : `navigateur → multer (backend) → /app/uploads/incidents/:id/`
- Download : `GET /api/files/:path` → middleware JWT → `res.sendFile()`

---

## Pages — état & plan d'action

### Pages existantes dans le template (à adapter)

| Page | Route actuelle | Action |
|---|---|---|
| `Dashboard.tsx` | `/` | Brancher GraphQL + subscriptions statut |
| `Annuaire.tsx` | `/annuaire` | Brancher GraphQL CRUD contacts |
| `MainCouranteDirection.tsx` | `/main-courante-direction` | GraphQL + subscription temps réel |
| `MainCouranteOperationnelle.tsx` | `/main-courante-operationnelle` | GraphQL + subscription temps réel |
| `Timeline.tsx` | `/timeline` | GraphQL + subscription + lien OpenCTI |
| `Bibliotheque.tsx` | `/bibliotheque` | Upload/download via GraphQL |
| `Artifacts.tsx` | `/artifacts` | **Supprimé** — sera réintégré dans une page Documents (Phase 6) |
| `Cartographie.tsx` | `/cartographie` | **Supprimé** — hors scope (peut être réintroduit en Phase 7+) |

### Pages à créer from scratch

| Page | Route | Description |
|---|---|---|
| `Login` | `/login` | **Créée (Phase 2)** — formulaire placeholder, auth réelle en Phase 5 |
| `IncidentSelector` | `/incidents` | **Créée (Phase 2)** — workspace picker avec données mockées, GraphQL en Phase 5 |
| `Administration` | `/admin` | Gestion utilisateurs, rôles, permissions |

### Corrections apportées au template *(Phase 2)*

1. ✅ **Supprimer Material UI** — `@mui/material`, `@emotion/react`, `@emotion/styled` supprimés
2. ✅ **`tsconfig.json`** — présent et configuré (`strict: true`, alias `@/`)
3. ✅ **Restructurer le routing** — `/` → `/incidents` ; workspace model `/incidents/:incidentId/*`
4. ✅ **Supprimer le plugin Figma** — `figma-asset-resolver` et dossier `figma/` supprimés
5. ✅ **Ajouter Apollo Client** — couche GraphQL + WebSocket split link opérationnel

---

## Modèle de données — Prisma schema

```prisma
// ─── IDENTITÉ & ACCÈS ─────────────────────────────────────────────────────

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  passwordHash String
  firstName    String
  lastName     String
  phone        String?
  company      String?
  site         String?
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  roleAssignments RoleAssignment[]
  logEntries      LogEntry[]
  timelineEvents  TimelineEvent[]
  documents       Document[]
  contacts        Contact[]
  auditLogs       AuditLog[]
  refreshTokens   RefreshToken[]
}

model Role {
  id          String    @id @default(uuid())
  name        String    @unique
  description String?
  isSystem    Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  assignments RoleAssignment[]
  permissions RolePermission[]
}

model Permission {
  id       String             @id @default(uuid())
  resource PermissionResource
  action   PermissionAction

  rolePermissions RolePermission[]

  @@unique([resource, action])
}

model RoleAssignment {
  id        String   @id @default(uuid())
  userId    String
  roleId    String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
  role Role @relation(fields: [roleId], references: [id])

  @@unique([userId, roleId])
}

model RolePermission {
  roleId       String
  permissionId String

  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}

model RefreshToken {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

// ─── INCIDENT (WORKSPACE CENTRAL) ─────────────────────────────────────────

model Incident {
  id            String         @id @default(uuid())
  name          String
  description   String?
  status        IncidentStatus @default(ACTIVE)
  severity      Severity       @default(MEDIUM)
  startedAt     DateTime       @default(now())
  resolvedAt    DateTime?
  createdById   String
  openctiCaseId String?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  deletedAt     DateTime?

  logEntries     LogEntry[]
  timelineEvents TimelineEvent[]
  documents      Document[]
  contacts       IncidentContact[]
  auditLogs      AuditLog[]
}

// ─── MAIN COURANTE ────────────────────────────────────────────────────────

model LogEntry {
  id         String    @id @default(uuid())
  incidentId String
  cell       Cell
  content    String
  authorId   String
  isEdited   Boolean   @default(false)
  editedAt   DateTime?
  editedById String?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  deletedAt  DateTime?

  incident Incident      @relation(fields: [incidentId], references: [id])
  author   User          @relation(fields: [authorId], references: [id])
  tags     LogEntryTag[]
}

model Tag {
  id    String @id @default(uuid())
  name  String @unique
  color String @default("#6B7280")

  logEntries LogEntryTag[]
}

model LogEntryTag {
  logEntryId String
  tagId      String

  logEntry LogEntry @relation(fields: [logEntryId], references: [id])
  tag      Tag      @relation(fields: [tagId], references: [id])

  @@id([logEntryId, tagId])
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────

model TimelineEvent {
  id                String            @id @default(uuid())
  incidentId        String
  type              TimelineEventType
  title             String
  description       String?
  occurredAt        DateTime
  actorId           String?
  ipAddress         String?
  assetName         String?
  affectedUser      String?
  openctiEntityId   String?
  openctiEntityType String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  incident  Incident   @relation(fields: [incidentId], references: [id])
  actor     User?      @relation(fields: [actorId], references: [id])
  documents Document[]
}

// ─── DOCUMENTS, BIBLIOTHÈQUE & ARTEFACTS ──────────────────────────────────
// incidentId null  → Bibliothèque globale (fiches réflexes, procédures)
// incidentId set   → Document ou artefact lié à un incident
// Distinction via `category`

model Document {
  id                String           @id @default(uuid())
  incidentId        String?
  timelineEventId   String?
  name              String
  filePath          String
  mimeType          String
  sizeBytes         Int
  category          DocumentCategory
  uploadedById      String
  openctiEntityId   String?
  openctiEntityType String?
  createdAt         DateTime         @default(now())
  deletedAt         DateTime?

  incident      Incident?      @relation(fields: [incidentId], references: [id])
  timelineEvent TimelineEvent? @relation(fields: [timelineEventId], references: [id])
  uploadedBy    User           @relation(fields: [uploadedById], references: [id])
}

// ─── ANNUAIRE ─────────────────────────────────────────────────────────────

model Contact {
  id           String    @id @default(uuid())
  firstName    String
  lastName     String
  role         String
  organization String?
  phone        String?
  email        String?
  site         String?
  notes        String?
  isGlobal     Boolean   @default(true)
  createdById  String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  createdBy User              @relation(fields: [createdById], references: [id])
  incidents IncidentContact[]
}

model IncidentContact {
  incidentId String
  contactId  String

  incident Incident @relation(fields: [incidentId], references: [id])
  contact  Contact  @relation(fields: [contactId], references: [id])

  @@id([incidentId, contactId])
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?
  action     String
  resource   String
  resourceId String?
  incidentId String?
  metadata   Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  user     User?     @relation(fields: [userId], references: [id])
  incident Incident? @relation(fields: [incidentId], references: [id])
}

// ─── ENUMS ────────────────────────────────────────────────────────────────

enum IncidentStatus    { ACTIVE CONTAINED CLOSED }
enum Severity          { LOW MEDIUM HIGH CRITICAL }
enum Cell              { DIRECTIONAL OPERATIONAL SHARED }
enum TimelineEventType { DETECTION ACTION DECISION COMMUNICATION ESCALATION RESOLUTION }
enum DocumentCategory  { ARTIFACT FICHE_REFLEXE RAPPORT PROCEDURE OTHER }
enum PermissionAction  { READ WRITE }

enum PermissionResource {
  DASHBOARD
  MAIN_COURANTE_DIR
  MAIN_COURANTE_OPS
  TIMELINE
  DOCUMENTS
  BIBLIOTHEQUE
  ANNUAIRE
  CARTOGRAPHIE
  ADMIN
}
```

---

## Système de rôles et permissions

**Rôles système** (créés au seed, non supprimables) :

| Rôle | Permissions |
|---|---|
| `Administrateur` | Toutes les ressources + `ADMIN` |
| `Pilote de crise` | Toutes les ressources sauf `ADMIN` (READ + WRITE) |
| `Cellule Directionnelle` | `DASHBOARD`, `MAIN_COURANTE_DIR`, `TIMELINE`, `ANNUAIRE`, `DOCUMENTS` |
| `Cellule Opérationnelle` | `DASHBOARD`, `MAIN_COURANTE_OPS`, `TIMELINE`, `ANNUAIRE`, `DOCUMENTS`, `CARTOGRAPHIE` |
| `Observateur` | `DASHBOARD`, `TIMELINE`, `BIBLIOTHEQUE`, `DOCUMENTS` (READ uniquement) |

RBAC appliqué côté backend (middleware resolver) et côté frontend (onglets masqués via Zustand).

---

## Temps réel — GraphQL Subscriptions

| Subscription | Déclencheur |
|---|---|
| `logEntryAdded(incidentId, cell)` | Nouvelle entrée main courante |
| `logEntryUpdated(incidentId, cell)` | Entrée modifiée |
| `timelineEventAdded(incidentId)` | Nouvel événement timeline |
| `incidentStatusChanged(incidentId)` | Changement de statut ou sévérité |
| `documentUploaded(incidentId)` | Nouveau document ou artefact |
| `incidentCreated` | Nouvelle crise ouverte |

Stack : `graphql-ws` + `graphql-redis-subscriptions`.

---

## Intégration OpenCTI (optionnelle)

Activée via `.env` (`OPENCTI_ENABLED=true`, `OPENCTI_URL`, `OPENCTI_TOKEN`).

| Fonctionnalité | Description |
|---|---|
| Recherche CTI | Chercher un observable depuis la timeline |
| Lien événement ↔ entité | Associer un `TimelineEvent` à un observable OpenCTI |
| Lien artefact ↔ entité | Associer un `Document` à une entité CTI |
| Export incident → Case | Créer un Case STIX dans OpenCTI |

---

## Structure du projet

```
opencrisis/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── CLAUDE.md
├── 03-nginx/
│   └── nginx.conf
│
├── 01-frontend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.development                 # URLs dev locales (non commité)
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── codegen.yml
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── src/
│       ├── vite-env.d.ts                # Déclarations TypeScript pour import.meta.env
│       ├── app/
│       │   ├── App.tsx
│       │   ├── routes.ts
│       │   ├── layouts/RootLayout.tsx
│       │   ├── providers/ThemeProvider.tsx
│       │   ├── components/
│       │   │   ├── ErrorBoundary.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── ui/                  # 52 composants shadcn
│       │   └── pages/
│       │       ├── Login.tsx            # Placeholder — auth réelle Phase 5
│       │       ├── IncidentSelector.tsx # Placeholder — GraphQL Phase 5
│       │       ├── Dashboard.tsx
│       │       ├── Annuaire.tsx
│       │       ├── Bibliotheque.tsx
│       │       ├── MainCouranteDirection.tsx
│       │       ├── MainCouranteOperationnelle.tsx
│       │       ├── Timeline.tsx
│       │       └── NotFound.tsx
│       ├── lib/apolloClient.ts          # Apollo Client (HTTP + WebSocket split)
│       ├── store/useAppStore.ts         # Zustand — currentUser, currentIncident, permissions
│       ├── context/AuthContext.tsx      # Skeleton AuthProvider (Phase 5)
│       ├── graphql/
│       │   ├── queries/
│       │   ├── mutations/
│       │   └── subscriptions/
│       └── types/generated.ts           # Auto-généré par codegen — NE PAS ÉDITER
│
└── 02-backend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── prisma/
    │   ├── schema.prisma
    │   ├── seed.ts
    │   └── migrations/
    │       ├── migration_lock.toml
    │       └── 20260527000000_init/
    │           └── migration.sql
    └── src/
        ├── context.ts               # GraphQLContext (userId, req, res)
        ├── prisma.ts                # PrismaClient singleton
        ├── pubsub.ts                # Redis pub/sub (Phase 4)
        ├── server.ts                # Express + Apollo + WebSocket + env validation
        ├── schema/
        │   ├── auth.ts              # typeDefs auth (User, Role, AuthPayload, Query, Mutation)
        │   └── index.ts
        ├── resolvers/
        │   ├── auth.ts              # login, logout, refreshToken, me
        │   └── index.ts
        ├── services/
        │   └── auth.ts              # bcrypt, JWT, Prisma — USER_INCLUDE exporté
        └── middleware/
            ├── auth.ts              # verifyAccessToken, extractBearerToken
            ├── rbac.ts              # requirePermission (réutilise USER_INCLUDE)
            └── audit.ts             # logAudit fire-and-forget
```

---

## Bibliothèques clés

**Backend** : `@apollo/server`, `graphql-ws`, `graphql-redis-subscriptions`, `prisma`, `@prisma/client`, `jsonwebtoken`, `bcryptjs`, `multer`, `zod`, `pdfkit`, `exceljs`

**Frontend** : `@apollo/client`, `graphql-ws`, `zustand`, `react-router-dom v7`, `shadcn/ui`, `tailwind v4`, `react-hook-form`, `zod`, `@graphql-codegen/*`

**Supprimés du template (Phase 2)** : `@mui/material`, `@emotion/react`, `@emotion/styled`, `framer-motion`, `react-dnd`, `react-responsive-masonry`, plugin `figma-asset-resolver`

---

## Phases d'implémentation

### ✅ Phase 1 — Infrastructure Docker *(terminée)*
- `docker-compose.yml` : 5 services, healthchecks, volumes `postgres_data` et `uploads_data`
- `.env.example` : `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `CORS_ORIGIN`, `OPENCTI_*`
- `nginx.conf` : reverse proxy HTTP

### ✅ Phase 2 — Frontend : nettoyage du template *(terminée)*
- Suppression des dépendances inutilisées : MUI, `@emotion/*`, `framer-motion`, `react-dnd`, `react-responsive-masonry`
- Suppression des pages hors scope : `Cartographie.tsx`, `TableauBlanc.tsx`, `Artifacts.tsx`
- Suppression du dossier `Front - Template/` et des artefacts Figma (`src/app/components/figma/`)
- Restructuration du routing : `/login`, `/incidents`, `/incidents/:incidentId/*` (7 routes actives)
- Création des pages `Login.tsx` et `IncidentSelector.tsx`
- Installation d'Apollo Client + `graphql-ws` + Zustand + GraphQL Code Generator
- Ajout de `vite-env.d.ts` (déclarations TypeScript pour `import.meta.env`)
- Ajout de `.dockerignore` et `01-frontend/.env.development`
- Génération de `pnpm-lock.yaml`
- Ajout de l'`ErrorBoundary` (composant classe — seule façon de capturer les erreurs de rendu React)

### ✅ Phase 3 — Backend : fondations auth & RBAC *(terminée)*
- Prisma schema complet (13 tables, 7 enums) + migration initiale versionnée
- Seed idempotent : 18 permissions, 5 rôles système, compte `admin@opencrisis.local / Admin1234!`
- Resolvers auth : `login`, `logout`, `refreshToken`, `me` — entièrement testés
- Middleware JWT (HTTP + WebSocket) + middleware RBAC (`requirePermission`)
- Audit log fire-and-forget (`logAudit`) + validation des env vars au démarrage

### Phase 4 — Backend : modules métier
- Resolvers Incident, LogEntry, Tag, TimelineEvent, Document, Contact
- Middleware audit log (toutes les mutations)
- Resolvers OpenCTI (conditionnel sur `OPENCTI_ENABLED`)

### Phase 5 — Frontend : auth & navigation
- Page Login + AuthContext + Zustand store
- Routes protégées par permission
- Page IncidentSelector (workspace picker)
- Sidebar avec sélecteur d'incident

### Phase 6 — Frontend : connexion GraphQL par module
- GraphQL Code Generator setup + génération initiale
- Adapter chaque page du template (remplacer mocks par hooks Apollo)
- Subscriptions temps réel sur Main Courante et Timeline
- Fusionner Artifacts + Bibliothèque → page Documents unifiée

### Phase 7 — Fonctionnalités transverses
- Page Administration (users, rôles, permissions, audit log viewer)
- Export PDF via `pdfkit`
- Export Excel via `exceljs`

---

## Vérification end-to-end

1. `docker compose up --build` → tous les services `healthy`
2. `http://localhost` → page Login
3. Login admin seed → IncidentSelector
4. Créer un incident → entrer dans le workspace
5. Deux onglets Main Courante → saisir une entrée → apparition immédiate dans l'autre
6. Basculer d'incident → données isolées
7. Rôle sans `CARTOGRAPHIE` → onglet masqué + erreur 403 sur la query
8. Upload PDF → re-téléchargement OK depuis un autre compte
9. `SELECT action, resource, "createdAt" FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 10;`
10. Export PDF rapport post-incident → fichier correct et téléchargeable
