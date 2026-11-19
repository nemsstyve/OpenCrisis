#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

test -f 02-backend/package-lock.json
test -f 02-backend/tests/integration/uploadHttp.integration.mjs

for image in \
    node:24-alpine \
    postgres:17-alpine \
    redis:7-alpine
do
    sudo docker image inspect "$image" >/dev/null
done

sudo -v

PREFIX="ocverify-$(date +%s)-$$"
NETWORK="$PREFIX-net"
NODE="$PREFIX-node"
POSTGRES="$PREFIX-pg"
REDIS="$PREFIX-redis"

WORK="$PREFIX-work"
PGDATA="$PREFIX-pgdata"
UPLOADS="$PREFIX-uploads"

cleanup() {
    echo
    echo "=== NETTOYAGE LABORATOIRE ==="

    sudo docker rm -f \
        "$NODE" "$POSTGRES" "$REDIS" \
        >/dev/null 2>&1 || true

    for volume in "$WORK" "$PGDATA" "$UPLOADS"; do
        sudo docker volume rm "$volume" \
            >/dev/null 2>&1 || true
    done

    sudo docker network rm "$NETWORK" \
        >/dev/null 2>&1 || true

    echo "Laboratoire supprime : $PREFIX"
}

trap cleanup EXIT

echo "=== CREATION DES RESSOURCES ISOLEES ==="

sudo docker network create --internal "$NETWORK" \
    >/dev/null

for volume in "$WORK" "$PGDATA" "$UPLOADS"; do
    sudo docker volume create "$volume" >/dev/null
done

echo "=== PREPARATION NODE.JS 24 ==="

sudo docker run -d \
    --name "$NODE" \
    --network bridge \
    --memory 2048m \
    --cpus 2 \
    --pids-limit 256 \
    --security-opt no-new-privileges \
    -v "$PWD/02-backend:/source:ro" \
    -v "$WORK:/work" \
    -v "$UPLOADS:/app/uploads" \
    -w /work \
    --entrypoint sh \
    node:24-alpine \
    -c 'sleep 3600' >/dev/null

sudo docker exec "$NODE" sh -ec '
    set -eu

    apk add --no-cache openssl >/dev/null

    cp -a /source/. /work/

    npm ci --no-audit --no-fund

    export DATABASE_URL="postgresql://ci:ci@localhost:5432/opencrisis_ci?schema=public"

    npx --no-install prisma generate

    npm run build
'

echo "PASS : compilation backend"

echo "=== FERMETURE DE L'ACCES EXTERNE ==="

sudo docker network connect "$NETWORK" "$NODE"
sudo docker network disconnect bridge "$NODE"

ACTUAL_NETWORKS="$(
    sudo docker inspect \
      --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' \
      "$NODE"
)"

test "$ACTUAL_NETWORKS" = "$NETWORK "

echo "PASS : Node.js uniquement sur le reseau isole"

echo "=== POSTGRESQL 17 ==="

sudo docker run -d \
    --name "$POSTGRES" \
    --network "$NETWORK" \
    --memory 512m \
    --cpus 1 \
    --pids-limit 128 \
    --security-opt no-new-privileges \
    -e POSTGRES_USER=ci \
    -e POSTGRES_PASSWORD=ci \
    -e POSTGRES_DB=opencrisis_ci \
    -v "$PGDATA:/var/lib/postgresql/data" \
    --health-cmd='pg_isready -U ci -d opencrisis_ci' \
    --health-interval=3s \
    --health-timeout=3s \
    --health-retries=20 \
    postgres:17-alpine >/dev/null

echo "=== REDIS 7 ==="

sudo docker run -d \
    --name "$REDIS" \
    --network "$NETWORK" \
    --memory 128m \
    --cpus 0.5 \
    --pids-limit 64 \
    --security-opt no-new-privileges \
    --health-cmd='redis-cli ping' \
    --health-interval=3s \
    --health-timeout=3s \
    --health-retries=20 \
    redis:7-alpine \
    redis-server --save "" --appendonly no \
    >/dev/null

echo "=== DISPONIBILITE DES SERVICES ==="

for service in "$POSTGRES" "$REDIS"; do
    healthy=0

    for attempt in $(seq 1 40); do
        status="$(
            sudo docker inspect \
              --format '{{.State.Health.Status}}' \
              "$service"
        )"

        if test "$status" = healthy; then
            healthy=1
            break
        fi

        sleep 2
    done

    test "$healthy" -eq 1

    echo "PASS : $service"
done

echo "=== MIGRATIONS ET TESTS BACKEND ==="

sudo docker exec \
    -e NODE_ENV=test \
    -e OPENCRISIS_INTEGRATION_TEST=1 \
    -e OPENCRISIS_HTTP_TEST_ISOLATED=1 \
    -e OPENCRISIS_TEST_BUILD_DIR=/work/dist \
    -e DATABASE_URL="postgresql://ci:ci@${POSTGRES}:5432/opencrisis_ci?schema=public" \
    -e REDIS_URL="redis://${REDIS}:6379" \
    -e JWT_SECRET="$(printf 'a1%.0s' {1..32})" \
    -e JWT_REFRESH_SECRET="$(printf 'b2%.0s' {1..32})" \
    -e TOTP_ENCRYPTION_KEY="$(printf 'c3%.0s' {1..32})" \
    "$NODE" sh -ec '
        set -eu

        cd /work

        echo "--- Migrations Prisma ---"
        npx --no-install prisma migrate deploy

        echo "--- Tests unitaires ---"
        timeout 120s node --test tests/*.test.mjs

        echo "--- Tests integration ---"
        timeout 120s node --test \
            tests/integration/*.integration.mjs

        echo "PASS : tous les tests backend"
    '

echo
echo "=== VALIDATION TERMINEE ==="
echo "Tests executes sans service de production."
echo "Aucune migration sur la base operationnelle."
echo "Aucun deploiement."
