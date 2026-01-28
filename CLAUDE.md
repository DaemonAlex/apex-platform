# CLAUDE.md - APEX Project Management System

## 🎯 PROMPT: Core Instructions

**Always tell the truth. Never make up information or speculate.**

- Base all statements on verifiable, factual, and current information
- Cite sources transparently
- Explicitly state "I cannot confirm this" if something can't be proven
- Maintain objectivity - remove personal bias
- Always fully understand the current state before making changes
- Back up to `G:\My Drive\APEX Backups` before code changes

**Problem-Solving Approach:**
- Explain reasoning step-by-step
- Understand how changes affect the whole app, not just individual issues
- Use differential troubleshooting - pay attention to symptoms pointing to root cause
- Present information clearly with next steps
- If unsure, ASK - never assume or speculate

**Development Methodology (4 Phases):**
1. **INVESTIGATION** (NO changes) - Map sources, understand data flow, identify dependencies
2. **ANALYSIS & PLANNING** - List solutions, assess impact, choose least invasive option
3. **IMPLEMENTATION** - Get approval, one change at a time, test thoroughly
4. **VERIFICATION** - Test fix AND related functionality

**Testing Requirements:**
- **NEVER claim work is complete without FULL testing**
- Test changes yourself before claiming they work
- Backend changes: Test with curl/API calls
- Frontend changes: Verify in running application
- If can't test directly: State "UNTESTED - requires user verification on [platform]"

**Stop Immediately When:**
- Making assumptions without verification
- User says "nothing changed" after modifications
- Moving too fast to think through consequences
- About to modify multiple files simultaneously

---

## 📊 CURRENT STATE (as of January 27, 2026)

### ✅ System Status: OPERATIONAL (v7.0 Modular)

**Infrastructure:**
- Cloudflared Tunnel: ✅ Running (4 connections, tunnel ID: 129c01c2-a18a-4b13-934a-5c334eb37052)
- nginx (APEX app): ✅ Running on port 80 (apex.daemonscripts.com)
- nginx (Portfolio): ✅ Running on port 8080 (daemonscripts.com)
- Node.js (backend): ✅ Running on port 3000
- SQL Server: ✅ Running on port 1433
- Vite Dev Server: ✅ Available on port 5173 (development)
- Public URLs:
  - https://daemonscripts.com → ✅ Portfolio site (port 8080)
  - https://apex.daemonscripts.com → ✅ APEX app (port 80)

**Active Features:**
- Project management with WTB_ prefix IDs
- Hierarchical subtasks with progress rollup
- Task attachments (mobile-optimized photo/document uploads)
- Database-only authentication (no hardcoded credentials)
- JWT tokens with 24-hour expiration
- **Modular ES Module architecture (v7.0)**
- State bridge for legacy/modern sync
- New UI modules (auth, notifications, modal)

**Key Technical Constraints:**
1. **Project IDs MUST start with `WTB_`** - Backend filter: `WHERE id LIKE 'WTB_%'` (node/routes/projects.js:53)
2. **Field Mapping:** Frontend `estimatedBudget` → Backend `budget`, Frontend `businessLine` → Backend `client`
3. **Modular Architecture:** Now using Vite + ES Modules (all phases complete)
4. **Default Admin:** `admin@apex.local` / `ApexAdmin2026!`

---

## 🏗️ MODULARIZATION PROJECT (Started January 27, 2026)

### Overview
Converting the 18,000+ line monolithic `index.html` to a modern ES Module architecture using Vite. Using the **"Strangler Fig" pattern** - gradually extracting pieces while keeping the main app running.

### Why Vite?
- Zero configuration needed
- Blazing fast Hot Module Replacement (HMR)
- Native ES Module support
- Future-ready for React/Vue migration

### Current Progress

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Setup & Infrastructure (Vite, directory structure) |
| Phase 2a | ✅ Complete | API Client (centralized fetch wrapper) |
| Phase 2b | ✅ Complete | CSS Extraction (4,471 lines → src/css/main.css) |
| Phase 2c | ✅ Complete | Utility Functions (formatters, project helpers) |
| Phase 3 | ✅ Complete | State Management (Bridge pattern for sync) |
| Phase 4 | ✅ Complete | UI Modules (Auth, Notifications, Modal) |
| Phase 5 | ✅ Complete | Full Migration (legacy→module bridges) |

### ⚠️ v7.1 Priority Areas

While v7.0 is production-ready, these gaps should be addressed in the next iteration:

| Priority | Area | Risk | Action |
|----------|------|------|--------|
| 🔴 Critical | **Testing** | Manual verification only; no regression protection for financial data | Add Jest + Supertest, target 80% coverage |
| 🔴 Critical | **XSS + Cookies** | localStorage JWTs vulnerable to XSS (82 innerHTML instances) | DOMPurify + httpOnly cookies (must ship together) |
| 🟡 High | **State Management** | Custom reactive store will become brittle as app grows | Plan React/Vue migration or adopt Redux/Zustand |

