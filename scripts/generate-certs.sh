#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# generate-certs.sh — Génère les certificats TLS auto-signés pour HTTPS
# ════════════════════════════════════════════════════════════════════════════
# Usage : bash scripts/generate-certs.sh
#
# Produit :
#   - certs/cert.pem  (certificat public, validité 365 jours)
#   - certs/key.pem   (clé privée RSA 2048, permissions 600)
#
# Le certificat couvre localhost (DNS) et 127.0.0.1 (IP) via SubjectAltName,
# ce qui satisfait les navigateurs modernes qui exigent un SAN.
#
# Les certificats sont auto-signés : les navigateurs afficheront un avertissement
# de sécurité au premier accès — c'est attendu en environnement dev/démo.
# ════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/../certs"

mkdir -p "${CERT_DIR}"

if [[ -f "${CERT_DIR}/cert.pem" && -f "${CERT_DIR}/key.pem" ]]; then
    echo "✓ Certificats déjà présents dans ${CERT_DIR}/"
    echo "  Pour les régénérer : rm ${CERT_DIR}/*.pem puis relancer ce script."
    exit 0
fi

echo "→ Génération des certificats TLS auto-signés (RSA 2048, 365 jours)..."

# MSYS2_ARG_CONV_EXCL='/C=' : sous Git Bash/MSYS, openssl recevrait "/C=FR/..."
# converti en chemin Windows, faisant échouer la génération. On exclut UNIQUEMENT
# l'argument -subj de la conversion (ciblé sur son préfixe "/C="), pour que les
# chemins -keyout/-out restent, eux, correctement convertis. Ignoré sur Linux/WSL/macOS.
MSYS2_ARG_CONV_EXCL='/C=' openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${CERT_DIR}/key.pem" \
    -out "${CERT_DIR}/cert.pem" \
    -subj "/C=FR/ST=Ile-de-France/L=Paris/O=OpenCrisis/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    2>/dev/null

chmod 644 "${CERT_DIR}/cert.pem"
chmod 600 "${CERT_DIR}/key.pem"

echo "✓ Certificats générés :"
echo "  - ${CERT_DIR}/cert.pem (public, lisible)"
echo "  - ${CERT_DIR}/key.pem  (privé, chmod 600)"
echo ""