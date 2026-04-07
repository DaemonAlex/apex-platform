# APEX Platform - Docker Distribution

Production Docker setup for deploying APEX on a Linux server. Three containers,
private bridge network, only the web tier exposes a port. Designed for
hand-off to a corporate Docker host with no source-tree dependencies at runtime.

| Service | Image | Purpose | Exposed |
|---------|-------|---------|---------|
| `db` | `postgres:16-alpine` | PostgreSQL 16 database | internal only |
| `backend` | built from `docker/Dockerfile.backend` | Express API on port 3001 | internal only |
| `web` | built from `docker/Dockerfile.web` | nginx serving the frontend + reverse-proxying `/api` to backend | host port (default `8080`) |

The backend and database are never reachable from outside the Docker network.
All client traffic terminates at `web`, which proxies `/api/*` to `backend`
over the private network.

---

## Prerequisites

- Linux host with Docker Engine 20.10+ and Docker Compose v2 (`docker compose ...`, not legacy `docker-compose`)
- ~2 GB free disk for images, plus DB volume growth
- Outbound HTTPS during the initial image build (npm registry, Alpine package mirrors)
  - For air-gapped hosts, see "Air-gapped install" below.
- An upstream TLS terminator if you are exposing this on the internet (nginx, Traefik, Caddy, F5, Cloudflare Tunnel, etc.). The `web` container speaks plain HTTP.

---

## Quick start (clean install, no test data)

```bash
# 1. Clone the repo on the build machine
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform

# 2. Configure environment
cp .env.example .env

# Edit .env and set the following (the compose file will refuse to start
# without DB_PASSWORD and JWT_SECRET):
#
#   DB_PASSWORD              - openssl rand -base64 24
#   JWT_SECRET               - openssl rand -base64 48
#   INITIAL_ADMIN_EMAIL      - the human who will own this deployment
#   INITIAL_ADMIN_PASSWORD   - min 12 chars, mixed case, digit, special
#   INITIAL_ADMIN_NAME       - display name (optional)
#   WEB_PORT                 - host port to publish, default 8080
#   FRONTEND_URL             - public origin used for CORS, e.g. https://apex.example.com

# 3. Build images
docker compose build

# 4. Start the stack
docker compose up -d

# 5. Wait for db + backend healthchecks to go green
docker compose ps
# All three should show "(healthy)" within ~30 seconds.

# 6. Bootstrap the first admin user
docker compose exec backend node seed-admin.js
# Should print "Initial admin created: ..." with the email you set in .env.

# 7. Verify
curl -fsS http://localhost:8080/healthz       # nginx -> "ok"
curl -fsS http://localhost:8080/health        # backend -> {"status":"healthy",...}
```

Open `http://<host>:8080` in a browser, log in with the email and password
you set in `.env`, then **change the password from the Profile page** and
delete the `INITIAL_ADMIN_PASSWORD` line from `.env`.

The database starts empty - no projects, no rooms, no test users. Everything
is created through the UI.

---

## Optional: load demo data

For evaluation or training environments, an additional script seeds 30+
fictional projects, rooms, and check history:

```bash
docker compose exec backend node seed-demo.js
```

**Warning:** `seed-demo.js` is destructive. It deletes all existing rows in
`projects` (where id starts with `WTB_`), `rooms`, and `roomcheckhistory`
before inserting demo data. Do not run on a production deployment that has
real data.

To wipe demo data later, drop and recreate the volume (destroys ALL data
including users):

```bash
docker compose down -v
docker compose up -d
docker compose exec backend node seed-admin.js
```

---

## Volumes

| Volume | Mounted at | Contents | Backup priority |
|--------|------------|----------|-----------------|
| `apex-db-data` | `/var/lib/postgresql/data` (db) | PostgreSQL data files - users, projects, rooms, audit log | **CRITICAL** |
| `apex-uploads` | `/app/uploads` (backend) | Task attachment uploads via `/api/attachments` | **CRITICAL** |