### Directory Structure
```
/apex-platform
├── index.html              # Original monolith (still works)
├── package.json            # Updated with Vite
├── vite.config.js          # Dev server + API proxy config
└── src/
    ├── main.js             # Bridge entry point (exposes to window.*)
    ├── css/
    │   └── main.css        # Extracted CSS (4,471 lines)
    └── js/
        ├── api/
        │   └── client.js   # Centralized API client with auth
        ├── core/
        │   ├── config.js   # App configuration & feature flags
        │   ├── state.js    # Reactive state store with Actions
        │   └── state-bridge.js  # Syncs legacy ↔ modern state
        ├── ui/
        │   ├── index.js    # UI module exports
        │   ├── auth.js     # Auth UI helpers (validation, login/logout)
        │   ├── notifications.js  # Toast notifications system
        │   └── modal.js    # Modal/dialog system
        └── utils/
            ├── formatters.js       # General utilities (209 lines)
            └── project-helpers.js  # Project-specific helpers (408 lines)
```

### Running the Application

**Development (Vite - recommended):**
```bash
cd /home/daemonalex/projects/apex-platform
npm run dev
# Access at http://localhost:5173
```

**Production (nginx):**
```bash
# Uses Docker containers on port 80
# Access at http://localhost
```

### New API Client Features
Located in `src/js/api/client.js`:
- Automatic JWT token injection
- Request timeout handling (30s default, 2min for uploads)
- Centralized error handling with `ApiError` class
- Auth event dispatching (`auth:unauthorized`, `auth:logout`)
- Domain-specific endpoints:
  - `authApi.login()`, `authApi.logout()`, `authApi.register()`
  - `projectsApi.getAll()`, `projectsApi.create()`, `projectsApi.update()`
  - `usersApi.getAll()`, `usersApi.getCurrent()`
  - `adminApi.getStats()`, `adminApi.getUsers()`
  - `attachmentsApi.upload()`, `attachmentsApi.getForTask()`

### Extracted Utility Functions
All exposed to `window.*` for backward compatibility:

**Formatters (src/js/utils/formatters.js):**
- `formatCurrency()`, `formatDate()`, `formatDateTime()`, `formatRelativeTime()`
- `formatPercentage()`, `formatFileSize()`, `formatPhoneNumber()`
- `truncateText()`, `capitalize()`, `toTitleCase()`
- `debounce()`, `throttle()`, `deepClone()`, `isEmpty()`
- `generateId()`, `generateProjectId()` (with WTB_ prefix)

**Project Helpers (src/js/utils/project-helpers.js):**
- `getTasks()`, `normalizeProject()`, `toArrayMaybe()`
- `calculateProjectProgress()`, `calculateProjectStatus()`
- `calculateProjectHealth()`, `calculateTaskAggregates()`
- `getProgressColor()`, `getRagColor()`, `getStatusColor()`
- `formatStatus()`, `formatProjectType()`, `formatBusinessLine()`
- `sortProjects()`, `filterProjectsBySearch()`, `filterProjectsByStatus()`
- `getProjectStats()`, `getDefaultTasksForType()`

### The "Bridge" Pattern
During migration, all new modules are exposed to `window.*` so legacy code continues to work:
```javascript
// In src/main.js
import { formatCurrency } from './js/utils/formatters.js';
window.formatCurrency = formatCurrency; // Legacy code can still use it
```

### Next Steps (Phase 3)
1. **Enable new state management** - Set `FEATURES.USE_NEW_STATE = true` in config.js
2. **Migrate API calls** - Replace `fetch('/api/...')` calls with `api.get()`, `projectsApi.getAll()`, etc.
3. **Extract UI modules** - Auth (login/logout), Dashboard, Project List

### Key Files to Understand
- `src/main.js` - Entry point, imports all modules, exposes to window
- `src/js/core/config.js` - Feature flags control migration rollout
- `vite.config.js` - API proxy configuration for development

### Testing the Modules
```bash
# Check if modules load
curl http://localhost:5173/src/main.js | head -20

# Check CSS extraction
curl http://localhost:5173/src/css/main.css | head -20

# Verify API proxy works
curl http://localhost:5173/api/health
```

### Migration Status Command
Run in browser console to see module status:
```javascript
APEX_migrationStatus()
// Shows: modules loaded, lines extracted, legacy overrides
```

### Known Issues
- CSS remains in index.html AND src/css/main.css during transition (intentional for production compatibility)
- `pool.close()` bug fixed in ALL route files (auth.js, projects.js, users.js, admin.js, audit.js, room-status.js) - connection pool stays open for reuse

### State Bridge Pattern (Phase 3)

The State Bridge (`src/js/core/state-bridge.js`) syncs the legacy `window.AppState` with the new modular `AppState`:

**How it works:**
1. Legacy code continues to modify `window.AppState` directly
2. Key state changes call `window.notifyStateChange(key, value)` to sync to modern state
3. Modern state changes automatically sync back to legacy state
4. Both remain in sync during the transition period

**Integration points in index.html:**
- `loginUser()` - notifies on user login
- `logout()` - notifies on user logout
- `loadProjectsFromBackend()` - notifies when projects are loaded
- `deleteProject()` - notifies when projects are deleted

**Using in new code:**
```javascript
// Modern modules can use the new state directly
import { AppState, Actions } from './js/core/state.js';

// Get state
const projects = AppState.get('projects');
const user = AppState.get('currentUser');

// Update state (automatically syncs to legacy)
Actions.setProjects(newProjects);
Actions.setUser(newUser);

// Subscribe to changes
AppState.subscribe('projects', (newProjects, oldProjects) => {
  console.log('Projects changed:', newProjects.length);
});
```

### UI Modules (Phase 4)

