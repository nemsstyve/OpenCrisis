# Frontend

## Structure des dossiers

```
01-frontend/src/
├── main.tsx                    # Point d'entrée React
├── App.tsx                     # Composant racine, routeur
│
├── app/
│   ├── pages/                  # Pages de l'application (une par route)
│   │   ├── Login.tsx
│   │   ├── IncidentSelector.tsx
│   │   ├── Dashboard.tsx
│   │   ├── MainCouranteDirection.tsx
│   │   ├── MainCouranteOperationnelle.tsx
│   │   ├── Timeline.tsx
│   │   ├── Bibliotheque.tsx
│   │   ├── Annuaire.tsx
│   │   ├── Administration.tsx
│   │   └── NotFound.tsx
│   └── routes.ts               # Définition des routes React Router
│
├── components/
│   ├── ui/                     # 52 composants shadcn/ui (ne pas modifier)
│   ├── Sidebar.tsx             # Barre de navigation latérale
│   ├── MainCourante.tsx        # Composant partagé Direction/Opérations
│   ├── PermissionGuard.tsx     # Affichage conditionnel selon permissions
│   ├── ProtectedOutlet.tsx     # Protection de route (redirect si non auth)
│   ├── ConfirmDialog.tsx       # Dialog de confirmation pour actions destructives
│   └── ErrorBoundary.tsx       # Fallback d'erreur React (class component)
│
├── context/
│   └── AuthContext.tsx         # Contexte d'authentification (login, logout, user)
│
├── graphql/                    # Opérations GraphQL par module
│   ├── admin.ts
│   ├── auth.ts
│   ├── contact.ts
│   ├── document.ts
│   ├── incident.ts
│   ├── logEntry.ts
│   ├── tag.ts
│   └── timeline.ts
│
├── hooks/
│   ├── useCurrentIncident.ts   # Restaure currentIncident depuis l'URL
│   └── useDebounce.ts          # Debounce pour les champs de recherche
│
├── lib/
│   ├── apolloClient.ts         # Configuration Apollo Client
│   ├── exportUtils.ts          # Déclenchement exports PDF/Excel
│   ├── fileUtils.ts            # Upload/download de fichiers
│   ├── formSchemas.ts          # Schémas Zod pour les formulaires
│   └── tokenStore.ts           # Stockage de l'access token en mémoire
│
├── store/
│   └── useAppStore.ts          # Store Zustand global
│
├── types/
│   └── generated.ts            # AUTO-GÉNÉRÉ par codegen — ne jamais éditer
│
├── providers/
│   └── ThemeProvider.tsx       # Thème dark/light (next-themes)
│
└── styles/
    ├── index.css
    ├── tailwind.css
    ├── theme.css               # Variables CSS du thème
    └── fonts.css
```

---

## Apollo Client

Configuration dans `lib/apolloClient.ts`.

**Split link HTTP / WebSocket :**
- Les queries et mutations passent par HTTP (`/api/graphql`)
- Les subscriptions passent par WebSocket (`ws://localhost/api/graphql`)

**Authentification :**
L'access token est lu depuis `tokenStore.ts` (mémoire) et injecté dans le header `Authorization: Bearer` de chaque requête.

**Gestion de l'expiration :**
Un `onError` link intercepte les erreurs `UNAUTHENTICATED`. Apollo Client tente alors un refresh automatique (`POST /api/auth/refresh`) avant de retenter la requête originale.

---

## Zustand store (`store/useAppStore.ts`)

```typescript
{
  currentUser: User | null       // Utilisateur connecté
  currentIncident: Incident | null  // Incident sélectionné
  permissions: Permission[]      // Permissions effectives de l'utilisateur
}
```

Le store est peuplé après connexion et réinitialisé à la déconnexion. Le hook `useCurrentIncident` restaure `currentIncident` depuis les URL params si le store est vide (rechargement de page).

---

## Composants clés

### `PermissionGuard`

```tsx
<PermissionGuard resource="ADMIN" action="READ">
  <Administration />
</PermissionGuard>
```

Affiche ses enfants uniquement si l'utilisateur courant a la permission requise. Sinon, n'affiche rien (ou un fallback).

### `ProtectedOutlet`

Wrapper de route React Router. Redirige vers `/login` si l'utilisateur n'est pas authentifié, et vers `/change-password` si `mustChangePassword` est `true`.

### `Sidebar`

Navigation latérale affichant les liens vers les pages de l'incident courant. Les liens sont filtrés selon les permissions de l'utilisateur via `hasPermission()`.

### `MainCourante`

Composant partagé entre `MainCouranteDirection` et `MainCouranteOperationnelle`. Reçoit la cellule en prop (`DIRECTIONAL` | `OPERATIONAL`). Gère l'affichage des entrées, la création, l'édition, la suppression, et l'abonnement subscription.

---

## Hooks

### `useCurrentIncident`

```typescript
const incident = useCurrentIncident()
```

Si `currentIncident` est null dans le store Zustand (rechargement de page), ce hook lit l'`incidentId` depuis les URL params et charge l'incident via GraphQL pour repeupler le store.

### `useDebounce`

```typescript
const debouncedValue = useDebounce(value, 300)
```

Retarde la mise à jour d'une valeur. Utilisé pour éviter des requêtes GraphQL à chaque frappe dans les champs de recherche.

---

## Utilitaires

### `lib/fileUtils.ts`

- `uploadFile(file, { incidentId?, category })` — POST multipart vers `/api/files/upload` avec le token Bearer
- `downloadFile(documentId, fileName)` — GET `/api/files/:id` avec le token Bearer, déclenche le téléchargement navigateur
- `formatBytes(n)` — Formatage lisible d'une taille en octets

### `lib/exportUtils.ts`

- `exportPdf(incidentId)` — GET `/api/export/:id/pdf` avec le token Bearer, ouvre le PDF dans un nouvel onglet
- `exportExcel(incidentId)` — GET `/api/export/:id/xlsx` avec le token Bearer, télécharge le fichier Excel

### `lib/formSchemas.ts`

Schémas Zod partagés par les formulaires React Hook Form. Garantissent que la validation client correspond à la validation serveur.

---

## Types GraphQL générés

Le fichier `src/types/generated.ts` est **entièrement généré** par GraphQL Code Generator à partir du schéma backend. Ne jamais l'éditer manuellement.

Workflow de mise à jour :

```bash
cd 01-frontend
pnpm codegen
```

Cela lit `schema.graphql` (extrait du backend) et génère les types TypeScript correspondant à toutes les queries, mutations et subscriptions définies dans `graphql/*.ts`.