Both are managed Docker named volumes. Inspect with `docker volume inspect apex-platform_apex-db-data`.

### Backup

```bash
# Logical SQL dump (preferred - portable, smaller, point-in-time)
docker compose exec -T db pg_dump -U apex_user -d apex_db -F c -f /tmp/apex.dump
docker compose cp db:/tmp/apex.dump ./apex-$(date +%Y%m%d).dump

# File-system snapshot of the data volume (faster but engine-version-locked)
docker run --rm \
  -v apex-platform_apex-db-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/apex-db-$(date +%Y%m%d).tgz -C /data .

# Uploads
docker run --rm \
  -v apex-platform_apex-uploads:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/apex-uploads-$(date +%Y%m%d).tgz -C /data .
```

Schedule these via cron on the host. Test restore at least once before relying on the backups.

### Restore

```bash
# pg_dump restore (into a fresh stack)
docker compose down -v
docker compose up -d db
# wait for healthy:
until docker compose exec -T db pg_isready -U apex_user; do sleep 1; done
docker compose cp ./apex-20260101.dump db:/tmp/apex.dump
docker compose exec -T db pg_restore -U apex_user -d apex_db --clean --if-exists /tmp/apex.dump
docker compose up -d backend web
```

---

## Reverse proxy / TLS

The `web` container only speaks HTTP on port 80 inside the network and
publishes that on the host as `${WEB_PORT}` (default 8080). For any
internet-facing deployment, put it behind your existing TLS terminator
and forward the standard proxy headers:

### Example - external nginx

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

### Example - Cloudflare Tunnel

```yaml
ingress:
  - hostname: apex.example.com
    service: http://localhost:8080
  - service: http_status:404
```

After putting it behind TLS, set `FRONTEND_URL=https://apex.example.com`
in `.env` and `docker compose up -d` to apply. CORS will reject any
origin that doesn't match.

---

## Air-gapped install

If the target host has no internet access, build the images on a connected
machine and transfer them as tar files.

**On the build machine:**

```bash
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform
cp .env.example .env
# Edit .env (set DB_PASSWORD, JWT_SECRET, INITIAL_ADMIN_*)
docker compose build

# Save all three images to a single archive
docker save \
  apex-backend:latest \
  apex-web:latest \
  postgres:16-alpine \
  | gzip > apex-images-$(date +%Y%m%d).tgz

# Transfer apex-images-*.tgz, docker-compose.yml, and .env to the target host
scp apex-images-*.tgz docker-compose.yml .env user@target:/opt/apex/
```

**On the target host:**

```bash
cd /opt/apex
gunzip -c apex-images-*.tgz | docker load
docker compose up -d
docker compose exec backend node seed-admin.js
```

---

## Updating

```bash
cd /path/to/apex-platform
git pull
docker compose build
docker compose up -d
```

The Vue bundle is rebuilt from `client/` source by `Dockerfile.web`, so any
changes to `client/src/` are picked up automatically. The backend image
includes only what the runtime needs - tests, dev scripts, and the demo
seed are excluded by `.dockerignore`.

For an air-gapped target, repeat the air-gapped install steps with the new
image tar.

---

## Operations

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f web
docker compose logs -f db

# Restart one service
docker compose restart backend

# Open a shell
docker compose exec backend sh
docker compose exec db psql -U apex_user -d apex_db

# Stop everything (data preserved)
docker compose down

