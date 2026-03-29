# CLAUDE.md - APEX Project Management Platform

## Core Instructions

**Always tell the truth. Never make up information or speculate.**

- Base all statements on verifiable, factual, and current information
- Explicitly state "I cannot confirm this" if something cannot be proven
- Always fully understand the current state before making changes
- Back up to `G:\My Drive\APEX Backups` before code changes
- **No em dashes ever.** Use periods, commas, or hyphens instead.
- **Database is the single source of truth.** All data lives in PostgreSQL. No localStorage, no client-side state as source of truth.

**Problem-Solving Approach:**
- Explain reasoning step-by-step
- Understand how changes affect the whole app, not just individual issues
- Use differential troubleshooting - pay attention to symptoms pointing to root cause
- If unsure, ASK - never assume or speculate

**Development Methodology (4 Phases):**
1. **INVESTIGATION** (NO changes) - Map sources, understand data flow, identify dependencies
2. **ANALYSIS & PLANNING** - List solutions, assess impact, choose least invasive option
3. **IMPLEMENTATION** - Get approval, one change at a time, test thoroughly
4. **VERIFICATION** - Test fix AND related functionality

**Testing Requirements:**
- **NEVER claim work is complete without FULL testing**
- Backend changes: Test with curl/API calls
- Frontend changes: Verify in running application
- If cannot test directly: State "UNTESTED - requires user verification"

---

## System Status (as of 2026-03-29)

### Architecture Overview

```
Internet -> Cloudflare Tunnel -> nginx (port 80) -> Express API (port 3001)
                                                  -> Static files (index.html shell)
                                                  -> Vue 3 IIFE bundle (/vue/apex-rooms.iife.js)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Naive UI + Pinia (6/6 sections migrated) |
| App Shell | Vanilla JS monolith (auth, profile, navigation, theme only) |
| Backend | Express.js (Node.js) with raw SQL + Drizzle ORM schema |
| Database | PostgreSQL 16 (apex_db) |
| Build | Vite 8 (IIFE output to `/vue/apex-rooms.iife.js`, ~2.0MB) |
| Icons | Phosphor Icons (web CDN) |
| Auth | JWT (24-hour expiration) |

### Infrastructure

| Service | Port | NSSM Name | Status |
|---------|------|-----------|--------|
| Express Backend | 3001 | APEX-Backend | Running |
| nginx | 80 | nginx | Running |
| PostgreSQL 16 | 5432 | postgresql-x64-16 | Running |
| Cloudflare Tunnel | - | cloudflared | Running |
| Vue Dev Server (development only) | 5173 | - | Use `cd client && npm run dev` |

### URLs

| URL | What |
|-----|------|
| `https://apex.daemonscripts.com` | Production (via Cloudflare tunnel -> nginx -> port 3001) |
| `https://apex.daemonscripts.com/health` | Backend health check |
| `http://apex.localhost` | Local access (via nginx) |

### Credentials

| What | Value |
|------|-------|
| Admin login | `admin@apex.local` / `***REDACTED-PASSWORD***` |
| PostgreSQL superuser | `postgres` / `***REDACTED-PASSWORD***` |
| PostgreSQL app user | `apex_user` / `***REDACTED-PASSWORD***` |
| Database | `apex_db` on localhost:5432 |
| GitHub | https://github.com/DaemonAlex/apex-platform |

---

## Major Architectural Decision: Vue 3 Migration (2026-03-28)

### Why

The 20,000+ line vanilla JS monolith in `index.html` has reached its maintainability limit. Previous attempts at modularization (Vite ES Modules, "Strangler Fig" pattern in January 2026) helped with organization but did not solve the fundamental problem: everything is in one HTML file with no component model, no type safety, and no proper state management.

### Migration Status: COMPLETE (all 6 sections)

| Section | App Component | Pinia Store | Mount Function |
|---------|--------------|-------------|----------------|
| Dashboard | DashboardApp.vue | (direct API) | `mountDashboard` |
| Projects | ProjectApp.vue | projects.ts | `mountProjects` |
| Room Status | RoomApp.vue | rooms.ts | `mountRooms` |
| Field Ops | FieldOpsApp.vue | (direct API) | `mountFieldOps` |
| Reports | ReportsApp.vue | (direct API) | `mountReports` |
| Admin | AdminApp.vue | admin.ts | `mountAdmin` |

