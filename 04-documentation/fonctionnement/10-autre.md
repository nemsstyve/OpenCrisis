# Autre

## Intégration OpenCTI

OpenCTI est une plateforme open source de renseignement sur les menaces cyber (Cyber Threat Intelligence). L'intégration dans OpenCrisis est **entièrement optionnelle** et **pas encore implémentée côté code** — seules les colonnes de base de données et les variables d'environnement sont en place pour une future intégration.

### Activation (préparation pour intégration future)

```env
OPENCTI_ENABLED=true
OPENCTI_URL=https://opencti.votre-organisation.fr
OPENCTI_TOKEN=votre-token-api
```

Si `OPENCTI_ENABLED=false` (valeur par défaut), aucun comportement de l'application n'est impacté. L'application est conçue pour vérifier ce flag avant tout appel à OpenCTI le jour où l'intégration sera implémentée.

### Champs liés (déjà présents dans la BDD)

| Modèle | Champ | Description |
|---|---|---|
| `Incident` | `openctiCaseId` | ID d'un Case STIX dans OpenCTI |
| `TimelineEvent` | `openctiEntityId`, `openctiEntityType` | Lien vers un observable/indicateur OpenCTI |
| `Document` | `openctiEntityId`, `openctiEntityType` | Lien vers une entité OpenCTI |

### Cas d'usage prévus

- Lier un événement de la timeline à un indicateur de compromission (IoC) OpenCTI
- Exporter l'incident comme Case STIX vers OpenCTI
- Enrichir les événements timeline avec des données de threat intelligence

### Architecture envisagée

L'instance OpenCTI sera hébergée **en dehors** du docker-compose d'OpenCrisis. Le backend communiquera avec elle via son API GraphQL (`${OPENCTI_URL}/graphql`) en utilisant le token comme `Authorization: Bearer`. Aucune stack OpenCTI auto-hébergée n'est prévue dans le périmètre d'OpenCrisis.

---

## Sécurité applicative

> Pour la sécurité de l'infrastructure (Docker, réseau, TLS, headers HTTP, rate limiting…), voir [11-securite-infrastructure.md](11-securite-infrastructure.md).

Ce paragraphe couvre uniquement la sécurité **côté code applicatif** (backend Node.js).

### Authentification

- **Access token JWT** : durée de vie courte (15 min), algorithme HS256 pinné explicitement (protection contre l'attaque `alg: none`), stocké en mémoire uniquement côté client
- **Refresh token** : durée de vie longue (7 jours), stocké en cookie `HttpOnly; Secure; SameSite=Strict`
- **Rotation des refresh tokens** : chaque refresh révoque l'ancien token et en émet un nouveau
- **`mustChangePassword`** : force la création d'un nouveau mot de passe lors de la première connexion ou après un reset admin
- **Hash des mots de passe** : bcrypt avec coût 12

### RBAC (Contrôle d'accès par rôle)

Chaque endpoint GraphQL et REST vérifie les permissions avant d'agir :
- `requirePermission(ctx, resource, action)` — lève une erreur `FORBIDDEN` si insuffisant
- Les permissions sont calculées en faisant l'union des permissions de tous les rôles de l'utilisateur

Le RBAC est centralisé dans `middleware/rbac.ts` et `middleware/httpPermission.ts`. Aucun resolver ne doit faire de vérification ad-hoc.

### Audit log

Toutes les mutations sensibles écrivent automatiquement une entrée dans `AuditLog` :
- **Qui** (userId + IP)
- **Quoi** (action + resource + resourceId)
- **Quand** (createdAt)
- **Contexte** (incidentId, metadata JSON)

L'audit log est **immuable** : aucune route ne permet de le supprimer ou de le modifier. Il est aussi écrit en fire-and-forget pour que les erreurs d'audit ne bloquent jamais une opération métier.

### Headers de sécurité (côté backend)

Le middleware **Helmet** ajoute automatiquement :
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (en HTTPS)
- `X-Powered-By` supprimé

> Le reverse proxy nginx applique également ses propres headers de sécurité (ceinture et bretelles). Voir [11-securite-infrastructure.md](11-securite-infrastructure.md).

### Protection contre les attaques

- **Rate-limiting login (mémoire)** : 10 tentatives / 15 min par IP, géré dans `services/auth.ts`
- **Rate-limiting nginx** : 10 req/min sur `/api/auth/login` (deuxième couche, voir doc infra)
- **Depth limit GraphQL** : `graphql-depth-limit` bloque les requêtes imbriquées trop profondes (limite à 10)
- **Validation des inputs** : Zod valide tous les inputs de mutation avant traitement
- **Introspection désactivée en prod** : `introspection: process.env.NODE_ENV !== 'production'`
- **Path traversal protection** : sur le téléchargement de fichiers, le chemin résolu est vérifié pour rester dans `UPLOADS_DIR`
- **`formatError` en production** : les erreurs internes ne sont jamais exposées au client, seul un message générique est renvoyé

### Politique de mot de passe

Appliquée à la création de compte et au changement de mot de passe :
- 8 caractères minimum
- Au moins 1 majuscule
- Au moins 1 chiffre
- Au moins 1 caractère spécial

### Validation des variables d'environnement

Au démarrage, le backend valide toutes les variables d'environnement avec **Zod** (`utils/env.ts`) :
- `DATABASE_URL` : URL Postgres valide
- `JWT_SECRET` et `JWT_REFRESH_SECRET` : longueur minimale, différents l'un de l'autre
- `NODE_ENV` : `development` | `production` | `test`

Si une variable est manquante ou invalide, le backend refuse de démarrer. Cela évite les configurations dégradées en production.

---

## Codegen GraphQL

### Principe

Le frontend utilise des types TypeScript générés automatiquement à partir du schéma GraphQL du backend. Cela garantit une cohérence de bout en bout entre l'API et le client.

**Fichier généré :** `01-frontend/src/types/generated.ts` — ne jamais éditer manuellement.

### Workflow

1. Modifier le schéma GraphQL dans `02-backend/src/schema/*.ts`
2. Redémarrer le backend (le schéma est chargé au démarrage)
3. Mettre à jour les opérations GraphQL dans `01-frontend/src/graphql/*.ts` si nécessaire
4. Régénérer les types :

```bash
cd 01-frontend
pnpm codegen
```

La configuration se trouve dans `01-frontend/codegen.yml`. Le schéma source est `01-frontend/schema.graphql` (extrait du backend via un script PowerShell).

---

## Conventions de commits

Le projet suit la spécification [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description courte>

[corps optionnel en français]
```

### Types utilisés

| Type | Utilisation |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `refactor` | Refactoring sans changement de comportement |
| `docs` | Documentation uniquement |
| `chore` | Tâches de maintenance (deps, config) |
| `perf` | Amélioration de performance |
| `test` | Ajout ou modification de tests |

### Exemples

```
feat(timeline): ajouter l'export Excel
fix(auth): corriger la rotation des refresh tokens
docs: refonte complète de la documentation
chore(deps): mettre à jour Prisma vers 5.22
```

---

## Conventions de branches

| Préfixe | Utilisation |
|---|---|
| `main` | Production |
| `dev` | Intégration des développements |
| `pm-*` | Branches personnelles (ex : `pm-docs`, `pm-dev`) |
| `claude/*` | Branches de travail des agents Claude Code (auto-générées) |
