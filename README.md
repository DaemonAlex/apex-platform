# APEX Platform - AV/UC Project Management System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-9.0-green.svg)](#)
[![Security](https://img.shields.io/badge/security-ASRB%20%2B%20SOC%202%20baseline-brightgreen.svg)](#)
[![Auth](https://img.shields.io/badge/auth-RS256%20%2B%20TOTP%202FA-blue.svg)](#)
[![Database](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](#)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](#)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](#)

An enterprise-grade project management platform for AV integrators, UC deployments, and field operations teams. Built with Vue 3 + TypeScript frontend and Express.js + PostgreSQL backend.

**Live:** [apex.daemonscripts.com](https://apex.daemonscripts.com)

---

## Architecture

```
Internet --> Cloudflare Tunnel --> nginx (port 80) --> Express API (port 3001)
                                                   --> Static files (index.html shell)
                                                   --> Vue 3 IIFE bundle (/vue/apex-rooms.iife.js)

PostgreSQL 16 (port 5432) <-- Express API
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3.5 + TypeScript + Naive UI 2.44 + Pinia 3.0 |
| App Shell | Vanilla JS (authentication, navigation, theme switching) |
| Build | Vite 8 (IIFE output, single ~2MB bundle) |
| Backend | Express.js + Node.js 18+ |
| Database | PostgreSQL 16 |
| ORM | Drizzle (schema definitions, raw SQL for queries) |
| Auth | RS256 access tokens (15m) in httpOnly cookies, opaque refresh tokens (14d sliding), CSRF double-submit, bcrypt password hashing, optional TOTP 2FA |
| Icons | Phosphor Icons (web CDN) |
| Hosting | Windows Server 2022, NSSM services, Cloudflare Tunnel (tunnel-only origin) |

### Frontend Sections (all Vue 3)

| Section | Component | Features |
|---------|-----------|----------|
| Dashboard | DashboardApp.vue | Charts (ECharts), KPI cards, greeting |
| Projects | ProjectApp.vue | List/detail views, tasks, notes, meetings, documents |
| Room Status | RoomApp.vue | Locations/floors/rooms hierarchy, equipment, compliance checks |
| Field Ops | FieldOpsApp.vue | Work orders, time tracking, status filtering |
| Reports | ReportsApp.vue | Portfolio, budget, timeline, my-tasks (4 tabs) |
| Admin | AdminApp.vue | Users, roles/permissions, settings (4 sub-tabs), audit log |
| Profile | ProfileApp.vue | Personal info, password change, preferences |

---

## Quick Start (Docker)

The fastest way to run APEX on a Linux server. The repo ships a complete
three-container stack (PostgreSQL 16, Express backend, nginx web tier).

```bash
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform
cp .env.example .env
# Edit .env: set DB_PASSWORD, JWT_SECRET, INITIAL_ADMIN_EMAIL, INITIAL_ADMIN_PASSWORD
docker compose build
docker compose up -d
docker compose exec backend node seed-admin.js
```

Open `http://<host>:8080`. Full instructions, including air-gapped install,
backup/restore, TLS termination, and a security checklist, are in
[`docker/README.md`](docker/README.md).

---

## Quick Start (Bare Metal)

### Prerequisites

- Node.js 18+
- PostgreSQL 16+
- nginx (for production)

### 1. Clone and Install

```bash
git clone https://github.com/DaemonAlex/apex-platform.git
cd apex-platform

# Backend dependencies
cd node && npm install && cd ..

# Frontend dependencies (only needed for development)
cd client && npm install && cd ..
```

### 2. Configure Environment

```bash
# Runtime DB user is CRUD-only (apex_app); a separate admin login is used for schema pushes.
# Generate the RSA keypair BEFORE first start — without it the service refuses to sign tokens.
mkdir -p secrets
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});require('fs').writeFileSync('secrets/jwt_private.pem',privateKey);require('fs').writeFileSync('secrets/jwt_public.pem',publicKey);"

cat > node/.env << 'EOF'
# PostgreSQL (runtime — CRUD-only role)
DB_USERNAME=apex_app
DB_PASSWORD=<runtime-password-no-ddl>
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=apex_db

# DDL credentials for drizzle-kit push (falls back to DB_* if unset)
# DDL_USERNAME=postgres
# DDL_PASSWORD=<superuser-password>

# HS256 fallback secret (still read by legacy flows during transition)
JWT_SECRET=<64-byte-base64>

# RS256 access tokens — primary auth from v9.0 onward
JWT_PRIVATE_KEY_FILE=./secrets/jwt_private.pem
JWT_PUBLIC_KEY_FILE=./secrets/jwt_public.pem
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=14

# Session cookies — set COOKIE_SECURE=false ONLY for pure-HTTP local dev
COOKIE_SECURE=true
COOKIE_DOMAIN=

# TOTP 2FA (AES-256-GCM at rest, distinct from JWT keys)
TOTP_ENC_KEY=<32-byte-base64>
TOTP_ISSUER=APEX Platform

NODE_ENV=production
PORT=3001
EOF
```

Generate secrets:
```bash
# HS256 fallback + TOTP encryption key (32 bytes each, base64)
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('base64'))"
node -e "console.log('TOTP_ENC_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Set Up Database

```bash
# Create database and the CRUD-only runtime role (no DDL, no SUPERUSER).
# Schema changes go through drizzle-kit push using a separate superuser.
psql -U postgres <<SQL
CREATE DATABASE apex_db;
CREATE USER apex_app WITH PASSWORD 'your-runtime-password';
REVOKE ALL ON DATABASE apex_db FROM apex_app;
GRANT CONNECT ON DATABASE apex_db TO apex_app;
\c apex_db
REVOKE CREATE ON SCHEMA public FROM apex_app;
GRANT USAGE ON SCHEMA public TO apex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apex_app;
GRANT USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public TO apex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO apex_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, UPDATE ON SEQUENCES TO apex_app;
SQL

# Push schema (uses DDL_USERNAME / DDL_PASSWORD from .env if set)
cd node && npm run db:push
```

Tables are defined in `node/drizzle/schema.ts` and created by `drizzle-kit push`.

### 4. Start Backend

```bash
cd node && node server.js
# Or with NSSM (Windows): nssm install APEX-Backend ...
```

### 5. Build Frontend (if modifying Vue code)

```bash
cd client && npm run build
# Output: vue/apex-rooms.iife.js
```

The built bundle is committed to the repo, so this step is only needed when making frontend changes.

### 6. Create First User

Public registration is disabled by design. Seed the first admin via the bootstrap script:

```bash
cd node
INITIAL_ADMIN_EMAIL=admin@example.com \
INITIAL_ADMIN_PASSWORD='YourSecurePassword123!' \
node seed-admin.js
```

The script is idempotent: it refuses to run if any users already exist. Subsequent users are created by an admin via the Admin UI or `POST /api/users`.

### 7. Access Application

Open `http://localhost` (via nginx) or configure your domain with a reverse proxy to port 3001.

---

## Project Structure

```
apex-platform/
  index.html                    # App shell (auth, nav) + Vue mount points
  vue/
    apex-rooms.iife.js          # Built Vue bundle (~2MB, all 7 sections)
  client/                       # Vue 3 source
    src/
      mount.ts                  # Entry point - exports mount functions
      *App.vue                  # 7 app components (Admin, Dashboard, etc.)
      stores/                   # Pinia stores (admin, projects, rooms, auth)
      composables/useApi.ts     # Shared API client with JWT injection
      components/               # Tab/section components
      types/                    # TypeScript interfaces
      views/                    # Route views (rooms, projects, locations)
    vite.config.ts              # IIFE build config
  node/                         # Express backend
    server.js                   # Entry point (middleware, route registration)
    db.js                       # PostgreSQL connection pool
    routes/                     # 15 route files
    middleware/                  # auth, audit, validate
    drizzle/schema.ts           # Drizzle ORM schema
  src/                          # Legacy Vite modules (bridge, being phased out)
```

---

## API Endpoints

| Route File | Base Path | Purpose |
|------------|-----------|---------|
| auth.js | `/api/auth/*` | Login, `/refresh`, `/logout`, password reset, `/verify-totp`, `/2fa/enroll`, `/2fa/verify-enroll`, `/2fa/disable`, `/2fa/status` |
| projects.js | `/api/projects/*` | Project CRUD, gated by `project_members` membership (admins bypass) |
| users.js | `/api/users/*` | User management, `/me` endpoint |
| admin.js | `/api/admin/*` | Admin ops, DB config, data utilities |
| reports.js | `/api/reports/*` | Portfolio, budget, timeline, user reports |
| room-status.js | `/api/room-status/*` | Rooms, locations, floors, equipment, standards, checks |
| roles.js | `/api/roles/*` | Role CRUD (persisted to PostgreSQL), permission catalog |
| settings.js | `/api/settings/*` | App configuration (key-value in AppConfig table) |
| audit.js | `/api/audit/*` | Audit log with filtering (category, severity, date range) |
| contacts.js | `/api/contacts/*` | Contact management |
| meetings.js | `/api/meetings/*` | Meeting management with submittals |
| documents.js | `/api/documents/*` | Document management |
| fieldops.js | `/api/fieldops/*` | Field operations and time tracking |
| attachments.js | `/api/attachments/*` | File uploads (10MB limit) |

---

## Database Tables

Auto-created on startup:

| Table | Purpose |
|-------|---------|
| Users | User accounts with bcrypt passwords, preferences, avatars |
| Roles | Role definitions with JSONB permissions (7 defaults seeded) |
| Projects | Project records with JSONB tasks, budget, timeline |
| Locations, Floors, Rooms | Room hierarchy for AV/UC space management |
| RoomEquipment, RoomStandards, RoomChecks | Equipment tracking and compliance |
| Contacts, ProjectAssignments | People and project team management |
| Meetings, Submittals | OAC meetings and submittal tracking |
| AuditLog | Full audit trail (category, severity, timestamps) |
| AppConfig | Key-value settings store (JSONB values) |
| PasswordResetTokens | Password reset flow |
| project_members | IDOR gate for `/api/projects` — admins bypass, everyone else must be a member |
| refresh_tokens | Opaque refresh tokens (SHA-256 hashed), one row per active session; rotation + reuse-detection |
| auth_failures | Login lockout counters (5 → 15m, 10 → 1h, 15 → 24h) |
| user_totp | AES-256-GCM-encrypted TOTP secrets + bcrypt-hashed backup codes |

---

## Security

APEX is built for deployment into environments that run an Application
Security Review Board process and meet SOC 2 CC6 (logical access) / CC7
(system operations) baseline controls. Every mitigation below is live in
`main` and covered by regression tests.

### Authentication & session management

- **RS256 access tokens** signed with a 2048-bit RSA keypair stored in `secrets/` (read-only to the service account)
- **15-minute access TTL**, paired with opaque 14-day sliding refresh tokens
- **httpOnly + Secure + SameSite=Strict cookies** — tokens never touch localStorage, so XSS cannot exfiltrate them
- **Refresh rotation with reuse detection** — presenting a revoked refresh token kills every session for that user
- **`/api/auth/logout`** revokes the refresh row and clears all cookies
- **CSRF double-submit protection** — mutating requests must echo the `apex_csrf` cookie back as an `X-CSRF-Token` header
- **TOTP 2FA** (speakeasy) — optional per-user enrollment, 10 bcrypt-hashed one-time backup codes, AES-256-GCM encryption of the stored secret using a key separate from the JWT keys
- **Account lockout + exponential backoff** — 5 failures → 15 min, 10 → 1 h, 15 → 24 h; responds `423 Locked` with `Retry-After`
- **bcrypt cost 12** password hashing, 12-character policy (upper/lower/digit/special, no 3+ repeats, no common sequences), 60-day rotation

### Authorization

- **IDOR gate on `/api/projects`** via the `project_members` table — admins bypass, non-members receive `404` (not `403`) to prevent project-id enumeration
- **Role-based access control** (7 roles: superadmin, admin, owner, project_manager, field_ops, auditor, viewer); system roles cannot be deleted or renamed
- **Self-or-admin** middleware on all `/api/users/:id/*` self-service routes

### API hardening

- **All queries parameterized** (`pg` placeholders) — zero string-concat SQL
- **express-validator** on every mutating endpoint; mass assignment is impossible (explicit destructuring, no `Object.keys(req.body)` spread)
- **Global rate limit** 500 req / 15 min; **auth rate limit** 15 req / 15 min
- **File uploads** restricted by MIME, 10 MB/file, 10 files max, filenames sanitized, path-traversal check
- **No error leakage** — every 500 goes through a shared helper returning `{error, correlationId}` while the full stack is logged server-side
- **No query-string JWTs** — browser-initiated downloads use an authenticated `fetch` + blob helper
- **Audit logging** (`auditLog()`) on every mutation endpoint, writing to the `AuditLog` table with category + severity

### HTTP + transport

- **Helmet CSP**, **HSTS with `includeSubDomains; preload`**, **X-Frame-Options DENY**, **Referrer-Policy**, **Permissions-Policy**, **X-Content-Type-Options**, **server_tokens off**
- **TLS 1.2+ enforced** for outbound HTTPS (`tls.DEFAULT_MIN_VERSION`)
- **CORS allowlist** (not wildcard), `X-CSRF-Token` explicitly listed in allowed headers

### Infrastructure

- **Tunnel-only origin** — Windows Firewall blocks inbound `80`, `3001`, and `5432` from the Internet; Cloudflare Tunnel reaches the origin over loopback only
- **PostgreSQL `listen_addresses = 'localhost'`**
- **Dedicated service account** `svc_apex` (least privilege, file ACLs scoped to `apex-platform/`), replacing `LocalSystem`
- **Dedicated runtime DB role** `apex_app` (SELECT / INSERT / UPDATE / DELETE only; no `CREATE` on `public`, no superuser); `DDL_USERNAME` / `DDL_PASSWORD` env overrides let schema pushes use a separate admin login
- **Environment variable validation** — fail-fast on missing `JWT_SECRET`, missing RSA keys, or missing DB credentials

### Observability

- **Structured JSON logger** (`utils/logger.js`) with a dedicated `security()` level that also writes to `AuditLog`
- **Correlation ids** on every 500 response for operator grep
- **NSSM stdout/stderr rotation** at 10 MB online

### Historical context

| Phase | Release | Scope |
|-------|---------|-------|
| ASRB 5.1 | v7.1 (Feb 2026) | XSS, CSP, input validation, rate limiting, audit logging, structured logs |
| SOC 2 baseline | v9.0 (Apr 2026) | RS256 + cookies + refresh + CSRF, IDOR gate, 2FA, lockout, tunnel-only, least-privilege service + DB accounts, nginx hardening, error-leak sweep |

---

## Development

### Frontend Development

```bash
cd client
npm install
npm run dev        # Vite dev server on :5173
npm run build      # Production build to ../vue/
```

After building, bump the cache version in `index.html`:
```html
<script src="/vue/apex-rooms.iife.js?v=25" defer></script>
```

### Backend Development

```bash
cd node
npm install
node server.js     # Starts on PORT from .env (default 3001)
```

### Validation

```bash
cd node && node check-reports.js    # 10-endpoint validation suite
```

---

## Deployment (Windows Server)

APEX runs as native Windows services via NSSM:

| Service | What |
|---------|------|
| APEX-Backend | Express.js on port 3001 |
| nginx | Reverse proxy on port 80 |
| postgresql-x64-16 | PostgreSQL on port 5432 |
| cloudflared | Cloudflare Tunnel |

```bash
# Restart after changes
nssm restart APEX-Backend

# Check status
nssm status APEX-Backend
```

---

## Recent Changes

### v9.0 - Security Hardening Release (April 2026)

Comprehensive security sweep ahead of first release. APEX now passes a
baseline ASRB review and meets SOC 2 CC6 / CC7 controls.

**Authentication & sessions**
- Migrated from HS256 / 7-day / localStorage → **RS256 / 15 min access + 14 d sliding refresh / httpOnly cookies**
- Opaque refresh tokens (SHA-256 hashed in `refresh_tokens`), rotation with reuse detection, `/api/auth/logout` revocation
- CSRF double-submit cookie + `X-CSRF-Token` header enforcement
- **TOTP 2FA** — `/api/auth/2fa/enroll`, `/2fa/verify-enroll`, `/verify-totp`, `/2fa/disable`; AES-256-GCM at-rest encryption, 10 bcrypt-hashed backup codes
- **Account lockout** — 5 → 15 min, 10 → 1 h, 15 → 24 h; `423` + `Retry-After`

**Authorization**
- **IDOR gate** on `/api/projects` via new `project_members` table; admins bypass, non-members get `404` (prevents project-id enumeration)

**Infrastructure & least privilege**
- New dedicated Windows service account `svc_apex` replaces `LocalSystem`
- New runtime DB role `apex_app` (CRUD only, no DDL, no superuser); `DDL_USERNAME`/`DDL_PASSWORD` env overrides for schema pushes
- PostgreSQL bound to `localhost`; backend bound to `127.0.0.1:3001`
- Windows Firewall blocks `80`, `3001`, `5432` from the Internet — origin reachable only via Cloudflare Tunnel + loopback
- **nginx hardening** — `server_tokens off`, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS `includeSubDomains; preload`, body-size + timeout caps, blocks for `.git` / `.env` / `/node/` / `/client/`

**Code quality**
- Swept 45 `details: error.message` client-side leaks, replaced with a shared `sendServerError()` helper returning `{error, correlationId}` — full stack still logged server-side under the correlation id
- Removed browser-download `?token=<jwt>` query-param path (leaked to URLs, logs, history); replaced with a `fetch` + blob helper

**Tests**
- Jest suite grew to **19 tests** including regression coverage for IDOR (non-member → 404), account lockout (6th attempt → 423 + `Retry-After`), and all existing endpoint contracts

### v8.0 - Vue 3 Migration Complete (March 2026)

- All 7 UI sections migrated from vanilla JS monolith to Vue 3 + TypeScript + Naive UI
- Monolith reduced to auth/navigation shell only
- Roles persisted to PostgreSQL (was in-memory)
- Full permission catalog (5 categories, 18 permissions)
- Admin section: working permission editor, masked DB credentials, delete confirmations, sub-tabbed settings, audit log with date filtering and CSV export
- Dark mode toggle on toolbar with localStorage persistence
- Profile section with password validation matching backend policy (12+ chars)
- New `/api/users/me` endpoint for current user profile
- DB config endpoints implemented (`/api/admin/db/config`, `/api/admin/db/test`, `/api/admin/db/create-mariadb-user`)
- 13 new database tables (Locations, Floors, RoomEquipment, RoomStandards, Contacts, etc.)
- 4 new backend route files (reports, contacts, meetings, documents)
- Service account for automated testing

### v7.1 - ASRB 5.1 Security Remediation (February 2026)

- All 6 HIGH-priority ASRB findings resolved
- DOMPurify XSS protection, Helmet CSP, express-validator, rate limiting, structured logging

### v7.0 - Vite Modularization (January 2026)

- 6,989 lines extracted into ES modules via Vite
- Centralized API client, reactive state store, UI modules

---

## License

MIT License - see [LICENSE](LICENSE)

---

**Built by [DaemonAlex](https://github.com/DaemonAlex)**

*APEX Platform v9.0 - Vue 3 + TypeScript + PostgreSQL + RS256 + TOTP 2FA*
