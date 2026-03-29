# APEX Platform - AV/UC Project Management System

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-8.0-green.svg)](#)
[![Security](https://img.shields.io/badge/security-ASRB%205.1%20Compliant-brightgreen.svg)](#)
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
| Auth | JWT (24-hour expiration, bcrypt password hashing) |
| Icons | Phosphor Icons (web CDN) |
| Hosting | Windows Server 2022, NSSM services, Cloudflare Tunnel |

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

## Quick Start

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
# Create node/.env
cat > node/.env << 'EOF'
DB_USERNAME=apex_user
DB_PASSWORD=<your-secure-password>
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=apex_db
JWT_SECRET=<64-character-hex-secret>
NODE_ENV=production
PORT=3001
EOF
```

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set Up Database

```bash
# Create database and user
psql -U postgres -c "CREATE DATABASE apex_db;"
psql -U postgres -c "CREATE USER apex_user WITH PASSWORD 'your-password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE apex_db TO apex_user;"
```

Tables are auto-created on first backend startup (rooms, roles, audit log, settings, etc.).

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

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@example.com","password":"YourSecurePassword123!","role":"superadmin"}'
```

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
| auth.js | `/api/auth/*` | Login, register, password reset |
| projects.js | `/api/projects/*` | Project CRUD (WTB_ prefix filter) |
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

---

## Security

### ASRB 5.1 Compliant (February 2026)

All 6 HIGH-priority findings from the Application Security Review Board audit have been resolved:

- **ASRB 5.1.1** - XSS Protection: DOMPurify + centralized escapeHtml, 65+ injection points fixed
- **ASRB 5.1.2** - Content Security Policy: Helmet with strict CSP directives
- **ASRB 5.1.3** - Input Validation: express-validator on all routes, parameterized queries
- **ASRB 5.1.4** - Rate Limiting: Auth-specific (15 req/15min) + global (500 req/15min)
- **ASRB 5.1.5** - Audit Logging: Auto-triggered middleware on all critical routes
- **ASRB 5.1.6** - Security Logging: Structured JSON logger for SIEM integration

### Additional Security

- JWT authentication with 24-hour expiration
- Password policy: 12+ characters, uppercase, lowercase, number, special character
- 60-day password rotation
- Role-based access control (7 roles: superadmin, admin, owner, project_manager, field_ops, auditor, viewer)
- System roles cannot be deleted or renamed
- Environment variable validation (fail-fast on missing credentials)

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

*APEX Platform v8.0 - Vue 3 + TypeScript + PostgreSQL*
