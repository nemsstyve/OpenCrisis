# Autre

## Intégration OpenCTI

OpenCTI est une plateforme open source de renseignement sur les menaces cyber (Cyber Threat Intelligence). L'intégration dans OpenCrisis est **entièrement optionnelle**.

### Activation

```env
OPENCTI_ENABLED=true
OPENCTI_URL=https://opencti.votre-organisation.fr
OPENCTI_TOKEN=votre-token-api
```

Si `OPENCTI_ENABLED=false`, toutes les fonctionnalités de base fonctionnent normalement. L'application vérifie ce flag avant tout appel au service OpenCTI.

### Champs liés

| Modèle | Champ | Description |
|---|---|---|
| `Incident` | `openctiCaseId` | ID d'un Case STIX dans OpenCTI |
| `TimelineEvent` | `openctiEntityId`, `openctiEntityType` | Lien vers un observable/indicateur OpenCTI |
| `Document` | `openctiEntityId`, `openctiEntityType` | Lien vers une entité OpenCTI |

### Cas d'usage

- Lier un événement de la timeline à un indicateur de compromission (IoC) OpenCTI
- Exporter l'incident comme Case STIX vers OpenCTI
- Enrichir les événements timeline avec des données de threat intelligence

---

## Sécurité

### Authentification

- **Access token JWT** : durée de vie courte (15 min), stocké en mémoire uniquement côté client
- **Refresh token** : durée de vie longue (7 jours), stocké en cookie `HttpOnly; Secure; SameSite=Strict`
- **Rotation des refresh tokens** : chaque refresh révoque l'ancien token et en émet un nouveau
- **`mustChangePassword`** : force la création d'un nouveau mot de passe lors de la première connexion ou après un reset admin

### RBAC (Contrôle d'accès par rôle)

Chaque endpoint GraphQL et REST vérifie les permissions avant d'agir :
- `requirePermission(ctx, resource, action)` — lève une erreur `FORBIDDEN` si insuffisant
- Les permissions sont calculées en faisant l'union des permissions de tous les rôles de l'utilisateur

### Audit log

Toutes les mutations sensibles écrivent automatiquement une entrée dans `AuditLog` :
- Qui (userId + IP)
- Quoi (action + resource + resourceId)
- Quand (createdAt)
- Contexte (incidentId, metadata JSON)

L'audit log ne peut pas être désactivé ni modifié par les utilisateurs.

### Headers de sécurité

Helmet ajoute automatiquement :
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (en HTTPS)
- Et autres headers recommandés OWASP

### Protection contre les attaques

- **Rate-limiting login** : 10 tentatives / 15 min par IP (en mémoire, `services/auth.ts`)
- **Depth limit GraphQL** : `graphql-depth-limit` bloque les requêtes imbriquées trop profondes
- **Validation des inputs** : Zod valide tous les inputs de mutation avant traitement

### Politique de mot de passe

Appliquée à la création de compte et au changement de mot de passe :
- 8 caractères minimum
- Au moins 1 majuscule
- Au moins 1 chiffre
- Au moins 1 caractère spécial

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