**Auth Module (`src/js/ui/auth.js`):**
- `validateEmail(email)` - Validate email format
- `validatePassword(password)` - Check password requirements, returns `{ isValid, errors, strength }`
- `calculatePasswordStrength(password)` - Returns 0-100 score
- `getPasswordStrengthLabel(strength)` - Returns `{ label, color }`
- `login(email, password)` - Async login with lockout protection
- `logout()` - Clear auth state
- `requestPasswordReset(email)` - Send reset email
- `resetPassword(token, email, newPassword)` - Complete reset
- `isAuthenticated()` - Check session validity
- `getAuthState()` - Get full auth UI state

**Notifications Module (`src/js/ui/notifications.js`):**
```javascript
// Show notifications
Notifications.success('Project saved!');
Notifications.error('Failed to load');
Notifications.warning('Unsaved changes');
Notifications.info('Loading...');

// Confirm dialog
const confirmed = await Notifications.confirm('Delete this project?', {
  title: 'Confirm Delete',
  type: 'danger'
});
```

**Modal Module (`src/js/ui/modal.js`):**
```javascript
// Create custom modal
const modal = Modal.create({
  title: 'Edit Project',
  content: '<form>...</form>',
  buttons: [
    { label: 'Cancel', onClick: (m) => m.close() },
    { label: 'Save', primary: true, onClick: handleSave }
  ]
});

// Built-in dialogs
await Modal.alert('Operation complete');
const name = await Modal.prompt('Enter project name:');
```

---

## 🖥️ LOCAL DEV ENVIRONMENT (WSL)

### Location
- **Path:** `/home/daemonalex/projects/apex-platform`
- **Windows equivalent:** `\\wsl$\Ubuntu\home\daemonalex\projects\apex-platform`

### Running Services (Local Dev)

| Service | Port | Command |
|---------|------|---------|
| Vite Dev Server | 5173 | `npm run dev` |
| Node.js Backend | 3000 | `cd node && npm start` |
| SQL Server | 1433 | Docker container `apex-sqlserver` |
| nginx | 80 | Docker container `apex-nginx` |

### Database Credentials (Local Dev)
```
Host: localhost
Database: APEX_DB
User: SA
Password: ApexDemo2026Secure
```

### Admin Login (Local Dev)
```
Email: admin@apex.local
Password: ApexAdmin2026!
```

### Quick Start Commands
```bash
# Start SQL Server (if not running)
sg docker -c 'docker start apex-sqlserver'

# Start backend
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
cd /home/daemonalex/projects/apex-platform/node
node server.js &

# Start Vite dev server
cd /home/daemonalex/projects/apex-platform
npm run dev

# Or start nginx for production mode
sg docker -c 'docker start apex-nginx'
```

---

## 🔧 CLOUDFLARED TUNNEL - IMPORTANT NOTES

**DO NOT panic about tunnel errors in logs during container restarts.**

**Current Working Configuration:**
- Config: `C:\Users\stor0\.cloudflared\config.yml`
- Command: `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run daemonscripts-apex`
- Running as: Process (not Windows service)

**How to Check Tunnel Status:**
1. **Test accessibility:** `curl -I https://daemonscripts.com` (should return 200 OK)
2. **Check connections:** Look for "Registered tunnel connection" in logs (4 connections = healthy)
3. **Local nginx:** `curl -I http://127.0.0.1:80` (should return 200 OK)

**Normal Behavior:**
- Tunnel logs will show temporary connection errors during container restarts
- Errors like "dial tcp 127.0.0.1:80: connectex: No connection could be made" are NORMAL when containers restart
- If tunnel shows 4 registered connections, it's working fine
- Tunnel automatically recovers when nginx becomes accessible again

**If Tunnel Actually Down (HTTP 530 errors on public URL):**
- Restart manually: `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run daemonscripts-apex`
- Or use Task Scheduler to auto-start at boot

**Ingress Configuration (Cloudflare Zero Trust Dashboard):**
- daemonscripts.com → http://127.0.0.1:8080 (portfolio nginx)
- www.daemonscripts.com → http://127.0.0.1:8080 (portfolio nginx)
- apex.daemonscripts.com → http://127.0.0.1:80 (APEX nginx)
- api.daemonscripts.com → http://localhost:3000 (backend)
- admin.daemonscripts.com → http://localhost:8080
- dev.daemonscripts.com → http://localhost:5173
- health.daemonscripts.com → http://localhost:8080

**NOTE:** Tunnel configuration is managed in Cloudflare Zero Trust dashboard under "Public Hostnames". Local config.yml file is NOT used when dashboard configuration exists.

---

## 🐳 DOCKER CONTAINERS

### Quick Commands

```bash
# Check status
docker ps -a | findstr apex

# Restart containers
docker restart apex-nginx-prod
docker restart apex-node-prod

# Check logs
docker logs apex-node-prod --tail 30

# Health check
curl http://localhost/api/health
```

### Container Details
- **apex-nginx-prod:** APEX app web server, port 80, volume: C:/DEV:/usr/share/nginx/html
- **daemonscripts-portfolio:** Portfolio website, port 8080, volume: C:/DEV/portfolio:/usr/share/nginx/html
- **apex-node-prod:** Backend API, port 3000, volume: C:/DEV:/app
- **sqlserver-prod:** Database, port 1433, named volume for persistence
- **Network:** apex-network

### Emergency Recovery
See "Container Architecture & Emergency Procedures" section at bottom of document.

---

## 📅 CHANGE HISTORY

### January 27, 2026 - Modularization Project Kickoff

#### **🏗️ Major Architecture Refactoring Started**