# Stop AND delete volumes - DESTROYS ALL DATA
docker compose down -v
```

### Health endpoints

| URL | What |
|-----|------|
| `/healthz` | nginx liveness - returns `ok` plain text, no backend dependency |
| `/health` | backend liveness via the proxy - returns `{"status":"healthy",...}` |

Both are safe for load-balancer probes.

---

## Configuration reference

All settings are environment variables. The compose file passes them through
to the backend container. Defaults in parentheses.

### Required

| Variable | Description |
|---|---|
| `DB_PASSWORD` | PostgreSQL password. Compose refuses to start without it. Generate: `openssl rand -base64 24` |
| `JWT_SECRET` | Token signing key. Compose refuses to start without it. Generate: `openssl rand -base64 48` |
| `INITIAL_ADMIN_EMAIL` | First admin user, consumed by `seed-admin.js` |
| `INITIAL_ADMIN_PASSWORD` | First admin password (12+ chars, mixed case, digit, special, no triples, no common sequences) |

### Database

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `db` | Hostname or service name. Set to FQDN for external/managed PostgreSQL |
| `DB_PORT` | `5432` | |
| `DB_DATABASE` | `apex_db` | |
| `DB_USERNAME` | `apex_user` | |
| `DB_POOL_MAX` | `20` | Max pool size |
| `DB_POOL_IDLE_MS` | `30000` | Idle connection timeout |
| `DB_CONNECT_TIMEOUT_MS` | `10000` | Connection timeout |
| `DB_SSL` | `false` | Set to `true` for managed PostgreSQL (RDS, Azure DB, GCP Cloud SQL) or any cross-network DB |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Verify the server cert. Set to `false` ONLY for self-signed certs in trusted private networks |
| `DB_SSL_CA` | unset | Path INSIDE THE CONTAINER to a CA cert PEM file. Mount it with a volume |
| `DB_SSL_CERT`, `DB_SSL_KEY` | unset | Optional client cert/key for mutual TLS |

### Auth and TLS

| Variable | Default | Description |
|---|---|---|
| `JWT_EXPIRES_IN` | `7d` | Token lifetime. Examples: `24h`, `7d`, `30d` |
| `TLS_MIN_VERSION` | `TLSv1.2` | Minimum TLS version for ALL outbound HTTPS (DB, Cisco, future integrations). Do not lower without a compliance reason |
| `FRONTEND_URL` | `http://localhost:8080` | Public origin used for CORS. Must match how users reach the app |

### Web tier

| Variable | Default | Description |
|---|---|---|
| `WEB_PORT` | `8080` | Host port for the nginx container |

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

### Optional: Cisco Control Hub

| Variable | Default | Description |
|---|---|---|
| `CISCO_MOCK_MODE` | `true` | When `true`, returns static fixture data instead of calling the live API. Set to `false` and provide credentials to talk to a real org |
| `CISCO_CLIENT_ID` | unset | OAuth client ID |
| `CISCO_CLIENT_SECRET` | unset | OAuth client secret |
| `CISCO_ORG_ID` | unset | Webex org id |
| `CISCO_PERSONAL_TOKEN` | unset | Personal access token (overrides client credentials flow when set) |

---

## Connecting to an external/managed PostgreSQL

To run the backend against AWS RDS, Azure Database for PostgreSQL, GCP Cloud
SQL, or your own external Postgres cluster instead of the in-stack `db`
container:

1. **Comment out or remove the `db` service** in `docker-compose.yml` and the
   `depends_on: db` block in the `backend` service.
2. **Point the backend at the external host** in `.env`:
   ```bash
   DB_HOST=apex-prod.cluster-xxxxx.us-east-1.rds.amazonaws.com
   DB_PORT=5432
   DB_DATABASE=apex_db
   DB_USERNAME=apex_user
   DB_PASSWORD=<from secrets manager>
   DB_SSL=true
   DB_SSL_REJECT_UNAUTHORIZED=true
   DB_SSL_CA=/etc/apex/db-ca.pem
   ```
3. **Mount the CA cert** into the backend container. Add to the `backend`
   service in `docker-compose.yml`:
   ```yaml
   volumes:
     - apex-uploads:/app/uploads
     - ./certs/rds-ca.pem:/etc/apex/db-ca.pem:ro
   ```
4. **Pre-create the database and user** on the managed instance with the
   same name and credentials. The backend will auto-create the tables on
   first request.
