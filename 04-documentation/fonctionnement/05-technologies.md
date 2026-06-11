# Technologies utilisées

## Frontend

| Technologie | Version | Rôle |
|---|---|---|
| **React** | 18.3 | Framework UI, rendu composant |
| **Vite** | 6.x | Bundler, dev server avec HMR |
| **TypeScript** | 5.4 | Typage statique de bout en bout |
| **Tailwind CSS** | v4 | Styles utilitaires, thème dark |
| **shadcn/ui** | — | 52 composants UI préfabriqués (Radix UI + Tailwind) |
| **Apollo Client** | 3.11 | Client GraphQL, cache normalisé, subscriptions |
| **graphql-ws** | 5.x | Transport WebSocket pour les subscriptions |
| **Zustand** | 5.x | État global léger (currentUser, currentIncident, permissions) |
| **React Router** | 7.x | Routage SPA côté client |
| **React Hook Form** | 7.x | Gestion des formulaires avec validation |
| **Zod** | 3.x | Validation des schémas de formulaires côté client |
| **Recharts** | 2.x | Graphiques (dashboard) |
| **date-fns** | 3.x | Manipulation des dates |
| **lucide-react** | 0.487 | Icônes SVG |
| **sonner** | 2.x | Notifications toast |
| **next-themes** | 0.4 | Gestion du thème dark/light |

## Backend

| Technologie | Version | Rôle |
|---|---|---|
| **Node.js** | 20 | Runtime JavaScript serveur |
| **Express** | 4.18 | Serveur HTTP, middleware REST |
| **Apollo Server** | 4.10 | Serveur GraphQL sur Express |
| **graphql** | 16.9 | Spécification et runtime GraphQL |
| **graphql-ws** | 5.x | Serveur WebSocket pour les subscriptions |
| **Prisma** | 5.22 | ORM, migrations, types générés |
| **bcryptjs** | 2.4 | Hachage des mots de passe |
| **jsonwebtoken** | 9.x | Création et vérification des JWT |
| **cookie-parser** | 1.4 | Parsing des cookies (refresh token) |
| **ioredis** | 5.3 | Client Redis (pub/sub subscriptions) |
| **graphql-redis-subscriptions** | 2.6 | Pont GraphQL ↔ Redis pub/sub |
| **multer** | 1.4 | Upload de fichiers multipart |
| **PDFKit** | 0.15 | Génération de PDF (export main courante) |
| **ExcelJS** | 4.4 | Génération de fichiers Excel (export timeline) |
| **Zod** | 3.x | Validation des inputs (mutations) et des variables d'env |
| **Helmet** | 8.x | Headers de sécurité HTTP |
| **cors** | 2.8 | CORS configurable via variable d'env |
| **graphql-depth-limit** | 1.1 | Protection contre les requêtes GraphQL trop profondes |
| **ts-node-dev** | 2.x | Hot-reload en développement |

## Infra

| Technologie | Version | Rôle |
|---|---|---|
| **PostgreSQL** | 16 | Base de données relationnelle principale |
| **Redis** | 7 | Pub/sub pour les subscriptions GraphQL temps réel |
| **Nginx** | Alpine | Reverse proxy, routage, gestion des WebSockets |
| **Docker** | 25+ | Conteneurisation de tous les services |
| **Docker Compose** | 2.x | Orchestration multi-services |

## Outils de développement

| Outil | Rôle |
|---|---|
| **GraphQL Code Generator** | Génère `src/types/generated.ts` à partir du schéma GraphQL |
| **Prisma Migrate** | Gestion des migrations de schéma de base de données |
| **Prisma Studio** | Interface graphique d'inspection de la base de données |
| **pnpm** | Gestionnaire de paquets frontend |
| **npm** | Gestionnaire de paquets backend |