**Goal:** Convert 18,000+ line monolithic index.html to modern ES Module architecture using Vite.

**Work Completed:**

1. **Environment Setup (WSL)**
   - Moved project to native Linux filesystem: `/home/daemonalex/projects/apex-platform`
   - Installed Node.js 20 via nvm
   - Set up Docker containers (SQL Server, nginx) on apex-network

2. **Vite Build System**
   - Installed Vite 7.3.1
   - Created `vite.config.js` with API proxy to backend
   - Added npm scripts: `dev`, `build`, `preview`

3. **Module Structure Created**
   ```
   src/
   ├── main.js                    # Bridge entry point
   ├── css/main.css               # 4,471 lines extracted
   └── js/
       ├── api/client.js          # Centralized API (281 lines)
       ├── core/config.js         # App configuration
       ├── core/state.js          # Reactive state management
       └── utils/
           ├── formatters.js      # General utilities (209 lines)
           └── project-helpers.js # Project helpers (408 lines)
   ```

4. **API Client Features**
   - Automatic JWT token injection
   - Request timeouts
   - Centralized error handling
   - Domain-specific endpoints (authApi, projectsApi, usersApi, adminApi)

5. **Bug Fixes**
   - Fixed `pool.close()` issue in ALL route files (auth.js, projects.js, users.js, admin.js, audit.js, room-status.js) that was closing database connections after each request

**Total Lines Extracted:** ~5,369

**Services Running:**
- Vite Dev Server: http://localhost:5173
- Node.js Backend: http://localhost:3000
- nginx: http://localhost:80
- SQL Server: localhost:1433

**Local Dev Credentials:**
- Admin: `admin@apex.local` / `ApexAdmin2026!`
- Database: SA / ApexDemo2026Secure

**Next Session:** Continue with Phase 3 (State Management migration)

---

### October 3, 2025 - Database Name Mismatch Resolution

#### **🐛 Critical Issue: Login Failure Due to Database Configuration Mismatch**

**Symptoms:**
- Users unable to log in to APEX application
- Backend returned: `Login failed for user 'sa'` with reason `Failed to open the explicitly specified database 'APEX_DB'`
- All containers reported as "up" but authentication was broken

**Root Cause Analysis:**

1. **Database Name Discrepancy:**
   - SQL Server database: `APEX_PROD` (created September 23, 2025)
   - Backend container environment: `DB_DATABASE=APEX_PROD` (incorrect)
   - **Timeline:** Backend container was recreated at some point without matching the SQL Server database name

2. **Configuration File Conflicts Found:**
   - `C:/DEV/.env` → Specifies `APEX_DB` (development config, not used)
   - `C:/DEV/.env.production` → Specifies `APEX_PROD` (correct)
   - `C:/DEV/node/.env` → Specifies `APEX_PROD` (correct) ✅
   - `C:/DEV/docker-compose.yml` → Specifies `APEX_DB` (development config, not used)

3. **Inconsistent Fallback Values in Code:**
   - ❌ `node/db.js:9` → Falls back to `APEX_DB`
   - ❌ `node/routes/auth.js:52` → Falls back to `APEX_DB`
   - ❌ `node/routes/users.js:11` → Falls back to `APEX_DB`
   - ✅ `node/routes/projects.js:11` → Falls back to `APEX_PROD`
   - ✅ `node/routes/admin.js:11` → Falls back to `APEX_PROD`
   - ✅ `node/routes/audit.js:11` → Falls back to `APEX_PROD`
   - ✅ `node/routes/load-sample-data.js:11` → Falls back to `APEX_PROD`

4. **How This Happened:**
   - The backend container (`apex-node-prod`) was likely recreated manually at some point using an incorrect environment variable
   - The `node/.env` file has the correct value (`APEX_PROD`), but the running container had been created with `-e DB_DATABASE=APEX_PROD`
   - SQL Server logs show first login failure with `APEX_DB` on **September 30, 2025 at 20:22:12** and **20:24:41**
   - Prior to September 30, backend was connecting successfully to `APEX_PROD`

**Resolution Applied:**

1. **Backend Container Recreated (October 3, 2025):**
   ```bash
   docker stop apex-node-prod
   docker rm apex-node-prod
   docker run -d --name apex-node-prod --network apex-network \
     -e DB_USERNAME=SA -e DB_PASSWORD=ApexProd2024! \
     -e DB_HOST=sqlserver-prod -e DB_PORT=1433 \
     -e DB_DATABASE=APEX_PROD \  # ← CORRECTED
     -e DISABLE_EMAIL=true \
     -v "C:/DEV:/app" -p 3000:3000 \
     node:18-alpine sh -c "cd /app/node && npm install --production && npm start"
   ```

2. **Admin User Recreated:**
   - Backend connected successfully to `APEX_PROD`
   - Registered new admin: `admin@apex.local` / `ApexSuperAdmin2025!` (User ID: 3009)
   - Login tested and verified working

**Verification Complete:**
- ✅ Backend connects to `APEX_PROD` database
- ✅ No database connection errors in logs
- ✅ Login API responds with valid JWT token
- ✅ Public URL accessible: https://apex.daemonscripts.com
- ✅ All containers running properly

**⚠️ REMAINING ISSUES TO ADDRESS:**

**Code Inconsistencies (NOT fixed in this session):**
These files still have incorrect fallback values and should be updated in a future session:

