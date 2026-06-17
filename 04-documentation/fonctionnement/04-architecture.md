# Architecture de l'application

## Vue d'ensemble

```
                              ┌──────────────────────────────────────────────────────┐
                              │                       Docker Host                     │
                              │                                                       │
                              │   ┌─── frontend-network (bridge) ────────────────┐    │
   Navigateur                 │   │                                              │    │
   utilisateur ──HTTPS:443──▶ │ ──┼──▶ nginx :443  ──▶ frontend :8080            │    │
                              │   │      (TLS)    ──▶ backend  :4000             │    │
                              │   │                                              │    │
                              │   └────────────────────────────────────┬─────────┘    │
                              │                                        │              │
                              │   ┌─── backend-network (internal) ─────┴─────────┐    │
                              │   │                                              │    │
                              │   │   backend ──▶ postgres :5432                 │    │
                              │   │            ──▶ redis    :6379                │    │
                              │   │                                              │    │
                              │   │   (aucune sortie internet possible)          │    │
                              │   └──────────────────────────────────────────────┘    │
                              │                                                       │
                              └──────────────────────────────────────────────────────┘
```

**Nginx** est le seul point d'entrée exposé sur la machine hôte. Il route :
- `/api/auth/login` → Backend (rate limit login strict, 10 req/min)
- `/api/files/*` → Backend (rate limit upload, timeout étendu)
- `/api/graphql` → Backend (support WebSocket pour les subscriptions temps réel)
- `/api/*` → Backend (autres routes REST)
- `/*` → Frontend (assets statiques + fallback SPA)

Tout le trafic HTTP (port 80) est redirigé en 301 vers HTTPS (port 443).

Le détail de la sécurisation HTTP (TLS, headers, rate limiting, blocage de fichiers) est dans [11-securite-infrastructure.md](11-securite-infrastructure.md).

---

## Isolation réseau

L'infrastructure utilise deux réseaux Docker distincts :

| Réseau | Services | Accès internet |
|---|---|---|
| `frontend-network` | nginx, frontend, backend | Oui |
| `backend-network` | backend, postgres, redis | **Non** (`internal: true`) |

Le **backend** est le seul service présent sur les deux réseaux, ce qui en fait le pont obligatoire entre nginx et les services de stockage. Conséquences :

- PostgreSQL et Redis ne peuvent pas sortir vers internet (pas d'exfiltration de données possible)
- Le frontend ne peut pas atteindre directement PostgreSQL — il doit nécessairement passer par le backend, qui applique l'authentification, le RBAC et l'audit log

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
1. POST /api/auth/login                    (HTTPS, rate-limité 10 req/min par IP)
   → access token (JWT, 15 min, retourné dans le body)
   → refresh token (JWT, 7 jours, stocké en cookie HttpOnly Secure SameSite=Strict)

2. Chaque requête GraphQL / REST           (HTTPS)
   → Header : Authorization: Bearer <access_token>
   → Middleware auth.ts valide le JWT (algorithme HS256 pinné)
   → userId injecté dans le contexte GraphQL

3. Expiration de l'access token
   → POST /api/auth/refresh (le cookie refresh est envoyé automatiquement)
   → Nouveau access token retourné
   → Ancien refresh token révoqué en base (rotation)

4. POST /api/auth/logout
   → Refresh token révoqué en base
   → Cookie supprimé
```

L'access token est stocké **en mémoire uniquement** côté frontend (`tokenStore.ts`) — jamais dans `localStorage` ni `sessionStorage`.

Le cookie de refresh est sécurisé par les flags `HttpOnly` (inaccessible au JavaScript), `Secure` (transmis uniquement en HTTPS) et `SameSite=Strict` (envoyé uniquement sur des requêtes du même site).

---

## Flux temps réel (subscriptions)

```
Frontend                        Backend                    Redis
   │                               │                          │
   │──WSS connect (/api/graphql)──▶│                          │
   │   (TLS via nginx)             │                          │
   │──subscribe(logEntries)───────▶│                          │
   │                               │──SUBSCRIBE channel──────▶│
   │                               │                          │
   │           [autre utilisateur crée une entrée]            │
   │                               │──PUBLISH event──────────▶│
   │                               │◀─────────────────────────│
   │◀──subscription data───────────│                          │
```

Les WebSocket passent par nginx (`location /api/graphql` avec les headers `Upgrade` et `Connection`), donc également chiffrés en TLS. La CSP autorise les connexions `wss:`.

Chaque mutation qui modifie des données temps réel publie un événement sur un canal Redis. Les subscriptions GraphQL actives reçoivent les données et les transmettent via WebSocket aux clients abonnés.

---

## Flux d'upload de fichier

```
Frontend → POST /api/files/upload (multipart/form-data, Authorization: Bearer)
         → Reverse proxy nginx :
              - Rate limit upload (20 req/min, burst 5)
              - client_max_body_size 50M
              - Timeout 300s pour les gros fichiers
         → Backend :
              - Middleware auth.ts vérifie le JWT
              - Middleware httpPermission.ts vérifie la permission DOCUMENTS WRITE
              - Multer stocke le fichier dans /app/uploads/tmp/
              - Validation de l'incidentId (incident ouvert ?)
              - Déplacement vers /app/uploads/incidents/:incidentId/
              - Entrée Document créée en base via Prisma
              - logAudit pour traçabilité

Frontend → GET /api/files/:documentId (Authorization: Bearer)
         → Backend :
              - JWT vérifié
              - Permission DOCUMENTS READ
              - Path traversal check (résolution dans /app/uploads/)
              - logAudit du téléchargement
              - Streaming du fichier
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

**Point d'entrée unique** — Tout le trafic passe par nginx. Aucun service applicatif n'est exposé directement sur l'hôte. Cela centralise les contrôles (TLS, rate limiting, headers de sécurité, blocage de fichiers) et empêche tout contournement.

**Isolation réseau par défaut** — Le réseau `backend-network` est `internal: true`. Postgres et Redis ne peuvent ni initier de connexion sortante, ni recevoir de trafic depuis l'extérieur. Toute communication avec eux passe obligatoirement par le backend.
