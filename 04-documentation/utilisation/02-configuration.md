# Configuration

Toutes les variables de configuration sont centralisées dans le fichier `.env` à la racine du projet. Copier `.env.example` et renseigner chaque valeur avant le premier démarrage.

> **Sécurité** : le fichier `.env` est exclu de Git via `.gitignore` et de toutes les images Docker via `.dockerignore`. Il ne doit jamais être commité ni copié dans une image.

---

## Base de données (PostgreSQL)

```env
DATABASE_URL="postgresql://opencrisis:LE_MOT_DE_PASSE@postgres:5432/opencrisis"
POSTGRES_USER=opencrisis
POSTGRES_PASSWORD=LE_MOT_DE_PASSE
POSTGRES_DB=opencrisis
```

| Variable | Description | Valeur par défaut |
|---|---|---|
| `DATABASE_URL` | URL de connexion Prisma. En production Docker, `postgres` est le nom du service — ne pas changer. | — |
| `POSTGRES_USER` | Nom d'utilisateur PostgreSQL | `opencrisis` |
| `POSTGRES_PASSWORD` | **Obligatoire.** Mot de passe de la base. Choisir un mot de passe fort. | — |
| `POSTGRES_DB` | Nom de la base de données | `opencrisis` |

> **Important** : `POSTGRES_PASSWORD` et le mot de passe inclus dans `DATABASE_URL` doivent être **strictement identiques**. Sinon le backend ne peut pas se connecter à la base.

> En mode développement local, remplacer `@postgres:5432` par `@localhost:5432` dans `DATABASE_URL`.

Pour générer un mot de passe fort :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+/=]/g,''))"
```

---

## JWT (authentification)

```env
JWT_SECRET=<64 octets hex aléatoires>
JWT_REFRESH_SECRET=<64 octets hex aléatoires différents>
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

Lancer cette commande deux fois pour obtenir deux secrets distincts. Le backend valide la longueur minimale au démarrage via Zod et refuse de démarrer si les secrets sont trop courts ou absents.

L'algorithme JWT est pinné à `HS256` côté backend (protection contre l'attaque `alg: none`).

---

## Redis

```env
REDIS_URL=redis://redis:6379
```

| Variable | Description |
|---|---|
| `REDIS_URL` | URL de connexion Redis. En production Docker, `redis` est le nom du service. En dev local, utiliser `redis://localhost:6379`. |

Redis est utilisé pour le pub/sub des souscriptions GraphQL (temps réel) et le rate-limiting distribué côté backend.

Redis est isolé sur `backend-network` (internal: true) et ne peut pas sortir vers internet.

---

## Application

```env
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://localhost
```

| Variable | Description | Valeur par défaut |
|---|---|---|
| `NODE_ENV` | Environnement d'exécution. Mettre `development` en dev local. | `production` |
| `PORT` | Port interne du backend. Modifié uniquement si conflit. | `4000` |
| `CORS_ORIGIN` | URL publique du frontend autorisée par CORS. **Doit utiliser `https://`** depuis l'activation du TLS. | `https://localhost` |

> **Attention** : depuis la mise en place du HTTPS, `CORS_ORIGIN` doit impérativement commencer par `https://`. Si vous laissez `http://localhost`, le backend rejettera les requêtes du frontend avec une erreur CORS.

> En production avec un domaine réel, mettre `CORS_ORIGIN=https://opencrisis.votre-organisation.fr`.

En mode `production`, l'introspection GraphQL est automatiquement désactivée et les erreurs internes sont masquées dans les réponses HTTP (seuls les codes d'erreur métier sont exposés).

---

## OpenCTI (optionnel)

```env
OPENCTI_ENABLED=false
OPENCTI_URL=
OPENCTI_TOKEN=
```

| Variable | Description |
|---|---|
| `OPENCTI_ENABLED` | Activer l'intégration OpenCTI. Mettre `true` uniquement si une instance OpenCTI **externe** est disponible. |
| `OPENCTI_URL` | URL de l'API OpenCTI (ex : `https://opencti.votre-organisation.fr`). |
| `OPENCTI_TOKEN` | Token d'API OpenCTI avec les droits de lecture/écriture nécessaires. |

> L'intégration OpenCTI est préparée (champs de BDD, variables d'env) mais le code applicatif qui consomme ces variables n'est pas encore implémenté. Laisser `OPENCTI_ENABLED=false` jusqu'à ce que l'intégration backend soit terminée.

> Aucune stack OpenCTI auto-hébergée n'est prévue dans le périmètre d'OpenCrisis. L'instance OpenCTI doit être hébergée séparément.

---

## Checklist de mise en production

Avant le premier démarrage en production, vérifier que :

- [ ] Les certificats TLS sont générés (`bash scripts/generate-certs.sh`) ou remplacés par ceux d'une CA en prod réelle
- [ ] `POSTGRES_PASSWORD` est un mot de passe fort (pas `changeme`)
- [ ] Le mot de passe dans `DATABASE_URL` est identique à `POSTGRES_PASSWORD`
- [ ] `JWT_SECRET` est un secret de 64 octets hex aléatoires (pas la valeur d'exemple)
- [ ] `JWT_REFRESH_SECRET` est différent de `JWT_SECRET` et tout aussi aléatoire
- [ ] `CORS_ORIGIN` commence par `https://` et correspond à l'URL publique réelle du frontend
- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` utilise bien le nom du service Docker `postgres` (pas `localhost`)
- [ ] `REDIS_URL` utilise bien le nom du service Docker `redis` (pas `localhost`)
- [ ] Le fichier `.env` n'est pas commité sur Git (`git status` ne doit pas l'afficher)
- [ ] Le dossier `certs/` n'est pas commité sur Git
- [ ] HSTS configuré sur `max-age=31536000` (1 an) dans `03-nginx/nginx.conf` au lieu de `3600` (valeur démo)