5. `docker compose up -d` and `docker compose exec backend node seed-admin.js`
   to bootstrap the first admin.

---

## Security model

### Roles

| Role | Can do |
|---|---|
| `superadmin`, `admin`, `owner` | Everything: create/update/delete users, roles, settings, audit log access, all project/room/field-ops actions |
| `project_manager` | Manage projects, tasks, rooms, vendors, contacts. Cannot modify users or system settings |
| `field_ops` | Field operations sections, project task updates, room checks |
| `auditor` | Read-only access to projects, rooms, audit log |
| `viewer` | Read-only baseline |

### What's locked down (2026-04 hardening pass)

- **Public registration is disabled.** `POST /api/auth/register` returns 404.
  Create users via `seed-admin.js` (first user) or via the admin UI / `POST /api/users` (subsequent users, admin-only).
- **`POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id`,
  `POST /api/users/:id/reset-password`** are gated to admin/superadmin/owner.
  Previously any logged-in user (including a `viewer`) could create
  superadmins, change anyone's role, delete the only admin, or trigger an
  admin password reset for any account and read the temp password from the
  response.
- **`PUT /api/users/:id/password`, `PUT /api/users/:id/preferences`,
  `PUT /api/users/:id/avatar`, `DELETE /api/users/:id/avatar`** are gated by
  the `requireSelfOrAdmin` middleware: a user can act on their own record,
  admins can act on any.
- **Admin password reset** uses `crypto.randomBytes(12)` for the temp
  password (was `Math.random` previously) and forces the target user to
  change it on next login.
- **TLS 1.2 minimum** is enforced globally for all outbound HTTPS via
  `tls.DEFAULT_MIN_VERSION`. Configurable via `TLS_MIN_VERSION` env var.
- **PostgreSQL TLS** is supported via `DB_SSL` family of env vars.
- **nginx** sets a strict CSP, `Permissions-Policy`, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `server_tokens off`. HSTS is left to the upstream TLS terminator (commented
  example in `docker/nginx.conf`).
- **Helmet** sets equivalent headers on API responses, including a CSP.
- **Rate limiting**: 500 req / 15 min globally, 15 attempts / 15 min on
  `/api/auth/*` (login, password reset).
- **Password policy**: 12 char minimum, mixed case, digit, special character,
  no three repeated characters, no common sequences. Passwords expire after
  60 days. Admin reset forces a change on next login.
- **JWT** signed with `JWT_SECRET` (min 48 random bytes recommended), default
  7-day lifetime, rejected on expiration with a clear error.
- **Audit log** records every user mutation, login, password change, admin
  reset, and disabled register attempt.

### What's NOT enforced by the docker stack itself

- **TLS in transit to the browser.** The `web` container speaks plain HTTP.
  Put it behind an upstream TLS terminator (nginx, Traefik, Cloudflare
  Tunnel, F5, etc.) and uncomment the HSTS header in `docker/nginx.conf` if
  you front this container directly with TLS.
- **Network egress filtering.** If your security policy requires the backend
  to only talk to specific CIDRs (DB host, Cisco API, internal services),
  enforce that at the host firewall or in your container network.
- **Secrets storage.** `.env` is a plain file on the host. For production
  consider Docker secrets, Vault, AWS Secrets Manager, etc., and pass values
  in via the environment.

---

## Security checklist

Before exposing this to anyone:

