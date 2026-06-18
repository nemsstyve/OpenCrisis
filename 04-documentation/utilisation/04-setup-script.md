# Script `setup.sh` — Gestion de l'installation

Le script `setup.sh` à la racine du projet est le **point d'entrée unique** pour installer, démarrer, gérer et tester OpenCrisis. Il s'adresse aux développeurs comme aux personnes qui déploient l'application en interne sans connaître les détails Docker.

> Le script n'est compatible qu'avec **bash**. Sous Windows, l'utiliser via **WSL Ubuntu** ou **Git Bash**.

---

## Utilisation rapide

```bash
bash setup.sh
```

Un menu interactif s'affiche avec 8 options. Sélectionner un numéro et suivre les instructions.

Pour scripter ou automatiser :

```bash
bash setup.sh install    # Installation complète
bash setup.sh start      # Démarrer la stack
bash setup.sh stop       # Arrêter la stack
bash setup.sh status     # Voir l'état des services
bash setup.sh test       # Tests de sécurité
bash setup.sh reset      # Réinitialisation complète (DANGER)
```

---

## Les 8 options du menu

### 1 — Première installation

À utiliser au tout premier déploiement. Le script :

1. Vérifie les prérequis (Docker, Docker Compose, OpenSSL, ports 80/443 libres)
2. Génère les certificats TLS auto-signés (`certs/cert.pem` et `certs/key.pem`)
3. Génère le fichier `.env` en mode **hybride** :
   - **Auto** : `JWT_SECRET` et `JWT_REFRESH_SECRET` (128 caractères hex aléatoires)
   - **Interactif avec valeur par défaut** : mot de passe Postgres, email admin, mot de passe admin
4. Build et démarre la stack Docker
5. Lance le seed Prisma (création des 5 rôles + compte admin)
6. Si l'email ou le mot de passe admin ont été personnalisés, met à jour le compte créé par le seed
7. Écrit `credentials.txt` avec tous les identifiants

À la fin, l'application est accessible sur **https://localhost**.

> Si une installation existe déjà (`.env` présent), le script propose d'écraser. Confirmer entraîne la suppression de tous les volumes Docker (perte des données).

### 2 — Démarrer la stack

Lance `docker compose up -d` et affiche l'état. À utiliser après un arrêt sans suppression de données.

