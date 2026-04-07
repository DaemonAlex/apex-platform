# Changelog

All notable changes to the APEX Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2026-04-07] - Docker Distribution

**Branch:** `claude/code-review-docker-setup-FES9r`

**Category:** Distribution / Deployment

**Severity/Impact:** Medium - new deployment surface, no runtime changes to the application itself.

**Summary:** Added a complete Docker distribution so APEX can be deployed on a Linux Docker host without the Windows / NSSM toolchain. Three containers (PostgreSQL 16, Express backend, nginx web tier) on a private bridge network, only the web tier publishes a host port. Includes a clean-install bootstrap script, hardened `.dockerignore` so secrets and dev-only files do not ship in the image, full handoff-ready operator documentation, and an air-gapped install path via `docker save` / `docker load`.

### Details

#### 1. Compose stack (`docker-compose.yml`) - NEW FILE

- Three services: `db` (postgres:16-alpine), `backend` (built from `docker/Dockerfile.backend`), `web` (built from `docker/Dockerfile.web`).
- Private bridge network `apex-net`. Only `web` publishes a port (`${WEB_PORT}:80`, default 8080). `backend` and `db` are unreachable from the host network.
- `:?` guards on `DB_PASSWORD` and `JWT_SECRET` - compose refuses to start if either is missing.
- Healthchecks: `pg_isready` for db, `wget` against `/health` for backend, `wget` against `/healthz` for web. `depends_on: condition: service_healthy` so the backend never starts before the db is ready.
- Named volumes `apex-db-data` and `apex-uploads` for persistent state.
- Wires `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME` into the backend container for the bootstrap script.

#### 2. Backend image (`docker/Dockerfile.backend`) - NEW FILE

- Multi-stage build: `node:20-alpine` deps stage runs `npm ci --omit=dev`, runtime stage copies the prepared `node_modules` and source.
- Non-root user `apex` (uid/gid created in the image), owns `/app` and `/app/uploads`.
- `tini` as PID 1 for proper signal handling and zombie reaping.
- Healthcheck hits `/health` directly inside the container.
- Listens on `PORT=3001` (set by compose, honored by `node/server.js`).

#### 3. Web image (`docker/Dockerfile.web`) - NEW FILE

- Two-stage build. First stage uses `node:20-alpine` to run `npm ci && npm run build` in `client/`, producing the Vue 3 IIFE bundle. Vite is configured with `outDir: '../vue'`, so the artifact lands at `/src/vue/apex-rooms.iife.js`.
- Final stage is `nginx:1.27-alpine` and copies in `index.html`, `images/`, and the freshly built Vue bundle. Default nginx site is removed.
- Healthcheck hits `/healthz`.

#### 4. nginx config (`docker/nginx.conf`) - NEW FILE

- Reverse proxies `/api/*` to `http://backend:3001` (Docker DNS) with `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` set.
- Adds security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`.
- `/vue/` served with `Cache-Control: public, max-age=2592000, immutable` (cache-busted by `?v=` query in `index.html`).
- `/` and `index.html` served with `Cache-Control: no-store, no-cache, must-revalidate` so version bumps take effect on first request.
- `/healthz` returns plain text `ok` with `access_log off` for load-balancer probes.
- `client_max_body_size 25m` to allow attachment uploads.

#### 5. Initial admin bootstrap (`node/seed-admin.js`) - NEW FILE

- Standalone script intended to be run once on first deploy: `docker compose exec backend node seed-admin.js`.
- Reads `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, and optional `INITIAL_ADMIN_NAME` from environment variables.
- Validates the password against the same rules as the rest of the codebase: min 12 chars, mixed case, digit, special character, no triple-repeated characters, no common sequences.
- Creates the `Users` table (and migration columns) if it does not exist - schema kept in sync with the lazy-init in `node/routes/auth.js`.
- **Idempotent and safe to re-run.** Refuses to do anything if any user already exists, which prevents accidental privilege escalation by re-running with a different password on a populated DB.
- bcrypt cost factor 12, matching the rest of the codebase. Sets the 60-day password expiration timestamp.
- Provides a clean-install path with no test data (the existing `seed-demo.js` is destructive and seeds 600+ rows of fictional projects).

#### 6. Hardened `.dockerignore` - NEW FILE

- Excludes `**/.env` and `**/.env.*` at any depth (the previous root-only `.env` pattern would have leaked `node/.env` into the backend image, which contained the dev DB password, JWT secret, and real Cisco OAuth client credentials).
- Excludes `**/tests/`, `**/__tests__/`, `**/*.test.js`.
- Excludes `node/check-reports.js` (dev tool with hardcoded service-account credentials, not a production runtime requirement).
- Excludes `node/seed-fieldops.sql` (test data).
- Excludes `node/uploads/`, `node/logs/`, `node/backups/`, `client/dist`, `**/node_modules`, IDE folders.
- Keeps `README.md` and `docker/README.md` for documentation; excludes other markdown.

