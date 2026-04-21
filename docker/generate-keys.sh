#!/usr/bin/env bash
# Standalone RSA keypair + symmetric-key generator for APEX.
# Use when you want to regenerate keys without touching .env.
#
# Generates (only if absent — never overwrites):
#   secrets/jwt_private.pem   RSA 2048 private key, chmod 400
#   secrets/jwt_public.pem    RSA 2048 public key
#
# Prints fresh random values for:
#   JWT_SECRET       (HS256 fallback, 48 bytes base64)
#   TOTP_ENC_KEY     (AES-256-GCM key, 32 bytes base64)
# paste these into your .env manually.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

command -v openssl >/dev/null 2>&1 || { echo "openssl required" >&2; exit 1; }

mkdir -p secrets
if [[ ! -f secrets/jwt_private.pem ]]; then
  echo "Generating RSA keypair..."
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out secrets/jwt_private.pem 2>/dev/null
  openssl rsa -in secrets/jwt_private.pem -pubout -out secrets/jwt_public.pem 2>/dev/null
  chmod 400 secrets/jwt_private.pem
  chmod 444 secrets/jwt_public.pem
  echo "  wrote secrets/jwt_private.pem (0400)"
  echo "  wrote secrets/jwt_public.pem  (0444)"
else
  echo "secrets/jwt_private.pem already exists — not overwriting"
fi

echo
echo "Random values for .env (copy into the file):"
echo "  JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "  TOTP_ENC_KEY=$(openssl rand -base64 32 | tr -d '\n')"