```javascript
// node/db.js:9 - SHOULD BE FIXED
database: process.env.DB_DATABASE || 'APEX_DB',  // ❌ Should be 'APEX_PROD'

// node/routes/auth.js:52 - SHOULD BE FIXED
database: process.env.DB_DATABASE || 'APEX_DB',  // ❌ Should be 'APEX_PROD'

// node/routes/users.js:11 - SHOULD BE FIXED
database: process.env.DB_DATABASE || 'APEX_DB',  // ❌ Should be 'APEX_PROD'
```

**Why Not Fixed Now:**
- System is currently working because `node/.env` has the correct `DB_DATABASE=APEX_PROD`
- The fallback values only matter if environment variable is missing
- Changing code requires testing and backup
- User requested documentation first, code fixes can follow

**Prevention for Future:**
1. **ALWAYS verify environment variables** when recreating containers
2. **Check `node/.env` file** for correct database name before container creation
3. **Use docker inspect** to verify container environment matches expectations
4. **Test database connectivity** immediately after container recreation
5. **Update fallback values in code** to match production database name

**Key Lesson:** Even when all containers show "running", a configuration mismatch in environment variables can break authentication. Always verify the backend can actually connect to the database, not just that containers are up.

---

### October 2, 2025 - Infrastructure Restructure: Portfolio Website & Subdomain Routing

#### **✅ Complete Domain Architecture Redesign**

**Goal:** Restructure daemonscripts.com as a portfolio/landing site with APEX moved to subdomain.

**Changes Implemented:**

1. **Portfolio Website Created**
   - **File:** `C:\DEV\portfolio\index.html` (24,879 bytes)
   - **Design:** Modern dark theme with gradient styling, fully responsive
   - **Sections:** Hero, Philosophy (6 cards), Services, Portfolio showcase
   - **APEX Card:** Live demo button, 8 features, 6 design highlights, tech stack badges
   - **Tech:** Pure HTML/CSS/JS, no dependencies, mobile-first responsive design

2. **Docker Container for Portfolio**
   - **Container:** `daemonscripts-portfolio`
   - **Image:** nginx:alpine
   - **Port:** 8080
   - **Volume:** `C:/DEV/portfolio:/usr/share/nginx/html`
   - **Network:** apex-network

3. **Cloudflare Tunnel Routing Updated**
   - **Configuration Location:** Cloudflare Zero Trust Dashboard → "Public Hostnames" (NOT local config.yml)
   - **Main domain:** daemonscripts.com → http://127.0.0.1:8080 (portfolio)
   - **WWW subdomain:** www.daemonscripts.com → http://127.0.0.1:8080 (portfolio)
   - **APEX subdomain:** apex.daemonscripts.com → http://127.0.0.1:80 (APEX app)
   - **Future subdomain:** dpsrp.daemonscripts.com can be added when ready (port 8081)

4. **Key Learning:**
   - Cloudflare tunnel uses dashboard configuration when "Public Hostnames" are defined
   - Local config.yml file is **ignored** when dashboard config exists
   - Configuration changes in dashboard take effect immediately (no tunnel restart needed)
   - Tunnel caching issue was resolved by updating dashboard routes instead of local config

**Testing:**
- ✅ https://daemonscripts.com returns HTTP 200 (portfolio site)
- ✅ https://apex.daemonscripts.com returns HTTP 200 (APEX app)
- ✅ Both sites fully accessible and functional

**Files Created/Modified:**
- Created: `C:\DEV\portfolio/index.html` (new portfolio website)
- Modified: `C:\DEV\CLAUDE.md` (infrastructure documentation updates)
- Modified: Cloudflare Zero Trust tunnel configuration (dashboard)

---

### October 1, 2025 (Evening Session - Data Integrity Fixes)

#### **✅ Data Integrity Guardian Audit Complete**
**Issue:** User requested verification that all reporting features pull from real database data (no placeholders/mock data)

**Findings:**
- **3 Critical Issues Found** where reports used hardcoded/fake data instead of live database sources

#### **✅ Issue #1: Performance Trends Chart - FIXED**
**Location:** `generatePerformanceChartData()` function (index.html lines 11254-11320)
**Problem:** Used `Math.random()` to generate fake monthly trends with misleading comment "Load historical data from database"
**Fix Applied:** Replaced with real project data calculations:
- **Progress mode:** Shows actual `project.progress` percentage per project
- **Budget mode:** Calculates `(actualBudget / estimatedBudget) * 100` per project
- **Timeline mode:** Calculates timeline accuracy from `startDate`, `endDate`, `completedDate` comparing planned vs actual duration
- **Empty state:** Returns empty arrays when no projects exist (no fake data)

**Data Source:** `AppState.projects` from `/api/projects` endpoint
**Field Mapping:** Uses `estimatedBudget` or `budget` (with proper frontend→backend mapping)

#### **✅ Issue #2: Team Utilization Chart - FIXED**
**Location:** `renderTeamUtilizationChart()` function (index.html lines 12201-12278)
**Problem:** Hardcoded fake team members: "John Smith", "Sarah Davis", "Mike Johnson", "Emily Brown", "David Wilson" with random workload percentages
**Fix Applied:** Now uses real task assignments from projects:
- Iterates through all `project.tasks` arrays
- Extracts actual assignees from `task.assignee` field
- Calculates workload as: `(active tasks / total tasks) * 100`
- Shows "Unassigned" for tasks without assignee
- **Empty state:** Returns empty arrays when no tasks/assignees exist