#### 7. Environment template (`.env.example`) - NEW FILE

- Documents every variable the compose stack and bootstrap script consume.
- Includes generation hints (`openssl rand -base64 24` for `DB_PASSWORD`, `openssl rand -base64 48` for `JWT_SECRET`).
- `INITIAL_ADMIN_*` variables are present so a fresh deploy has a working bootstrap path.

#### 8. Operator documentation (`docker/README.md`) - NEW FILE

- Quick start (clean install, no test data).
- Optional demo data load with explicit warning that `seed-demo.js` is destructive.
- Backup procedures (logical `pg_dump` and file-system snapshots) and a tested restore procedure.
- Reverse proxy / TLS examples for external nginx and Cloudflare Tunnel.
- Air-gapped install via `docker save | gzip` on a connected build machine and `docker load` on the target.
- Update path for both connected and air-gapped hosts.
- Day-2 operations (logs, restart, shell, stop, destroy).
- Security checklist (8 items covering secrets, firewall, backups, base image patching, TLS).
- Troubleshooting for the common failure modes (missing env vars, healthcheck races, 502 on `/api`, upload permissions, the benign field-ops migration log).

#### 9. Lock file fix (`client/package-lock.json`)

- Regenerated to add `@emnapi/core@1.9.2`, `@emnapi/runtime@1.9.2`, and bump `@emnapi/wasi-threads` to `1.2.1`. The committed lock file was out of sync with `package.json`, which made `npm ci` in the web image build fail with `EUSAGE`. No source changes.

#### 10. Main README (`README.md`)

- Added a "Quick Start (Docker)" section pointing at `docker/README.md` for the full operator instructions. The existing bare-metal quick-start is preserved as "Quick Start (Bare Metal)".

### Verification

- `docker compose build` produces both `apex-backend:latest` and `apex-web:latest` images.
- Vue bundle compiles cleanly inside the build container: `apex-rooms.iife.js` 2,320,649 bytes / gzip 645 kB, no TypeScript errors.
- All three containers reach `healthy` state within ~30 seconds of `docker compose up -d`.
- Verified endpoints: `/healthz` (nginx), `/health` (backend via proxy), `/` (index.html, no-store), `/vue/apex-rooms.iife.js` (immutable cache), `POST /api/auth/login` (proxy round-trip with validation response).
- Verified `/app/.env` is no longer present inside the backend image after the `.dockerignore` fix.
- Verified `seed-admin.js` against a fresh DB: creates the admin, refuses to run a second time with the user-already-exists message, password validation rejects weak inputs.
- Verified non-root `apex` user can write to `/app/uploads`.

### Out of scope for this change

- The pre-existing `POST /api/auth/register` endpoint is unauthenticated and accepts a `role` from the request body. Any client that can reach the API can create themselves as `superadmin` / `owner` / `admin`. This is an application-layer issue, not docker-specific, and is documented separately for follow-up.
- The pre-existing field-ops migration race that logs `relation "fieldops" does not exist` on every backend startup. Benign, table is created lazily on first request.

---

## [2026-03-31] - Cisco Control Hub Integration

**Commit:** 1ee7338 on branch `main` - https://github.com/DaemonAlex/apex-platform.git

**Category:** Integration / Architecture

**Severity/Impact:** Medium

**Summary:** Added a full Cisco Control Hub integration to the APEX platform, spanning a secure OAuth2 API client, a mock development environment, new authenticated Express routes, and a Naive UI Vue 3 dashboard component. Cisco credentials are sourced exclusively from environment variables. CORS and route registration in server.js were updated to support the new integration.

---

### Details

#### 1. Backend - Cisco OAuth2 API Client (`node/routes/ciscoClient.js`) - NEW FILE

- New module that authenticates with Cisco Control Hub using OAuth2 client credentials flow.
- TLS hardened via Node.js `secureOptions` with `SSL_OP_NO_TLSv1` and `SSL_OP_NO_TLSv1_1` flags and `minVersion: 'TLSv1.2'` set on the HTTPS agent - TLS 1.0 and 1.1 are explicitly rejected.
- Wraps four Cisco Control Hub API endpoint groups:
  - Organization info
  - Locations
  - Devices (including status)
  - Workspaces
- All credentials sourced from environment variables: `CISCO_CLIENT_ID`, `CISCO_CLIENT_SECRET`, `CISCO_ORG_ID`. No secrets are committed to the repository.

#### 2. Backend - Cisco Mock Environment (`node/routes/ciscoMockData.js`, `node/routes/ciscoMock.js`) - NEW FILES

