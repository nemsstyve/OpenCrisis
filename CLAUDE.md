# OpenCrisis — Contexte projet pour Claude

## Workflow après chaque changement de code

Après **chaque tâche**, dans l'ordre :
1. **Vérification code** — propreté, simplicité, pas de complexité inutile, pas d'import mort
2. **Test navigateur** via Claude in Chrome — scénario utilisateur réel (nominal + cas d'erreur)
3. **Vérification sécurité** — pas de régression OWASP introduite
4. **Documentation** — mettre à jour CLAUDE.md et les fichiers `04-documentation/` si nécessaire

---

## Workflow de fin de phase

Quand l'utilisateur dit **"fin de phase"**, **"vérifie et commit"** ou équivalent, exécuter systématiquement les étapes suivantes **dans l'ordre**, en s'arrêtant si une étape échoue :

### Étape 1 — Qualité du code
- Supprimer les imports inutilisés, variables mortes, blocs commentés
- S'assurer que chaque fonction fait une seule chose
- Vérifier la cohérence du nommage avec le reste du projet
- Utiliser le skill `/simplify` si disponible

### Étape 2 — Tests fonctionnels
- Tester chaque fonctionnalité développée dans la phase via `curl`, `docker exec`, ou le navigateur
- Vérifier les cas nominaux ET les cas d'erreur (token invalide, champ manquant, permission refusée…)
- Utiliser le skill `/verify` si disponible
- **Si un test échoue → corriger avant de continuer**

### Étape 3 — Vérification sécurité (OWASP)
Effectuer uniquement si les étapes 1 et 2 sont validées. Vérifier au minimum :
- **A01 Broken Access Control** — chaque endpoint/resolver vérifie les permissions
- **A02 Cryptographic Failures** — pas de secrets en clair, cookies HttpOnly/Secure/SameSite
- **A03 Injection** — pas de concaténation SQL/GraphQL brute, Prisma utilisé partout
- **A07 Auth Failures** — tokens expirés rejetés, refresh token révoqué après usage
- **A09 Logging** — audit log écrit sur toutes les mutations sensibles
- Utiliser le skill `/security-review` si disponible
- **Si une faille est trouvée → corriger avant de continuer**

### Étape 4 — Documentation
- Mettre à jour `04-documentation/06-verification.md` (checklist de la phase)
- Mettre à jour `04-documentation/00-plan.md` (marquer la phase ✅)
- Mettre à jour `CLAUDE.md` si la structure ou les règles ont changé

### Étape 5 — Commit
- Format **Conventional Commits** obligatoire (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- Un commit par nature de changement (code séparé de docs si possible)
- Message en anglais, corps en français si besoin de détails

---

## Ce qu'est le projet

Application web de gestion de crise cyber pour une seule organisation. Réunit la cellule directionnelle et la cellule opérationnelle sur une interface unique avec collaboration en temps réel.

**Concept central** : sélecteur d'incident (modèle workspace Slack). Après login, l'utilisateur choisit une crise ; toutes les routes sont sous `/incidents/:id/*`. Plusieurs crises peuvent coexister simultanément.

Le plan de développement complet est dans `04-documentation/00-plan.md`.

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind v4 + shadcn/ui |
| Backend | Node.js 20 + Express + Apollo Server 4 (GraphQL) |
| ORM | Prisma (schéma dans `02-backend/prisma/schema.prisma`) |
| Base de données | PostgreSQL 16 |
| Temps réel | GraphQL Subscriptions (`graphql-ws` + Redis pub/sub) |
| Auth | JWT (access token) + refresh token (cookie HttpOnly) |
| Fichiers | Volume Docker `uploads_data`, servi par Express avec vérification JWT |
| Reverse proxy | Nginx |
| Types | GraphQL Code Generator (`pnpm codegen` dans `01-frontend/`) |
| État global | Zustand (`currentUser`, `currentIncident`, permissions actives) |

---

## Commandes clés

```bash
# Démarrer tous les services (prod)
docker compose up --build

# Démarrer postgres + redis seulement (dev)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up postgres redis

# Backend — nouvelle migration (après modification du schéma Prisma)
docker exec -it opencrisis-backend-1 npx prisma migrate dev --name <nom>

# Backend — seed (rôles système + admin)
docker exec opencrisis-backend-1 npx prisma db seed

# Backend — Prisma Studio
docker exec opencrisis-backend-1 npx prisma studio

# Frontend — générer les types GraphQL
cd 01-frontend && pnpm codegen

# Frontend — dev server
cd 01-frontend && pnpm dev
```

---

## Structure du projet

```
opencrisis/
├── docker-compose.yml
├── .env.example          # Variables requises : DATABASE_URL, JWT_SECRET,
│                         # JWT_REFRESH_SECRET, REDIS_URL, CORS_ORIGIN, OPENCTI_*
├── 01-frontend/
│   ├── src/
│   │   ├── app/pages/    # Login/, IncidentSelector/, Dashboard/, MainCourante/,
│   │   │                 # Timeline/, Documents/, Annuaire/, Cartographie/, Administration/
│   │   ├── components/ui/ # 52 composants shadcn (ne pas modifier)
│   │   ├── graphql/      # queries/, mutations/, subscriptions/ (fichiers .graphql)
│   │   ├── store/        # Zustand stores
│   │   ├── context/      # AuthContext
│   │   └── types/generated.ts  # AUTO-GÉNÉRÉ par codegen — ne pas éditer manuellement
│   └── codegen.yml
├── 02-backend/
│   ├── prisma/
│   │   ├── schema.prisma  # Source de vérité du modèle de données
│   │   ├── seed.ts
│   │   └── migrations/    # Versionnées — ne pas modifier à la main
│   └── src/
│       ├── schema/        # typeDefs GraphQL par module
│       ├── resolvers/     # Query / Mutation / Subscription
│       ├── services/      # Logique métier (auth.ts exporte USER_INCLUDE ; admin.ts Phase 7)
│       ├── resolvers/     # auth, incident, logEntry, tag, timeline, document, contact, admin
│       ├── routes/        # auth.ts, files.ts, export.ts (PDF/Excel), admin.ts
│       ├── schema/        # typeDefs GraphQL par module (auth, incident, logEntry, tag, timeline, document, contact, admin)
│       ├── middleware/
│       │   ├── auth.ts           # Vérification JWT (HTTP + WebSocket)
│       │   ├── rbac.ts           # requirePermission (throw) + hasPermission (bool)
│       │   ├── httpPermission.ts # requireHttpPermission + getUserReadableResources (REST)
│       │   └── audit.ts          # logAudit() — fire-and-forget, ne propage pas les erreurs
│       ├── utils/
│       │   └── validation.ts     # passwordSchema zod (DÉC-3 — complexité mdp)
│       ├── pubsub.ts      # Instance Redis pub/sub (Phase 4 — non importé avant)
│       └── server.ts      # Valide les env vars au démarrage (exit 1 si manquantes)
├── 03-nginx/
│   └── nginx.conf
└── 04-documentation/
    └── *.md
```

---

## Modèle de données — entités principales

- **User** — utilisateur avec rôle(s) assigné(s). Champ `mustChangePassword: Boolean` (Lot 0) — si `true`, l'utilisateur est forcé vers `/change-password` dès la connexion.
- **Role** — rôle nommé, `isSystem=true` pour les rôles non supprimables
- **Permission** — combinaison `PermissionResource × PermissionAction`
- **Incident** — entité centrale (workspace). Tout est filtré par `incidentId`
- **LogEntry** — entrée de main courante, champ `cell: Cell` (DIRECTIONAL | OPERATIONAL | SHARED)
- **Tag** — tags libres sur les entrées main courante (relation M2M via `LogEntryTag`)
- **TimelineEvent** — événement chronologique de la crise
- **Document** — fichier. `incidentId null` = bibliothèque globale ; sinon rattaché à l'incident. `category` distingue ARTIFACT / FICHE_REFLEXE / RAPPORT / PROCEDURE / OTHER
- **Contact** — annuaire de l'organisation. Le rattachement par incident (`IncidentContact`) et le champ `isGlobal` ont été retirés au Sprint P2
- **AuditLog** — trace automatique de toutes les mutations (ne jamais supprimer)
- **RefreshToken** — tokens de renouvellement JWT stockés en base

---

## Rôles système (seed)

| Rôle | Accès |
|---|---|
| `Administrateur` | Tout + ADMIN |
| `Pilote de crise` | Tout sauf ADMIN |
| `Cellule Directionnelle` | DASHBOARD, MAIN_COURANTE_DIR, TIMELINE, ANNUAIRE, DOCUMENTS |
| `Cellule Opérationnelle` | DASHBOARD, MAIN_COURANTE_OPS, TIMELINE, ANNUAIRE, DOCUMENTS |
| `Observateur` | DASHBOARD, TIMELINE, BIBLIOTHEQUE, DOCUMENTS (READ only) |

---

## Règles de développement importantes

- **Règles d'édition LogEntry (DÉC-2)** — `editLogEntry` / `deleteLogEntry` : auteur OU rôle avec `WRITE` sur la cellule (Pilote/Admin). Appliqué dans `resolvers/logEntry.ts`.
- **Export scoped (DÉC-1)** — `GET /api/export/:id/pdf` et `/xlsx` filtrent les entrées sur les cellules que l'utilisateur peut lire. Appliqué dans `routes/export.ts`.
- **Politique mot de passe (DÉC-3)** — validation zod dans `utils/validation.ts` : 8 chars min, 1 maj, 1 chiffre, 1 spécial. Appliquée à `createUser` et `changePassword`. Tout nouveau compte a `mustChangePassword: true`.
- **Rate-limiting login** — 10 tentatives / 15 min par IP, en mémoire dans `services/auth.ts`. Les échecs de login sont audités.
- **`01-frontend/src/types/generated.ts` ne se modifie jamais à la main** — régénérer avec `pnpm codegen` (requiert Node.js local) après tout changement du schéma GraphQL. Le schéma source est `01-frontend/schema.graphql` (extrait depuis `02-backend/src/schema/` via le script PowerShell en bas). `src/types/api.ts` a été supprimé (Lot UI-0, DÉC-UI-2).
- **Toute mutation GraphQL doit appeler `requirePermission(ctx, resource, action)`** avant d'agir
- **Authentification des resolvers (F2)** — utiliser le helper `requireAuth(ctx)` de `middleware/rbac.ts` (retourne le `userId` non-null) plutôt que des `if (!ctx.userId)` répétés
- **Validation des inputs (F1)** — schémas zod centralisés dans `utils/validation.ts`, appliqués via `validate(schema, input)` en tête de chaque mutation (lève `BAD_USER_INPUT`)
- **Validation des variables d'env (F4)** — schéma zod dans `utils/env.ts`, `loadEnv()` appelé au démarrage de `server.ts` (exit 1 si invalide)
- **Toute mutation doit appeler `logAudit(...)`** — fire-and-forget, ne pas await
- **Les fichiers uploadés vont dans `/app/uploads/incidents/:incidentId/`** — jamais à la racine du volume
- **Soft delete uniquement** sur User, Incident, LogEntry, Document, Contact — utiliser `deletedAt`, ne jamais `DELETE` en base
- **OpenCTI est optionnel** — toujours vérifier `OPENCTI_ENABLED` avant d'appeler le service OpenCTI
- **Pas de Material UI** — utiliser uniquement shadcn/ui (MUI supprimé en Phase 2)
- **Pas de Node.js local** — toutes les commandes `prisma` s'exécutent via `docker exec opencrisis-backend-1`

## État des pages front-end (Phase 7 terminée)

Pages existantes dans `01-frontend/src/app/pages/` :

| Page | Statut |
|---|---|
| `Login.tsx` | ✅ Auth réelle (Phase 5) |
| `IncidentSelector.tsx` | ✅ GraphQL réel (Phase 5) |
| `Dashboard.tsx` | ✅ GraphQL réel — stats + frise + contributeurs (Phase 6) |
| `Annuaire.tsx` | ✅ GraphQL réel — CRUD contacts + RBAC (Phase 6) |
| `Bibliotheque.tsx` | ✅ GraphQL + REST upload/download — deux onglets global/incident (Phase 6) |
| `MainCouranteDirection.tsx` | ✅ GraphQL + subscriptions temps réel + tags (Phase 6) |
| `MainCouranteOperationnelle.tsx` | ✅ GraphQL + subscriptions temps réel + tags (Phase 6) |
| `Timeline.tsx` | ✅ GraphQL + subscription + modal création (Phase 6) |
| `Administration.tsx` | ✅ CRUD users + reset mdp, matrice rôles/permissions, journal audit paginé (Phase 7) |
| `NotFound.tsx` | ✅ Terminée |

`Artifacts.tsx` supprimé — remplacé par Documents dans la Bibliothèque.

### Hooks et utilitaires (Phase 6-7)

- `src/hooks/useCurrentIncident.ts` — restaure `currentIncident` Zustand depuis URL params si store vide
- `src/lib/fileUtils.ts` — `downloadFile(id, name)` + `uploadFile(file, opts)` + `formatBytes(n)` via REST JWT
- `src/lib/exportUtils.ts` — déclenchement export PDF (main courante) et Excel (timeline) via GET REST JWT

---

## Intégration OpenCTI

Optionnelle, activée par `OPENCTI_ENABLED=true` dans `.env`. Permet de lier des événements de timeline à des observables/indicateurs OpenCTI, et d'exporter un incident comme Case STIX. Les champs `openctiEntityId`, `openctiEntityType` sur `TimelineEvent` et `Document`, et `openctiCaseId` sur `Incident` stockent les références.
