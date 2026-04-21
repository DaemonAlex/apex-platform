# APEX Platform — Docker & Linux Distribution

Production + development Docker setup for running APEX on a Linux host. Two
compose files live in the repo root:

| File | Purpose | Cookie `Secure` flag | Hot reload | Ports exposed |
|------|---------|----------------------|------------|---------------|
| `docker-compose.yml` | Production stack | `true` (HTTPS required) | No (prebuilt image) | `web` only (`8080`) |
| `docker-compose.dev.yml` | Linux dev box | `false` (plain-HTTP OK) | Yes (nodemon + Vite) | `web` + `backend` + `db` + Vite |

Both run the same three services: `db` (PostgreSQL 16), `backend`
(Express + Node 20), `web` (nginx serving the built Vue bundle).

---

## At a glance — v9.0 security posture

Everything below is enforced by the compose stack out of the box. See the
full [`Security model`](#security-model) section later for the authoritative
list.

- RS256 access tokens in **httpOnly + Secure + SameSite=Strict cookies**
- Opaque, SHA-256-hashed refresh tokens with rotation + reuse detection
- CSRF double-submit cookie + `X-CSRF-Token` header on mutating requests
- TOTP 2FA (AES-256-GCM at rest, 10 bcrypt-hashed one-time backup codes)
- Account lockout — 5 fails / 15 min, 10 / 1 h, 15 / 24 h
- Project-level IDOR gate via the `project_members` table
- bcrypt cost 12 passwords, 12-character policy, 60-day rotation
- Rate limits: 500 req / 15 min global, 15 / 15 min on `/api/auth/*`
- Helmet CSP + strict nginx security headers, `server_tokens off`

---

## Prerequisites

- Linux host, macOS, or Windows with WSL2
- Docker Engine 20.10+ and the Docker Compose v2 plugin (`docker compose`, not legacy `docker-compose`)
- `openssl` on the build host (used by the bootstrap script + manual key generation)
- ~2 GB free disk for images, plus DB volume growth
- Outbound HTTPS during the initial image build (npm registry, Alpine package mirrors) — for air-gapped hosts see [`Air-gapped install`](#air-gapped-install)
- An upstream TLS terminator for any internet-facing deployment (Traefik, Caddy, Cloudflare Tunnel, F5, AWS ALB, etc.). The `web` container speaks plain HTTP on port 80.

---

## Quick start — Development (`docker-compose.dev.yml`)

For a developer's laptop or dev box. Generates everything on the fly, runs
the backend under nodemon, runs Vite with HMR against a bind-mounted
`client/` directory, and publishes every internal port so you can run
`psql`, `curl`, or `jest` against the container stack from the host.

```bash
# Clone and check out the dev branch
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform
git checkout dev

# One-shot bootstrap: generates secrets/, .env, prints the initial admin password
./docker/bootstrap-dev.sh

# Bring up the stack (first run pulls + builds images; subsequent starts are fast)
docker compose -f docker-compose.dev.yml up --build

# --- in a second terminal ---
# Push the schema
docker compose -f docker-compose.dev.yml exec backend npm run db:push

# Seed the first admin user (idempotent)
docker compose -f docker-compose.dev.yml exec backend node seed-admin.js
```

Open the app:

| URL | What |
|-----|------|
| `http://localhost:8080` | Full app via nginx + the committed Vue bundle |
| `http://localhost:5173` | Vite dev server with hot module reload on `client/` |
| `http://localhost:3001/health` | Backend liveness (exposed for curl / Jest) |
| `postgres://localhost:5432` | Database (use `DB_USERNAME` / `DB_PASSWORD` from `.env`) |

### Running backend tests against the dev stack

```bash
export APEX_TEST_URL=http://localhost:3001
export APEX_TEST_USER=dev@apex.local
export APEX_TEST_PASSWORD='<from bootstrap output or .env>'
cd node && npm test
```

### Editing backend code

`./node` is bind-mounted at `/app` inside the `backend` container, and the
container runs `nodemon --watch .` — save a `.js` file on the host and
nodemon restarts the backend. The DB connection persists; no schema
rebuild unless you change `drizzle/schema.ts` and re-run `db:push`.

### Editing frontend code

`./client` is bind-mounted into the `vite` service. Vite's HMR pushes
changes straight to `http://localhost:5173` without a rebuild. To
exercise the production bundle instead, run `npm run build` on the host
and reload `http://localhost:8080`.

### Resetting dev state

```bash
# Stop, destroy volumes (DB + uploads), start fresh
docker compose -f docker-compose.dev.yml down -v
./docker/bootstrap-dev.sh   # does nothing if files exist; delete .env + secrets/ first for a full regen
docker compose -f docker-compose.dev.yml up --build
```

---

## Quick start — Production (`docker-compose.yml`)

Clean install, no test data, production hardening defaults. Use this on
any host intended for real traffic.

```bash
# 1. Clone the main branch
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform

# 2. Generate the RSA keypair the backend uses for RS256 access tokens
./docker/generate-keys.sh

# 3. Configure environment
cp .env.example .env

# Edit .env. The compose file refuses to start without:
#   DB_PASSWORD            openssl rand -base64 24
#   JWT_SECRET             openssl rand -base64 48    (HS256 fallback)
#   TOTP_ENC_KEY           openssl rand -base64 32    (AES-256-GCM for 2FA)
#   INITIAL_ADMIN_EMAIL    the human who will own this deployment
#   INITIAL_ADMIN_PASSWORD min 12 chars, mixed case, digit, special
#   FRONTEND_URL           public origin used for CORS, e.g. https://apex.example.com

# 4. Build images
docker compose build

# 5. Start the stack
docker compose up -d

# 6. Push the schema
docker compose exec backend npm run db:push

# 7. Bootstrap the first admin user
docker compose exec backend node seed-admin.js
# prints "Initial admin created: ..." with the email you set in .env.

# 8. Smoke test
curl -fsS http://localhost:8080/healthz    # nginx -> "ok"
curl -fsS http://localhost:8080/health     # backend -> {"status":"healthy",...}
```

Open `http://<host>:8080` in a browser, log in with the email and password
from `.env`, then **change the password from the Profile page** and delete
`INITIAL_ADMIN_PASSWORD` from `.env`.

The database starts empty — no projects, no rooms, no test users.

### Optional — load demo data

For evaluation or training environments:

```bash
docker compose exec backend node seed-demo.js
```

**Warning:** `seed-demo.js` is destructive. It deletes all rows in `projects`
(where id starts with `WTB_`), `rooms`, and `roomcheckhistory` before
inserting demo data. Do not run on a deployment with real data.

---

## Volumes

| Volume | Mounted at | Contents | Backup priority |
|--------|------------|----------|-----------------|
| `apex-db-data` | `/var/lib/postgresql/data` (db) | PostgreSQL data — users, projects, rooms, audit log, refresh tokens, 2FA secrets | **CRITICAL** |
| `apex-uploads` | `/app/uploads` (backend) | Task attachment uploads | **CRITICAL** |
| `./secrets` (bind) | `/app/secrets:ro` (backend) | RSA keypair for RS256 | **CRITICAL** (keep offline backup) |

The dev compose defines the same volumes with `-dev` suffixes so dev and
prod state can coexist on the same host.

### Backup

```bash
# Logical SQL dump (preferred — portable, point-in-time)
docker compose exec -T db pg_dump -U apex_user -d apex_db -F c -f /tmp/apex.dump
docker compose cp db:/tmp/apex.dump ./apex-$(date +%Y%m%d).dump

# File-system snapshot of the data volume (faster, engine-version-locked)
docker run --rm \
  -v apex-platform_apex-db-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/apex-db-$(date +%Y%m%d).tgz -C /data .

# Uploads
docker run --rm \
  -v apex-platform_apex-uploads:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/apex-uploads-$(date +%Y%m%d).tgz -C /data .

# RSA keys (back up offline — losing them invalidates every active session)
tar czf apex-keys-$(date +%Y%m%d).tgz secrets/
```

Schedule the first three via cron. Test restore at least once before
relying on the backups. Keep the keys archive somewhere encrypted and
separate from the DB backups.

### Restore

```bash
docker compose down -v
docker compose up -d db
until docker compose exec -T db pg_isready -U apex_user; do sleep 1; done
docker compose cp ./apex-20260101.dump db:/tmp/apex.dump
docker compose exec -T db pg_restore -U apex_user -d apex_db --clean --if-exists /tmp/apex.dump
# Restore the key archive back to ./secrets/ so refresh tokens verify
tar xzf apex-keys-20260101.tgz
docker compose up -d backend web
```

---

## Reverse proxy / TLS

The `web` container only speaks HTTP on port 80 inside the network and
publishes that on the host as `${WEB_PORT}` (default `8080`). For any
internet-facing deployment, put it behind your existing TLS terminator
and forward the standard proxy headers.

### External nginx

```nginx
server {
    listen 443 ssl http2;
    server_name apex.example.com;

    ssl_certificate     /etc/letsencrypt/live/apex.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/apex.example.com/privkey.pem;

    location / {
        proxy_pass http://apex-host:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 25m;
    }
}
```

### Cloudflare Tunnel

```yaml
ingress:
  - hostname: apex.example.com
    service: http://localhost:8080
  - service: http_status:404
```

After putting it behind TLS, set `FRONTEND_URL=https://apex.example.com`
and `COOKIE_SECURE=true` in `.env`, then `docker compose up -d` to apply.
CORS will reject any origin that doesn't match.

---

## Air-gapped install

Build the images on a connected machine and transfer them as a tar file.

**On the build machine:**

```bash
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform
./docker/generate-keys.sh
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, TOTP_ENC_KEY, INITIAL_ADMIN_*

docker compose build
docker save \
  apex-backend:latest \
  apex-web:latest \
  postgres:16-alpine \
  | gzip > apex-images-$(date +%Y%m%d).tgz

scp apex-images-*.tgz docker-compose.yml .env .env.example secrets/ user@target:/opt/apex/
```

**On the target host:**

```bash
cd /opt/apex
gunzip -c apex-images-*.tgz | docker load
docker compose up -d
docker compose exec backend npm run db:push
docker compose exec backend node seed-admin.js
```

---

## Updating

```bash
cd /path/to/apex-platform
git pull
docker compose build
docker compose up -d
docker compose exec backend npm run db:push   # applies any new schema
```

The Vue bundle is rebuilt from `client/` source by `Dockerfile.web`, so any
changes in `client/src/` ship automatically. The backend image includes
only runtime files — tests, dev scripts, and the demo seed are excluded
by `.dockerignore`.

For an air-gapped target, repeat the air-gapped install steps with the
new image archive.

---

## Operations

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f web
docker compose logs -f db

# Restart one service
docker compose restart backend

# Shell into a container
docker compose exec backend sh
docker compose exec db psql -U apex_user -d apex_db

# Stop everything (data preserved)
docker compose down

# Stop AND delete volumes — DESTROYS ALL DATA
docker compose down -v
```

### Health endpoints

| URL | What |
|-----|------|
| `/healthz` | nginx liveness — plain-text `ok`, no backend dependency |
| `/health` | backend liveness via the proxy — `{"status":"healthy",...}` |

Both are safe for load-balancer probes.

---

## Configuration reference

Every setting is an environment variable. The compose file passes them
through to the backend container. Defaults in parentheses.

### Required

| Variable | Description |
|---|---|
| `DB_PASSWORD` | PostgreSQL password. Compose refuses to start without it. Generate: `openssl rand -base64 24` |
| `JWT_SECRET` | HS256 fallback signing key (legacy flows + Bearer headers). Generate: `openssl rand -base64 48` |
| `TOTP_ENC_KEY` | AES-256-GCM key for 2FA secrets at rest. Generate: `openssl rand -base64 32` |
| `INITIAL_ADMIN_EMAIL` | First admin user (consumed by `seed-admin.js`) |
| `INITIAL_ADMIN_PASSWORD` | First admin password (12+ chars, mixed case, digit, special, no triples, no common sequences) |

### RS256 access tokens (v9.0)

| Variable | Default | Description |
|---|---|---|
| `JWT_PRIVATE_KEY_FILE` | `/app/secrets/jwt_private.pem` | Private key used to sign access tokens. Mounted read-only |
| `JWT_PUBLIC_KEY_FILE` | `/app/secrets/jwt_public.pem` | Public key used to verify access tokens |
| `JWT_ACCESS_TTL` | `15m` | Access-token lifetime. Keep short — refresh covers it |
| `JWT_REFRESH_TTL_DAYS` | `14` | Refresh-token lifetime in days (sliding — any use rotates and extends) |
| `JWT_EXPIRES_IN` | `7d` | Legacy HS256 lifetime (only used when RS256 keys aren't loaded) |

### Session cookies

| Variable | Default | Description |
|---|---|---|
| `COOKIE_SECURE` | `true` | `Secure` flag. MUST be true in production. Set to `false` only for pure-HTTP local dev (the dev compose file does this) |
| `COOKIE_DOMAIN` | unset | Leaves `Domain` attribute off (host-only). Set to eTLD+1 only if you need sibling-subdomain visibility |

### TOTP 2FA

| Variable | Default | Description |
|---|---|---|
| `TOTP_ENC_KEY` | — | REQUIRED. AES-256-GCM key. Distinct from JWT keys so a DB dump cannot yield session signing and a JWT-key leak cannot decrypt 2FA secrets |
| `TOTP_ISSUER` | `APEX Platform` | Issuer name shown in authenticator apps |

### Database

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `db` | Service name or external FQDN |
| `DB_PORT` | `5432` | |
| `DB_DATABASE` | `apex_db` | |
| `DB_USERNAME` | `apex_user` | Runtime user — should be CRUD-only (no DDL, no superuser) |
| `DB_POOL_MAX` | `20` | Max pool size |
| `DB_POOL_IDLE_MS` | `30000` | Idle connection timeout |
| `DB_CONNECT_TIMEOUT_MS` | `10000` | Connection timeout |
| `DB_SSL` | `false` | `true` for managed PostgreSQL (RDS, Azure DB, GCP Cloud SQL) or any cross-network DB |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Verify server cert. Set to `false` ONLY for self-signed certs in trusted private networks |
| `DB_SSL_CA` | unset | Path INSIDE THE CONTAINER to a CA cert PEM. Mount with a volume |
| `DB_SSL_CERT`, `DB_SSL_KEY` | unset | Optional client cert / key for mutual TLS |
| `DDL_USERNAME`, `DDL_PASSWORD` | fall back to `DB_*` | Override credentials for `drizzle-kit push`. Set only when the runtime user is CRUD-only and a separate superuser login is needed for schema changes |

### Auth and TLS

| Variable | Default | Description |
|---|---|---|
| `TLS_MIN_VERSION` | `TLSv1.2` | Minimum TLS version for ALL outbound HTTPS (DB, Cisco, future integrations) |
| `FRONTEND_URL` | `http://localhost:8080` | Public origin(s) for CORS, comma-separated |

### Web tier

| Variable | Default | Description |
|---|---|---|
| `WEB_PORT` | `8080` | Host port for the nginx container |
| `BACKEND_HOST_PORT` | `3001` | **Dev compose only** — host port for the backend |
| `DB_HOST_PORT` | `5432` | **Dev compose only** — host port for PostgreSQL |
| `VITE_HOST_PORT` | `5173` | **Dev compose only** — host port for Vite |

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

### Optional — Cisco Control Hub

| Variable | Default | Description |
|---|---|---|
| `CISCO_MOCK_MODE` | `true` | When `true`, returns static fixtures instead of calling the live API |
| `CISCO_CLIENT_ID` | unset | OAuth client ID |
| `CISCO_CLIENT_SECRET` | unset | OAuth client secret |
| `CISCO_ORG_ID` | unset | Webex org id |
| `CISCO_PERSONAL_TOKEN` | unset | Personal access token (overrides client-credentials flow) |

---

## Connecting to an external / managed PostgreSQL

To run against AWS RDS, Azure Database for PostgreSQL, GCP Cloud SQL, or
your own external Postgres cluster:

1. **Comment out the `db` service** in `docker-compose.yml` and the
   `depends_on: db` block in the `backend` service.
2. **Point the backend at the external host** in `.env`:

   ```bash
   DB_HOST=apex-prod.cluster-xxxxx.us-east-1.rds.amazonaws.com
   DB_PORT=5432
   DB_DATABASE=apex_db
   DB_USERNAME=apex_app            # CRUD-only runtime user
   DB_PASSWORD=<from secrets manager>
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=true
   DB_SSL_CA=/etc/apex/db-ca.pem
   # For schema pushes
   DDL_USERNAME=apex_admin
   DDL_PASSWORD=<admin password>
   ```

3. **Mount the CA cert** into the backend container:

   ```yaml
   volumes:
     - apex-uploads:/app/uploads
     - ./secrets:/app/secrets:ro
     - ./certs/rds-ca.pem:/etc/apex/db-ca.pem:ro
   ```

4. **Pre-create the database and roles** on the managed instance:

   ```sql
   CREATE DATABASE apex_db;
   CREATE USER apex_app WITH PASSWORD '<runtime>';
   REVOKE ALL ON DATABASE apex_db FROM apex_app;
   GRANT CONNECT ON DATABASE apex_db TO apex_app;
   \c apex_db
   REVOKE CREATE ON SCHEMA public FROM apex_app;
   GRANT USAGE ON SCHEMA public TO apex_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apex_app;
   GRANT USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public TO apex_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apex_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, UPDATE ON SEQUENCES TO apex_app;
   ```

5. `docker compose up -d` then `docker compose exec backend npm run db:push && docker compose exec backend node seed-admin.js`.

---

## Security model

### Roles

| Role | Can do |
|---|---|
| `superadmin`, `admin`, `owner` | Everything: user / role / setting admin, audit log access, bypass the project membership gate |
| `project_manager` | Projects, tasks, rooms, vendors, contacts; cannot modify users or system settings |
| `field_ops` | Field operations sections, project task updates, room checks |
| `auditor` | Read-only across projects, rooms, audit log |
| `viewer` | Read-only baseline |

### v9.0 hardening (authoritative)

**Authentication**

- RS256 access tokens signed with a 2048-bit RSA keypair from `./secrets/`
- 15-minute access TTL + 14-day sliding refresh with rotation on every use
- Refresh-token reuse detection — presenting a revoked token revokes every session for that user
- httpOnly + Secure + SameSite=Strict cookies — tokens never touch `localStorage`
- `/api/auth/logout` revokes the refresh row and clears cookies
- TOTP 2FA (`/api/auth/2fa/enroll`, `/2fa/verify-enroll`, `/2fa/disable`, `/verify-totp`) — speakeasy, AES-256-GCM at rest, 10 bcrypt-hashed backup codes
- Account lockout — 5 → 15 min, 10 → 1 h, 15 → 24 h, returns `423 Locked` + `Retry-After`
- Public registration returns 404; users are created by admins
- bcrypt cost 12, 12-char password policy, 60-day rotation

**Authorization**

- IDOR gate on `/api/projects` via the `project_members` table — admins bypass, non-members receive `404` (not `403`) to prevent project-id enumeration
- `requireSelfOrAdmin` on self-service routes (`PUT /api/users/:id/password`, `/preferences`, `/avatar`)
- `admin` gate on every mutating `/api/users/*` endpoint

**API & transport**

- CSRF double-submit — the non-HttpOnly `apex_csrf` cookie is echoed as `X-CSRF-Token` on every mutating request
- Parameterized SQL everywhere (no string-concat)
- `express-validator` on every mutating endpoint; explicit destructuring prevents mass assignment
- Global rate limit 500 / 15 min, auth rate limit 15 / 15 min
- All 500 responses go through `sendServerError()` returning `{error, correlationId}` — full stack stays server-side
- No query-string JWTs (browser downloads use a `fetch` + blob helper)

**nginx headers (web container)**

- Helmet-equivalent CSP, Permissions-Policy, Referrer-Policy, X-Frame-Options DENY, X-Content-Type-Options nosniff
- `server_tokens off`
- HSTS is set at the upstream TLS terminator (commented example in `docker/nginx.conf`)

**TLS**

- TLS 1.2+ enforced globally for outbound HTTPS via `tls.DEFAULT_MIN_VERSION`
- DB TLS supported via `DB_SSL` family of env vars

### What's NOT enforced by the stack

- **Browser-facing TLS.** The `web` container speaks plain HTTP. Use an upstream terminator.
- **Network egress filtering.** Enforce at the host firewall or container network.
- **Secrets storage.** `.env` is a plain file. Prefer file-based secrets — see below.

---

## Docker secrets / file-based secrets

The backend supports the standard `${VAR}_FILE` convention. Set any of
`DB_PASSWORD_FILE`, `JWT_SECRET_FILE`, `TOTP_ENC_KEY_FILE`,
`INITIAL_ADMIN_PASSWORD_FILE`, `CISCO_CLIENT_SECRET_FILE`, or
`CISCO_PERSONAL_TOKEN_FILE` to a path containing the secret value, leave
the plain env var empty, and the backend resolves the file content into
the env var at startup (`node/utils/secrets.js`). Same pattern as the
official postgres / mysql / redis images.

A ready-to-use overlay is provided at `docker-compose.secrets.yml`:

```bash
mkdir -p ./secrets && chmod 700 ./secrets
openssl rand -base64 24 > ./secrets/db_password.txt
openssl rand -base64 48 > ./secrets/jwt_secret.txt
openssl rand -base64 32 > ./secrets/totp_enc_key.txt
printf 'YourBootstrapPassword!2026' > ./secrets/initial_admin_password.txt
chmod 600 ./secrets/*.txt

# Remove or empty DB_PASSWORD, JWT_SECRET, TOTP_ENC_KEY, INITIAL_ADMIN_PASSWORD in .env

docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d
```

For Vault / AWS Secrets Manager / Azure Key Vault / k8s secrets, mount
the secret value as a file via your orchestration layer and point the
matching `*_FILE` env var at the mount path. The backend handles the rest.

---

## Security checklist

Before exposing to the internet:

- [ ] `.env` exists on the host only, **never committed** (`.gitignore` excludes it)
- [ ] `secrets/jwt_private.pem` chmod 400, backed up offline, excluded from git
- [ ] `JWT_SECRET` at least 48 random bytes (`openssl rand -base64 48`), unique per environment
- [ ] `TOTP_ENC_KEY` at least 32 random bytes (`openssl rand -base64 32`), unique per environment
- [ ] `DB_PASSWORD` unique and on a rotation schedule
- [ ] `INITIAL_ADMIN_PASSWORD` changed from the Profile page after first login, then removed from `.env`
- [ ] `FRONTEND_URL` set to your real public origin so CORS rejects everything else
- [ ] `COOKIE_SECURE=true` (the default) — you're behind HTTPS
- [ ] `WEB_PORT` (default 8080) firewalled off from the public internet — only the upstream TLS proxy should reach it
- [ ] If the database is on a different host, `DB_SSL=true` and `DB_SSL_CA` points at a pinned CA file
- [ ] Runtime DB user is CRUD-only (not the owner / superuser) — use `apex_app`-style grants and put schema-push creds in `DDL_*`
- [ ] `TLS_MIN_VERSION=TLSv1.2` (the default)
- [ ] DB, uploads, and `secrets/` in a tested backup rotation
- [ ] `docker compose pull` runs periodically to refresh base images
- [ ] Host OS is patched and the Docker daemon is current
- [ ] Upstream proxy enforces TLS 1.2+, HSTS, and rate-limits `/api/auth/*`
- [ ] Smoke test: `curl -i http://localhost:8080/api/auth/register` returns 404
- [ ] Smoke test: a non-admin cannot read a project they aren't a member of (returns 404)

---

## What's in the image

The backend image contains application code, `node_modules`, and the
`seed-admin.js` / `seed-demo.js` bootstrap scripts. Excluded via
`.dockerignore`:

- `**/.env` and `**/.env.*`
- `**/tests/`, `**/*.test.js`
- `node/check-reports.js` (dev tool — uses a service account)
- `node/seed-fieldops.sql` (test data)
- `node/uploads/`, `node/logs/`, `node/backups/` (local state)
- `client/dist`, `**/node_modules`
- `secrets/` (mounted at runtime, never baked in)

If you add new files that should NOT ship in the image, update
`.dockerignore` and verify with `docker run --rm apex-backend:latest ls -la /app`.

---

## Troubleshooting

### Backend exits immediately with "Missing required environment variables"

You forgot to set `DB_PASSWORD`, `JWT_SECRET`, or `TOTP_ENC_KEY` in `.env`.
Compose refuses to start the backend or db with the `:?` guard.

### Backend logs "JWT public key not loaded"

The RS256 keys aren't readable inside the container. Check:

```bash
docker compose exec backend ls -la /app/secrets
docker compose exec backend cat /app/secrets/jwt_public.pem | head -2
```

You should see `-----BEGIN PUBLIC KEY-----`. If the file is missing, run
`./docker/generate-keys.sh` on the host and restart the backend. If it
exists but isn't readable, check the host file permissions — the mount
is read-only, so the file must be owned in a way the container user
can read.

### Login returns a token but cookies aren't set in the browser

Check that `COOKIE_SECURE` matches how you're reaching the site:

- `COOKIE_SECURE=true` requires the browser to see an `https://` origin.
  If your upstream proxy forwards to http://localhost:8080 without TLS,
  the browser drops the Set-Cookie silently.
- On pure-HTTP dev, set `COOKIE_SECURE=false` (the dev compose does this).

Also check that `FRONTEND_URL` in `.env` matches the origin the browser
shows. CORS + cookie origin mismatches produce the same symptom.

### `seed-admin.js` says "INITIAL_ADMIN_EMAIL is not set"

You edited `.env` but didn't restart compose since. `docker compose up -d`
to re-read, then re-run the seed.

### `seed-admin.js` says "Users table already has N user(s)"

Expected if you've created users before. The script is idempotent and
refuses to overwrite. For a clean reset:

```bash
docker compose down -v     # DESTROYS ALL DATA
./docker/generate-keys.sh  # regenerate keys if needed
docker compose up -d
docker compose exec backend npm run db:push
docker compose exec backend node seed-admin.js
```

### `web` returns 502 on `/api/*`

Backend is unhealthy. `docker compose logs backend` for the cause. Most
common: DB wasn't ready when the backend started. The healthcheck
dependency should prevent this on a normal start, but a slow disk on
first boot can still trip it. `docker compose restart backend`.

### `/api/auth/refresh` returns 401 after the backend restarts

Expected if you regenerate the RSA private key — the new backend can't
verify tokens signed by the old key. Users need to log in again. If you
did NOT regenerate the key, check that `./secrets` is mounted correctly.

### File uploads fail with permission denied

The `apex-uploads` volume must be writable by uid/gid `apex` (the
non-root user created inside the backend image). Verify:

```bash
docker compose exec backend ls -la /app/uploads
docker compose exec backend touch /app/uploads/.write-test && \
  docker compose exec backend rm /app/uploads/.write-test && echo OK
```

If you migrated a volume created with different ownership:

```bash
docker compose exec --user root backend chown -R apex:apex /app/uploads
```

### Account locked out (`423 Locked`) during testing

Expected — the lockout counter kicks in at 5 failed attempts. To clear:

```bash
docker compose exec db psql -U apex_user -d apex_db \
  -c "DELETE FROM auth_failures WHERE username = 'the-locked-email@example.com';"
```

In dev only, restarting the backend also resets the global rate-limit
counter (useful when repeated Jest runs trip the `/api/auth` limiter).

### Image build fails with `npm error EUSAGE` in client stage

`client/package.json` and `client/package-lock.json` are out of sync.
Regenerate the lock file on a machine with internet access:

```bash
cd client && npm install
git add package-lock.json && git commit -m "fix: sync client lockfile"
```

### dev backend logs `EACCES` on the bind-mounted `./node` directory

The dev container runs as root so this is rare, but if you've hardened
the image: the host user that owns `./node` doesn't match the container
user. Either run the container as root (the default dev image does),
or `sudo chown -R $(id -u):$(id -g) node` on the host.