- Before state: no mock capability; live Cisco credentials were required for any local development touching Cisco data.
- After state: setting the environment variable `CISCO_USE_MOCK=true` switches the Cisco client to return static fixture data from `ciscoMockData.js` via the mock driver in `ciscoMock.js`.
- Allows local development and testing without live Cisco credentials or VPN access to the Control Hub.

#### 3. Backend - Express Routes (`node/routes/cisco.js`) - NEW FILE

- New route file mounting the Cisco API surface at `/api/cisco/*`.
- All routes protected behind the existing `authenticateToken` middleware (JWT), consistent with every other protected route in the application.
- Endpoint groups exposed: org info, locations, devices, workspaces.

#### 4. Frontend - Cisco Dashboard Component (`client/src/CiscoApp.vue`) - NEW FILE

- New Vue 3 + Naive UI dashboard component following the established section mount pattern used by all seven existing sections (Dashboard, Projects, Room Status, Field Ops, Reports, Admin, Profile).
- Displays: organization overview, location summary, device status counts, workspace utilization.
- Exposed globally as `window.ApexCisco` for mounting by the monolith shell via the existing `mountVueSection()` pattern.

#### 5. Frontend - Mount Entry Point (`client/src/mount.ts`) - MODIFIED

- Before state: exported `mountDashboard`, `mountProjects`, `mountRooms`, `mountFieldOps`, `mountReports`, `mountAdmin`, `mountProfile` (7 mount functions).
- After state: adds `mountCisco` export and registers `window.ApexCisco` global, bringing the total to 8 mounted sections.
- Vite library name (`ApexBundle`) is unchanged, preserving the fix from 2026-03-29 that prevents the IIFE return value from overwriting individual window globals.

#### 6. Backend - Server Entry Point (`node/server.js`) - MODIFIED

- Cisco routes (`node/routes/cisco.js`) registered with the Express app.
- CORS `allowedMethods` updated: `PATCH` added to the list of allowed HTTP methods.
- Before state (CORS methods): `GET, POST, PUT, DELETE, OPTIONS`
- After state (CORS methods): `GET, POST, PUT, DELETE, PATCH, OPTIONS`

---

**Rationale:** The APEX platform manages AV/UC rooms, devices, and workspaces. Cisco Control Hub is the primary management plane for Cisco collaboration devices across those environments. Surfacing live org, device-status, and workspace-utilization data inside APEX eliminates the need to context-switch to the Control Hub portal for routine operational checks and supports future compliance and reporting workflows.

**Dependencies/Side Effects:**
- The NSSM `APEX-Backend` service must be restarted after deploying for new routes to register: `nssm restart APEX-Backend`.
- The Vue bundle must be rebuilt and the cache-bust version parameter in `index.html` incremented before the Cisco dashboard is visible in the browser: `cd client && npm run build`, then bump `?v=N` on the IIFE script tag.
- Three new environment variables must be present in the backend environment before the live client will function: `CISCO_CLIENT_ID`, `CISCO_CLIENT_SECRET`, `CISCO_ORG_ID`. Without them, set `CISCO_USE_MOCK=true` to use the mock environment.
- The CORS `PATCH` addition is additive and does not affect existing route behavior.

**Rollback Plan:**
1. Revert commit 1ee7338: `git revert 1ee7338`.
2. Rebuild the Vue bundle: `cd client && npm run build`.
3. Increment the bundle cache-bust version in `index.html`.
4. Restart the backend service: `nssm restart APEX-Backend`.
5. Remove `CISCO_CLIENT_ID`, `CISCO_CLIENT_SECRET`, `CISCO_ORG_ID`, and `CISCO_USE_MOCK` from the environment if desired.

**Related Entries:**
- 2026-03-29 - Vue 3 Migration Complete: establishes the `window.ApexX` mount pattern and `mountVueSection()` integration this feature follows.
- 2026-03-28 - Architectural Decision: Vue 3 Migration: defines the component, store, and mount patterns CiscoApp.vue conforms to.
- 2026-03-29 - Dark Mode Toolbar Toggle / useTheme composable: CiscoApp.vue should import `useTheme()` from `client/src/composables/useTheme.ts` for consistent dark/light mode support (verify and add if not already present).

---

## [7.0.0] - 2026-01-27

### Major Refactoring - ES Module Architecture

**Complete modularization of the monolithic codebase using Vite and ES Modules.**

#### Added
- **Vite Build System**
  - Hot Module Replacement (HMR) for development
  - ES Module support with tree-shaking
  - API proxy configuration for development
  - Production build optimization

