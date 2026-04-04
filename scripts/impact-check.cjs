#!/usr/bin/env node
/**
 * APEX Cross-Stack Impact Checker
 * Runs automatically via Claude Code hook after file edits.
 * Reads the edited file from stdin (hook JSON), maps dependencies,
 * and outputs warnings about what else might be affected.
 *
 * Can also be run manually: echo '{"tool_input":{"file_path":"path"}}' | node scripts/impact-check.cjs
 */

// Dependency map: file -> what it affects and what to verify
const IMPACT_MAP = {
  // ===== BACKEND ROUTES =====
  'node/routes/fieldops.js': {
    label: 'Field Ops Backend',
    affects: [
      'client/src/FieldOpsApp.vue (form fields, table columns, report display)',
      'client/src/DashboardApp.vue (upcoming field work section, attention feed)',
      'node/tests/api.test.js (field ops contract tests)',
    ],
    verify: [
      'API response shape matches FieldOpsApp expectations (mapFieldOpsRow fields)',
      'Report endpoint shape matches Reports tab (byVendor, teamWorkload, flags)',
      'Dashboard /api/reports/attention still includes overdue field ops',
      'POST/PUT field names match form.value keys in FieldOpsApp',
    ],
    visuals: [
      'REPORTS: Vendor Performance card reads vendorPerformance[].{vendorName, recentRate, priorRate, trend, recentAvgHours}',
      'REPORTS: Team Workload card reads teamWorkload[].{assignee, openCount, completedThisMonth, overdueCount, avgResponseHours}',
      'REPORTS: Flags array reads flags[].{type, severity, message}',
      'REPORTS: Monthly trend chart reads byMonth[].{month, count, completed}',
      'REPORTS: By Category reads byCategory[].{category, count, completed}',
      'DASHBOARD: Upcoming Field Work section reads fieldOps with date, taskName, assignee, location, type',
      'DASHBOARD: Attention feed reads attention items with type=overdue_fieldop',
    ],
    tests: ['npm test -- --testNamePattern="Field Ops"'],
  },
  'node/routes/projects.js': {
    label: 'Projects Backend',
    affects: [
      'client/src/ProjectsApp.vue (project list, detail, task management)',
      'client/src/DashboardApp.vue (portfolio stats, status chart)',
      'client/src/FieldOpsApp.vue (project dropdown in schedule form)',
      'client/src/ReportsApp.vue (budget and timeline reports)',
    ],
    verify: [
      'GET /api/projects response shape matches ProjectsApp table columns',
      'GET /api/projects?summary=true still returns id+name for field ops dropdown',
      'GET /api/reports/portfolio aggregation still works with any schema changes',
      'Task JSONB structure changes cascade to attention feed (overdue tasks)',
    ],
    tests: ['npm test -- --testNamePattern="Projects"'],
  },
  'node/routes/reports.js': {
    label: 'Reports Backend',
    affects: [
      'client/src/DashboardApp.vue (portfolio, attention feed, stats)',
      'client/src/ReportsApp.vue (budget, timeline drilldown)',
    ],
    verify: [
      'Portfolio response shape: projects, budget, tasks, businessLines, projectTypes',
      'Attention response shape: attention[], today[], counts{}',
      'Dashboard stats row reads: projects.total, tasks.completionRate, onTimeRate, atRisk',
    ],
    visuals: [
      'DASHBOARD: Stats row needs portfolio.projects.total, tasks.completionRate, onTimeRate, atRisk, compliance.summary.total',
      'DASHBOARD: Project Status chart needs portfolio.projects.{active, onHold, planning, cancelled} + atRisk',
      'DASHBOARD: Project Status "By Type" view needs portfolio.projectTypes[].{type, count}',
      'DASHBOARD: Project Status "Tasks" view needs portfolio.tasks.{completed, inProgress, notStarted}',
      'DASHBOARD: Budget gauge needs portfolio.budget.{totalPlanned, totalActual}',
      'DASHBOARD: Budget "By Department" view needs portfolio.businessLines[].{name, budget}',
      'DASHBOARD: Budget "Health" view needs portfolio.budget.overBudgetCount + projects.total',
      'DASHBOARD: Attention feed needs attention[].{type, severity, title, subtitle, projectId, assignee, daysOverdue}',
      'DASHBOARD: Today Schedule needs today[].{type, title, subtitle, fieldOpType, location, startTime, status}',
      'REPORTS: Budget drilldown expects per-project budget rows',
      'REPORTS: Timeline drilldown expects per-project schedule data',
    ],
    tests: ['npm test -- --testNamePattern="Dashboard"'],
  },
  'node/routes/vendors.js': {
    label: 'Vendors Backend',
    affects: [
      'client/src/FieldOpsApp.vue (vendor dropdown, contact picker)',
      'client/src/VendorsApp.vue (vendor management)',
    ],
    verify: [
      'Vendor response includes contacts JSONB array for contact picker',
      'Vendor name field flows into field ops vendorName on creation',
    ],
    tests: ['npm test -- --testNamePattern="Vendors"'],
  },
  'node/routes/room-status.js': {
    label: 'Room Status Backend',
    affects: [
      'client/src/RoomApp.vue (room list, checks, equipment)',
      'client/src/DashboardApp.vue (room health chart, compliance scorecard)',
      'client/src/FieldOpsApp.vue (room dropdown for room checks)',
    ],
    verify: [
      'Compliance scorecard shape: summary{}, rooms[] with ragStatus and missing[]',
      'Room list includes id+name+location for field ops room picker',
      'Dashboard room chart reads ragStatus and compliance fields',
    ],
    tests: ['npm test -- --testNamePattern="Room Status"'],
  },
  'node/routes/contacts.js': {
    label: 'Contacts Backend',
    affects: [
      'client/src/ContactsApp.vue (contacts management)',
      'Project assignments (projectassignments table)',
    ],
    verify: ['Contact types: internal, vendor, gc, architect, oac_rep, consultant, client'],
    tests: ['npm test -- --testNamePattern="Contacts"'],
  },

  // ===== FRONTEND VUE COMPONENTS =====
  'client/src/DashboardApp.vue': {
    label: 'Dashboard Frontend',
    affects: [
      'Consumes: /api/reports/portfolio, /api/room-status/compliance/scorecard, /api/reports/attention, /api/fieldops',
    ],
    verify: [
      'Chart cycling state (projectView, budgetView, roomView) indexes match view arrays',
      'pieBase() helper shared by all 3 charts - changes affect all charts',
      'Legend computeds must return {label, value, color} objects',
      'navigateTo() function maps to monolith showView() sections',
    ],
    tests: [],
  },
  'client/src/FieldOpsApp.vue': {
    label: 'Field Ops Frontend',
    affects: [
      'Consumes: /api/fieldops, /api/fieldops/report, /api/projects, /api/vendors, /api/room-status, /api/users',
    ],
    verify: [
      'form.value keys must match backend POST /api/fieldops body params',
      'Report sections read: report.vendorPerformance, report.teamWorkload, report.flags, report.byCategory',
      'vendorContactOptions computed depends on vendorOptions having raw.contacts',
      'onProjectSelect/onVendorSelect/onRoomSelect auto-fill form fields',
    ],
    tests: [],
  },
  'client/src/composables/useTheme.ts': {
    label: 'Theme System',
    affects: [
      'ALL Vue components use colors from useTheme()',
      'DashboardApp, FieldOpsApp, ProjectsApp, RoomApp, ReportsApp, AdminApp, ProfileApp',
    ],
    verify: [
      'Color tokens: textMuted, textSecondary, textPrimary, cardBg, railColor, borderSubtle, tooltipBg/Border/Text, inputBg/Border/Text',
      'Removing or renaming a token breaks all components that reference it',
      'Both dark and light mode objects must have identical keys',
    ],
    tests: [],
  },
  'client/src/mount.ts': {
    label: 'Vue Mount Entry Point',
    affects: ['ALL 7 section mount functions', 'index.html mountVueSection() calls'],
    verify: [
      'Mount function names must match what index.html calls',
      'Each mount function creates its own Vue app instance',
      'Naive UI provider wrapping in each component, not in mount.ts',
    ],
    tests: [],
  },

  // ===== INFRASTRUCTURE =====
  'index.html': {
    label: 'App Shell (Monolith)',
    affects: ['Auth flow', 'Navigation', 'Vue bundle loading', 'CSS'],
    verify: [
      'Cache bust version ?v=N on apex-rooms.iife.js and .css',
      'mountVueSection() function matches mount.ts exports',
      'Section div IDs match what mount functions target',
    ],
    tests: [],
  },
  'node/server.js': {
    label: 'Express Server',
    affects: ['ALL API routes', 'Auth middleware', 'Rate limiting'],
    verify: [
      'Route registration order matters (specific before wildcard)',
      'Auth middleware applied to protected routes',
      'Rate limiter on /api/auth/login - tests may hit this',
    ],
    tests: ['npm test'],
  },
  'node/middleware/audit.js': {
    label: 'Audit Middleware',
    affects: ['All mutation endpoints that use auditLog()'],
    verify: [
      'auditLog(description, entity, level) signature unchanged',
      'Extracts projectId/taskId from req.params',
    ],
    tests: [],
  },
};

