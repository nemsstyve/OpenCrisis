# Sécurité de l'infrastructure

Ce document détaille toutes les mesures de durcissement appliquées à l'infrastructure Docker d'OpenCrisis : isolation réseau, conteneurs non-root, capabilities Linux, TLS/HTTPS, rate limiting, headers de sécurité.

Le périmètre couvert ici est strictement **l'infrastructure** (compose, images, réseaux, reverse proxy). La sécurité applicative (authentification, RBAC, audit log, validation des inputs) est documentée dans [10-autre.md](10-autre.md).

---

## Philosophie

L'infrastructure suit cinq principes :

1. **Moindre privilège** — chaque service tourne avec le minimum de droits nécessaires (non-root, capabilities Linux supprimées, pas d'élévation possible)
2. **Surface d'attaque minimale** — seuls deux ports sont exposés sur la machine hôte (80 et 443 via le reverse proxy nginx). Tous les autres services sont inaccessibles depuis l'extérieur.
3. **Défense en profondeur** — sécurité appliquée à chaque couche (réseau, conteneur, image, application HTTP, application backend), aucune dépendance à un seul mécanisme
4. **Reproductibilité** — toutes les versions d'images sont pinnées précisément. Aucune surprise sur une mise à jour automatique.
5. **Build reproductible** — builds multi-étapes, code source absent des images finales, dépendances de production uniquement

---

## Couche 1 — Réseau Docker

### Deux réseaux séparés

```yaml
networks:
  frontend-network:
    driver: bridge
  backend-network:
    driver: bridge
    internal: true   # Aucun accès internet
```

| Réseau | Services connectés | Accès internet |
|---|---|---|
| `frontend-network` | nginx, frontend, backend | Oui (sortie possible) |
| `backend-network` | backend, postgres, redis | **Non** (`internal: true`) |

Le backend est le **seul** service présent sur les deux réseaux : il fait le pont entre nginx (qui le contacte côté frontend-network) et postgres/redis (qu'il contacte côté backend-network).

### Conséquences directes

- **PostgreSQL et Redis ne peuvent pas sortir vers internet.** Aucune exfiltration de données possible depuis ces services si compromis.
- **Frontend et nginx ne peuvent pas parler directement à PostgreSQL.** Pour atteindre la base, il faut nécessairement passer par le backend (qui applique l'authentification, le RBAC, et l'audit log).
- **Aucune connexion entrante** vers postgres ou redis depuis l'extérieur de Docker, car aucun port n'est exposé sur l'hôte pour ces services.

### Vérification

```bash
# Postgres tente d'accéder à internet → doit échouer
docker compose exec postgres wget -O- https://www.google.com 2>&1 | head -3

# Redis tente d'accéder à internet → doit échouer aussi
docker compose exec redis wget -O- https://www.google.com 2>&1 | head -3
```

### Ports exposés sur l'hôte

| Service | Port hôte | Protocole | Rôle |
|---|---|---|---|
| nginx | 80 | HTTP | Redirection 301 vers HTTPS |
| nginx | 443 | HTTPS | Point d'entrée applicatif unique |
| frontend | — | — | Accessible uniquement via nginx |
| backend | — | — | Accessible uniquement via nginx |
| postgres | — | — | Accessible uniquement via le backend |
| redis | — | — | Accessible uniquement via le backend |

Tous les services applicatifs utilisent `expose:` (port interne au réseau Docker) plutôt que `ports:` (port mappé sur l'hôte).

---

## Couche 2 — Conteneurs

### Utilisateurs non-root

| Service | Utilisateur effectif | Mécanisme |
|---|---|---|
| nginx (reverse proxy) | `nginx` (workers) | Master nginx peut binder 80/443 puis switch workers en non-root |
| frontend | `nginx` (101:101) | Image `nginxinc/nginx-unprivileged` — jamais root |
| backend | `node` | `USER node` dans le Dockerfile |
| postgres | `postgres` | Switch automatique au démarrage via SETUID/SETGID |
| redis | `redis` | Switch automatique au démarrage via SETUID/SETGID |

### Vérification

```bash
docker compose exec frontend whoami    # → nginx
docker compose exec backend whoami     # → node
docker compose exec postgres whoami    # → postgres
docker compose exec redis whoami       # → redis
```

### `no-new-privileges`

Tous les services ont :

```yaml
security_opt:
  - no-new-privileges:true
```

Cette option du noyau Linux interdit à un processus de gagner plus de privilèges que ceux dont il dispose au démarrage, même via un binaire `setuid`. Concrètement, un attaquant qui obtient un shell dans un conteneur ne peut pas escalader vers root.

### Capabilities Linux

Stratégie systématique : **drop ALL puis add uniquement ce qui est strictement nécessaire**.

```yaml
cap_drop:
  - ALL
cap_add:
  - ...   # uniquement les capabilities requises pour fonctionner
```

| Service | Capabilities ajoutées | Justification |
|---|---|---|
| nginx (reverse proxy) | `NET_BIND_SERVICE` `CHOWN` `SETUID` `SETGID` | Bind ports < 1024 (80/443) + switch utilisateur pour les workers |
| frontend | aucune | nginx-unprivileged écoute sur 8080 (> 1024), pas root |
| backend | aucune | `USER node`, port 4000 (> 1024), pas d'opération privilégiée |
| postgres | `CHOWN` `SETUID` `SETGID` `DAC_READ_SEARCH` `FOWNER` | Initialisation du volume données + switch utilisateur postgres |
| redis | aucune | Démarre directement comme UID 999 (`user: "999:999"` dans compose), pas de switch d'utilisateur |

Sans ces capabilities sélectives, les services concernés ne démarreraient pas (erreur `Operation not permitted` au moment du switch d'utilisateur ou du `chown` initial).

### Limites de ressources

| Service | CPU | RAM |
|---|---|---|
| nginx | 0.5 | 256M |
| frontend | 0.5 | 256M |
| backend | 1.0 | 1G |
| postgres | 1.0 | 1G |
| redis | 0.25 | 256M |

Ces limites protègent contre :
- Une fuite mémoire dans un service qui mangerait toute la RAM de l'hôte
- Un déni de service interne (un service qui sature le CPU et bloque les autres)
- Un comportement anormal lié à une exploitation (par exemple un fork bomb)

### Healthchecks

Tous les services applicatifs ont un healthcheck. Les dépendances `depends_on: condition: service_healthy` garantissent que :

- Le backend ne démarre pas avant que postgres ET redis répondent
- Nginx ne démarre pas avant que frontend ET backend soient en bonne santé

Un service qui devient `unhealthy` (3 checks consécutifs en erreur) est marqué comme tel, et `restart: unless-stopped` le redémarre automatiquement.

---

## Couche 3 — Images Docker

### Versions pinnées précisément

| Service | Image | Justification |
|---|---|---|
| nginx (reverse proxy) | `nginx:alpine` | Stable, base Alpine minimaliste |
| frontend (runtime) | `nginxinc/nginx-unprivileged:alpine` | Image officielle non-root |
| frontend (build) | `node:alpine` | Version Node LTS précise |
| backend | `node:alpine` | Idem |
| postgres | `postgres:alpine` | Version mineure pinnée |
| redis | `redis:alpine` | Idem |

Pas de tag `:latest` nulle part. Une mise à jour d'image est une décision consciente, pas un effet de bord d'un `docker compose pull`.

### Builds multi-étapes

Le frontend et le backend utilisent des Dockerfiles en deux étapes :

```
Stage 1 (builder) : Node.js complet + outils de build (npm/pnpm, TypeScript, Vite…)
Stage 2 (runner)  : Image finale légère, copie uniquement le résultat du build
```

L'image finale ne contient **ni** le code source TypeScript, **ni** les dépendances de développement, **ni** les outils de build. Ça réduit drastiquement la surface d'attaque et la taille des images.

### Frontend particulièrement allégé

Le frontend final est servi par `nginxinc/nginx-unprivileged` qui ne contient **aucune trace de Node.js**. C'est juste un serveur de fichiers statiques HTML/CSS/JS — pas de runtime JavaScript côté serveur.

### Pas de dépendances de dev en production

Le Dockerfile backend installe avec `npm install --production` (ou équivalent), ce qui exclut tous les packages de la section `devDependencies` du `package.json` : pas de TypeScript compiler, pas d'ESLint, pas de Jest. Uniquement Express, Apollo Server, Prisma, etc.

---

## Couche 4 — TLS / HTTPS

### Certificats auto-signés (environnement dev / démo interne)

Un script `scripts/generate-certs.sh` produit les certificats au format PEM, valides 365 jours, RSA 2048 bits, avec SubjectAltName pour `localhost` et `127.0.0.1`.

```bash
bash scripts/generate-certs.sh
# → certs/cert.pem  (public, droits 644)
# → certs/key.pem   (privé, droits 600)
```

Le dossier `certs/` est exclu de Git via `.gitignore`. **Chaque environnement génère ses propres certificats** — la clé privée ne doit jamais sortir de la machine où elle a été générée.

> Pour un déploiement réel (interne entreprise ou public), remplacer les certificats auto-signés par des certificats émis par une CA d'entreprise ou Let's Encrypt. Les emplacements `certs/cert.pem` et `certs/key.pem` restent les mêmes.

### Configuration TLS

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers 'ECDHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256';
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1h;
ssl_session_tickets off;
```

- **TLS 1.2 et 1.3 uniquement** — TLS 1.0 et 1.1 sont obsolètes et vulnérables (BEAST, POODLE)
- **ECDHE uniquement** (Perfect Forward Secrecy) — les suites DHE ont été retirées car elles nécessitent un fichier `ssl_dhparam` explicite ; sans lui, nginx utilise des paramètres DH par défaut potentiellement faibles. ECDHE offre le même PFS sans configuration supplémentaire.
- **AES-GCM** — chiffrement authentifié (AEAD), résistant aux attaques par padding
- **Session tickets désactivés** — évite la vulnérabilité de réutilisation de tickets TLS

### Redirection HTTP → HTTPS

Tout trafic HTTP (port 80) reçoit une réponse `301 Moved Permanently` vers la même URL en HTTPS :

```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

Aucune ressource n'est servie en clair, même par accident.

### HSTS (HTTP Strict Transport Security)

```nginx
add_header Strict-Transport-Security "max-age=3600; includeSubDomains" always;
```

Une fois qu'un navigateur a visité le site en HTTPS, il refuse pour toute requête ultérieure de repasser en HTTP, même si l'utilisateur tape `http://...` ou clique sur un lien HTTP.

Le `max-age=3600` (1 heure) est volontairement court pendant la phase démo. Pour un déploiement réel, passer à `max-age=31536000` (1 an) avec `preload`.

---

## Couche 5 — Reverse proxy nginx (durcissement HTTP)

### Headers de sécurité OWASP

| Header | Valeur | Protection |
|---|---|---|
| `Strict-Transport-Security` | `max-age=3600; includeSubDomains` | Force HTTPS dans le navigateur |
| `X-Frame-Options` | `DENY` | Empêche l'inclusion dans une iframe (clickjacking) |
| `X-Content-Type-Options` | `nosniff` | Empêche le MIME-sniffing par le navigateur |
| `Referrer-Policy` | `strict-origin` | Limite la fuite d'URL via Referer |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=()` | Désactive les API navigateur non utilisées |
| `Content-Security-Policy` | voir section dédiée | XSS, injection de contenu, clickjacking |

> **`X-XSS-Protection` retiré** : déprécié depuis 2019, ignoré par Chrome/Firefox, et source de vulnérabilités dans les anciennes versions d'IE. La CSP (`script-src 'self'`) couvre intégralement ce vecteur dans les navigateurs modernes.

### Content Security Policy (CSP)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' wss://$host;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

- **`default-src 'self'`** — tout ressource externe interdite par défaut
- **`script-src 'self'`** — aucun script externe ni inline (sauf si nécessaire pour Vite/React)
- **`connect-src 'self' wss://$host`** — autorise les WebSocket sécurisés uniquement vers le même hôte que la requête. `$host` est expansé dynamiquement par nginx (`wss://localhost` en dev, `wss://mondomaine.fr` en prod). La directive bare `wss:` (sans hôte) autorisait des connexions WebSocket vers n'importe quel serveur internet.
- **`object-src 'none'`** — bloque les plugins Flash/Java/ActiveX (legacy mais important)
- **`frame-ancestors 'none'`** — équivalent moderne de X-Frame-Options DENY

### Rate limiting (trois zones)

```nginx
limit_req_zone $binary_remote_addr zone=general:10m rate=200r/m;
limit_req_zone $binary_remote_addr zone=login:10m   rate=10r/m;
limit_req_zone $binary_remote_addr zone=upload:10m  rate=20r/m;
```

| Zone | Limite | Burst | Cible | Protection |
|---|---|---|---|---|
| `general` | 200 req/min | 50 | Toute la zone HTTPS | DoS basique |
| `login` | 10 req/min | 3 | `/api/auth/login` (match exact) | Bruteforce de mots de passe |
| `upload` | 20 req/min | 5 | `/api/files/*` | Spam d'uploads, DoS via gros fichiers |

Au-delà de la limite + burst, nginx répond `429 Too Many Requests`. Le compteur s'amortit sur une fenêtre glissante de 1 minute.

### Blocage des fichiers sensibles

```nginx
location ~ /\.(?!well-known) { deny all; }
location ~* \.(env|log|sql|sh|bak|swp)$ { deny all; }
```

Toute requête vers un fichier de configuration, un log, un script ou un fichier caché renvoie `403 Forbidden` sans même générer d'entrée dans les logs.

### Masquage de l'identité du serveur

```nginx
server_tokens off;
proxy_hide_header X-Powered-By;
```

- `server_tokens off` masque la version de nginx dans les headers et pages d'erreur
- `proxy_hide_header X-Powered-By` supprime le header `X-Powered-By: Express` ajouté par défaut par Node.js (même si helmet le supprime déjà côté backend, ceinture et bretelles)

### Taille maximale des uploads

```nginx
client_max_body_size 50M;
```

Cohérent avec la limite multer côté backend. Un attaquant ne peut pas envoyer un fichier de 10 Go pour saturer le disque ou la RAM.

---

## Couche 6 — Secrets

### Variables d'environnement dans `.env`

Tous les secrets (mots de passe, JWT, tokens) sont centralisés dans `.env` à la racine. Ce fichier n'est **jamais** :
- Commité sur Git (exclu par `.gitignore`)
- Copié dans une image Docker (exclu par les `.dockerignore`)
- Loggué (validation par zod côté backend, qui empêche aussi le démarrage si une variable critique est absente)

### `.gitignore` à la racine

```
.env
.env.local
.env.*.local
credentials.txt     # fichier de sortie de setup.sh (contient les mots de passe générés)
certs/
Application/certs/  # pattern explicite : le pattern certs/ seul ne couvre pas les sous-dossiers imbriqués
backups/
node_modules/
```

### `.dockerignore` dans chaque service

```
node_modules
dist
.env
.env.*
*.local
*.log
```

Empêche notamment de copier accidentellement un `.env` local dans une image Docker au moment du build.

### Génération de secrets forts

```bash
# Mot de passe PostgreSQL (24 octets base64, sans caractères spéciaux problématiques)
node -e "console.log(require('crypto').randomBytes(24).toString('base64').replace(/[+/=]/g,''))"

# Secrets JWT (64 octets hex, 128 caractères)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

À regénérer pour chaque environnement. Le `POSTGRES_PASSWORD` et la valeur incluse dans `DATABASE_URL` doivent être **strictement identiques**.

---

## Tableau complet des mesures

| # | Mesure | Couche | Protection contre |
|---|---|---|---|
| 1 | `no-new-privileges` sur 5 services | Conteneur | Élévation de privilèges |
| 2 | `cap_drop: ALL` sur 5 services | Conteneur | Abus de capabilities Linux |
| 3 | `cap_add` sélectif (moindre privilège) | Conteneur | Idem |
| 4 | Utilisateurs non-root partout | Conteneur | Compromission avec droits root |
| 5 | Limites CPU/RAM par service | Conteneur | DoS interne, fuites mémoire |
| 6 | Versions d'images pinnées précisément | Image | Mise à jour involontaire |
| 7 | Builds multi-étapes | Image | Surface d'attaque, taille |
| 8 | Pas de devDependencies en prod | Image | Outils de dev exploitables |
| 9 | Image Alpine partout | Image | Surface d'attaque minimale |
| 10 | Deux réseaux séparés | Réseau | Pivot latéral, accès direct DB |
| 11 | `backend-network` internal:true | Réseau | Exfiltration depuis DB/Redis |
| 12 | Seuls 80+443 exposés sur l'hôte | Réseau | Attaque directe sur les services |
| 13 | TLS 1.2/1.3 uniquement | HTTP | Downgrade, vulnérabilités legacy |
| 14 | Ciphers ECDHE avec PFS | HTTP | Compromis rétroactif de clés |
| 15 | Redirection 301 HTTP → HTTPS | HTTP | Trafic en clair |
| 16 | HSTS | HTTP | Downgrade attack |
| 17 | 6 headers de sécurité OWASP (X-XSS-Protection retiré, remplacé par CSP) | HTTP | XSS, clickjacking, MIME-sniffing |
| 18 | CSP stricte | HTTP | XSS, injection de contenu |
| 19 | Rate limiting général (200/min) | HTTP | DoS basique |
| 20 | Rate limiting login (10/min) | HTTP | Bruteforce de mots de passe |
| 21 | Rate limiting upload (20/min) | HTTP | Spam d'uploads, DoS |
| 22 | Blocage fichiers sensibles | HTTP | Exposition de configs/logs |
| 23 | `server_tokens off` + `X-Powered-By` masqué | HTTP | Fingerprinting du serveur |
| 24 | `client_max_body_size 50M` | HTTP | DoS par gros uploads |
| 25 | `.env` hors Git et hors image | Secrets | Fuite de mots de passe |
| 26 | `.dockerignore` dans chaque service | Secrets | Copie accidentelle de `.env` |
| 27 | Certificats `certs/` hors Git | Secrets | Fuite de clé privée TLS |
| 28 | Healthchecks + `depends_on healthy` | Disponibilité | Démarrage dans le mauvais ordre |
| 29 | `restart: unless-stopped` | Disponibilité | Conteneur qui plante définitivement |

---

## Couverture OWASP Top 10 (2021)

Vue d'ensemble de la couverture par catégorie :

| OWASP | Catégorie | Couverture |
|---|---|---|
| A01 | Broken Access Control | RBAC backend + headers anti-clickjacking + `frame-ancestors 'none'` |
| A02 | Cryptographic Failures | TLS 1.2/1.3 + PFS + HSTS + bcrypt côté backend + JWT pinné HS256 |
| A03 | Injection | Prisma ORM (paramétrisation auto) + validation zod + CSP stricte |
| A04 | Insecure Design | Workspace par incident, soft delete, audit log immuable |
| A05 | Security Misconfiguration | server_tokens off, X-Powered-By masqué, .env hors Git, headers OWASP |
| A06 | Vulnerable Components | Images Alpine pinnées + npm sans devDependencies |
| A07 | Auth Failures | JWT court + refresh rotatif + bcrypt + rate limit login + must change password |
| A08 | Software/Data Integrity | Builds reproductibles + lockfiles npm/pnpm + signatures d'images |
| A09 | Logging Failures | Audit log immuable côté backend (chaque mutation tracée) |
| A10 | SSRF | `backend-network` internal:true (pas de sortie internet depuis DB/Redis) |

---

## Tests de validation

Procédure pour valider que les mesures sont effectivement actives.

### Isolation réseau

```bash
# Postgres et Redis ne peuvent pas sortir
docker compose exec postgres wget -O- https://www.google.com 2>&1 | head -3
docker compose exec redis wget -O- https://www.google.com 2>&1 | head -3
# Attendu : "bad address" ou "network unreachable"
```

### Utilisateurs non-root

```bash
docker compose exec frontend whoami    # nginx
docker compose exec backend whoami     # node
docker compose exec postgres whoami    # postgres
docker compose exec redis whoami       # redis
```

### Ports exposés

```bash
docker compose ps
# Attendu : seul nginx montre 0.0.0.0:80->80/tcp et 0.0.0.0:443->443/tcp
# Les autres services : pas de mapping de port hôte
```

### Redirection HTTP → HTTPS

```bash
curl -I http://localhost
# Attendu : HTTP/1.1 301 Moved Permanently + Location: https://...
```

### Headers de sécurité

```bash
curl -kI https://localhost
# Attendu : présence de Strict-Transport-Security, X-Frame-Options,
#           X-Content-Type-Options, Referrer-Policy, Permissions-Policy,
#           Content-Security-Policy
```

### Rate limiting

```bash
# 15 requêtes login rapides → après ~10 OK, des 429 doivent apparaître
for i in {1..15}; do
  curl -kso /dev/null -w "%{http_code}\n" -X POST https://localhost/api/auth/login
done
```

### Blocage des fichiers sensibles

```bash
curl -kI https://localhost/.env
curl -kI https://localhost/config.sql
curl -kI https://localhost/backup.sh
# Attendu : 403 Forbidden sur les trois
```

### Capabilities Linux

```bash
# PostgreSQL : CHOWN + SETUID + SETGID + DAC_READ_SEARCH + FOWNER
docker inspect opencrisis-postgres-1 \
  --format '{{.HostConfig.CapDrop}} / {{.HostConfig.CapAdd}}'
# Attendu : [ALL] / [CHOWN SETUID SETGID DAC_READ_SEARCH FOWNER]

# Redis : aucune cap ajoutée (user: 999:999, pas de switch d'utilisateur)
docker inspect opencrisis-redis-1 \
  --format '{{.HostConfig.CapDrop}} / {{.HostConfig.CapAdd}}'
# Attendu : [ALL] / []
```

---

## Résolution de problèmes courants

### Volume Redis "Permission denied" après modification des capabilities

Si on modifie les `cap_drop` / `cap_add` du service redis entre deux démarrages, le volume `redis_data` peut conserver des droits incompatibles avec le nouvel utilisateur effectif.

```bash
docker compose down
docker volume rm opencrisis_redis_data
docker compose up -d
```

Le même problème peut survenir sur n'importe quel service où l'utilisateur effectif change.

### `docker-credential-desktop.exe not found` (WSL)

Sous WSL, le fichier `~/.docker/config.json` peut référencer un credentials helper Windows qui n'existe pas dans l'environnement Linux.

```bash
echo '{}' > ~/.docker/config.json
```

### Frontend `unhealthy` avec healthcheck IPv6

L'image `nginxinc/nginx-unprivileged` n'ajoute pas automatiquement l'écoute IPv6 si le `default.conf` a été modifié. Le healthcheck `wget http://localhost:8080` peut alors échouer si `localhost` résout d'abord en IPv6.

Solution dans le compose :

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080"]
```

Force la résolution IPv4 explicite.

### Réseau Docker corrompu

Après plusieurs cycles `up`/`down` avec changement de config réseau :

```bash
docker compose down -v
docker network prune -f
docker compose up --build
```

---

## Limites connues et améliorations futures

L'infrastructure actuelle est solide pour un usage interne. Pour aller plus loin :

- **Pas de backup automatisé** — la base et les uploads ne sont pas sauvegardés. Un service `backup` (pg_dump + GPG + rétention) serait à ajouter pour la résilience.
- **Pas de scan antivirus sur les uploads** — n'importe quel utilisateur authentifié peut uploader un fichier malveillant. Une intégration ClamAV dans `routes/files.ts` est envisageable.
- **Pas de monitoring / alerting** — pas de Prometheus, pas de Grafana, pas d'alerting sur les patterns anormaux.
- **Pas de logging centralisé** — les logs restent dans les conteneurs et sont perdus au `docker compose down`. Un agent vers ELK / Loki améliorerait la traçabilité.
- **Pas de scan CVE automatisé** — Trivy ou Snyk en CI permettrait de détecter les vulnérabilités connues dans les images.
- **PostgreSQL sans SSL** — la communication backend ↔ DB est en clair sur le réseau Docker interne. Acceptable parce que `backend-network` est `internal: true`, mais activer SSL côté Postgres serait un plus.
- **Pas de 2FA** — l'authentification est limitée à email + password. Du TOTP serait recommandé pour une vraie cellule de crise.
- **Certificats auto-signés** — à remplacer par des certificats Let's Encrypt ou d'une CA d'entreprise pour la production.