**Data Source:** `AppState.projects` → `project.tasks[]` → `task.assignee`

#### **✅ Issue #3: DashboardAPI Export - FIXED**
**Location:** `generateReportData()` function (index.html lines 12572-12600, previously 12478-12511)
**Problem:** Called `DashboardAPI.getMetrics()`, `DashboardAPI.getChartData()`, `DashboardAPI.getRecentProjects()` but `DashboardAPI` object didn't exist → threw `ReferenceError` breaking all exports
**Fix Applied:** Created complete `DashboardAPI` wrapper object (index.html lines 12478-12570):

```javascript
const DashboardAPI = {
    getMetrics: async function() {
        // Loads AppState.projects if needed
        // Calculates: totalProjects, completedProjects, inProgressProjects,
        //   atRiskProjects, totalValue, utilization, totalTasks, completedTasks
        // Returns metrics object with real data
    },
    getChartData: async function(chartType, period) {
        // Uses generateStatusChartData(projects) for RAG status
        // Returns status distribution or chart data based on type
    },
    getRecentProjects: async function(limit = 50) {
        // Sorts projects by creation date (most recent first)
        // Returns actual projects from AppState.projects
    }
};
```

**Data Source:** All methods call `loadProjectsFromBackend()` to ensure `AppState.projects` is populated, then use existing calculation functions

**Result:** PDF/Excel/JSON export functionality now works with real data instead of throwing errors

#### **✅ Career Development Section - REPLACED WITH TEAM PERFORMANCE DASHBOARD**
**Location:** `renderCareerProgress()` function (index.html lines 13160-13382)

**Problem Identified:**
- Section called "🚀 Career Development Progress" with hardcoded fake data
- Showed fake skills: "Project Management: 75%", "Technical Leadership: 60%" with made-up "+5", "+8" improvements
- Showed fake achievements: "Successfully delivered 3 major projects", "Led team of 8 members", "Completed course" - all false
- Showed generic advice: "Focus on Strategic Planning" with arbitrary "Target: 70% by end of quarter"
- **Zero connection to actual project/task data**
- User feedback: "This is PM software, not an HR platform"

**Solution:** Complete replacement with real PM metrics dashboard

**New: 📊 Team Performance Dashboard**

**1. Team Work Stats Section (lines 13164-13218)**
Calculates per team member from real data:
- Tasks completed: Count where `task.status === 'completed'`
- Active tasks: Count where `task.status !== 'completed'`
- Projects: Unique project IDs per assignee
- Projects delivered: Count where `project.status === 'completed'`
- Average completion time: Days between `task.startDate` and `task.completedDate`
- Budget variance: `((actualBudget - estimatedBudget) / estimatedBudget) * 100`

