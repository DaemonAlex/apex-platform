#!/usr/bin/env bash
# APEX dev bootstrap — idempotent, run as often as you like.
#
# Creates everything a fresh Linux box needs to run
# `docker compose -f docker-compose.dev.yml up`:
#   1. ./secrets/jwt_private.pem + jwt_public.pem   (RS256 keypair)
#   2. .env                                          (generated from .env.example
#                                                     with strong random values
#                                                     filled in — only if absent)
#   3. .env.local                                    (dev-safe overrides:
#                                                     COOKIE_SECURE=false,
#                                                     DB_PASSWORD simple local value)
#
# Existing files are NEVER overwritten. Delete them yourself first if you
# want a clean regen.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

info()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*"; }
die()   { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || die "missing dependency: $1"
}
require openssl
require docker

# ---------------------------------------------------------------------------
# 1. RSA keypair for RS256 access tokens
# ---------------------------------------------------------------------------
mkdir -p secrets
if [[ ! -f secrets/jwt_private.pem ]]; then
  info "generating RSA keypair in secrets/"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out secrets/jwt_private.pem 2>/dev/null
  openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem 2>/dev/null
  chmod 400 secrets/jwt_private.pem
  chmod 444 secrets/jwt_public.pem
else
  info "secrets/jwt_private.pem already present — skipping keygen"
fi

# ---------------------------------------------------------------------------
# 2. .env from template, with random values substituted
# ---------------------------------------------------------------------------
if [[ ! -f .env ]]; then
  [[ -f .env.example ]] || die ".env.example missing — repo incomplete"
  info "creating .env from .env.example"

  JWT_SECRET_VALUE="$(openssl rand -base64 48 | tr -d '\n')"
  TOTP_ENC_KEY_VALUE="$(openssl rand -base64 32 | tr -d '\n')"
  DB_PASSWORD_VALUE="dev_$(openssl rand -hex 8)"
  INITIAL_ADMIN_PASSWORD_VALUE="Dev!$(openssl rand -hex 6)Aa1"

  # sed-in the generated values. The template's CHANGE_ME_* sentinels are
  # replaced by literal random values. Any line we don't match stays as-is.
  sed \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_VALUE}|" \
    -e "s|^TOTP_ENC_KEY=.*|TOTP_ENC_KEY=${TOTP_ENC_KEY_VALUE}|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD_VALUE}|" \
    -e "s|^INITIAL_ADMIN_EMAIL=.*|INITIAL_ADMIN_EMAIL=dev@apex.local|" \
    -e "s|^INITIAL_ADMIN_PASSWORD=.*|INITIAL_ADMIN_PASSWORD=${INITIAL_ADMIN_PASSWORD_VALUE}|" \
    -e "s|^INITIAL_ADMIN_NAME=.*|INITIAL_ADMIN_NAME=Dev Admin|" \
    -e "s|^COOKIE_SECURE=.*|COOKIE_SECURE=false|" \
    -e "s|^FRONTEND_URL=.*|FRONTEND_URL=http://localhost:8080,http://localhost:5173|" \
    .env.example > .env

  chmod 600 .env

  # Write initial admin credentials to a file the operator can `cat` then
  # delete. Printing them to stdout leaks into terminal scrollback, shell
  # history (if they get copy-pasted), and any pre-commit scanner that
  # sees a "password: <value>" pattern in a shell script.
  mkdir -p secrets
  umask 077
  {
    printf 'email\tdev@apex.local\n'
    printf 'initial_admin_password\t%s\n' "$INITIAL_ADMIN_PASSWORD_VALUE"
  } > secrets/initial_admin_credentials.txt
  chmod 600 secrets/initial_admin_credentials.txt

  info ".env created. Initial admin credentials written to:"
  printf '  secrets/initial_admin_credentials.txt  (chmod 600)\n'
  printf 'Read it once, change the password after first login, then delete the file.\n\n'
else
  info ".env already present — skipping generation"
fi

# ---------------------------------------------------------------------------
# 3. Make sure docker compose is reachable, and nothing on the host is
#    already squatting on the ports this stack needs.
# ---------------------------------------------------------------------------
if ! docker compose version >/dev/null 2>&1; then
  die "'docker compose' not available. Install Docker Engine 20.10+ and the Compose v2 plugin."
fi

for port in 5432 3001 8080 5173; do
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${port}$"; then
    warn "port ${port} already in use on the host — the stack may fail to publish it"
  fi
done

info "bootstrap complete"
cat <<'EOF'

Next steps:

  # Start the stack
  docker compose -f docker-compose.dev.yml up --build

  # (in another terminal) push the schema
  docker compose -f docker-compose.dev.yml exec backend npm run db:push

  # Seed the first admin user (idempotent — skips if any user exists)
  docker compose -f docker-compose.dev.yml exec backend node seed-admin.js

  # Tail the backend
  docker compose -f docker-compose.dev.yml logs -f backend

URLs:
  http://localhost:8080   — app shell (nginx + built bundle)
  http://localhost:5173   — Vite dev server (hot module reload)
  http://localhost:3001   — backend API
  postgres://localhost:5432 — database (use DB_USERNAME/DB_PASSWORD from .env)
EOF
