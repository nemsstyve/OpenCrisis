# Configuration

## Fichier `.env`

Le fichier `.env` à la racine du projet contient toutes les variables de configuration. **Il ne doit jamais être commité dans Git** (présent dans `.gitignore`).

Le fichier `.env.example` sert de modèle documenté.

```bash
# Créer le .env à partir du modèle
cp .env.example .env
# Puis éditer les valeurs
```

---

## Variables d'environnement

### Base de données

```env
# URL de connexion PostgreSQL au format : postgresql://user:password@host:port/dbname
# En Docker : "postgres" est le nom du service Docker (résolution DNS interne)
DATABASE_URL="postgresql://opencrisis:monmotdepasse@postgres:5432/opencrisis"

# Variables utilisées directement par l'image postgres:16-alpine au démarrage
POSTGRES_USER=opencrisis
POSTGRES_PASSWORD=monmotdepasse   # Doit correspondre à DATABASE_URL
POSTGRES_DB=opencrisis
```

> **Important** : `POSTGRES_PASSWORD` et le mot de passe dans `DATABASE_URL` doivent être identiques.

### Authentification JWT

```env
# Secrets de signature des tokens JWT — doivent être longs, aléatoires et secrets
# Générer avec PowerShell :
# $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
# $bytes = New-Object byte[] 64; $rng.GetBytes($bytes)
# [System.BitConverter]::ToString($bytes).Replace("-","").ToLower()

JWT_SECRET=<64 octets en hexadécimal>
JWT_REFRESH_SECRET=<autre valeur de 64 octets>

# Durée de validité des tokens
JWT_ACCESS_EXPIRES_IN=15m    # Access token : courte durée (15 min par défaut)
JWT_REFRESH_EXPIRES_IN=7d    # Refresh token : longue durée (7 jours par défaut)
```

**Pourquoi deux secrets distincts ?**  
L'access token et le refresh token ont des niveaux de sensibilité différents. Si `JWT_SECRET` est compromis, les access tokens (valides 15 min) peuvent être forgés. Si `JWT_REFRESH_SECRET` est compromis, les refresh tokens (valides 7 jours) le sont. Deux secrets séparés limitent la portée d'une compromission.

**Que se passe-t-il si on change un secret ?**  
Tous les tokens signés avec l'ancien secret deviennent invalides. Tous les utilisateurs sont déconnectés. À faire lors d'une rotation de sécurité planifiée.

### Redis

```env
# URL de connexion Redis
# En Docker : "redis" est le nom du service
REDIS_URL=redis://redis:6379

# Si Redis est protégé par un mot de passe :
# REDIS_URL=redis://:monmotdepasse@redis:6379
```

### Application

```env
NODE_ENV=production          # "production" | "development"
PORT=4000                    # Port interne du backend (ne pas changer sauf si conflit)

# Origine autorisée pour CORS (URL publique du frontend)
# En développement local : http://localhost
# En production : https://opencrisis.votredomaine.fr
CORS_ORIGIN=http://localhost
```

### Intégration OpenCTI (optionnelle)

```env
# Désactivé par défaut — mettre à true uniquement avec une instance OpenCTI disponible
OPENCTI_ENABLED=false

# URL de votre instance OpenCTI
OPENCTI_URL=https://openctii.votreorganisation.fr

# Token d'API OpenCTI (Settings → API Access dans l'interface OpenCTI)
OPENCTI_TOKEN=votre-token-api
```

---

## Configuration Docker Compose

### `docker-compose.yml` — Production

Structure annotée :

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"              # Seul port exposé vers l'extérieur
    volumes:
      - ./03-nginx/nginx.conf:/etc/nginx/nginx.conf:ro  # :ro = lecture seule
    depends_on:
      frontend:
        condition: service_healthy   # Attend que le frontend réponde
      backend:
        condition: service_healthy   # Attend que le backend réponde /health

  backend:
    environment:
      DATABASE_URL: ${DATABASE_URL}  # Injecté depuis .env
      # ...
    volumes:
      - uploads_data:/app/uploads    # Volume persistant pour les fichiers

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-opencrisis}  # Valeur par défaut si non défini
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}       # Obligatoire — pas de défaut
    volumes:
      - postgres_data:/var/lib/postgresql/data      # Données persistantes
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U opencrisis"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:     # Données PostgreSQL — NE PAS supprimer sans backup
  redis_data:        # Journal AOF Redis
  uploads_data:      # Fichiers uploadés par les utilisateurs
```

### `docker-compose.dev.yml` — Développement

En mode développement, **seuls PostgreSQL et Redis** tournent dans Docker. Le frontend et le backend tournent directement sur l'hôte avec hot-reload.

```bash
# Démarrer uniquement postgres + redis
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --detach

# postgres est alors accessible sur localhost:5432
# redis est alors accessible sur localhost:6379
```

**Pourquoi cette approche ?**
- **Hot-reload** : Vite HMR recharge le navigateur instantanément après chaque modification de fichier
- **Debugging** : les breakpoints Node.js fonctionnent directement sans configuration Docker particulière
- **Vitesse** : pas de rebuild Docker à chaque modification de code

---

## Changer le port d'écoute

Par défaut, nginx écoute sur le port `80`. Pour changer (ex: conflit avec un autre service) :

**1. Modifier `docker-compose.yml`** :
```yaml
nginx:
  ports:
    - "8080:80"    # Accessible sur http://localhost:8080
```

**2. Mettre à jour `.env`** :
```env
CORS_ORIGIN=http://localhost:8080
```

**3. Redémarrer** :
```bash
docker compose up --detach
```

---

## Activer HTTPS en production

Pour passer en HTTPS avec un certificat SSL :

**1. Modifier `03-nginx/nginx.conf`** — ajouter le bloc HTTPS :
```nginx
server {
    listen 443 ssl;
    server_name opencrisis.votredomaine.fr;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # ... les locations existantes
}

# Redirection HTTP → HTTPS
server {
    listen 80;
    server_name opencrisis.votredomaine.fr;
    return 301 https://$host$request_uri;
}
```

**2. Monter les certificats dans `docker-compose.yml`** :
```yaml
nginx:
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./03-nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./certs:/etc/nginx/certs:ro    # Répertoire local contenant les certificats
```

**3. Mettre à jour `.env`** :
```env
CORS_ORIGIN=https://opencrisis.votredomaine.fr
```

---

## Rotation des secrets

Pour changer les secrets JWT (après une suspicion de compromission) :

```bash
# 1. Générer de nouveaux secrets
$rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::new()
$bytes = New-Object byte[] 64; $rng.GetBytes($bytes)
$new_jwt = [System.BitConverter]::ToString($bytes).Replace("-","").ToLower()

# 2. Mettre à jour .env avec les nouveaux secrets

# 3. Redémarrer le backend
docker compose restart backend
```

> Tous les utilisateurs seront déconnectés — les tokens existants ne seront plus valides.
