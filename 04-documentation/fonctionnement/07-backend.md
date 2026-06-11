# Backend

## Structure des dossiers

```
02-backend/src/
├── server.ts              # Point d'entrée : Express + Apollo + WebSocket
├── context.ts             # Contexte GraphQL (userId, req, res)
├── prisma.ts              # Singleton PrismaClient
├── pubsub.ts              # Instance Redis pub/sub (graphql-redis-subscriptions)
│
├── schema/                # Définitions TypeDefs GraphQL par module
│   ├── index.ts           # Fusion de tous les typeDefs
│   ├── auth.ts
│   ├── incident.ts
│   ├── logEntry.ts
│   ├── tag.ts
│   ├── timeline.ts
│   ├── document.ts
│   ├── contact.ts
│   └── admin.ts
│
├── resolvers/             # Implémentations Query/Mutation/Subscription
│   ├── index.ts           # Fusion de tous les resolvers
│   ├── auth.ts
│   ├── incident.ts
│   ├── logEntry.ts
│   ├── tag.ts
│   ├── timeline.ts
│   ├── document.ts
│   ├── contact.ts
│   └── admin.ts
│
├── services/              # Logique métier isolée des resolvers
│   ├── auth.ts            # JWT, bcrypt, rate-limiting login, USER_INCLUDE
│   ├── incident.ts
│   ├── logEntry.ts
│   ├── tag.ts
│   ├── timeline.ts
│   ├── document.ts
│   ├── contact.ts
│   └── admin.ts
│
├── routes/                # Endpoints REST (hors GraphQL)
│   ├── files.ts           # Upload/download de fichiers
│   └── export.ts          # Export PDF et Excel
│
├── middleware/
│   ├── auth.ts            # Vérification JWT (HTTP + WebSocket)
│   ├── rbac.ts            # requirePermission, hasPermission, requireAuth
│   ├── httpPermission.ts  # Permissions pour les routes REST
│   └── audit.ts           # logAudit() fire-and-forget
│
└── utils/
    ├── env.ts             # Validation des variables d'environnement (Zod)
    └── validation.ts      # Schémas Zod réutilisables (password, inputs)
```

---

## Démarrage du serveur (`server.ts`)

Au démarrage :
1. `loadEnv()` — valide les variables d'environnement via Zod (exit 1 si invalide)
2. Création du serveur Express
3. Ajout des middlewares globaux : `helmet`, `cors`, `cookie-parser`, `express.json`
4. Montage des routes REST : `/api/auth/*`, `/api/files/*`, `/api/export/*`
5. Création d'Apollo Server avec le schéma GraphQL fusionné
6. Création du serveur WebSocket (`graphql-ws`) pour les subscriptions
7. Écoute sur `PORT` (4000 par défaut)

---

## Middlewares

### `middleware/auth.ts`

Vérifie le JWT dans le header `Authorization: Bearer <token>` :
- Extrait et vérifie la signature avec `JWT_SECRET`
- Injecte `userId` dans le contexte GraphQL ou Express
- Pour les WebSocket : extrait le token depuis les paramètres de connexion

### `middleware/rbac.ts`

```typescript
// Lance une erreur GraphQL FORBIDDEN si la permission manque
requirePermission(ctx, 'DOCUMENTS', 'WRITE')

// Retourne true/false sans exception
hasPermission(ctx, 'ADMIN', 'READ')

// Retourne userId non-null ou lance UNAUTHENTICATED
const userId = requireAuth(ctx)
```

Utiliser `requireAuth` en tête de chaque resolver protégé, puis `requirePermission` pour vérifier les droits métier.

### `middleware/httpPermission.ts`

Équivalent de `rbac.ts` pour les routes REST (Express middleware) :
- `requireHttpPermission(resource, action)` — middleware Express
- `getUserReadableResources(userId)` — retourne la liste des ressources lisibles

### `middleware/audit.ts`

```typescript
logAudit({
  userId,
  action: 'CREATE',
  resource: 'LogEntry',
  resourceId: entry.id,
  incidentId: entry.incidentId,
  metadata: { cell: entry.cell },
  ipAddress: ctx.req.ip,
})
```

Fire-and-forget : ne jamais `await`, ne propage jamais d'erreurs. Écrit en base via Prisma de façon asynchrone.

---

## Pattern de mutation

Toute mutation GraphQL suit ce pattern dans l'ordre :

```typescript
async createXxx(_, input, ctx) {
  // 1. Authentification
  const userId = requireAuth(ctx)

  // 2. Permission RBAC
  requirePermission(ctx, 'RESOURCE', 'WRITE')

  // 3. Validation de l'input
  const data = validate(xxxSchema, input)

  // 4. Logique métier (service)
  const result = await xxxService.create(data, userId)

  // 5. Audit (fire-and-forget)
  logAudit({ userId, action: 'CREATE', resource: 'Xxx', resourceId: result.id, ... })

  return result
}
```

---

## Routes REST

### `routes/files.ts`

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/files/upload` | Upload multipart. Multer stocke dans `/app/uploads/incidents/:incidentId/`. Crée un enregistrement `Document` en base. |
| `GET` | `/api/files/:documentId` | Download avec vérification JWT + permission READ sur DOCUMENTS. Stream le fichier depuis le volume. |

### `routes/export.ts`

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/export/:incidentId/pdf` | Génère un PDF de la main courante via PDFKit. Filtré sur les cellules accessibles à l'utilisateur. |
| `GET` | `/api/export/:incidentId/xlsx` | Génère un Excel de la timeline via ExcelJS. |

---

## Services notables

### `services/auth.ts`

- `USER_INCLUDE` — objet Prisma include standard pour charger l'utilisateur avec ses rôles et permissions. Exporté et réutilisé dans les resolvers.
- Rate-limiting login en mémoire : 10 tentatives / 15 min par IP.
- `generateTokens(userId)` — génère access + refresh token, stocke le refresh en base.

### Validation (`utils/validation.ts`)

```typescript
const passwordSchema = z.string()
  .min(8)
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/[0-9]/, 'Au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Au moins un caractère spécial')

validate(passwordSchema, input.password) // lève BAD_USER_INPUT si invalide
```

---

## Règles métier importantes

- **`mustChangePassword`** — si `true`, l'accès à toutes les routes (hors `/change-password`) est bloqué
- **Soft delete** — les queries Prisma filtrent toujours sur `deletedAt: null` pour les entités métier
- **Édition des entrées main courante** — autorisée à l'auteur ou à tout utilisateur avec `WRITE` sur la cellule concernée
- **Export scoped** — l'export PDF filtre les entrées main courante sur les cellules que l'utilisateur peut lire
