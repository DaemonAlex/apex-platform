# Changelog

All notable changes to the APEX Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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