The monolith (`index.html`) now only handles: authentication/login, profile management, app shell (navigation, sidebar, theme switching). All section content is rendered by Vue apps mounted via `mountVueSection()`.

**Mount pattern:** Each Vue app is exposed globally (e.g., `window.ApexAdmin = { mount: mountAdmin }`) and the monolith calls `mountVueSection(containerId, globalName)` when navigating to a section.

### New Frontend Stack

| Technology | Purpose |
|------------|---------|
| **Vue 3** (Composition API) | Component framework |
| **TypeScript** | Type safety |
| **Vite** | Build tool and dev server |
| **Naive UI** | Component library (tables, forms, modals, etc.) |
| **Pinia** | State management (replaces custom reactive store) |
| **Vue Router** | Client-side routing |

### New Backend Addition

| Technology | Purpose |
|------------|---------|
| **Drizzle ORM** | Type-safe PostgreSQL queries (replacing raw SQL in route files) |

Express stays as the HTTP framework. Drizzle gets added alongside existing raw queries - no big-bang rewrite of the backend.

### Directory Structure

```
F:\Server\webapps\sites\apex-platform\
  index.html                    # App shell (auth, nav, profile) + Vue mount points
  vue\
    apex-rooms.iife.js          # Built Vue bundle (~2.0MB, all 6 sections)
  client\                       # Vue 3 source
    src\
      mount.ts                  # Entry point - exports mount functions for each section
      AdminApp.vue              # Admin section (Users, Roles, Settings, Audit)
      DashboardApp.vue          # Dashboard section
      ProjectApp.vue            # Projects section (list + detail views)
      ReportsApp.vue            # Reports section (Portfolio, Budget, Timeline, MyTasks)
      RoomApp.vue               # Room Status section (Rooms, Locations, Standards)
      FieldOpsApp.vue           # Field Ops section
      stores\                   # Pinia stores
        admin.ts, projects.ts, rooms.ts, auth.ts
      composables\
        useApi.ts               # Shared API client (apiFetch with JWT)
      components\
        admin\                  # Admin tab components
          UsersTab.vue, RolesTab.vue, SettingsTab.vue, AuditLogTab.vue
          settings\             # Settings sub-tab components
            GeneralSettings.vue, NotificationSettings.vue,
            DatabaseSettings.vue, FinancialSettings.vue
        projects\               # Project tab components
      types\
        index.ts, admin.ts      # TypeScript interfaces
      views\
        RoomStatus.vue, LocationManager.vue, ProjectList.vue, ProjectDetail.vue
    vite.config.ts              # IIFE build config (output to ../vue/)
    package.json                # Vue 3.5, Naive UI 2.44, Pinia 3.0, Vite 8
  node\                         # Backend (Express + PostgreSQL)
    server.js
    db.js
    routes\                     # 15 route files
    middleware\                  # auth.js, audit.js, validate.js
    drizzle\schema.ts           # Drizzle ORM schema definitions
  src\                          # Legacy Vite modules (bridge from Jan 2026, being phased out)
```

---

## Room Status System Redesign (2026-03-28)

### New Database Schema

The room system has been redesigned from a flat room list to a managed hierarchy with equipment tracking and configurable checks.

**Tables (auto-created by `ensureRoomTables()` in room-status.js):**

| Table | Purpose |
|-------|---------|
| **Locations** | Buildings/branches (name, address, city, state, zip, contact info) |
| **Floors** | Floors within a location (location_id FK, sort_order) |
| **Rooms** | Core room records (room_id, name, type, capacity, location_id FK, floor_id FK, standard_id FK, check_frequency, check_day) |
| **RoomEquipment** | Equipment inventory per room (equipment type, model, serial, install date, warranty, notes) |
| **RoomStandards** | Templates defining expected equipment/config per room type (name, room_type, equipment list as JSONB) |
| **RoomChecks** | Audit trail of tech checks (checked_by, check_date, status, issues JSONB, snow_ticket, notes) |

### Room Types