Refuse de démarrer si `.env` ou les certificats sont absents (relancer l'option 1).

### 3 — Arrêter la stack

Lance `docker compose down`. Demande ensuite si l'utilisateur veut aussi supprimer les volumes :

- **Non** (défaut) — `docker compose down` simple, données conservées
- **Oui** — `docker compose down -v`, **toutes les données métier sont perdues**

### 4 — Changer un mot de passe (sous-menu)

#### 4.1 — Mot de passe admin de l'application

Modifie le mot de passe d'un utilisateur applicatif (par défaut `admin@opencrisis.local`). Le script :

1. Demande l'email du compte à modifier
2. Demande le nouveau mot de passe (politique : 8+ caractères, 1 majuscule, 1 chiffre, 1 caractère spécial)
3. Hash avec bcrypt (coût 12) et met à jour la BDD via Prisma
4. Désactive `mustChangePassword` (puisque l'utilisateur a choisi)

La stack doit être démarrée (le script la démarre automatiquement si besoin).

#### 4.2 — Mot de passe Postgres (DESTRUCTIF)

⚠ Cette opération **supprime toutes les données** parce que Postgres ne supporte pas le changement de mot de passe d'un superuser sans accès initial. Le script :

1. Demande deux confirmations explicites
2. Arrête la stack et supprime le volume `postgres_data`
3. Génère ou demande un nouveau mot de passe Postgres
4. Met à jour `POSTGRES_PASSWORD` ET `DATABASE_URL` dans `.env`
5. Relance la stack et le seed (compte admin recréé avec `Admin1234!` à changer)

À n'utiliser **qu'en cas de mot de passe compromis** ou lors d'une réinitialisation volontaire.

#### 4.3 — Secrets JWT

Régénère `JWT_SECRET` et `JWT_REFRESH_SECRET` dans le `.env` et redémarre le backend. Tous les utilisateurs connectés sont déconnectés (leurs tokens deviennent invalides). Aucune perte de données.

À utiliser après une fuite suspectée des secrets JWT.

### 5 — Régénérer les certificats TLS

Lance `scripts/generate-certs.sh` après confirmation. Si la stack tourne, redémarre nginx pour appliquer les nouveaux certificats.

À utiliser quand les certificats arrivent à expiration (au-delà de 365 jours par défaut).

### 6 — Voir l'état des services

Affiche `docker compose ps` et rappelle les URLs utiles.

### 7 — Tester la sécurité

Lance la batterie complète de tests de validation (cf. [11-securite-infrastructure.md](../fonctionnement/11-securite-infrastructure.md#tests-de-validation)) :

- **Isolation réseau** : postgres et redis ne peuvent pas sortir vers internet
- **Utilisateurs non-root** : tous les services tournent en non-root
- **Ports exposés** : seuls 80 et 443 le sont
- **Redirection HTTP → HTTPS** : code 301 attendu
- **Headers de sécurité** : HSTS, X-Frame-Options, CSP, Permissions-Policy, etc.
- **X-Powered-By masqué**
- **Blocage des fichiers sensibles** : `.env`, `.sql`, `.sh` retournent 403/404
- **Capabilities Linux** : postgres a bien `cap_drop: ALL`

Un résumé final affiche le nombre de tests réussis et échoués.

### 8 — Réinitialiser complètement (DANGER)

Tout supprime : conteneurs, volumes, `.env`, certificats, `credentials.txt`. Le projet revient à son état initial avant la première installation. Deux confirmations sont demandées.

À utiliser pour repartir de zéro sur une machine de démo.

---

## Fichier `credentials.txt`

À l'issue de l'installation, le script écrit `credentials.txt` à la racine. Ce fichier contient :

- L'email et le mot de passe admin de l'application
- Le mot de passe Postgres
- Une note sur les secrets JWT (qui restent uniquement dans `.env`)

Le fichier est :

- **Protégé** par `chmod 600` (lecture/écriture pour le propriétaire uniquement)
- **Exclu de Git** via `.gitignore` (à ajouter manuellement si pas encore fait)

> ⚠ Ce fichier est sensible. Le copier dans un gestionnaire de secrets (Bitwarden, 1Password, KeePass…) puis le supprimer. Ne JAMAIS le committer ni le partager par email.

Ajouter à `.gitignore` à la racine :

```
credentials.txt
```

---

## Politique de mots de passe appliquée

| Cible | Longueur | Règles |
|---|---|---|
| Mot de passe admin application | ≥ 8 | 1 majuscule, 1 chiffre, 1 caractère spécial |
| Mot de passe Postgres | ≥ 12 | Aucun de `/ @ : ? # espace` (ils cassent `DATABASE_URL`) |
| Secrets JWT | — | Générés automatiquement, 64 octets hex (128 caractères) |

Le script redemande tant que la politique n'est pas respectée.

---

## Résolution de problèmes

### `Permission denied: ./setup.sh`

Le script n'a pas les droits d'exécution. Lancer :

```bash
chmod +x setup.sh
```

Ou utiliser explicitement `bash setup.sh`.

### `command not found: docker compose`

Docker Compose v2 n'est pas installé ou n'est pas dans le PATH. Sur Docker Desktop, il est inclus — relancer Docker Desktop. Sinon installer le plugin officiel.

### Le script bloque sur "Attente que le backend soit prêt"

Le backend met du temps à appliquer les migrations Prisma au premier démarrage. Le script attend jusqu'à 90 secondes. Si rien ne se passe :

1. Ouvrir un autre terminal
2. Lancer `docker compose logs backend` pour voir les erreurs
3. Corriger et relancer `bash setup.sh start`

### `docker-credential-desktop.exe not found` (WSL)

Le helper Docker pour Windows n'est pas accessible côté Linux. Réinitialiser le fichier de config :

```bash
echo '{}' > ~/.docker/config.json
```

### `port is already allocated`

Un autre service (Apache, IIS, autre projet Docker) occupe déjà le port 80 ou 443. Soit l'arrêter, soit changer les ports dans `docker-compose.yml`.

---

## Tester l'installation post-script

Après l'option 1 (ou `bash setup.sh install`), vérifier manuellement :

```bash
# 1. État global
docker compose ps
# Attendu : 5 services Up, 4 "healthy" + nginx Up

# 2. Login fonctionnel
# Ouvrir https://localhost dans un navigateur
# Accepter l'avertissement de certificat auto-signé
# Se connecter avec les credentials affichés / dans credentials.txt

# 3. Tests de sécurité complets
bash setup.sh test
# OU dans le menu interactif, option 7
```

Si tous les tests de l'option 7 passent, l'installation est validée.

---

## Workflow recommandé

**Premier déploiement** :

```bash
git clone <repo> opencrisis
cd opencrisis
bash setup.sh           # option 1
# Suivre les invites interactives
# Copier credentials.txt dans un coffre-fort
# Supprimer credentials.txt
```

**Redémarrage après reboot** :

```bash
bash setup.sh start
```

**Audit de sécurité régulier** :

```bash
bash setup.sh test
```

**Changement de mot de passe utilisateur** :

```bash
bash setup.sh           # option 4.1
```

**Migration vers un nouveau serveur** :

1. Sur la nouvelle machine : `bash setup.sh install`
2. Restaurer un backup PostgreSQL si besoin (procédure à venir avec le service `backup`)
3. Copier les fichiers de `uploads_data` depuis l'ancien serveur