- [ ] `.env` is on the host filesystem only, **never committed to git** (`.gitignore` already excludes it)
- [ ] `JWT_SECRET` is at least 48 random bytes (`openssl rand -base64 48`), unique per environment
- [ ] `DB_PASSWORD` is unique and rotated on a schedule
- [ ] `INITIAL_ADMIN_PASSWORD` was changed from the Profile page after first login, then removed from `.env`
- [ ] `FRONTEND_URL` is set to your real public origin so CORS rejects everything else
- [ ] `WEB_PORT` (default 8080) is firewalled off from the public internet - only the upstream TLS proxy should reach it
- [ ] If the database is on a different host, `DB_SSL=true` and `DB_SSL_CA` is set to a pinned CA file
- [ ] `TLS_MIN_VERSION=TLSv1.2` (the default) - do not lower without a documented compliance reason
- [ ] DB and uploads volumes are in your backup rotation, with a tested restore
- [ ] `docker compose pull` runs periodically to refresh `postgres:16-alpine` and the base node/nginx images for security updates
- [ ] Host OS is patched and Docker daemon is on a recent version
- [ ] If the app is internet-facing, the upstream proxy enforces TLS 1.2+, HSTS, and rate-limits authentication endpoints
- [ ] Confirmed `POST /api/auth/register` returns 404 (smoke test: `curl -i -X POST http://localhost:8080/api/auth/register`)
- [ ] Confirmed a non-admin user cannot create/delete users or trigger password resets for other users

### What's in the image

The backend image contains application code, `node_modules`, and the
`seed-admin.js` and `seed-demo.js` bootstrap scripts. Excluded by
`.dockerignore`:

- `**/.env` and `**/.env.*` (any environment files at any depth)
- `**/tests/`, `**/*.test.js` (test fixtures and runner)
- `node/check-reports.js` (dev tool with hardcoded service-account creds, not for production)
- `node/seed-fieldops.sql` (test data)
- `node/uploads/`, `node/logs/`, `node/backups/` (local state)
- `client/dist`, `**/node_modules`

If you add new files that should NOT ship in the image, update `.dockerignore`
and verify with `docker run --rm apex-backend:latest ls -la /app`.

---

## Troubleshooting

### Backend exits immediately with "Missing required environment variables"

You forgot to set `DB_PASSWORD` or `JWT_SECRET` in `.env`. Compose will refuse
to start the backend or db with the `:?` guard.

### `seed-admin.js` says "INITIAL_ADMIN_EMAIL is not set"

You set the values in `.env` but haven't restarted compose since editing it.
`docker compose up -d` to re-read the file, then re-run the seed.

### `seed-admin.js` says "Users table already has N user(s)"

Expected if you've already created users (UI registration, prior bootstrap, or
loaded a backup). The script is idempotent and refuses to overwrite. To reset,
`docker compose down -v` and start fresh - **this destroys all data.**

### `web` returns 502 on `/api/*`

Backend is not healthy. `docker compose logs backend` for the cause. Most
common: the DB wasn't ready when the backend started. The healthcheck
dependency in compose should prevent this on a normal restart, but a slow
disk on first boot can still trip it. `docker compose restart backend`.

### Frontend loads but API calls 404

Check that nginx is proxying `/api/`:

```bash
docker compose exec web cat /etc/nginx/conf.d/apex.conf
```

The `location /api/` block should `proxy_pass` to `http://apex_backend`.

### File uploads fail with permission denied

The `apex-uploads` volume must be writable by uid/gid `apex` (created
non-root inside the backend image). Verify:

```bash
docker compose exec backend ls -la /app/uploads
docker compose exec backend touch /app/uploads/.write-test && \
  docker compose exec backend rm /app/uploads/.write-test && echo OK
```

If you migrated from a volume created with different ownership, fix it:

```bash
docker compose exec --user root backend chown -R apex:apex /app/uploads
```

### "Field ops migration error" in backend logs on startup

Pre-existing benign race - the field ops migration runs before any route has
created the table. The table is created lazily on the first `/api/fieldops/*`
request and the error stops appearing. Not introduced by docker, not blocking.

### Image build fails with `npm error EUSAGE` in client stage

`client/package.json` and `client/package-lock.json` are out of sync.
Regenerate the lock file on a machine with internet access:

```bash
cd client && npm install
git add package-lock.json && git commit -m "fix: sync client lockfile"
```