Conference, Huddle, Boardroom, Training, Lobby, Community Room, Office, plus custom types.

### Check System

- Configurable frequency per room: daily, weekly, biweekly, monthly
- Each check records: who checked, when, pass/fail status, issue descriptions, SNOW ticket numbers
- Full audit trail - checks are never deleted, only appended
- Compliance checking: compare room equipment against its assigned standard

### Key Backend File

`F:\Server\webapps\sites\apex-platform\node\routes\room-status.js` - Contains all CRUD endpoints plus `ensureRoomTables()` auto-migration function that creates/updates all room-related tables on startup.

---

## Reports System (2026-03-28)

### What Changed

Previously there were two separate views (Reports and Insights) that were largely redundant. The old `metrics.js` and `insights.js` route files contained SQL Server stored procedure calls that were broken since the PostgreSQL migration. Both files have been deleted.

### Current State

Reports are now a single unified view with 4 tabs, backed by real PostgreSQL endpoints.

| Tab | Endpoint | What It Shows |
|-----|----------|---------------|
| Portfolio | `GET /api/reports/portfolio` | Executive summary: project counts by status, budget health, at-risk count, business line breakdown |
| Budget | `GET /api/reports/budget` | Budget vs actual across projects, over/under tracking |
| Timeline | `GET /api/reports/timeline` | Project timeline analysis, on-time delivery metrics |
| My Tasks | `GET /api/reports/my-tasks` | Current user's task assignments across all projects |

There is also a 5th endpoint for report data export.

**Backend file:** `F:\Server\webapps\sites\apex-platform\node\routes\reports.js`

---

## Completed Work (Recent, newest first)

| Date | What |
|------|------|
| 2026-03-29 | **VUE 3 MIGRATION COMPLETE.** All 6 sections (Dashboard, Projects, Room Status, Field Ops, Reports, Admin) now run on Vue 3. Admin section migrated with 11 new files, fixing broken permission editor, adding delete confirmations, masking DB credentials, eliminating duplicate navigation, splitting settings into sub-tabs, adding CSV audit export. Bundle v=20, ~2.0MB. |
| 2026-03-28 | **ARCHITECTURAL DECISION: Vue 3 migration.** Frontend moving from vanilla JS monolith to Vue 3 + TypeScript + Naive UI + Pinia + Vue Router. Backend adding Drizzle ORM. Section-by-section, starting with Room Status. |
| 2026-03-28 | Room Status system redesigned: Locations > Floors > Rooms hierarchy, equipment inventory, room standards with compliance, configurable check frequency (daily/weekly/biweekly/monthly), full audit trail with SNOW tickets |
| 2026-03-28 | Phase 1B complete: task creation streamlined to 3-field quick-add (name, phase, priority) with expandable details, dynamic phases per project type |
| 2026-03-28 | Reports merged from 2 views into 1 with 4 tabs (Portfolio, Budget, Timeline, My Tasks), backed by real PostgreSQL endpoints. Dead metrics.js and insights.js (SQL Server code) deleted. |
| 2026-03-28 | CSS consolidated: unified .apex-card system, dark mode consolidated under [data-theme="dark"] |
| 2026-03-28 | All remaining emoji replaced with Phosphor icons |
| 2026-03-28 | Dark mode: full implementation, JS toggle fix, metric icons, status badges |
| 2026-03-28 | Branding: logo configurable via window.APEX_BRAND, removed hardcoded Wintrust logo |
| 2026-03-28 | UX: removed 9 noisy notifications, fixed user dropdown "Loading..." bug |
| 2026-03-27 | Phase 1A complete: project creation streamlined from 18 fields to 5, added Telephony and UC Deployment types |
| 2026-03-27 | Server infrastructure overhaul: migrated from Docker/WSL to native Windows NSSM services |
| 2026-03-27 | APEX Platform deployed on Windows Server: PostgreSQL 16, backend on port 3001, nginx config, NSSM service |
| 2026-03-27 | Cloudflare tunnel configured: apex.daemonscripts.com -> nginx port 80 -> API port 3001 |
| 2026-01-27 | Vite ES Module modularization (Strangler Fig pattern) - all 5 phases complete |

