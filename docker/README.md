# APEX Platform - Docker Distribution

Production Docker setup for deploying APEX on a Linux server. Three containers:

| Service | Image | Purpose |
|---------|-------|---------|
| `db` | `postgres:16-alpine` | PostgreSQL 16 database |
| `backend` | built from `docker/Dockerfile.backend` | Express API on port 3001 (internal) |
| `web` | built from `docker/Dockerfile.web` | nginx serving the frontend + reverse-proxying `/api` to backend |

## Prerequisites

- Docker Engine 20.10+ and Docker Compose v2 (`docker compose ...`)
- Outbound HTTPS for the initial image build (npm registry, Phosphor Icons CDN at runtime)
- ~2 GB disk for images, plus DB volume growth

## Quick start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env: set DB_PASSWORD and JWT_SECRET (REQUIRED)
#   Generate JWT_SECRET:  openssl rand -base64 48
#   Generate DB_PASSWORD: openssl rand -base64 24

# 2. Build and start
docker compose build
docker compose up -d

# 3. Check status
docker compose ps
docker compose logs -f backend
```

App is reachable at `http://<host>:8080` (change `WEB_PORT` in `.env` to override).

## First-run database setup

The backend auto-creates its tables on startup (see `ensureRoomTables()` and similar
in the route files). On first boot:

1. Wait for `apex-db` to be healthy: `docker compose ps`
2. Wait for `apex-backend` logs to show `APEX Backend API started`
3. Hit `http://<host>:8080/health` - should return `{"status":"healthy",...}`

You will need to seed an initial admin user. Two options:

```bash
# Option A: use the seed script bundled in the backend image
docker compose exec backend node seed-demo.js

# Option B: connect to the DB and insert manually
docker compose exec db psql -U apex_user -d apex_db
```

## Volumes

| Volume | Mounted at | Contents |
|--------|------------|----------|
| `apex-db-data` | `/var/lib/postgresql/data` | PostgreSQL data files |
| `apex-uploads` | `/app/uploads` (backend) | Task attachments uploaded via `/api/attachments` |

Back these up with `docker run --rm -v apex-db-data:/data -v $PWD:/backup alpine tar czf /backup/db.tgz /data` (or use `pg_dump`).

## Reverse proxy / TLS

The `web` container only speaks HTTP on port 80 inside the network. For corporate
deployment put it behind your existing TLS terminator (nginx, Traefik, F5, Cloudflare
Tunnel, etc). Forward the original `Host`, `X-Real-IP`, and `X-Forwarded-Proto`
headers. Update `FRONTEND_URL` in `.env` to the public origin so CORS allows it.

Example with an external nginx:

```nginx
location / {
    proxy_pass http://apex-host:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

The Vue bundle is rebuilt from `client/` source by `Dockerfile.web`, so changes
to `client/src/` are picked up automatically.

## Operations

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f web

# Restart one service
docker compose restart backend

# Open a shell
docker compose exec backend sh
docker compose exec db psql -U apex_user -d apex_db

# Stop everything (data preserved)
docker compose down

# Stop AND delete volumes (DESTROYS DATA)
docker compose down -v
```

## Security checklist

- [ ] `.env` is not committed (`.gitignore` already excludes it)
- [ ] `JWT_SECRET` is at least 48 random bytes, unique per environment
- [ ] `DB_PASSWORD` is unique and rotated periodically
- [ ] `FRONTEND_URL` is set to your real public origin (locks down CORS)
- [ ] Port 8080 is firewalled off from the public internet; only the upstream
      proxy / TLS terminator should reach it
- [ ] DB volume is included in your backup rotation
- [ ] Run `docker compose pull` periodically to refresh `postgres:16-alpine` and
      `nginx:1.27-alpine` base images

## Troubleshooting

**Backend exits immediately with "Missing required environment variables"**
You forgot to set `DB_PASSWORD` or `JWT_SECRET` in `.env`.

**`web` returns 502 on `/api/...`**
Backend is not healthy. `docker compose logs backend` to see why. Most common
cause is the DB not being ready yet on first boot - the depends_on healthcheck
should prevent this, but slow disks can still trip it.

**Tables don't exist**
The backend creates tables lazily on the first request to each route. Hit the
app once after startup, or run `node seed-demo.js` inside the backend container.

**Frontend loads but API calls 404**
Check that nginx is proxying `/api/`: `docker compose exec web cat /etc/nginx/conf.d/apex.conf`.

**File uploads fail**
Confirm the `apex-uploads` volume is mounted: `docker compose exec backend ls -la /app/uploads`.
