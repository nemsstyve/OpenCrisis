# Architecture de l'application

## Vue d'ensemble

```
                         ┌─────────────────────────────────────────────┐
                         │              Docker Network "opencrisis"     │
                         │                                              │
  Navigateur  ──HTTP──▶  │  Nginx :80  ──▶  Frontend :80 (React/Vite)  │
              ──WS────▶  │             ──▶  Backend :4000 (Express)     │
                         │                      │                       │
                         │                      ├──▶ PostgreSQL :5432   │
                         │                      └──▶ Redis :6379        │
                         └─────────────────────────────────────────────┘
```

**Nginx** est le seul point d'entrée public (port 80). Il route :
- `/api/*` → Backend Node.js (port 4000)
- `/*` → Frontend React (port 80, assets statiques)
- WebSocket (`Upgrade: websocket` sur `/api/graphql`) → Backend

---

## Concept workspace (sélecteur d'incident)

Toutes les routes applicatives sont sous `/incidents/:incidentId/*`. L'utilisateur choisit un incident au démarrage (ou après connexion), et toutes les données affichées sont filtrées par cet `incidentId`.

Ce modèle permet plusieurs crises simultanées sans isolation de comptes : un même utilisateur peut passer d'un incident à l'autre en changeant de workspace.

```
/login
/change-password
/incidents                    ← sélecteur
/incidents/:id/dashboard
/incidents/:id/main-courante/direction
/incidents/:id/main-courante/operations
/incidents/:id/timeline
/incidents/:id/bibliotheque
/incidents/:id/annuaire
/incidents/:id/administration
```

---

## Flux d'authentification

```
1. POST /api/auth/login
   → access token (JWT, 15 min, retourné dans le body)
   → refresh token (JWT, 7 jours, stocké en cookie HttpOnly Secure SameSite=Strict)

2. Chaque requête GraphQL / REST
   → Header : Authorization: Bearer <access_token>
   → Middleware auth.ts valide le JWT et injecte userId dans le contexte GraphQL

3. Expiration de l'access token
   → POST /api/auth/refresh (le cookie refresh est envoyé automatiquement)
   → Nouveau access token retourné
   → Ancien refresh token révoqué en base (rotation)

4. POST /api/auth/logout
   → Refresh token révoqué en base
   → Cookie supprimé
```

L'access token est stocké **en mémoire uniquement** côté frontend (`tokenStore.ts`) — jamais dans `localStorage` ni `sessionStorage`.

---

## Flux temps réel (subscriptions)

```
Frontend                    Backend                    Redis
   │                           │                          │
   │──WS connect (/api/graphql)─▶│                          │
   │──subscribe(logEntries)────▶│                          │
   │                           │──SUBSCRIBE channel──────▶│
   │                           │                          │
   │         [autre utilisateur crée une entrée]          │
   │                           │──PUBLISH event──────────▶│
   │                           │◀─────────────────────────│
   │◀──subscription data───────│                          │
```

Chaque mutation qui modifie des données temps réel publie un événement sur un canal Redis. Les subscriptions GraphQL actives reçoivent les données et les transmettent via WebSocket aux clients abonnés.

---

## Flux d'upload de fichier

```
Frontend → POST /api/files/upload (multipart/form-data, Authorization: Bearer)
         → Middleware auth.ts vérifie le JWT
         → Middleware httpPermission.ts vérifie la permission DOCUMENTS WRITE
         → Multer stocke le fichier dans /app/uploads/incidents/:incidentId/
         → Entrée Document créée en base via Prisma
         → Réponse avec l'ID du document

Frontend → GET /api/files/:documentId (Authorization: Bearer)
         → JWT vérifié → permission DOCUMENTS READ → fichier servi
```

Les fichiers sont stockés dans un volume Docker `uploads_data`, monté en `/app/uploads` dans le conteneur backend. Ils ne sont jamais accessibles sans JWT valide.

---

## Architecture GraphQL + REST hybride

L'API est majoritairement GraphQL, avec des endpoints REST pour les opérations qui ne s'y prêtent pas :

| Protocole | Cas d'usage |
|---|---|
| GraphQL (Apollo) | Toutes les queries, mutations, subscriptions |
| REST `POST /api/files/upload` | Upload multipart (fichiers binaires) |
| REST `GET /api/files/:id` | Download de fichier avec streaming |
| REST `GET /api/export/:id/pdf` | Génération et stream d'un PDF |
| REST `GET /api/export/:id/xlsx` | Génération et stream d'un Excel |
| REST `POST /api/auth/login` | Auth (cookies, pas GraphQL) |
| REST `POST /api/auth/refresh` | Refresh token |
| REST `POST /api/auth/logout` | Révocation cookie |

---

## Décisions d'architecture

**Soft delete uniquement** — Aucun `DELETE` SQL sur les entités métier. Toutes les suppressions ajoutent une date dans `deletedAt`. Cela préserve l'historique d'audit et évite les suppressions accidentelles irréversibles.

**RBAC centralisé** — Toute mutation GraphQL doit appeler `requirePermission(ctx, resource, action)` avant d'agir. Les vérifications ne sont pas dispersées dans les resolvers mais centralisées dans `middleware/rbac.ts`.

**Audit log automatique** — Chaque mutation appelle `logAudit()` en fire-and-forget. Les erreurs d'audit ne doivent jamais bloquer une opération métier.

**UUID partout** — Toutes les clés primaires sont des UUID v4. Pas d'auto-incrément entier exposé dans l'API.

**Token en mémoire** — L'access token n'est jamais persisté côté client. En cas de rechargement de page, Apollo Client tente un refresh automatique avant de rediriger vers le login.