---

## Planned Work

### Post-Migration Cleanup

- Remove dead admin JS functions from index.html (lines ~17762-19020, unreachable code)
- Consider extracting shared `themeOverrides` into a composable (currently duplicated in each App.vue)
- Migrate Profile section to Vue (last remaining monolith UI besides auth)

### Backend Improvements

- Implement DB config endpoints (`admin/db/config`, `admin/db/test`, `admin/db/create-mariadb-user`) - currently called from frontend but don't exist
- Persist roles to database instead of in-memory array in `roles.js`
- Add Drizzle ORM alongside existing raw queries for new features

### Feature Expansion

- Three report levels: Portfolio (executive), Project deep dive, Individual contributor
- View transitions between sections
- Bulk user actions in Admin
- Audit log detail view (expand rows to see full change context)

---

## Key Files Reference

| File | What |
|------|------|
| `F:\Server\webapps\sites\apex-platform\index.html` | App shell + Vue mount points (still ~19K lines, has dead code) |
| `F:\Server\webapps\sites\apex-platform\vue\apex-rooms.iife.js` | Built Vue bundle (all 6 sections, ~2.0MB) |
| `F:\Server\webapps\sites\apex-platform\client\src\mount.ts` | Vue entry point - all mount functions |
| `F:\Server\webapps\sites\apex-platform\client\src\composables\useApi.ts` | Shared API client (apiFetch) |
| `F:\Server\webapps\sites\apex-platform\node\server.js` | Express entry point |
| `F:\Server\webapps\sites\apex-platform\node\db.js` | PostgreSQL connection pool |
| `F:\Server\webapps\sites\apex-platform\node\routes\projects.js` | Project CRUD (WTB_ prefix filter) |
| `F:\Server\webapps\sites\apex-platform\node\routes\reports.js` | 5 report endpoints (real PostgreSQL) |
| `F:\Server\webapps\sites\apex-platform\node\routes\room-status.js` | Room system (6 tables, full CRUD) |
| `F:\Server\webapps\sites\apex-platform\node\routes\auth.js` | Authentication (JWT) |
| `F:\Server\webapps\sites\apex-platform\service-start.bat` | NSSM service startup script |

---

## Technical Constraints

1. **Project IDs MUST start with `WTB_`** - Backend filter: `WHERE id LIKE 'WTB_%'` in `projects.js`
2. **Field Mapping:** Frontend `estimatedBudget` maps to backend `budget`, Frontend `businessLine` maps to backend `client`
3. **Phosphor Icons only** - no emoji in the UI. CDN: `https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css`
4. **Dark mode** - all CSS must work under `[data-theme="dark"]`
5. **PostgreSQL** - all queries use PostgreSQL syntax (not SQL Server). Database is `apex_db`.
6. **NSSM services** - backend runs as Windows service `APEX-Backend`, restart with `nssm restart APEX-Backend`

---

## API Endpoints

| Route File | Base Path | Purpose |
|------------|-----------|---------|
| auth.js | `/api/auth/*` | Login, logout, register, password reset |
| projects.js | `/api/projects/*` | Project CRUD with WTB_ filter |
| users.js | `/api/users/*` | User management |
| admin.js | `/api/admin/*` | Admin operations, stats |
| reports.js | `/api/reports/*` | Portfolio, budget, timeline, my-tasks (4-tab reports) |
| room-status.js | `/api/room-status/*` | Rooms, locations, floors, equipment, standards, checks |
| attachments.js | `/api/attachments/*` | File uploads |
| audit.js | `/api/audit/*` | Audit log |
| roles.js | `/api/roles/*` | Role management |
| settings.js | `/api/settings/*` | App settings |
| fieldops.js | `/api/fieldops/*` | Field operations |

---

## User Roles

| Role | Access |
|------|--------|
| Superadmin / Admin / Owner / Root | Full access including administration |
| Project Manager | Project management capabilities |
| Field Ops | Field operations access |
| Auditor | Read-only access |

---

## Existing Vite Module Bridge (Legacy)

The `src/` directory contains ES modules from the January 2026 modularization effort. These are exposed to `window.*` for backward compatibility with the monolith:

