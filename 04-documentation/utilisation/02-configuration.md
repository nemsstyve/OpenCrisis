# Configuration

Toutes les variables de configuration sont centralisées dans le fichier `.env` à la racine du projet. Copier `.env.example` et renseigner chaque valeur avant le premier démarrage.

---

## Base de données (PostgreSQL)

```env
DATABASE_URL="postgresql://opencrisis:changeme@postgres:5432/opencrisis"
POSTGRES_USER=opencrisis
POSTGRES_PASSWORD=changeme
POSTGRES_DB=opencrisis
```

| Variable | Description | Valeur par défaut |
|---|---|---|
| `DATABASE_URL` | URL de connexion Prisma. En production Docker, `postgres` est le nom du service — ne pas changer. | — |
| `POSTGRES_USER` | Nom d'utilisateur PostgreSQL | `opencrisis` |
| `POSTGRES_PASSWORD` | **Obligatoire.** Mot de passe de la base. Choisir un mot de passe fort. | `changeme` |
| `POSTGRES_DB` | Nom de la base de données | `opencrisis` |

> En mode développement local, remplacer `@postgres:5432` par `@localhost:5432` dans `DATABASE_URL`.

---

## JWT (authentification)

```env
JWT_SECRET=CHANGE_ME_GENERATE_A_RANDOM_64_BYTE_HEX_STRING
JWT_REFRESH_SECRET=CHANGE_ME_GENERATE_ANOTHER_RANDOM_64_BYTE_HEX_STRING
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

| Variable | Description | Valeur recommandée |
|---|---|---|
| `JWT_SECRET` | Clé de signature des access tokens. **Ne jamais exposer.** | 64 octets hex aléatoires |
| `JWT_REFRESH_SECRET` | Clé de signature des refresh tokens. Différente de `JWT_SECRET`. | 64 octets hex aléatoires |
| `JWT_ACCESS_EXPIRES_IN` | Durée de vie de l'access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Durée de vie du refresh token | `7d` |

Générer des clés sécurisées :

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Lancer cette commande deux fois pour obtenir deux secrets distincts.

---

## Redis

```env
REDIS_URL=redis://redis:6379
```

| Variable | Description |
|---|---|
| `REDIS_URL` | URL de connexion Redis. En production Docker, `redis` est le nom du service. En dev local, utiliser `redis://localhost:6379`. |

Redis est utilisé pour le pub/sub des souscriptions GraphQL (temps réel).

---

## Application

```env
NODE_ENV=production
PORT=4000
CORS_ORIGIN=http://localhost
```

| Variable | Description | Valeur par défaut |
|---|---|---|
| `NODE_ENV` | Environnement d'exécution. Mettre `development` en dev local. | `production` |
| `PORT` | Port interne du backend. Modifié uniquement si conflit. | `4000` |
| `CORS_ORIGIN` | URL publique du frontend autorisée par CORS. En production avec un domaine, mettre `https://votre-domaine.fr`. | `http://localhost` |

---

## OpenCTI (optionnel)

```env
OPENCTI_ENABLED=false
OPENCTI_URL=
OPENCTI_TOKEN=
```

| Variable | Description |
|---|---|
| `OPENCTI_ENABLED` | Activer l'intégration OpenCTI. Mettre `true` uniquement si une instance OpenCTI est disponible. |
| `OPENCTI_URL` | URL de l'API OpenCTI (ex : `https://opencti.votre-organisation.fr`). |
| `OPENCTI_TOKEN` | Token d'API OpenCTI avec les droits de lecture/écriture nécessaires. |

> Laisser `OPENCTI_ENABLED=false` si vous n'utilisez pas OpenCTI. Toutes les fonctionnalités de base fonctionnent sans cette intégration.

---

## Checklist de mise en production

Avant le premier démarrage en production, vérifier que :

- [ ] `POSTGRES_PASSWORD` est un mot de passe fort (pas `changeme`)
- [ ] `JWT_SECRET` est un secret de 64 octets hex aléatoires (pas la valeur d'exemple)
- [ ] `JWT_REFRESH_SECRET` est différent de `JWT_SECRET` et tout aussi aléatoire
- [ ] `CORS_ORIGIN` correspond à l'URL publique réelle du frontend
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` utilise bien le nom du service Docker `postgres` (pas `localhost`)
- [ ] `REDIS_URL` utilise bien le nom du service Docker `redis` (pas `localhost`)