// Read hook input from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const filePath = data.tool_input?.file_path || data.file_path || '';

    // Normalize path to relative from apex-platform root
    const normalized = filePath
      .replace(/\\/g, '/')
      .replace(/\\\\/g, '/')
      .replace(/^.*apex-platform\//, '');

    // Find matching impact entry
    let match = null;
    let matchKey = null;
    for (const [pattern, info] of Object.entries(IMPACT_MAP)) {
      if (normalized.includes(pattern) || normalized.endsWith(pattern)) {
        match = info;
        matchKey = pattern;
        break;
      }
    }

    if (!match) {
      // No known impact - silent exit
      process.exit(0);
    }

    // Output impact warning to Claude's context
    const lines = [];
    lines.push(`[IMPACT CHECK] Edited: ${match.label} (${matchKey})`);
    lines.push('');
    lines.push('Affected components:');
    match.affects.forEach(a => lines.push(`  - ${a}`));
    lines.push('');
    lines.push('Verify these contracts:');
    match.verify.forEach(v => lines.push(`  - ${v}`));
    if (match.visuals && match.visuals.length > 0) {
      lines.push('');
      lines.push('Visual elements at risk (charts, reports, UI):');
      match.visuals.forEach(v => lines.push(`  ! ${v}`));
    }
    if (match.tests.length > 0) {
      lines.push('');
      lines.push('Run to validate: ' + match.tests.join(' && '));
    }

    console.log(lines.join('\n'));
    process.exit(0);
  } catch (e) {
    // Silent exit on parse errors (non-hook invocation)
    process.exit(0);
  }
});

// Handle case where stdin is empty (manual run without piped input)
setTimeout(() => {
  if (!input) {
    console.log('Usage: echo \'{"tool_input":{"file_path":"node/routes/fieldops.js"}}\' | node scripts/impact-check.cjs');
    console.log('\nTracked files:');
    Object.entries(IMPACT_MAP).forEach(([k, v]) => console.log(`  ${k} - ${v.label}`));
    process.exit(0);
  }
}, 500);