```javascript
// src/main.js exposes modules to window for legacy code
import { formatCurrency } from './js/utils/formatters.js';
window.formatCurrency = formatCurrency;
```

Key modules in `src/js/`:
- `api/client.js` - Centralized API client with JWT injection, timeout handling, domain-specific endpoints
- `core/state.js` - Reactive state store with Actions
- `core/state-bridge.js` - Syncs legacy `window.AppState` with modern state
- `ui/auth.js` - Auth UI helpers (validation, login/logout, lockout protection)
- `ui/notifications.js` - Toast notification system
- `ui/modal.js` - Modal/dialog system
- `utils/formatters.js` - Currency, date, file size, phone formatters
- `utils/project-helpers.js` - Project calculations, filtering, sorting

This bridge pattern will be phased out as features migrate to Vue components.

---

## Troubleshooting

### Backend not responding
```bash
nssm status APEX-Backend
nssm restart APEX-Backend
curl http://localhost:3001/api/health
```

### Projects not showing
Project ID does not start with `WTB_`. Backend filters with `WHERE id LIKE 'WTB_%'`.

### Database connection issues
```bash
# Check PostgreSQL is running
sc query postgresql-x64-16
# Connect directly
psql -h localhost -U apex_user -d apex_db
```

### Public URL returning errors
Check Cloudflare tunnel, then nginx, then backend - in that order:
1. `nssm status cloudflared`
2. `nssm status nginx`
3. `nssm status APEX-Backend`

---

## Session Resume Checklist

**Last session:** 2026-03-29

**What was completed:**
- Vue 3 migration is DONE - all 6 sections migrated
- Admin section migrated with full UX improvements (11 new Vue files)
- Bundle rebuilt (v=20), backend restarted, 10/10 reports passing

**Quick resume commands:**
```bash
# Check everything works
cd F:\Server\webapps\sites\apex-platform\node && node check-reports.js

# Rebuild Vue after changes
cd F:\Server\webapps\sites\apex-platform\client && npm run build

# Bump cache (increment v=N in index.html line 20)
# <script src="/vue/apex-rooms.iife.js?v=20" defer></script>

# Restart backend
nssm restart APEX-Backend
```

**Next steps (pick any):**
1. Clean up dead admin JS from monolith (~250 lines of unreachable code)
2. Implement missing DB config backend endpoints
3. Persist roles to database instead of in-memory
4. Migrate Profile section to Vue (last monolith UI)
5. Feature work: bulk user actions, audit detail views, report drill-down

**No blockers.**

---

## Historical Notes

### Pre-Migration Architecture (before 2026-03-27)

The APEX platform originally ran on:
- **Database:** Microsoft SQL Server (in Docker container `apex-sqlserver`)
- **Infrastructure:** Docker containers on WSL (Ubuntu) at `/home/daemonalex/projects/apex-platform`
- **Backend port:** 3000 (now 3001)
- **Tunnel config:** Local `config.yml` with separate tunnel ID `129c01c2-a18a-4b13-934a-5c334eb37052`

This was all replaced with native Windows services and PostgreSQL on 2026-03-27. The Docker/WSL setup is no longer in use.

### January 2026 Modularization (Strangler Fig)

Attempted to modernize the monolith by extracting modules into `src/js/` using Vite ES Modules. All 5 phases completed (API client, CSS extraction, utilities, state management, UI modules). The modules work but the fundamental problem - 20,000+ lines in one HTML file with no component model - remained. This led to the Vue 3 migration decision.

### October 2025 Data Integrity Fixes

- Performance trends chart, team utilization chart, and DashboardAPI export were all using hardcoded/fake data. Replaced with real database calculations.
- Career Development section (hardcoded fake data) replaced with Team Performance Dashboard using real task/project data.
- Database name mismatch (`APEX_DB` vs `APEX_PROD`) caused login failures. Resolved by recreating backend container with correct env var.

### September 2025 Features

- Task attachments (mobile-optimized photo/document uploads)
- Hierarchical subtasks with progress rollup
- Security lockdown (removed all hardcoded credentials)
- Project ID format changed from `proj-` to `WTB_` prefix

---

*Last updated: 2026-03-29*