- **New Modular Architecture**
  - `src/js/api/client.js` - Centralized API client with JWT management (281 lines)
  - `src/js/core/config.js` - Application configuration and feature flags
  - `src/js/core/state.js` - Reactive state management store
  - `src/js/core/state-bridge.js` - Legacy-to-modern state synchronization (228 lines)
  - `src/js/ui/auth.js` - Authentication UI with password strength validation (354 lines)
  - `src/js/ui/notifications.js` - Toast notification system (308 lines)
  - `src/js/ui/modal.js` - Modal/dialog component system (389 lines)
  - `src/js/utils/formatters.js` - General utility functions (209 lines)
  - `src/js/utils/project-helpers.js` - Project-specific helpers (408 lines)

- **CSS Extraction**
  - 4,471 lines of CSS extracted to `src/css/main.css`
  - Maintains backward compatibility with legacy code

- **Developer Experience**
  - `npm run dev` - Start Vite development server
  - `npm run build` - Production build
  - `npm run preview` - Preview production build
  - `APEX_migrationStatus()` - Console command for migration status

#### Changed
- **API Client**
  - Centralized fetch wrapper with automatic JWT injection
  - Request timeout handling (30s default, 2min for uploads)
  - Domain-specific endpoints (authApi, projectsApi, usersApi, adminApi, attachmentsApi)
  - Automatic token refresh and session management

- **State Management**
  - Bridge pattern syncs legacy `window.AppState` with new modular state
  - Reactive subscriptions for state changes
  - Feature flag controlled rollout (`FEATURES.USE_NEW_STATE`)

- **UI Components**
  - New notification system with toast animations
  - Enhanced modal system with stacking support
  - Password strength indicator with real-time feedback
  - Lockout protection for failed login attempts

#### Fixed
- **Connection Pool Bug** - Fixed `pool.close()` issue in all route files that was closing database connections prematurely
  - Affected files: auth.js, projects.js, users.js, admin.js, audit.js, room-status.js
  - Connections now properly reused via pooling

#### Technical
- **Total Lines Extracted:** 6,989 lines from monolithic index.html
- **Migration Pattern:** "Strangler Fig" - gradual extraction while maintaining compatibility
- **Legacy Bridge:** All new modules exposed to `window.*` for backward compatibility

---

## [1.0.0] - 2025-09-07

### Added
- **Complete Field Operations Management**
  - Advanced scheduling system with calendar integration
  - Reschedule management with comprehensive reason tracking
  - Work order management (Installation, Commissioning, Break/Fix, Maintenance)
  - Resource planning and technician coordination
  - Mobile-friendly interface for field teams

- **Productivity Monitoring System**
  - Real-time activity tracking and focus monitoring
  - Personal insights dashboard with productivity analytics
  - Early warning systems for project risks and burnout detection
  - Team performance tracking and collaboration metrics

- **Enhanced Executive Reporting**
  - Advanced filtering system with executive-focused terminology
  - Pipeline visibility and strategic oversight metrics
  - Improved visual indicators and status reporting
  - Custom report generation with multiple export formats

- **Comprehensive Security Implementation**
  - XSS protection with HTML escaping for all user inputs
  - Comprehensive audit logging for all user activities
  - Role-based access control with granular permissions
  - Secure authentication with JWT token support

- **Data Management Enhancements**
  - Browser localStorage as primary data storage
  - Optional backend database integration with MariaDB
  - Automatic data validation and migration system
  - Export/import functionality with JSON, Excel, PDF, and CSV formats

### Security
- **Critical XSS Vulnerability Fixed**: All user-provided data now properly escaped
- **Audit Logging**: Complete activity trail for compliance and security monitoring
- **Input Validation**: Client and server-side validation for all data inputs
- **Session Management**: Secure authentication and session handling

### Technical
- **Single-Page Application**: Complete platform in one HTML file
- **Offline Capability**: Full functionality without internet connection
- **Mobile Responsive**: Optimized for all device sizes
- **CDN Dependencies**: Fast loading from global CDNs
- **Browser Compatibility**: Works on all modern browsers

### Infrastructure
- **Nginx Hosting**: Production-ready web server configuration
- **HTTPS Support**: SSL/TLS encryption with security headers
- **Backend Integration**: Optional Node.js API for enhanced features
- **Database Support**: MariaDB/MySQL integration when backend enabled

## [0.9.0] - Previous Version

### Features (Legacy)
- Basic project management functionality
- Task creation and assignment
- Simple reporting capabilities
- Local storage data persistence

---

## Release Notes

### Breaking Changes in 1.0.0
- Updated data structure for enhanced field operations
- Security improvements may require data validation
- Configuration changes for backend integration

### Migration Guide
- All existing localStorage data will be automatically migrated
- Review security settings for role-based access
- Update any custom integrations to use new API endpoints

### Known Issues
- None currently identified

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

**For detailed technical documentation, see the [documentation folder](docs/).**