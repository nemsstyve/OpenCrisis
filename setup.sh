#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# setup.sh — Gestion de l'installation OpenCrisis
# ════════════════════════════════════════════════════════════════════════════
# Point d'entrée unique pour installer, démarrer, gérer et tester
# l'application OpenCrisis. Compatible bash (Linux, WSL, macOS, Git Bash).
#
# Usage interactif :
#   bash setup.sh
#
# Usage en ligne de commande :
#   bash setup.sh install      # Première installation complète
#   bash setup.sh start        # Démarrer la stack
#   bash setup.sh stop         # Arrêter la stack
#   bash setup.sh status       # Voir l'état des services
#   bash setup.sh test         # Lancer les tests de sécurité
#   bash setup.sh reset        # Réinitialisation complète (DANGER)
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Localisation du projet ─────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/.env"
CREDENTIALS_FILE="$SCRIPT_DIR/credentials.txt"
CERTS_DIR="$SCRIPT_DIR/certs"
GENERATE_CERTS_SCRIPT="$SCRIPT_DIR/scripts/generate-certs.sh"

# ─── Couleurs ANSI ──────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    RED=$'\033[0;31m'
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[0;33m'
    BLUE=$'\033[0;34m'
    BOLD=$'\033[1m'
    RESET=$'\033[0m'
else
    RED="" GREEN="" YELLOW="" BLUE="" BOLD="" RESET=""
fi

# ════════════════════════════════════════════════════════════════════════════
# HELPERS — affichage
# ════════════════════════════════════════════════════════════════════════════

log_info()    { echo "${BLUE}[i]${RESET} $*"; }
log_ok()      { echo "${GREEN}[OK]${RESET} $*"; }
log_warn()    { echo "${YELLOW}[!]${RESET} $*"; }
log_error()   { echo "${RED}[X]${RESET} $*" >&2; }
log_title()   { echo ""; echo "${BOLD}${BLUE}=== $* ===${RESET}"; echo ""; }

pause()       { echo ""; read -r -p "${YELLOW}Appuyer sur Entrée pour continuer…${RESET}"; }

# ════════════════════════════════════════════════════════════════════════════
# HELPERS — validation et génération
# ════════════════════════════════════════════════════════════════════════════

# Politique de mot de passe applicative (8+ chars, 1 maj, 1 chiffre, 1 spécial)
validate_app_password() {
    local pwd="$1"
    [[ ${#pwd} -ge 8 ]]                 || { echo "Au moins 8 caractères requis"; return 1; }
    [[ "$pwd" =~ [A-Z] ]]               || { echo "Au moins une majuscule requise"; return 1; }
    [[ "$pwd" =~ [0-9] ]]               || { echo "Au moins un chiffre requis"; return 1; }
    [[ "$pwd" =~ [^a-zA-Z0-9] ]]        || { echo "Au moins un caractère spécial requis"; return 1; }
    return 0
}

# Vérifie qu'un mot de passe Postgres ne contient pas de chars qui cassent
# DATABASE_URL (/, @, :, ?, #, espace)
validate_pg_password() {
    local pwd="$1"
    [[ ${#pwd} -ge 12 ]]                 || { echo "Au moins 12 caractères requis"; return 1; }
    [[ ! "$pwd" =~ [/@:?\#[:space:]] ]]  || { echo "Caractères interdits : / @ : ? # espace"; return 1; }
    return 0
}

# Génère un secret hex aléatoire (pour JWT)
generate_hex_secret() {
    openssl rand -hex 64
}

# Génère un mot de passe alphanumérique (sans chars problématiques pour DATABASE_URL)
generate_safe_password() {
    openssl rand -base64 24 | tr -d '/+=@:?#' | cut -c1-24
}

# Demande une valeur avec une valeur par défaut (Entrée = défaut)
ask_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local input
    read -r -p "$prompt ${YELLOW}[$default]${RESET} : " input
    if [[ -z "$input" ]]; then
        printf -v "$var_name" '%s' "$default"
    else
        printf -v "$var_name" '%s' "$input"
    fi
}

# Demande un mot de passe (saisie masquée) avec valeur par défaut.
# Le défaut n'est PAS affiché en clair dans le terminal — il sera enregistré
# dans credentials.txt (droits 600, exclu de Git).
ask_password_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local input
    echo "${YELLOW}Un mot de passe a été pré-généré — appuyer sur Entrée pour l'utiliser,${RESET}"
    echo "${YELLOW}ou saisir un mot de passe personnalisé (la saisie est masquée) :${RESET}"
    read -r -s -p "$prompt : " input
    echo ""
    if [[ -z "$input" ]]; then
        printf -v "$var_name" '%s' "$default"
    else
        printf -v "$var_name" '%s' "$input"
    fi
}

# Demande confirmation [y/N], retourne 0 si oui
confirm() {
    local prompt="$1"
    local response
    read -r -p "${YELLOW}$prompt [y/N]${RESET} : " response
    [[ "$response" =~ ^[yY](es|ES)?$ ]]
}

# ════════════════════════════════════════════════════════════════════════════
# CHECKS — état de l'environnement
# ════════════════════════════════════════════════════════════════════════════

check_prerequisites() {
    log_title "Vérification des prérequis"
    local all_ok=true

    # Docker
    if command -v docker >/dev/null 2>&1; then
        log_ok "Docker installé : $(docker --version | head -1)"
    else
        log_error "Docker n'est pas installé"
        all_ok=false
    fi

    # Docker daemon en cours d'exécution
    if docker info >/dev/null 2>&1; then
        log_ok "Docker daemon en cours d'exécution"
    else
        log_error "Docker daemon n'est pas démarré (lancer Docker Desktop)"
        all_ok=false
    fi

    # Docker Compose v2
    if docker compose version >/dev/null 2>&1; then
        log_ok "Docker Compose v2 disponible"
    else
        log_error "Docker Compose v2 indisponible"
        all_ok=false
    fi

    # OpenSSL
    if command -v openssl >/dev/null 2>&1; then
        log_ok "OpenSSL installé : $(openssl version)"
    else
        log_error "OpenSSL n'est pas installé"
        all_ok=false
    fi

    # Vérification ports 80 et 443
    for port in 80 443; do
        if ss -tln 2>/dev/null | grep -qE ":${port}\s" \
           || netstat -tln 2>/dev/null | grep -qE ":${port}\s" \
           || lsof -i :${port} >/dev/null 2>&1; then
            # Vérifier si c'est nous-mêmes (docker compose)
            if docker compose ps 2>/dev/null | grep -q nginx; then
                log_warn "Port $port occupé par OpenCrisis (déjà démarré)"
            else
                log_warn "Port $port occupé par un autre processus — conflit probable"
            fi
        else
            log_ok "Port $port disponible"
        fi
    done

    echo ""
    if $all_ok; then
        log_ok "Tous les prérequis sont satisfaits"
        return 0
    else
        log_error "Certains prérequis manquent — installation impossible"
        return 1
    fi
}

env_exists()       { [[ -f "$ENV_FILE" ]]; }
certs_exist()      { [[ -f "$CERTS_DIR/cert.pem" && -f "$CERTS_DIR/key.pem" ]]; }
stack_is_running() { [[ -n "$(docker compose ps --services --filter status=running 2>/dev/null)" ]]; }

# ════════════════════════════════════════════════════════════════════════════
# ACTION — installation initiale
# ════════════════════════════════════════════════════════════════════════════

action_install() {
    log_title "Installation complète d'OpenCrisis"

    check_prerequisites || { pause; return 1; }

    # 1. Détection d'une installation existante
    if env_exists; then
        log_warn "Un fichier .env existe déjà"
        if ! confirm "Écraser l'installation existante ? (les volumes Docker seront supprimés)"; then
            log_info "Installation annulée"
            pause
            return 0
        fi
        log_info "Arrêt et suppression des volumes…"
        docker compose down -v >/dev/null 2>&1 || true
        rm -f "$ENV_FILE" "$CREDENTIALS_FILE"
    fi

    # 2. Génération des certificats TLS
    log_title "Étape 1/5 — Génération des certificats TLS"
    if certs_exist; then
        if confirm "Les certificats existent — les régénérer ?"; then
            rm -f "$CERTS_DIR/cert.pem" "$CERTS_DIR/key.pem"
            bash "$GENERATE_CERTS_SCRIPT" </dev/null
        else
            log_info "Certificats existants conservés"
        fi
    else
        bash "$GENERATE_CERTS_SCRIPT" </dev/null
    fi

    # 3. Génération du .env
    log_title "Étape 2/5 — Configuration de l'environnement"
    log_info "Les secrets JWT sont générés automatiquement."
    log_info "Le mot de passe Postgres et les identifiants admin sont à confirmer."
    echo ""

    # Génération auto des secrets JWT
    local jwt_secret jwt_refresh_secret
    jwt_secret="$(generate_hex_secret)"
    jwt_refresh_secret="$(generate_hex_secret)"
    log_ok "JWT_SECRET généré (128 caractères hex)"
    log_ok "JWT_REFRESH_SECRET généré (128 caractères hex)"
    echo ""

    # Mot de passe Postgres — interactif avec défaut
    local pg_password
    while true; do
        local pg_default
        pg_default="$(generate_safe_password)"
        ask_password_with_default "Mot de passe Postgres" "$pg_default" pg_password
        if err=$(validate_pg_password "$pg_password"); then
            log_ok "Mot de passe Postgres accepté"
            break
        else
            log_error "$err"
        fi
    done
    echo ""

    # Email et mot de passe admin de l'application
    local admin_email admin_password
    ask_with_default "Email du compte admin" "admin@opencrisis.local" admin_email

    while true; do
        local admin_default="Admin1234!"
        ask_password_with_default "Mot de passe admin (politique : 8+ chars, 1 maj, 1 chiffre, 1 spécial)" "$admin_default" admin_password
        if err=$(validate_app_password "$admin_password"); then
            log_ok "Mot de passe admin accepté"
            break
        else
            log_error "$err"
        fi
    done

    # Écriture du .env
    log_title "Étape 3/5 — Écriture du fichier .env"
    cat > "$ENV_FILE" <<EOF
# ════════════════════════════════════════════════════════════════════════════
# OpenCrisis — Variables d'environnement
# Généré le $(date -Iseconds) par setup.sh
# Ce fichier contient des secrets — ne JAMAIS le committer
# ════════════════════════════════════════════════════════════════════════════

# ─── Base de données PostgreSQL ─────────────────────────────────────────────
POSTGRES_USER=opencrisis
POSTGRES_PASSWORD=${pg_password}
POSTGRES_DB=opencrisis
DATABASE_URL="postgresql://opencrisis:${pg_password}@postgres:5432/opencrisis"

# ─── JWT ────────────────────────────────────────────────────────────────────
JWT_SECRET=${jwt_secret}
JWT_REFRESH_SECRET=${jwt_refresh_secret}
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── Redis ──────────────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ─── Application ────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://localhost

# ─── OpenCTI (optionnel, non implémenté) ────────────────────────────────────
OPENCTI_ENABLED=false
OPENCTI_URL=
OPENCTI_TOKEN=
EOF
    chmod 600 "$ENV_FILE"
    log_ok ".env généré (droits 600)"

    # Build et démarrage
    log_title "Étape 4/5 — Build et démarrage de la stack"
    log_info "Build des images (peut prendre plusieurs minutes la première fois)…"
    if ! docker compose build; then
        log_error "Échec du build des images"
        log_info "Relancer manuellement : docker compose build"
        pause
        return 1
    fi
    log_ok "Build terminé"

    log_info "Démarrage des conteneurs…"
    if ! docker compose up -d; then
        log_error "Échec du démarrage de la stack"
        log_info "Vérifier les logs : docker compose logs"
        pause
        return 1
    fi
    log_ok "Conteneurs démarrés"

    log_info "Attente que le backend soit prêt (jusqu'à 90s)…"
    local attempts=0
    while [[ $attempts -lt 18 ]]; do
        if docker compose ps backend 2>/dev/null | grep -q "healthy"; then
            log_ok "Backend healthy"
            break
        fi
        attempts=$((attempts + 1))
        sleep 5
        echo -n "."
    done
    echo ""
    if [[ $attempts -ge 18 ]]; then
        log_warn "Backend pas encore healthy — continuer quand même"
    fi

    # Seed de la base + mise à jour de l'admin si custom
    log_title "Étape 5/5 — Initialisation de la base de données"
    log_info "Création des rôles système et du compte admin…"
    if ! docker compose exec -T backend npx prisma db seed 2>&1 | tail -20; then
        log_warn "Le seed a peut-être déjà été exécuté"
    fi

    # Si l'utilisateur a personnalisé email ou mot de passe, on patche
    if [[ "$admin_email" != "admin@opencrisis.local" ]] || [[ "$admin_password" != "Admin1234!" ]]; then
        log_info "Personnalisation du compte admin…"
        update_admin_credentials "$admin_email" "$admin_password"
    fi

    # Écriture des credentials
    write_credentials_file "$admin_email" "$admin_password" "$pg_password"

    log_title "Installation terminée"
    log_ok "Application accessible sur ${BOLD}https://localhost${RESET}"
    log_ok "Compte admin : ${BOLD}$admin_email${RESET}"
    log_info "Mot de passe : enregistré dans ${BOLD}credentials.txt${RESET} (droits 600, exclu de Git)"
    log_warn "[!] Copier credentials.txt dans un coffre-fort de mots de passe, puis supprimer le fichier."
    pause
}

# ════════════════════════════════════════════════════════════════════════════
# Mise à jour du compte admin via le backend (bcrypt + Prisma)
# ════════════════════════════════════════════════════════════════════════════

update_admin_credentials() {
    local new_email="$1"
    local new_password="$2"

    docker compose exec -T \
        -e NEW_EMAIL="$new_email" \
        -e NEW_PASSWORD="$new_password" \
        backend node -e '
            const bcrypt = require("bcryptjs");
            const { PrismaClient } = require("@prisma/client");
            const prisma = new PrismaClient();
            (async () => {
                try {
                    const hash = await bcrypt.hash(process.env.NEW_PASSWORD, 12);
                    const result = await prisma.user.update({
                        where: { email: "admin@opencrisis.local" },
                        data: {
                            email: process.env.NEW_EMAIL,
                            passwordHash: hash,
                            mustChangePassword: false,
                        },
                    });
                    console.log("[OK] Compte admin mis à jour :", result.email);
                    process.exit(0);
                } catch (err) {
                    console.error("[X] Échec :", err.message);
                    process.exit(1);
                }
            })();
        ' && log_ok "Admin mis à jour ($new_email)" \
          || log_error "Impossible de mettre à jour l'admin — vérifier docker compose logs backend"
}

# ════════════════════════════════════════════════════════════════════════════
# Écriture du fichier credentials.txt
# ════════════════════════════════════════════════════════════════════════════

write_credentials_file() {
    local admin_email="$1"
    local admin_password="$2"
    local pg_password="$3"

    cat > "$CREDENTIALS_FILE" <<EOF
════════════════════════════════════════════════════════════════════════════
  OpenCrisis — Identifiants
  Généré le $(date -Iseconds)
════════════════════════════════════════════════════════════════════════════

[!] FICHIER SENSIBLE — ne pas committer, ne pas partager.
  Copier ces informations dans un gestionnaire de secrets, puis supprimer
  ce fichier (il est exclu de Git via .gitignore).

────────────────────────────────────────────────────────────────────────────
  Application (https://localhost)
────────────────────────────────────────────────────────────────────────────

  Email     : $admin_email
  Mot de passe : $admin_password

────────────────────────────────────────────────────────────────────────────
  Base de données PostgreSQL (interne, non exposée)
────────────────────────────────────────────────────────────────────────────

  Utilisateur : opencrisis
  Mot de passe : $pg_password
  Base        : opencrisis

────────────────────────────────────────────────────────────────────────────
  Secrets JWT
────────────────────────────────────────────────────────────────────────────

  Stockés dans .env (JWT_SECRET et JWT_REFRESH_SECRET, 128 caractères hex).
  Ne JAMAIS exposer. En cas de fuite : régénérer via setup.sh option 4.3.

════════════════════════════════════════════════════════════════════════════
EOF
    chmod 600 "$CREDENTIALS_FILE"
    log_ok "credentials.txt écrit (droits 600)"
}

# ════════════════════════════════════════════════════════════════════════════
# ACTIONS — démarrage / arrêt / status
# ════════════════════════════════════════════════════════════════════════════

action_start() {
    log_title "Démarrage de la stack"
    if ! env_exists; then
        log_error "Fichier .env absent — lancer d'abord l'installation (option 1)"
        pause; return 1
    fi
    if ! certs_exist; then
        log_error "Certificats TLS absents — lancer d'abord l'installation (option 1)"
        pause; return 1
    fi

    log_info "Build et démarrage (peut prendre 1-2 min si les images doivent être (re)construites)…"
    docker compose up --build -d
    echo ""
    log_info "Attente que la stack soit healthy…"
    sleep 5
    docker compose ps
    echo ""
    log_ok "Application accessible sur ${BOLD}https://localhost${RESET}"
    pause
}

action_stop() {
    log_title "Arrêt de la stack"
    if confirm "Aussi supprimer les volumes (perte de TOUTES les données) ?"; then
        log_warn "Suppression des volumes…"
        docker compose down -v
        log_ok "Stack arrêtée et volumes supprimés"
    else
        docker compose down
        log_ok "Stack arrêtée (données conservées)"
    fi
    pause
}

action_status() {
    log_title "État des services"
    docker compose ps
    echo ""
    log_info "URLs utiles (si la stack est démarrée) :"
    echo "  ${BOLD}https://localhost${RESET}            — Application"
    echo "  ${BOLD}https://localhost/api/health${RESET} — Healthcheck backend"
    pause
}

# ════════════════════════════════════════════════════════════════════════════
# ACTIONS — changement de mot de passe (sous-menu)
# ════════════════════════════════════════════════════════════════════════════

action_change_password() {
    while true; do
        log_title "Changer un mot de passe"
        echo "  ${BOLD}1.${RESET} Mot de passe admin de l'application"
        echo "  ${BOLD}2.${RESET} Mot de passe Postgres  ${RED}(DANGER — reset complet de la BDD)${RESET}"
        echo "  ${BOLD}3.${RESET} Secrets JWT  ${YELLOW}(déconnecte tous les utilisateurs)${RESET}"
        echo "  ${BOLD}0.${RESET} Retour au menu principal"
        echo ""
        read -r -p "Choix : " choice
        case "$choice" in
            1) change_admin_password ;;
            2) change_postgres_password ;;
            3) change_jwt_secrets ;;
            0) return 0 ;;
            *) log_error "Choix invalide" ;;
        esac
    done
}

change_admin_password() {
    log_title "Changement du mot de passe admin"
    if ! env_exists; then
        log_error "Installation absente — lancer l'option 1 d'abord"; pause; return
    fi
    if ! stack_is_running; then
        log_warn "La stack n'est pas démarrée — démarrage…"
        docker compose up --build -d
        sleep 10
    fi

    local current_email new_password
    read -r -p "Email du compte admin à modifier [admin@opencrisis.local] : " current_email
    current_email="${current_email:-admin@opencrisis.local}"

    while true; do
        read -r -s -p "Nouveau mot de passe (8+, 1 maj, 1 chiffre, 1 spécial) : " new_password
        echo ""
        if err=$(validate_app_password "$new_password"); then
            break
        fi
        log_error "$err"
    done

    docker compose exec -T \
        -e USER_EMAIL="$current_email" \
        -e NEW_PASSWORD="$new_password" \
        backend node -e '
            const bcrypt = require("bcryptjs");
            const { PrismaClient } = require("@prisma/client");
            const prisma = new PrismaClient();
            (async () => {
                try {
                    const hash = await bcrypt.hash(process.env.NEW_PASSWORD, 12);
                    const result = await prisma.user.update({
                        where: { email: process.env.USER_EMAIL },
                        data: { passwordHash: hash, mustChangePassword: false },
                    });
                    console.log("[OK] Mot de passe mis à jour pour :", result.email);
                    process.exit(0);
                } catch (err) {
                    console.error("[X] Échec :", err.message);
                    process.exit(1);
                }
            })();
        ' && log_ok "Mot de passe admin mis à jour" \
          || log_error "Échec — vérifier que l'email existe dans la BDD"
    pause
}

change_postgres_password() {
    log_title "Changement du mot de passe Postgres ${RED}(DESTRUCTIF)${RESET}"
    log_warn "Cette opération va :"
    echo "  • Arrêter la stack"
    echo "  • SUPPRIMER le volume postgres_data (TOUTES les données métier perdues)"
    echo "  • Mettre à jour le .env"
    echo "  • Relancer la stack avec le nouveau mot de passe"
    echo "  • Relancer le seed (admin recréé avec le mot de passe par défaut)"
    echo ""

    if ! confirm "Continuer ?"; then
        log_info "Annulé"; pause; return
    fi
    if ! confirm "${RED}DERNIER AVERTISSEMENT — confirmer la suppression de la BDD ?${RESET}"; then
        log_info "Annulé"; pause; return
    fi

    local new_pg_password
    while true; do
        local pg_default
        pg_default="$(generate_safe_password)"
        ask_password_with_default "Nouveau mot de passe Postgres" "$pg_default" new_pg_password
        if err=$(validate_pg_password "$new_pg_password"); then
            break
        fi
        log_error "$err"
    done

    log_info "Arrêt de la stack…"
    docker compose down -v

    log_info "Mise à jour du .env…"
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${new_pg_password}|" "$ENV_FILE"
    sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://opencrisis:${new_pg_password}@postgres:5432/opencrisis\"|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"

    log_info "Redémarrage de la stack…"
    docker compose up --build -d

    log_info "Attente que le backend soit prêt…"
    local attempts=0
    while [[ $attempts -lt 18 ]]; do
        if docker compose ps backend 2>/dev/null | grep -q "healthy"; then
            break
        fi
        attempts=$((attempts + 1))
        sleep 5
    done

    log_info "Re-seed de la base…"
    docker compose exec -T backend npx prisma db seed

    log_ok "Mot de passe Postgres changé"
    log_warn "Compte admin réinitialisé : admin@opencrisis.local / Admin1234! (à changer dès la 1re connexion)"
    pause
}

change_jwt_secrets() {
    log_title "Régénération des secrets JWT"
    log_warn "Tous les utilisateurs connectés seront déconnectés."
    if ! confirm "Continuer ?"; then
        log_info "Annulé"; pause; return
    fi

    local new_jwt new_refresh
    new_jwt="$(generate_hex_secret)"
    new_refresh="$(generate_hex_secret)"

    log_info "Mise à jour du .env…"
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=${new_jwt}|" "$ENV_FILE"
    sed -i.bak "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${new_refresh}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
    log_ok "Secrets régénérés"

    if stack_is_running; then
        log_info "Redémarrage du backend pour appliquer…"
        docker compose restart backend
        log_ok "Backend redémarré — les anciens tokens sont invalidés"
    fi
    pause
}

# ════════════════════════════════════════════════════════════════════════════
# ACTION — régénération des certificats
# ════════════════════════════════════════════════════════════════════════════

action_regenerate_certs() {
    log_title "Régénération des certificats TLS"
    if [[ ! -f "$GENERATE_CERTS_SCRIPT" ]]; then
        log_error "Script absent : $GENERATE_CERTS_SCRIPT"; pause; return
    fi
    if confirm "Écraser les certificats existants ?"; then
        rm -f "$CERTS_DIR/cert.pem" "$CERTS_DIR/key.pem"
        bash "$GENERATE_CERTS_SCRIPT" </dev/null

        if stack_is_running; then
            log_info "Redémarrage de nginx pour appliquer les nouveaux certificats…"
            docker compose restart nginx
            log_ok "nginx redémarré"
        else
            log_warn "La stack n'est pas en cours d'exécution."
            if confirm "La démarrer maintenant (build + up) ?"; then
                docker compose up --build -d
                log_ok "Stack démarrée avec les nouveaux certificats"
            else
                log_info "Pour démarrer plus tard : option 2 du menu, ou 'bash setup.sh start'"
            fi
        fi
    fi
    pause
}

# ════════════════════════════════════════════════════════════════════════════
# ACTION — tests de sécurité
# ════════════════════════════════════════════════════════════════════════════

action_test_security() {
    log_title "Tests de validation de la sécurité"
    if ! stack_is_running; then
        log_error "Stack non démarrée — lancer l'option 2 d'abord"; pause; return
    fi

    local pass=0 fail=0
    test_result() {
        if [[ $? -eq 0 ]]; then
            log_ok "$1"; pass=$((pass + 1))
        else
            log_error "$1"; fail=$((fail + 1))
        fi
    }

    echo ""
    echo "${BOLD}1. Isolation réseau (postgres ne doit pas accéder à internet)${RESET}"
    docker compose exec -T postgres wget -q --timeout=5 -O- https://www.google.com >/dev/null 2>&1
    [[ $? -ne 0 ]]; test_result "postgres bloqué d'internet"

    docker compose exec -T redis wget -q --timeout=5 -O- https://www.google.com >/dev/null 2>&1
    [[ $? -ne 0 ]]; test_result "redis bloqué d'internet"

    echo ""
    echo "${BOLD}2. Utilisateurs non-root (UID du PID 1)${RESET}"
    # On lit /proc/1/status pour avoir le UID réel du process principal du conteneur.
    # docker exec id -u ne marche pas pour postgres/redis qui font le switch user via
    # gosu dans l'entrypoint plutôt que via la directive USER du Dockerfile.
    local pid1_uid
    for svc in frontend backend postgres redis; do
        pid1_uid="$(docker compose exec -T "$svc" awk '/^Uid:/ {print $2}' /proc/1/status 2>/dev/null | tr -d '\r')"
        [[ -n "$pid1_uid" && "$pid1_uid" != "0" ]]
        test_result "$svc tourne en non-root (UID PID 1: ${pid1_uid:-?})"
    done

    echo ""
    echo "${BOLD}3. Ports exposés sur l'hôte${RESET}"
    # Liste les ports uniques exposés par tous les conteneurs (déduplique IPv4/IPv6)
    local exposed_ports
    exposed_ports="$(docker compose ps --format "{{.Ports}}" 2>/dev/null \
        | grep -oE '0\.0\.0\.0:[0-9]+|:::[0-9]+' \
        | grep -oE '[0-9]+$' \
        | sort -u)"
    local port_count
    port_count="$(echo "$exposed_ports" | grep -c .)"
    local exposed_list
    exposed_list="$(echo "$exposed_ports" | tr '\n' ',' | sed 's/,$//')"

    [[ "$exposed_list" == "80,443" || "$exposed_list" == "443,80" ]]
    test_result "Seuls les ports 80 et 443 sont exposés (détectés: ${exposed_list:-aucun})"

    echo ""
    echo "${BOLD}4. Redirection HTTP → HTTPS${RESET}"
    local http_code
    http_code="$(curl -s -o /dev/null -w "%{http_code}" http://localhost 2>/dev/null)"
    [[ "$http_code" == "301" ]]
    test_result "HTTP renvoie 301 (reçu : $http_code)"

    echo ""
    echo "${BOLD}5. Headers de sécurité HTTPS${RESET}"
    local headers
    headers="$(curl -k -s -I https://localhost 2>/dev/null)"

    echo "$headers" | grep -qi "strict-transport-security"
    test_result "HSTS présent"
    echo "$headers" | grep -qi "x-frame-options"
    test_result "X-Frame-Options présent"
    echo "$headers" | grep -qi "x-content-type-options"
    test_result "X-Content-Type-Options présent"
    echo "$headers" | grep -qi "content-security-policy"
    test_result "Content-Security-Policy présent"
    echo "$headers" | grep -qi "permissions-policy"
    test_result "Permissions-Policy présent"

    echo "$headers" | grep -qi "x-powered-by"
    [[ $? -ne 0 ]]; test_result "X-Powered-By masqué"

    echo ""
    echo "${BOLD}6. Blocage des fichiers sensibles${RESET}"
    for path in ".env" "config.sql" "backup.sh"; do
        code="$(curl -k -s -o /dev/null -w "%{http_code}" "https://localhost/$path" 2>/dev/null)"
        [[ "$code" == "403" || "$code" == "404" ]]
        test_result "/$path retourne $code (403/404 attendu)"
    done

    echo ""
    echo "${BOLD}7. Capabilities Linux (postgres)${RESET}"
    local caps
    caps="$(docker inspect "$(docker compose ps -q postgres)" --format '{{.HostConfig.CapDrop}}' 2>/dev/null)"
    [[ "$caps" == "[ALL]" ]]
    test_result "postgres a cap_drop: ALL"

    echo ""
    log_title "Résumé : ${GREEN}${pass} réussis${RESET} / ${RED}${fail} échecs${RESET}"
    pause
}

# ════════════════════════════════════════════════════════════════════════════
# ACTION — réinitialisation complète
# ════════════════════════════════════════════════════════════════════════════

action_reset() {
    log_title "Réinitialisation complète ${RED}(DESTRUCTIF)${RESET}"
    log_warn "Cette opération va supprimer :"
    echo "  • Tous les conteneurs et les volumes (BDD, uploads, persistance Redis)"
    echo "  • Le fichier .env"
    echo "  • Les certificats TLS"
    echo "  • Le fichier credentials.txt"
    echo ""
    if ! confirm "Continuer ?"; then
        log_info "Annulé"; pause; return
    fi
    if ! confirm "${RED}DERNIER AVERTISSEMENT — tout sera perdu, confirmer ?${RESET}"; then
        log_info "Annulé"; pause; return
    fi

    docker compose down -v 2>/dev/null || true
    rm -f "$ENV_FILE" "$CREDENTIALS_FILE"
    rm -f "$CERTS_DIR/cert.pem" "$CERTS_DIR/key.pem"
    log_ok "Projet réinitialisé"
    log_info "Pour réinstaller : relancer ce script et choisir l'option 1"
    pause
}

# ════════════════════════════════════════════════════════════════════════════
# MENU PRINCIPAL
# ════════════════════════════════════════════════════════════════════════════

show_menu() {
    clear
    cat <<EOF
${BOLD}${BLUE}════════════════════════════════════════════════════════════${RESET}
${BOLD}              OpenCrisis — Gestion de l'installation        ${RESET}
${BOLD}${BLUE}════════════════════════════════════════════════════════════${RESET}

EOF

    # Indicateurs d'état
    local installed running
    if env_exists; then installed="${GREEN}OUI${RESET}"; else installed="${YELLOW}NON${RESET}"; fi
    if stack_is_running; then running="${GREEN}EN COURS${RESET}"; else running="${YELLOW}ARRÊTÉE${RESET}"; fi

    echo "  État de l'installation : $installed"
    echo "  État de la stack       : $running"
    echo ""
    echo "  ${BOLD}1.${RESET} Première installation (génère .env + certs, build, démarre, seed)"
    echo "  ${BOLD}2.${RESET} Démarrer la stack"
    echo "  ${BOLD}3.${RESET} Arrêter la stack"
    echo "  ${BOLD}4.${RESET} Changer un mot de passe (admin / Postgres / JWT)"
    echo "  ${BOLD}5.${RESET} Régénérer les certificats TLS"
    echo "  ${BOLD}6.${RESET} Voir l'état des services"
    echo "  ${BOLD}7.${RESET} Tester la sécurité"
    echo "  ${BOLD}8.${RESET} Réinitialiser complètement ${RED}(DANGER)${RESET}"
    echo ""
    echo "  ${BOLD}0.${RESET} Quitter"
    echo ""
}

main_menu() {
    while true; do
        show_menu
        read -r -p "Choix : " choice
        case "$choice" in
            1) action_install ;;
            2) action_start ;;
            3) action_stop ;;
            4) action_change_password ;;
            5) action_regenerate_certs ;;
            6) action_status ;;
            7) action_test_security ;;
            8) action_reset ;;
            0) echo "Au revoir !"; exit 0 ;;
            *) log_error "Choix invalide"; sleep 1 ;;
        esac
    done
}

# ════════════════════════════════════════════════════════════════════════════
# DISPATCHER — mode CLI ou interactif
# ════════════════════════════════════════════════════════════════════════════

case "${1:-}" in
    install) action_install ;;
    start)   action_start ;;
    stop)    action_stop ;;
    status)  action_status ;;
    test)    action_test_security ;;
    reset)   action_reset ;;
    "")      main_menu ;;
    *)
        echo "Usage : $0 [install|start|stop|status|test|reset]"
        echo "Sans argument : menu interactif"
        exit 1
        ;;
esac