**Data Sources:**
- `task.assignee` - Team member identification
- `task.status` - Task state
- `task.startDate`, `task.completedDate` - Date calculations
- `project.owner` or `project.projectManager` - Project ownership (**NOTE: These fields don't exist - see issues below**)
- `project.estimatedBudget` or `project.budget` - Budget baseline
- `project.actualBudget` - Actual spend

**2. Upcoming Actions Due Section (lines 13220-13247)**
Shows tasks approaching deadlines or overdue:
- Filters tasks where `task.status !== 'completed'` AND due within 7 days
- Calculates `daysUntilDue` from `task.dueDate` or `task.endDate` (**NOTE: Tasks only have endDate - see issues below**)
- Sorts by due date ascending (earliest first)
- Color coding:
  - **Red:** Overdue (daysUntilDue < 0) or due today
  - **Yellow:** Due in 1-3 days
  - **Blue:** Due in 4-7 days
- Shows: Task name, Project name, Assignee, Days until due

**Purpose:** Helps team see approaching deadlines, helps stakeholders understand what's coming

**3. Project Health Summary Section (lines 13249-13266)**
Shows RAG status breakdown per team member:
- Counts green/yellow/red projects per owner using `calculateProjectHealth(project)`
- Calculates average progress percentage per owner
- Uses existing `calculateProjectHealth()` function (lines 11356-11416)

**Data Sources:**
- `project.owner` or `project.projectManager` - Ownership (**NOTE: Don't exist - see issues below**)
- `project.progress` - Progress percentage
- `project.tasks[].ragStatus` - Task-level RAG status for rollup

**Display:** Grid of cards showing Green/Yellow/Red counts and average progress per person

#### **⚠️ CRITICAL ISSUE IDENTIFIED: Missing Database Fields**

**Data Integrity Guardian Investigation Results:**

**Database Schema Analysis (from node/routes/projects.js lines 61-83):**

**PROJECTS TABLE - Fields That Exist:**
```
✅ id, name, client, type, status, budget, actualBudget
✅ startDate, endDate, description, tasks (JSON array)
✅ requestorInfo, siteLocation, businessLine, progress
✅ priority, requestDate, dueDate, estimatedBudget
✅ costCenter, purchaseOrder, parent_project_id
✅ created_at, updated_at
```

**PROJECTS TABLE - Fields That DON'T Exist:**
```
❌ owner - Not in database
❌ projectManager - Not in database
❌ createdBy - Not in database
❌ assignedTo - Not in database
```

**TASKS (JSON within Projects) - Fields That Exist:**
```
✅ id, name, description, status, ragStatus, phase
✅ priority, assignee, estimatedHours, actualHours
✅ startDate, endDate, completedDate, notes
✅ fieldOperationsRequired, parentTaskId, subtasks
✅ notesThread, createdAt, updatedAt
```

**TASKS - Fields That DON'T Exist:**
```
❌ dueDate - Not used (tasks use endDate instead)
❌ assignedTo - Not used (tasks use assignee instead)
```

**Impact:** Team Performance Dashboard will show all metrics under "Unassigned" because it's looking for `project.owner`/`project.projectManager` fields that don't exist.

**Recommended Field Mapping (TO BE APPLIED TOMORROW):**
```javascript
// Current code (WRONG):
const owner = project.owner || project.projectManager || 'Unassigned';
const dueDate = task.dueDate || task.endDate;
const assignee = task.assignee || task.assignedTo || 'Unassigned';

// Should be (CORRECT):
const owner = project.requestorInfo || 'Unassigned';  // Use requestorInfo as proxy for owner
const dueDate = task.endDate;  // Tasks only have endDate
const assignee = task.assignee || 'Unassigned';  // Tasks only have assignee
```

**Code Changes Required (PENDING):**
- **Line 13169:** Remove `task.assignedTo` fallback
- **Line 13196:** Change to `project.requestorInfo`
- **Line 13228:** Change to just `task.endDate`
- **Line 13252:** Change to `project.requestorInfo`

**Long-term Database Schema Recommendations:**
```sql
ALTER TABLE Projects ADD createdBy INT FOREIGN KEY REFERENCES Users(id);
ALTER TABLE Projects ADD projectManager INT FOREIGN KEY REFERENCES Users(id);
ALTER TABLE Projects ADD owner INT FOREIGN KEY REFERENCES Users(id);
```

#### **Files Modified Today:**
- `C:\DEV\index.html` - All reporting fixes and Team Performance Dashboard
- Backup: `G:\My Drive\APEX Backups\index_backup_20251001_[timestamp].html`

#### **Testing Status:**
- ✅ DashboardAPI object created successfully (no JavaScript errors)
- ✅ Performance trends chart restored and fixed
- ✅ Team utilization chart fixed
- ✅ Team Performance Dashboard built and deployed
- ⚠️ **UNTESTED:** All features require browser verification with real data
- ⚠️ **KNOWN ISSUE:** Dashboard shows "Unassigned" until field mapping is fixed (pending tomorrow)

#### **Next Session Tasks:**
1. Apply field mapping fixes (4 line changes)
2. Verify Team Performance Dashboard shows real team member data
3. Test with actual projects/tasks in browser
4. Consider adding database schema fields for proper ownership tracking

---

### October 1, 2025 (Earlier - Documentation)
- **Documentation cleanup:** Restructured CLAUDE.md to reduce confusion about tunnel status
- **Lesson learned:** Historical log errors don't mean current system is broken - test first before diagnosing

### September 30, 2025 (PM)
- **✅ Task Attachments Feature:** Mobile-optimized photo/document uploads
  - Backend: Added multer, /api/attachments route, file storage in /app/uploads/tasks/
  - Frontend: Camera access on mobile, 10MB file limit, JPG/PNG/PDF support
  - Files: index.html updated, node/routes/attachments.js created

### September 30, 2025 (AM)
- **✅ Date Change Bug Fix:** Fixed duplicate ID `editProjectStatus` causing form submission failure
- **✅ Console Cleanup:** Commented out 9 debug console.log statements

### September 29, 2025
- **✅ Advanced Subtask Features:** Progress rollup display, hours aggregation, RAG status bubbling
- **✅ Comprehensive Testing:** Backend API, data storage, JavaScript logic, HTML structure

### September 23, 2025
- **✅ Login Screen Cleanup:** Removed test JS auto-fill code, removed "Offline Mode" message
- **✅ fetchWithTimeout Fix:** Fixed AbortError bug

### September 19, 2025
- **✅ Major Security Lockdown:** Removed all hardcoded credentials and test accounts
- **✅ Project ID Fix:** Changed from `proj-` to `WTB_` prefix
- **✅ Email Service Fix:** Changed createTransporter to createTransport
- **✅ Hierarchical Subtasks:** Complete subtask management system with unlimited nesting

---

## 📁 CRITICAL FILE LOCATIONS

### Core Files
- `C:\DEV\index.html` - Entire frontend (18,000+ lines)
- `C:\DEV\node/routes/projects.js` - Project API with WTB_ filter (line 53)
- `C:\DEV\node/routes/auth.js` - Authentication
- `C:\DEV\node/routes/attachments.js` - File uploads
- `C:\DEV\nginx-simple.conf` - nginx configuration

### Backups
- `G:\My Drive\APEX Backups\` - All code backups with timestamps

### Documentation
- `APEX_DOCUMENTATION.md` - User documentation
- `SECURITY_EVALUATION.md` - Security audit

---

## 🔍 TROUBLESHOOTING QUICK REFERENCE

### "502 Bad Gateway"
- **Cause:** Backend container down
- **Fix:** `docker restart apex-node-prod && docker restart apex-nginx-prod`

### "Projects Not Showing in List"
- **Cause:** Project ID doesn't start with `WTB_`
- **Fix:** Ensure frontend generates IDs as `WTB_${timestamp}_${random}`

### "Login Failing"
- **Cause:** Wrong credentials or password expired (60-day policy)
- **Fix:** Use database credentials only, password reset if expired

### "Tunnel Down" (HTTP 530)
- **Cause:** Cloudflared process stopped
- **Fix:** Restart cloudflared: `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel run daemonscripts-apex`

### "Changes Not Showing"
- **Cause:** Browser cache or nginx cache
- **Fix:** Hard refresh (Ctrl+F5) or `docker restart apex-nginx-prod`

---

## 🚫 DO NOT

- Change project ID format without updating backend filter
- Add hardcoded credentials or test accounts
- Assume tunnel is down based on historical log errors
- Make multiple simultaneous changes
- Claim something is fixed without testing

---

## ✅ ALWAYS

- Test changes yourself before claiming completion
- Check current state with curl/docker commands before diagnosing
- Back up to `G:\My Drive\APEX Backups` before code changes
- Verify projects use WTB_ prefix
- Look at log timestamps (old errors ≠ current problems)

---

## 🐳 CONTAINER ARCHITECTURE & EMERGENCY PROCEDURES

### System Architecture
```
Internet → Cloudflared Tunnel → nginx (port 80) → Node.js (port 3000) → SQL Server (port 1433)
```

### Complete System Recovery
If all containers are down:

```bash
# 1. Check if containers exist
docker ps -a | findstr apex

# 2. Start existing containers
docker start sqlserver-prod
docker start apex-node-prod
docker start apex-nginx-prod

# 3. If containers don't exist, recreate (SQL first, then node, then nginx)
# SQL Server
docker run -d --name sqlserver-prod --network apex-network \
  -e ACCEPT_EULA=Y -e SA_PASSWORD=ApexProd2024! -p 1433:1433 \
  mcr.microsoft.com/mssql/server:2019-latest

# Node Backend
docker run -d --name apex-node-prod --network apex-network \
  -e DB_USERNAME=SA -e DB_PASSWORD=ApexProd2024! \
  -e DB_HOST=sqlserver-prod -e DB_PORT=1433 \
  -e DB_DATABASE=APEX_PROD -e DISABLE_EMAIL=true \
  -v "C:/DEV:/app" -p 3000:3000 \
  node:18-alpine sh -c "cd /app/node && npm install --production && npm start"

# Nginx Frontend
docker run -d --name apex-nginx-prod --network apex-network \
  -p 80:80 \
  -v "C:/DEV:/usr/share/nginx/html" \
  -v "C:/DEV/nginx-simple.conf:/etc/nginx/nginx.conf" \
  nginx:alpine
```

### Database Recovery
If database loses data:

```bash
# Connect to SQL Server
docker exec -it sqlserver-prod /opt/mssql-tools/bin/sqlcmd -S localhost -U SA -P 'ApexProd2024!'

# Create database and tables (run SQL commands)
CREATE DATABASE APEX_PROD;
GO
USE APEX_PROD;
GO
CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    email NVARCHAR(255) UNIQUE NOT NULL,
    password NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) DEFAULT 'user',
    preferences NVARCHAR(MAX),
    avatar NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE()
);
GO

