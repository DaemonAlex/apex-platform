// APEX legacy monolith JavaScript. Extracted from index.html in 2026-04
// so the page can serve a strict CSP without 'unsafe-inline' on script-src.
//
// This file contains everything that survived the Vue 3 migration: app
// shell glue, theme toggle, configurable settings cache, project phase
// definitions, AppState, navigation/routing, audit logging helpers,
// authentication, and the apiFetch helper. New code should go into the
// Vue client (`client/src/`), not here.
//
// Loaded synchronously (no defer) to preserve the exact behavior of the
// previous inline script - it must execute before any subsequent body
// content that calls these functions.

        // Dark mode toggle - persists to localStorage, syncs with user preferences
        function toggleDarkMode() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('apex_theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('apex_theme', 'dark');
            }
            updateThemeIcon();
            // Notify Vue apps of theme change
            window.dispatchEvent(new CustomEvent('apex-theme-change', { detail: { dark: !isDark } }));

            // Sync with backend user preferences if logged in
            if (typeof AppState !== 'undefined' && AppState.user && AppState.backendAuth) {
                try {
                    const prefs = AppState.user.preferences || {};
                    prefs.darkMode = !isDark;
                    AppState.user.preferences = prefs;
                    fetch('/api/users/' + AppState.user.id + '/preferences', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + (AppState.backendAuth.token || '')
                        },
                        body: JSON.stringify(prefs)
                    }).catch(function() {});
                } catch (_) {}
            }
        }

        function updateThemeIcon() {
            var icon = document.getElementById('themeToggleIcon');
            if (!icon) return;
            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            icon.className = isDark ? 'ph ph-sun' : 'ph ph-moon';
        }

        // Apply saved theme immediately on load (before login, prevents flash)
        (function() {
            var saved = localStorage.getItem('apex_theme');
            if (saved === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();

        // CRITICAL FIX: Define ALL status formatter functions FIRST to prevent errors

        // Create formatStatus alias to prevent any remaining calls from failing
        function formatStatus(status) {
            return statusFormatter2025(status);
        }

        function statusFormatter2025(status) {
            // Comprehensive null/undefined/invalid value handling
            if (status === null || status === undefined || status === '' || status === 'null' || status === 'undefined') {
                return 'Not Started';
            }

            // Safe string conversion with multiple fallbacks
            let safeStatus = '';
            try {
                if (typeof status === 'string') {
                    safeStatus = status;
                } else if (typeof status === 'number') {
                    safeStatus = status.toString();
                } else if (typeof status === 'boolean') {
                    safeStatus = status ? 'true' : 'false';
                } else if (status && typeof status.toString === 'function') {
                    safeStatus = status.toString();
                } else {
                    safeStatus = String(status || '');
                }
            } catch (err) {
                console.warn('StatusFormatter error:', err);
                return 'Error';
            }

            // Trim and validate the string
            safeStatus = (safeStatus || '').trim();
            if (!safeStatus || safeStatus.length === 0) {
                return 'Not Started';
            }

            // Safe string operations with bounds checking
            try {
                // Use slice instead of substring for better browser compatibility
                const firstChar = safeStatus.length > 0 ? safeStatus.slice(0, 1) : '';
                const restChars = safeStatus.length > 1 ? safeStatus.slice(1) : '';

                // Safely convert to uppercase
                const firstLetter = firstChar ? firstChar.toUpperCase() : '';

                // Replace hyphens with spaces and handle the rest
                const restLetters = restChars ? restChars.replace(/-/g, ' ') : '';

                return firstLetter + restLetters;
            } catch (err) {
                console.warn('StatusFormatter string operation error:', err);
                return 'Status Error';
            }
        }

        // ==================== CONFIGURABLE SETTINGS ====================
        // Cache for business lines and prefix loaded from the API
        let _cachedBusinessLines = null;
        let _cachedProjectPrefix = null;

        async function getBusinessLines() {
            if (_cachedBusinessLines) return _cachedBusinessLines;
            try {
                const data = await apiFetch('/settings/business-lines');
                _cachedBusinessLines = data.businessLines || [];
            } catch (e) {
                _cachedBusinessLines = [];
            }
            return _cachedBusinessLines;
        }

        async function getProjectPrefix() {
            if (_cachedProjectPrefix) return _cachedProjectPrefix;
            try {
                const data = await apiFetch('/settings/project-prefix');
                _cachedProjectPrefix = data.prefix || 'WTB';
            } catch (e) {
                _cachedProjectPrefix = 'WTB';
            }
            return _cachedProjectPrefix;
        }

        // Populate any business line <select> element with options from the database
        async function populateBusinessLineSelect(selectEl, selectedValue) {
            if (!selectEl) return;
            const lines = await getBusinessLines();
            const current = selectedValue || selectEl.value;
            selectEl.innerHTML = '<option value="">Select business line...</option>' +
                lines.map(bl => `<option value="${bl.value}" ${bl.value === current ? 'selected' : ''}>${bl.label}</option>`).join('');
        }

        // Invalidate cache when settings change
        function clearSettingsCache() {
            _cachedBusinessLines = null;
            _cachedProjectPrefix = null;
        }

        // ==================== APPLICATION STATE ====================
        // Phase Definitions by Project Type
        const projectPhasesByType = {
            av: [
                {
                    id: 'phase_1',
                    name: 'Pre-installation - Logistics',
                    order: 1,
                    defaultTasks: [
                        'Kick Off Call',
                        'Create project folder in Egnyte',
                        'Project information gathered',
                        'Review Project Requirements and Submit Writeup to Stakeholder/s',
                        'Create Business Case and submit to Stakeholder/s',
                        'Contact AV Vendor for Quote',
                        'Revise/Review Vendor Quote',
                        'Create SNOW ticket request for PO',
                        'Verify PO Receipt',
                        'Verify Hardware Shipment',
                        'Request Hardware Serials and MACs',
                        'Verify Install Dates',
                        'Verify Infrastructure Requirements Prior to Install',
                        'Verify CRE Furniture Customization',
                        'Verify Installations dates with Vendors, Stakeholders and Local On-site Contacts'
                    ]
                },
                {
                    id: 'phase_2',
                    name: 'Pre-Installation - AV Setup',
                    order: 2,
                    defaultTasks: [
                        'Verify space names with Stakeholder/s',
                        'SNOW Request to Create Room in AD/Entra with Calendar',
                        'Verify Calendar Ownership with Stakeholder/s',
                        'Verify Site has AV VLAN',
                        'Create IP address request in SNOW',
                        'Request to put MAC/s on VLAN',
                        'Create SNOW Request to assign IP/s to Firewall Policy Group (ISE)',
                        'If Teams Room, Create SNOW request to PAM for MTR Account and Correct OU'
                    ]
                },
                {
                    id: 'phase_3',
                    name: 'Post-Installation Commissioning',
                    order: 3,
                    defaultTasks: [
                        'Vendor Delivery and Install',
                        'Vendor Commissioning',
                        'Testing and Verification',
                        'Verify Vendor Labeling',
                        'Remind Vendor to Leave Documentation',
                        'Install Signoff',
                        'Testing and Verification',
                        'Install Monitoring tools',
                        'Update NOC with New Devices to be Monitored',
                        'AV Dept Sign Off',
                        'Create Room Instructions',
                        'Label Room Systems, Cabling and Furniture',
                        'Schedule Training with Stakeholder/s',
                        'Provide Training',
                        'AV Dept Install Sign off'
                    ]
                },
                {
                    id: 'phase_4',
                    name: 'Post-Installation - Logistics',
                    order: 4,
                    defaultTasks: [
                        'Review and Approve Invoices for Payment',
                        'Enter Installed Equipment into Inventory',
                        'Ensure all Documentation is saved in the AV Project Folder in Egnyte',
                        'Update Conference Room Info on SharePoint',
                        'Add Space to Health Website'
                    ]
                }
            ],
            telephony: [
                {
                    id: 'phase_1',
                    name: 'Planning and Assessment',
                    order: 1,
                    defaultTasks: [
                        'Kick Off Call',
                        'Site survey and current system audit',
                        'Gather call flow and extension requirements',
                        'Number porting inventory and plan',
                        'System design and vendor selection',
                        'Create Business Case and submit to Stakeholder/s',
                        'Contact vendor for quote',
                        'Revise/Review vendor quote',
                        'Create SNOW ticket request for PO',
                        'Verify PO Receipt'
                    ]
                },
                {
                    id: 'phase_2',
                    name: 'Procurement and Provisioning',
                    order: 2,
                    defaultTasks: [
                        'Order handsets and hardware',
                        'Verify hardware shipment',
                        'PBX/UCaaS licensing and tenant setup',
                        'SIP trunk provisioning',
                        'Submit number porting requests',
                        'Verify network readiness (QoS, VLAN, bandwidth)',
                        'Create SNOW request for firewall rules',
                        'Configure E911 and compliance requirements'
                    ]
                },
                {
                    id: 'phase_3',
                    name: 'Installation and Configuration',
                    order: 3,
                    defaultTasks: [
                        'Handset deployment and staging',
                        'PBX/call manager configuration',
                        'Auto-attendant and IVR setup',
                        'Call routing and hunt group configuration',
                        'Voicemail setup and greetings',
                        'Conference bridge configuration',
                        'Analog/fax line configuration',
                        'Verify number porting completion',
                        'Install monitoring and call analytics'
                    ]
                },
                {
                    id: 'phase_4',
                    name: 'Testing and Go-Live',
                    order: 4,
                    defaultTasks: [
                        'Internal call testing',
                        'External call testing (inbound/outbound)',
                        'Failover and redundancy testing',
                        'E911 verification testing',
                        'User acceptance testing',
                        'End-user training',
                        'Cutover execution',
                        'Post-cutover monitoring',
                        'Documentation and handover',
                        'Review and approve invoices for payment'
                    ]
                }
            ],
            'uc-deployment': [
                {
                    id: 'phase_1',
                    name: 'Planning and Design',
                    order: 1,
                    defaultTasks: [
                        'Kick Off Call',
                        'Gather requirements and use cases',
                        'Platform selection and licensing review',
                        'Integration design (directory, SSO, calendar)',
                        'Network readiness assessment',
                        'Create Business Case and submit to Stakeholder/s',
                        'Contact vendor for quote',
                        'Create SNOW ticket request for PO',
                        'Verify PO Receipt'
                    ]
                },
                {
                    id: 'phase_2',
                    name: 'Infrastructure and Provisioning',
                    order: 2,
                    defaultTasks: [
                        'Tenant/environment setup',
                        'SSO and directory sync configuration',
                        'Network and firewall configuration',
                        'QoS policy deployment',
                        'Meeting room device provisioning',
                        'User account provisioning and licensing',
                        'Policy and compliance configuration',
                        'Recording and retention setup'
                    ]
                },
                {
                    id: 'phase_3',
                    name: 'Deployment and Migration',
                    order: 3,
                    defaultTasks: [
                        'Pilot group rollout',
                        'Client deployment (desktop and mobile)',
                        'User migration (phased waves)',
                        'Data migration (contacts, history)',
                        'Meeting room system deployment',
                        'Integration testing (calendar, email, apps)',
                        'Verify call quality and performance',
                        'Install monitoring and analytics'
                    ]
                },
                {
                    id: 'phase_4',
                    name: 'Adoption and Handover',
                    order: 4,
                    defaultTasks: [
                        'End-user training sessions',
                        'Champion/power user training',
                        'Adoption metrics review',
                        'Support team handoff and documentation',
                        'User feedback collection',
                        'Post-deployment optimization',
                        'Documentation and knowledge base updates',
                        'Review and approve invoices for payment'
                    ]
                }
            ],
            general: [
                {
                    id: 'phase_1',
                    name: 'Planning',
                    order: 1,
                    defaultTasks: [
                        'Kick Off Call',
                        'Define scope and objectives',
                        'Identify stakeholders and roles',
                        'Gather requirements',
                        'Create project timeline',
                        'Resource allocation and budgeting'
                    ]
                },
                {
                    id: 'phase_2',
                    name: 'Execution',
                    order: 2,
                    defaultTasks: [
                        'Begin core work items',
                        'Status check-in with stakeholders',
                        'Track progress against timeline',
                        'Address blockers and risks',
                        'Coordinate with dependent teams'
                    ]
                },
                {
                    id: 'phase_3',
                    name: 'Review and QA',
                    order: 3,
                    defaultTasks: [
                        'Quality review of deliverables',
                        'Stakeholder review and feedback',
                        'Revisions and corrections',
                        'Final approval'
                    ]
                },
                {
                    id: 'phase_4',
                    name: 'Closeout',
                    order: 4,
                    defaultTasks: [
                        'Final documentation',
                        'Lessons learned and retrospective',
                        'Stakeholder sign-off',
                        'Archive project files'
                    ]
                }
            ]
        };

        // Map project types to phase sets
        function getProjectPhases(projectType) {
            const typeToPhaseSet = {
                'new-build': 'av',
                'upgrade': 'av',
                'breakfix': 'av',
                'refresh': 'av',
                'telephony': 'telephony',
                'uc-deployment': 'uc-deployment',
                'custom': 'general'
            };
            const phaseSet = typeToPhaseSet[projectType] || 'general';
            return projectPhasesByType[phaseSet] || projectPhasesByType.general;
        }

        // Default to AV phases for backward compatibility
        const projectPhases = projectPhasesByType.av;

        // Build phase <option> HTML for a given project type
        function buildPhaseOptions(projectType, selectedPhase) {
            const phases = getProjectPhases(projectType);
            return phases.map(p =>
                `<option value="${p.id}" ${(selectedPhase || 'phase_1') === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('');
        }

        const AppState = {
            isLoggedIn: false,
            user: null,
            currentView: 'login',
            data: {
                projects: [],
                metrics: {},
                charts: {}
            },
            breakfixBudget: {
                totalBudget: 50000, // Default $50,000 breakfix budget
                spentAmount: 0,
                remainingBudget: 50000,
                lastUpdated: new Date().toISOString()
            },
            refreshBudget: {
                totalBudget: 100000, // Default $100,000 refresh budget
                spentAmount: 0,
                remainingBudget: 100000,
                lastUpdated: new Date().toISOString()
            },
            config: {
                // Set USE_BACKEND to true if you have a backend server running
                USE_BACKEND: true,  // Backend API now deployed and running
                apiUrl: '/api',  // API URL through nginx reverse proxy
                refreshInterval: 30000, // 30 seconds
                backendEnabled: true,
                masterAccounts: []
            },
            users: [],
            projects: []
        };

        // ==================== NAVIGATION MANAGEMENT ====================
        function showView(viewName) {
            // Guard admin view
            if (viewName === 'admin' && !isAdmin()) {
                showNotification('Administration is restricted to Administrators', 'error');
                return;
            }

            // Update nav buttons
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const navBtn = document.getElementById(`nav${viewName ? viewName.substring(0, 1).toUpperCase() + viewName.substring(1) : 'Unknown'}`);
            if (navBtn) navBtn.classList.add('active');

            // Update content views
            document.querySelectorAll('.content-view').forEach(view => {
                view.classList.remove('active');
            });
            // Handle insights using reportsView
            const actualViewName = viewName === 'insights' ? 'reports' : viewName;
            const viewEl = document.getElementById(`${actualViewName}View`);
            console.log('[showView]', viewName, '-> element:', viewEl?.id, 'found:', !!viewEl);
            if (viewEl) viewEl.classList.add('active');
            // Debug: verify only one view is active
            const activeViews = document.querySelectorAll('.content-view.active');
            if (activeViews.length > 1) console.warn('[showView] Multiple active views!', Array.from(activeViews).map(v => v.id));

            // Breadcrumb removed - no longer needed

            // Update sidebar
            updateSidebar(viewName);

            // Load view content
            loadViewContent(viewName);

            AppState.currentView = viewName;
        }

        // Breadcrumb function removed - breadcrumbs no longer used

        function updateSidebar(viewName) {
            const sidebarConfigs = {
                dashboard: {
                    title: 'Dashboard',
                    subtitle: 'Overview',
                    nav: ''
                },
                projects: {
                    title: 'Projects',
                    subtitle: 'Manage all projects',
                    nav: ''
                },
                reports: {
                    title: 'Reports',
                    subtitle: 'Portfolio performance and project health',
                    nav: ''
                },
                admin: {
                    title: 'Administration',
                    subtitle: 'System management and configuration',
                    nav: ''
                },
                roomstatus: {
                    title: 'Room Status',
                    subtitle: 'Rooms by location, floor, and space',
                    nav: ''
                },
                insights: {
                    title: 'Reports',
                    subtitle: 'Portfolio performance and project health',
                    nav: '' // Redirects to reports
                },
                fieldops: {
                    title: 'Field Operations',
                    subtitle: 'Onsite work scheduling',
                    nav: ''
                },
                vendors: {
                    title: 'Vendors',
                    subtitle: 'Manage vendors and contacts',
                    nav: ''
                },
                cisco: {
                    title: 'Infrastructure',
                    subtitle: 'Devices, spaces, and room health',
                    nav: ''
                },
                profile: {
                    title: 'Profile',
                    subtitle: 'Account settings',
                    nav: ''
                }
            };

            const config = sidebarConfigs[viewName];
            const sidebar = document.getElementById('sidebar');
            const mainContent = document.querySelector('.main-content');
            if (!config.nav) {
                // Hide sidebar entirely for Vue-powered views - go full width
                if (sidebar) sidebar.style.display = 'none';
                if (mainContent) mainContent.style.marginLeft = '0';
            } else {
                if (sidebar) sidebar.style.display = '';
                if (mainContent) mainContent.style.marginLeft = '';
                document.getElementById('sidebarTitle').textContent = config.title;
                document.getElementById('sidebarSubtitle').textContent = config.subtitle;
                document.getElementById('sidebarNav').innerHTML = config.nav;
            }
        }

        // ==================== CONTENT LOADING ====================
        function loadViewContent(viewName) {
            switch (viewName) {
                case 'dashboard':
                    mountVueSection('dashboardVueMount', 'ApexDashboard');
                    break;
                case 'projects':
                    mountVueSection('projectsVueMount', 'ApexProjects');
                    break;
                case 'reports':
                case 'insights':
                    mountVueSection('reportsVueMount', 'ApexReports');
                    break;
                case 'fieldops':
                    mountVueSection('fieldopsVueMount', 'ApexFieldOps');
                    break;
                case 'roomstatus':
                    mountVueSection('roomStatusGrid', 'ApexRooms');
                    break;
                case 'admin':
                    mountVueSection('adminVueMount', 'ApexAdmin');
                    break;
                case 'profile':
                    mountVueSection('profileVueMount', 'ApexProfile');
                    break;
                case 'cisco':
                    mountVueSection('ciscoVueMount', 'ApexCisco');
                    break;
                case 'vendors':
                    mountVueSection('vendorsVueMount', 'ApexVendors');
                    break;
            }
        }


        // [Removed ~1,378 lines: Dashboard, Projects, Reports, FieldOps rendering - replaced by Vue 3 apps]

        // ==================== UTILITY FUNCTIONS ==================== v2.1
        // Phase 5: These now use modular versions when available

        function formatDate(dateString) {
            // Use new module if available
            if (window.formatDate && window.formatDate !== formatDate) {
                return window.formatDate(dateString);
            }
            return new Date(dateString).toLocaleDateString();
        }

        function formatProjectType(type) {
            // Use new module if available
            if (window.formatProjectType && window.formatProjectType !== formatProjectType) {
                return window.formatProjectType(type);
            }
            const typeMap = {
                'new-build': 'New Build',
                'upgrade': 'Upgrade',
                'breakfix': 'BreakFix',
                'refresh': 'Refresh',
                'custom': 'Custom Project'
            };
            return typeMap[type] || type;
        }

        // Phase info helper for badges - searches all phase sets
        function derivePhaseInfo(phaseId, projectType) {
            try {
                let phaseKey = phaseId;
                if (typeof phaseId === 'number') {
                    phaseKey = `phase_${phaseId}`;
                } else if (typeof phaseId === 'string' && !phaseId.startsWith('phase_')) {
                    phaseKey = `phase_${phaseId}`;
                }

                const cls = phaseKey ? String(phaseKey).replace('_', '-') : 'phase-1';

                // If project type provided, search that set first
                if (projectType) {
                    const phases = getProjectPhases(projectType);
                    const phase = phases.find(p => p.id === phaseKey);
                    if (phase) return { name: phase.name, class: cls };
                }

                // Fallback: search all phase sets
                for (const setKey of Object.keys(projectPhasesByType)) {
                    const phase = projectPhasesByType[setKey].find(p => p.id === phaseKey);
                    if (phase) return { name: phase.name, class: cls };
                }

                return { name: phaseKey || 'Unknown', class: cls };
            } catch (_) {
                return { name: 'Unknown', class: 'phase-1' };
            }
        }



        // ============== AUDIT LOGGING HELPERS ==============
        function computeDiff(before = {}, after = {}) {
            try {
                const diff = {};
                const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
                keys.forEach(k => {
                    const b = before ? before[k] : undefined;
                    const a = after ? after[k] : undefined;
                    if (JSON.stringify(b) !== JSON.stringify(a)) {
                        diff[k] = { before: b, after: a };
                    }
                });
                return diff;
            } catch (_) { return {}; }
        }

        function auditLogEvent({ action, entity, entityId, entityName, before, after, details = '', severity = 'info', meta = {} }) {
            try {
                AppState.auditLog = AppState.auditLog || [];
                const actor = {
                    id: AppState.user?.id || null,
                    name: AppState.user?.name || AppState.user?.email || 'Unknown',
                    email: AppState.user?.email || '',
                    role: AppState.user?.Role?.name || AppState.user?.role || ''
                };
                const entry = {
                    id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    timestamp: new Date().toISOString(),
                    action, entity, entityId, entityName,
                    actor, user: actor.name, // backward-compat for existing table renderer
                    details,
                    diff: computeDiff(before || {}, after || {}),
                    severity,
                    meta,
                    userAgent: navigator.userAgent,
                    page: (location.pathname || '') + (location.hash || '')
                };
                AppState.auditLog.unshift(entry);
                try {

                } catch (_) {}
                try {
                    if (isBackendMode()) {
                        const token = AppState.backendAuth?.token;
                        fetch(AppState.config.apiUrl + '/audit/log', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
                            body: JSON.stringify(entry)
                        }).catch(() => {});
                    }
                } catch (_) {}
            } catch (e) {
                console.error('Audit log failed:', e);
            }
        }

        function hasPermission(key) {
            try {
                const roleRaw = String(AppState.user?.Role?.name || AppState.user?.role || '');
                const roleName = roleRaw.toLowerCase().replace('-', '_');
                // Admin-style roles are full access
                if (['admin','owner','superadmin','root'].includes(roleName)) return true;
                // Primary source: explicit permissions on role
                const perms = AppState.user?.Role?.permissions;
                if (Array.isArray(perms)) return perms.includes(key);
                // Database-only permissions - no local fallback
                const allowByRole = {
                    'tasks.notes.view': ['admin','project_manager','manager','auditor','owner','superadmin','root'],
                    'tasks.notes.edit': ['admin','project_manager','manager','owner','superadmin','root']
                };
                if (allowByRole[key]) return allowByRole[key].includes(roleName);
                return false;
            } catch (_) { return false; }
        }


        function formatBusinessLine(businessLine) {
            if (!businessLine) return 'N/A';
            // Use cached business lines if available
            if (_cachedBusinessLines) {
                const found = _cachedBusinessLines.find(bl => bl.value === businessLine);
                if (found) return found.label;
            }
            // Fallback: capitalize
            return businessLine.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }

        function toArrayMaybe(v) {
            if (Array.isArray(v)) return v;
            if (v && typeof v === 'object') return Object.values(v);
            return [];
        }
        function getTasks(project) {
            try { return toArrayMaybe(project?.tasks); } catch (_) { return []; }
        }
        function normalizeProject(p) {
            try { return { ...p, tasks: getTasks(p) }; } catch (_) { return { ...p, tasks: [] }; }
        }

        // [Removed ~4,612 lines: Task attachments, Project CRUD, detail management - replaced by Vue 3 apps]

        function toggleUserMenu() {
            const userMenu = document.getElementById('userMenu');
            if (userMenu) {
                userMenu.style.display = userMenu.style.display === 'none' ? 'block' : 'none';
            }
        }

        // [Removed ~2,462 lines: Report rendering, Analytics, Budget calculations - replaced by Vue 3 apps]

        // Notification system - uses new module when available (Phase 5 migration)
        function showNotification(message, type = 'info') {
            // Use new modular notification system if available
            if (window.APEX_Notifications) {
                return window.APEX_Notifications.show(message, type);
            }

            // Legacy fallback
            window.__activeNotifications = window.__activeNotifications || [];
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.innerHTML = `
                <div class="notification-content">
                    ${type === 'success' ? '<i class="ph ph-check-circle"></i>' : type === 'error' ? '<i class="ph ph-x-circle"></i>' : '<i class="ph ph-info"></i>'} ${message}
                </div>
            `;

            const baseTop = 100;
            const spacing = 10;
            const notificationHeight = 60;

            window.__activeNotifications = window.__activeNotifications.filter(n => document.body.contains(n));
            const topPosition = baseTop + (window.__activeNotifications.length * (notificationHeight + spacing));
            notification.style.top = `${topPosition}px`;
            window.__activeNotifications.push(notification);
            document.body.appendChild(notification);

            setTimeout(() => {
                const index = window.__activeNotifications.indexOf(notification);
                if (index > -1) window.__activeNotifications.splice(index, 1);
                window.__activeNotifications.forEach((n, i) => {
                    n.style.top = `${baseTop + (i * (notificationHeight + spacing))}px`;
                });
                notification.remove();
            }, 3000);
        }

        // [Removed ~590 lines: Admin data init, Personal insights, Field ops init - replaced by Vue 3 apps]

        // Generic Vue section mounter
        function findMountFn(globalName) {
            const obj = window[globalName];
            if (!obj) return null;
            // Try .mount first (our manual assignment), then any method that starts with 'mount'
            if (typeof obj.mount === 'function') return obj.mount;
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'function' && key.startsWith('mount')) return obj[key];
            }
            return null;
        }

        function mountVueSection(containerId, globalName) {
            console.log('[Vue] mountVueSection:', containerId, globalName);
            const container = document.getElementById(containerId);
            if (!container) { console.log('[Vue] Container not found:', containerId); return; }
            if (container.dataset.vueMounted === 'true') { console.log('[Vue] Already mounted:', containerId); return; }

            const mountFn = findMountFn(globalName);
            if (mountFn) {
                container.dataset.vueMounted = 'true';
                container.innerHTML = '';
                mountFn(container, { token: AppState.backendAuth?.token || '', userName: AppState.user?.name || '' });
                return;
            }

            // Wait for script to load
            let attempts = 0;
            const check = setInterval(() => {
                attempts++;
                const fn = findMountFn(globalName);
                if (fn) {
                    clearInterval(check);
                    container.dataset.vueMounted = 'true';
                    container.innerHTML = '';
                    fn(container, { token: AppState.backendAuth?.token || '', userName: AppState.user?.name || '' });
                } else if (attempts > 25) {
                    clearInterval(check);
                    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--gray-500);">Failed to load module. Try refreshing.</div>';
                }
            }, 200);
        }

        // [Removed ~3,153 lines: Room status rendering, Field ops calendar, Admin CRUD - replaced by Vue 3 apps]

        function updateUserDisplays() {
            // Update user dropdown
            const dropdownUserName = document.getElementById('dropdownUserName');
            const dropdownUserRole = document.getElementById('dropdownUserRole');

            if (dropdownUserName && AppState.user) {
                dropdownUserName.textContent = AppState.user.name || 'Unknown User';
            }

            if (dropdownUserRole && AppState.user) {
                dropdownUserRole.textContent = AppState.user.Role?.displayName || AppState.user.role || 'No Role';
            }

            // Update user avatar initial
            const userAvatar = document.getElementById('userAvatar');
            if (userAvatar && AppState.user && AppState.user.name) {
                userAvatar.textContent = AppState.user.name.charAt(0).toUpperCase();
            }
        }

        // [Removed ~519 lines: Permission/Role CRUD, Financial settings UI - replaced by Vue 3 apps]

        // ==================== AUTHENTICATION ====================
        window.handleLogin = async function handleLogin(event) {
            try {
                event.preventDefault();

                // Check if AppState is available
                if (typeof AppState === 'undefined') {
                    setTimeout(() => {
                        const newEvent = { ...event, target: event.target };
                        handleLogin(newEvent);
                    }, 500);
                    return;
                }

                const formData = new FormData(event.target);
                const submitBtn = event.target.querySelector('.login-btn');
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in...'; }
                const email = formData.get('email');
                const password = formData.get('password');

                // Backend authentication mode
                const res = await fetchWithTimeout(AppState.config.apiUrl + '/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password })
                }, 15000);
                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                    // Check for password expiration
                    if (res.status === 403 && data.passwordExpired) {
                        showNotification('Your password has expired. Please reset your password.', 'error');
                        // Pre-fill email in forgot password form and show it
                        const forgotEmailInput = document.getElementById('forgotEmail');
                        if (forgotEmailInput) {
                            forgotEmailInput.value = email;
                        }
                        showForgotPassword();
                        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
                        return;
                    }

                    // Database-only authentication - no fallback accounts allowed
                    showNotification(data.error || 'Invalid email or password', 'error');
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
                    return;
                }

                if (!data.token) {
                    showNotification('Login failed - no authentication token received', 'error');
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Sign In'; }
                    return;
                }

                // Store tokens and enable backend mode globally
                AppState.backendAuth = { token: data.token, refreshToken: data.refreshToken, email };
                AppState.config.backendEnabled = true;

                if (window.TokenManager) {
                    window.TokenManager.setToken(data.token);
                }

                // Normalize user shape for UI compatibility
                const user = data.user || {};
                if (user.Role?.name && !user.role) user.role = user.Role.name;
                // Master account override (treat as Owner)
                try {
                    const masterList = (AppState.config.masterAccounts || []).map(e => String(e).toLowerCase());
                    if (masterList.includes(String(email).toLowerCase())) {
                        user.role = 'Owner';
                        user.Role = user.Role || {};
                        user.Role.name = 'Owner';
                        user.Role.displayName = user.Role.displayName || 'Owner';
                        user.Role.id = user.Role.id || 'owner';
                    }
                } catch (_) {}
                AppState.user = user;

                // If backend mandates a password change, force it now
                if (data.mustChangePassword || user.mustChangePassword) {
                    await showBackendForceChangeModal();
                } else {
                    // Login successful - no notification needed, user knows they logged in
                }

        // Database-only authentication - no local fallbacks allowed


                await loginUser(AppState.user);
            } catch (error) {
                console.error('Error in handleLogin:', error);

                // Keep error visible longer
                const msg = (error && (error.name === 'AbortError')) ? 'Login request timed out. Please check backend connectivity.' : `Login error: ${error.message || 'Please try again.'}`;
                showNotification(msg, 'error');

                const submitBtn = (event && event.target) ? event.target.querySelector('.login-btn') : null;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign In';
                }
            }
        }



        async function loginUser(user) {
            try {
                AppState.isLoggedIn = true;
                AppState.user = user;
                AppState.currentView = 'dashboard';

                // Record login in audit log
                try {
                    AppState.auditLog = AppState.auditLog || [];
                    AppState.auditLog.unshift({
                        id: AppState.auditLog.length + 1,
                        timestamp: new Date().toISOString(),
                        user: user.name || user.email || 'Unknown User',
                        action: 'login',
                        resource: 'System',
                        details: 'User logged in successfully',
                        ipAddress: '127.0.0.1'
                    });
                } catch (_) {}


                // Hide login screen and show app
                const loginScreen = document.getElementById('loginScreen');
                const mainApp = document.getElementById('mainApp');

                if (loginScreen) {
                    loginScreen.style.display = 'none';
                } else {
                    console.error('❌ Login screen element not found');
                }

                if (mainApp) {
                    mainApp.style.display = 'flex';
                    // Main app shown
                    // Ensure the view snaps to the app header after login
                    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
                } else {
                    console.error('❌ Main app element not found');
                }

                document.body.classList.add('logged-in');

                // Apply dark mode: localStorage takes priority, fallback to user preference
                var savedTheme = localStorage.getItem('apex_theme');
                if (savedTheme === 'dark' || (!savedTheme && user.preferences && user.preferences.darkMode)) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    localStorage.setItem('apex_theme', 'dark');
                } else if (savedTheme === 'light') {
                    document.documentElement.removeAttribute('data-theme');
                }
                updateThemeIcon();

                // Set up user info
                updateUserDisplays();

                // Initialize the application
                // Load projects from backend FIRST before showing dashboard
                try {
                    if (isBackendMode()) {
                        await loadProjectsFromBackend();
                        // Projects loaded from database only
                    } else {
                        console.error('❌ Database connection required. No offline mode.');
                        showNotification('Database connection required', 'error');
                        return;
                    }
                } catch (error) {
                    console.error('❌ Error loading projects from backend:', error);
                }

                try {
                    setupRoleBasedUI();
                    // Role-based UI set up
                } catch (error) {
                    console.error('❌ Error setting up role-based UI:', error);
                }

                try {
                    showView('dashboard');
                    // Dashboard view loaded
                } catch (error) {
                    console.error('❌ Error loading dashboard view:', error);
                }


                // User is now logged in

            } catch (error) {
                showNotification('Login failed due to system error. Please try again.', 'error');

                // Reset login state
                AppState.isLoggedIn = false;
                AppState.user = null;
                AppState.currentView = 'login';
            }
        };

        // Password Reset Functions
        window.showForgotPassword = function() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('forgotPasswordScreen').style.display = 'flex';
        };

        window.showLogin = function() {
            document.getElementById('forgotPasswordScreen').style.display = 'none';
            document.getElementById('resetPasswordScreen').style.display = 'none';
            document.getElementById('loginScreen').style.display = 'flex';
        };

        window.handleForgotPassword = async function(event) {
            event.preventDefault();
            const formData = new FormData(event.target);
            const email = formData.get('email');

            try {
                const submitBtn = event.target.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Sending...';

                const response = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();

                if (response.ok) {
                    showNotification(data.message, 'success');
                    // Show success message and return to login
                    setTimeout(() => {
                        showLogin();
                    }, 2000);
                } else {
                    showNotification(data.error || 'Failed to send reset email', 'error');
                }

            } catch (error) {
                console.error('Forgot password error:', error);
                showNotification('Network error. Please try again.', 'error');
            } finally {
                const submitBtn = event.target.querySelector('button[type="submit"]');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Reset Link';
            }
        };

        window.handleResetPassword = async function(event) {
            event.preventDefault();
            const formData = new FormData(event.target);
            const newPassword = formData.get('newPassword');
            const confirmPassword = formData.get('confirmPassword');

            if (newPassword !== confirmPassword) {
                showNotification('Passwords do not match', 'error');
                return;
            }

            // Get token and email from URL
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const email = urlParams.get('email');

            if (!token || !email) {
                showNotification('Invalid reset link', 'error');
                return;
            }

            try {
                const submitBtn = event.target.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Resetting...';

                const response = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, email, newPassword })
                });

                const data = await response.json();

                if (response.ok) {
                    showNotification('Password reset successfully! Please sign in with your new password.', 'success');
                    // Clear URL parameters and return to login
                    window.history.replaceState({}, document.title, window.location.pathname);
                    setTimeout(() => {
                        showLogin();
                    }, 2000);
                } else {
                    showNotification(data.error || 'Failed to reset password', 'error');
                }

            } catch (error) {
                console.error('Reset password error:', error);
                showNotification('Network error. Please try again.', 'error');
            } finally {
                const submitBtn = event.target.querySelector('button[type="submit"]');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Reset Password';
            }
        };

        // Check for reset token in URL on page load
        window.checkResetToken = function() {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const email = urlParams.get('email');

            if (token && email) {
                // Show reset password screen
                const loginScreen = document.getElementById('loginScreen');
                const resetScreen = document.getElementById('resetPasswordScreen');

                if (loginScreen) loginScreen.style.display = 'none';
                if (resetScreen) resetScreen.style.display = 'flex';
            }
        };

        // Frontend password validation
        window.validatePasswordRequirements = function(input) {
            const password = input.value;
            const messageDiv = document.getElementById('passwordValidationMessage');
            const errors = [];

            if (password.length < 12) {
                errors.push('Password must be at least 12 characters long');
            }

            if (!/[A-Z]/.test(password)) {
                errors.push('Must contain at least one uppercase letter');
            }

            if (!/[a-z]/.test(password)) {
                errors.push('Must contain at least one lowercase letter');
            }

            if (!/[0-9]/.test(password)) {
                errors.push('Must contain at least one number');
            }

            if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
                errors.push('Must contain at least one special character');
            }

            if (/(.)\1{2,}/.test(password)) {
                errors.push('Cannot contain three or more consecutive identical characters');
            }

            if (/123|abc|qwe|asd|zxc/i.test(password)) {
                errors.push('Cannot contain common sequences');
            }

            if (errors.length > 0) {
                messageDiv.style.display = 'block';
                messageDiv.style.color = '#dc3545';
                messageDiv.innerHTML = '• ' + errors.join('<br>• ');
                input.style.borderColor = '#dc3545';
                return false;
            } else {
                messageDiv.style.display = 'block';
                messageDiv.style.color = '#28a745';
                messageDiv.innerHTML = '✓ Password meets all requirements';
                input.style.borderColor = '#28a745';
                return true;
            }
        };

        // Password validation using new module (Phase 5 migration)
        window.validatePasswordRequirements = function(input) {
            const messageDiv = document.getElementById('passwordValidationMessage');
            if (!messageDiv) return;

            const password = input.value;
            if (!password) {
                messageDiv.style.display = 'none';
                return;
            }

            // Use new module if available
            if (window.validatePassword) {
                const result = window.validatePassword(password);
                const strengthInfo = window.getPasswordStrengthLabel ?
                    window.getPasswordStrengthLabel(result.strength) :
                    { label: 'Unknown', color: '#666' };

                messageDiv.style.display = 'block';
                if (result.isValid) {
                    messageDiv.innerHTML = `
                        <span style="color: ${strengthInfo.color}; font-weight: 600;">
                            ✓ Password strength: ${strengthInfo.label}
                        </span>
                        <div style="height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 4px;">
                            <div style="height: 100%; width: ${result.strength}%; background: ${strengthInfo.color}; border-radius: 2px; transition: all 0.3s;"></div>
                        </div>
                    `;
                } else {
                    messageDiv.innerHTML = `
                        <span style="color: #ef4444;">✗ ${result.errors[0]}</span>
                        <div style="height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 4px;">
                            <div style="height: 100%; width: ${result.strength}%; background: ${strengthInfo.color}; border-radius: 2px; transition: all 0.3s;"></div>
                        </div>
                    `;
                }
            } else {
                // Legacy fallback
                const isValid = password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*]/.test(password);
                messageDiv.style.display = 'block';
                messageDiv.innerHTML = isValid ?
                    '<span style="color: #22c55e;">✓ Password meets requirements</span>' :
                    '<span style="color: #ef4444;">✗ Password does not meet requirements</span>';
            }
        };

        // Secure password generator
        window.generateSecurePassword = function() {
            const lowercase = 'abcdefghijklmnopqrstuvwxyz';
            const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const numbers = '0123456789';
            const symbols = '@#$%&*+-=?';

            let password = '';

            // Ensure at least one character from each required category
            password += lowercase[Math.floor(Math.random() * lowercase.length)];
            password += uppercase[Math.floor(Math.random() * uppercase.length)];
            password += numbers[Math.floor(Math.random() * numbers.length)];
            password += symbols[Math.floor(Math.random() * symbols.length)];

            // Fill remaining characters (12-16 total length)
            const allChars = lowercase + uppercase + numbers + symbols;
            const targetLength = 14; // Good balance of security and usability

            for (let i = password.length; i < targetLength; i++) {
                password += allChars[Math.floor(Math.random() * allChars.length)];
            }

            // Shuffle the password to avoid predictable patterns
            password = password.split('').sort(() => Math.random() - 0.5).join('');

            // Set the password in both fields
            const passwordInput = document.getElementById('resetNewPassword');
            const confirmInput = document.getElementById('resetConfirmPassword');

            if (passwordInput) {
                passwordInput.value = password;
                passwordInput.type = 'text'; // Temporarily show the generated password
                validatePasswordRequirements(passwordInput);

                // Hide password after 3 seconds
                setTimeout(() => {
                    passwordInput.type = 'password';
                }, 3000);
            }

            if (confirmInput) {
                confirmInput.value = password;
            }

            // Show success message
            // Password generated - visible in the field
        };

        function logout() {
            AppState.isLoggedIn = false;
            AppState.user = null;
            AppState.currentView = 'login';
            AppState.backendAuth = null;

            if (window.TokenManager) {
                window.TokenManager.clearToken();
            }

            // Show login screen and hide app
            document.getElementById('loginScreen').style.display = 'flex';
            document.getElementById('mainApp').style.display = 'none';
            document.body.classList.remove('logged-in');

            // Logged out - no notification, redirecting to login screen
        }


        // Offline sample projects when backend is unavailable

        // ==================== INITIALIZATION ====================
        // Check if libraries are loaded
        function checkLibraries() {
            // CDN libraries removed - Vue apps bundle their own dependencies
            return {};
        }

        document.addEventListener('DOMContentLoaded', async function() {
            // Check library availability
            const libraries = checkLibraries();

            // Check for old cache version and reload if necessary
            try {
                const usp = new URLSearchParams(window.location.search);

                // Force reload if old cache version is detected
                const versionParam = usp.get('v');
                if (versionParam && versionParam.includes('20250908v4')) {
                    // Remove the old version parameter and reload
                    window.location.href = window.location.pathname;
                    return;
                }
            } catch(_) {}



            // After init AppState.users

            // Check if already logged in
            if (AppState.isLoggedIn && AppState.user) {



                await loginUser(AppState.user);
            } else {
                // Show login screen by default - checkResetToken will override if needed
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('mainApp').style.display = 'none';
                // Backend info removed per user request
            }

            // Check for password reset token AFTER login screen logic
            checkResetToken();

            // AV Project Management 8.0 initialized
        });






        function setupRoleBasedUI() {
            const userRole = ((AppState.user?.Role?.name || AppState.user?.role || '') + '').toLowerCase().replace('-', '_') || 'auditor';

            // Hide Executive tab for non-admin/project_manager roles
            const executiveTab = document.getElementById('executiveTab');
            if (executiveTab && !['admin', 'owner', 'project_manager', 'superadmin', 'root'].includes(userRole)) {
                executiveTab.style.display = 'none';
            }

            // Hide Administration for non-admin
            const navAdminBtn = document.getElementById('navAdmin');
            const adminView = document.getElementById('adminView');
            const privileged = ['admin','owner','superadmin','root'].includes(userRole);
            if (navAdminBtn) navAdminBtn.style.display = privileged ? 'inline-flex' : 'none';
            if (adminView && !privileged) adminView.classList.remove('active');


        }

        function isAdmin() {
            const roleName = (AppState.user?.Role?.name || AppState.user?.role || '').toLowerCase();
            return ['admin','owner','superadmin','root'].includes(roleName);
        }


        async function loadProjectsFromBackend() {
            try {
                const token = AppState.backendAuth?.token;
                if (!token) throw new Error('Not authenticated');
                const res = await fetch(AppState.config.apiUrl + '/projects?limit=1000', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load projects');

                const projects = Array.isArray(data) ? data : (data.projects || []);

                AppState.projects = projects.map(normalizeProject);
            } catch (e) {
                console.error('Backend load error:', e);
                showNotification('Failed to load projects from backend', 'error');
            }
        }

        // ===== Backend helpers =====
        function isBackendMode() {
            // Check if backend is enabled AND we have auth token
            return AppState.config.USE_BACKEND && !!AppState.backendAuth?.token;
        }

        function mapProjectType(t) {
            const tt = (t || '').toLowerCase();
            if (tt === 'new-build' || tt === 'new build') return 'new-build';
            if (tt === 'renovation' || tt === 'upgrade') return 'renovation';
            if (tt === 'maintenance' || tt === 'breakfix' || tt === 'break-fix' || tt === 'repair') return 'maintenance';
            return 'other';
        }


        async function showBackendForceChangeModal() {
            return new Promise((resolve) => {
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal">
                      <div class="modal-header">
                        <h2>Set a New Password</h2>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">\u00d7</button>
                      </div>
                      <div class="modal-body">
                        <p>For security, you must set a new password before continuing.</p>
                        <form id="forcePwForm">
                          <div class="form-group">
                            <label>Current Password</label>
                            <input type="password" name="currentPassword" class="form-control" required autocomplete="current-password">
                          </div>
                          <div class="form-group">
                            <label>New Password</label>
                            <input type="password" name="newPassword" class="form-control" required minlength="6" autocomplete="new-password">
                          </div>
                          <div class="form-actions" style="margin-top:1rem;">
                            <button type="submit" class="btn btn-primary">Update Password</button>
                            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                          </div>
                        </form>
                      </div>
                    </div>`;

                document.body.appendChild(modal);

                const form = modal.querySelector('#forcePwForm');
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(form);
                    const currentPassword = fd.get('currentPassword');
                    const newPassword = fd.get('newPassword');
                    try {
                        await apiFetch('/auth/password', {
                            method: 'PUT',
                            body: JSON.stringify({ currentPassword, newPassword })
                        });
                        showNotification('Password updated. Thank you!', 'success');
                        modal.remove();
                        resolve();
                    } catch (err) {
                        console.error('Force password change failed:', err);
                        showNotification(err.message || 'Failed to update password', 'error');
                    }
                });
            });
        }

        function mapProjectStatus(s) {
            const ss = (s || '').toLowerCase();
            if (['draft','active','on-hold','completed','cancelled'].includes(ss)) return ss;
            if (ss === 'planning' || ss === 'not-started') return 'draft';
            return 'active';
        }

        function toBackendProjectPayload(p) {
            return {
                id: p.id || `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: p.name,
                requestorInfo: p.requestorInfo,
                siteLocation: p.siteLocation,
                businessLine: p.businessLine,
                description: p.description,
                type: p.type,
                priority: p.priority,
                status: p.status,
                purchaseOrder: p.purchaseOrder || '',
                costCenter: p.costCenter || '',
                requestDate: p.requestDate || new Date().toISOString().slice(0,10),
                startDate: p.startDate || new Date().toISOString().slice(0,10),
                dueDate: p.dueDate || p.endDate || new Date().toISOString().slice(0,10),
                endDate: p.endDate || p.dueDate || new Date().toISOString().slice(0,10),
                estimatedBudget: p.estimatedBudget ?? 0,
                actualBudget: p.actualBudget ?? 0,
                progress: p.progress ?? 0,
                tasks: p.tasks || []
            };
        }

        // Network helper with timeout to avoid hanging UI on unreachable backends
        async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(url, { ...options, credentials: options.credentials || 'include', signal: controller.signal });
                return res;
            } finally {
                clearTimeout(id);
            }
        }

        async function apiFetch(path, options = {}) {
            // Phase 3 Migration: Use new centralized API client when available
            if (window.api && window.APEX_FEATURES?.USE_NEW_API_CLIENT !== false) {
                const method = (options.method || 'GET').toUpperCase();
                const body = options.body ? JSON.parse(options.body) : undefined;

                try {
                    switch (method) {
                        case 'GET':
                            return await window.api.get(path);
                        case 'POST':
                            return await window.api.post(path, body);
                        case 'PUT':
                            return await window.api.put(path, body);
                        case 'DELETE':
                            return await window.api.delete(path);
                        default:
                            return await window.api.get(path);
                    }
                } catch (apiError) {
                    // If new API client fails, throw the error (it handles 401 etc)
                    throw apiError;
                }
            }

            // Fallback to legacy implementation
            const url = AppState.config.apiUrl + path;
            const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
            if (AppState.backendAuth?.token) {
                headers['Authorization'] = 'Bearer ' + AppState.backendAuth.token;
                headers['x-auth-token'] = AppState.backendAuth.token;
            }
            let res = await fetchWithTimeout(url, { ...options, headers }, options.timeoutMs || 15000);
            if (res.status === 401 && AppState.backendAuth?.refreshToken) {
                const rr = await fetchWithTimeout(AppState.config.apiUrl + '/auth/refresh', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: AppState.backendAuth.refreshToken })
                }, options.timeoutMs || 15000);
                const rdata = await rr.json().catch(() => ({}));
                if (rr.ok && rdata.token) {
                    AppState.backendAuth.token = rdata.token;
                    if (rdata.refreshToken) AppState.backendAuth.refreshToken = rdata.refreshToken;
                    headers['Authorization'] = 'Bearer ' + AppState.backendAuth.token;
                    headers['x-auth-token'] = AppState.backendAuth.token;
                    res = await fetchWithTimeout(url, { ...options, headers }, options.timeoutMs || 15000);
                }
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || res.statusText || 'Request failed');
            return data;
        }

        // ==================== GLOBAL UTILITY FUNCTIONS ====================

        // Global escapeHtml function for security (ASRB 5.1.1)
        function escapeHtml(text) {
            if (text === null || text === undefined) return '';
            if (typeof text !== 'string') text = String(text);
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // [Removed ~1,199 lines: ProductivityMonitor, Personal insights UI - replaced by Vue 3 apps]


// =============================================================================
// Inline event handler replacement (added 2026-04-08)
// =============================================================================
//
// Wires up element event handlers from declarative data-* attributes so the
// CSP can drop 'unsafe-inline' from script-src. Replaces what used to be
// 30 inline onclick/onsubmit/onchange/oninput attributes in index.html.
//
// Supported attributes:
//
//   data-action="fnName"            - click handler, calls window[fnName]()
//   data-action="fnName" data-arg=X - click handler, calls window[fnName](X)
//   data-form-handler="fnName"      - submit handler, e.preventDefault() then
//                                     window[fnName](event)
//   data-change-handler="fnName"    - change handler, calls window[fnName]()
//   data-input-handler="fnName"     - input handler, calls window[fnName](el)
//                                     (passes the element, like the original
//                                     oninput="fn(this)" pattern)
//
// For elements that need to call multiple functions (the 4 user dropdown
// items), they have explicit ids (dropdownAccountSettings, dropdownNotifications,
// dropdownPreferences, dropdownLogout) and are wired in wireupCompoundHandlers
// below.
//
// Anchor tags (<a href="#">) get e.preventDefault() automatically so they
// don't navigate to "#" and scroll the page.

function wireupDataActions() {
    // Generic click handlers via data-action / data-arg
    document.querySelectorAll('[data-action]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            if (el.tagName === 'A') e.preventDefault();
            var fnName = el.dataset.action;
            var arg = el.dataset.arg;
            var fn = window[fnName];
            if (typeof fn !== 'function') {
                console.warn('[wireupDataActions] no function for data-action="' + fnName + '"');
                return;
            }
            if (arg !== undefined && arg !== null && arg !== '') {
                // Convert numeric-looking args (e.g. data-arg="-1" for changeMonth)
                var n = Number(arg);
                fn(!isNaN(n) && arg.trim() !== '' && /^-?\d+(\.\d+)?$/.test(arg) ? n : arg);
            } else {
                fn();
            }
        });
    });

    // Form submit handlers via data-form-handler
    document.querySelectorAll('[data-form-handler]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var fnName = form.dataset.formHandler;
            var fn = window[fnName];
            if (typeof fn !== 'function') {
                console.warn('[wireupDataActions] no function for data-form-handler="' + fnName + '"');
                return;
            }
            fn(e);
        });
    });

    // Change handlers via data-change-handler
    document.querySelectorAll('[data-change-handler]').forEach(function (el) {
        el.addEventListener('change', function () {
            var fnName = el.dataset.changeHandler;
            var fn = window[fnName];
            if (typeof fn !== 'function') {
                console.warn('[wireupDataActions] no function for data-change-handler="' + fnName + '"');
                return;
            }
            fn();
        });
    });

    // Input handlers via data-input-handler (passes the element, mirroring
    // the original oninput="fn(this)" pattern)
    document.querySelectorAll('[data-input-handler]').forEach(function (el) {
        el.addEventListener('input', function () {
            var fnName = el.dataset.inputHandler;
            var fn = window[fnName];
            if (typeof fn !== 'function') {
                console.warn('[wireupDataActions] no function for data-input-handler="' + fnName + '"');
                return;
            }
            fn(el);
        });
    });

    // Compound handlers - elements that call multiple functions on click.
    // Each is wired explicitly because data-action only supports a single fn.
    var compounds = [
        { id: 'dropdownAccountSettings', handler: function () { showView('profile'); toggleUserMenu(); } },
        { id: 'dropdownNotifications',   handler: function () { toggleUserMenu(); } },
        { id: 'dropdownPreferences',     handler: function () { showView('profile'); toggleUserMenu(); } },
        { id: 'dropdownLogout',          handler: function () { logout(); } },
    ];
    compounds.forEach(function (c) {
        var el = document.getElementById(c.id);
        if (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                c.handler();
            });
        }
    });
}

// Run the wireup. Script tag is at end of <body> so the DOM is fully
// parsed by the time this runs, but be defensive in case something
// changes the load position later.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireupDataActions);
} else {
    wireupDataActions();
}