# Create admin user (password: ApexSuperAdmin2025!)
INSERT INTO Users (name, email, password, role) VALUES (
    'Super Admin',
    'admin@apex.local',
    '$2b$12$7vBgE.p9xD8qH3K2fA9nC.Vx8wR5tL6mP2qN9sQ1uY3eI7oU4kM8a',
    'superadmin'
);
GO
```

---

## 📚 SYSTEM REFERENCE

### Application Architecture
- **Single-file application:** index.html contains all HTML/CSS/JavaScript
- **Backend:** Node.js/Express with JWT authentication
- **Database:** Microsoft SQL Server
- **External Dependencies:** CDN-loaded (Chart.js, XLSX, jsPDF, SortableJS)

### User Roles
- **Superadmin/Admin/Owner/Root:** Full access including administration
- **Project Manager:** Project management capabilities
- **Field Ops:** Field operations access
- **Auditor:** Read-only access

### Project Phase System
- Phase 1: Pre-installation - Logistics
- Phase 2: Pre-Installation - AV Setup
- Phase 3: Post-Installation Commissioning
- Phase 4: Post-Installation - Logistics

### API Endpoints
- `/api/auth/*` - Authentication
- `/api/projects/*` - Project management
- `/api/attachments/*` - File uploads
- `/api/admin/*` - Admin operations

### Environment Variables (Backend)
```
DB_USERNAME=SA
DB_PASSWORD=ApexProd2024!
DB_HOST=sqlserver-prod
DB_PORT=1433
DB_DATABASE=APEX_PROD
JWT_SECRET=your-jwt-secret-here
DISABLE_EMAIL=true
```

---

*Last updated: January 27, 2026*

---

## 📋 SESSION CONTINUITY NOTES

When resuming work on this project:

1. **Check running services:**
   ```bash
   curl http://localhost:3000/health  # Backend
   curl http://localhost:5173/        # Vite dev server
   sg docker -c 'docker ps'           # Docker containers
   ```

2. **Start services if needed:**
   ```bash
   # Backend
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
   cd /home/daemonalex/projects/apex-platform/node && node server.js &

   # Vite
   cd /home/daemonalex/projects/apex-platform && npm run dev &

   # Docker (SQL Server + nginx)
   sg docker -c 'docker start apex-sqlserver apex-nginx'
   ```

3. **Current migration phase:** Phase 2 complete, ready for Phase 3 (State Management)

4. **Key principle:** "Strangler Fig" - new modules run alongside legacy code via `window.*` exposure

- NEVER ASK ME TO DO AN ACTION THAT YOU CAN DO YOURSELF
