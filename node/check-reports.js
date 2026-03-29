// Report endpoint validation script
// Run after backend changes to verify all report endpoints return valid data

const http = require('http');

const API = 'http://localhost:3001';
const CREDS = { email: 'service@apex.local', password: '***REDACTED-PASSWORD***' };

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  // Login
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify(CREDS),
  });
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.token;
  if (!token) { console.error('FAIL: Could not login'); process.exit(1); }
  const userId = loginData.user?.id || loginData.userId || 1;

  const headers = { Authorization: `Bearer ${token}` };
  const results = [];

  // Define checks
  const checks = [
    {
      name: 'Portfolio Report',
      url: '/api/reports/portfolio',
      validate: (d) => {
        if (!d.projects) return 'Missing projects';
        if (typeof d.projects.total !== 'number') return 'projects.total not a number';
        if (!d.tasks) return 'Missing tasks';
        if (typeof d.tasks.completionRate !== 'number') return 'tasks.completionRate not a number';
        if (!d.budget) return 'Missing budget';
        return null;
      }
    },
    {
      name: 'Budget Report',
      url: '/api/reports/budget',
      validate: (d) => {
        if (!d.totals) return 'Missing totals';
        if (!Array.isArray(d.projects)) return 'projects not an array';
        return null;
      }
    },
    {
      name: 'Timeline Report',
      url: '/api/reports/timeline',
      validate: (d) => {
        if (!Array.isArray(d.upcoming)) return 'upcoming not an array';
        if (!Array.isArray(d.overdue)) return 'overdue not an array';
        if (!Array.isArray(d.recentlyCompleted)) return 'recentlyCompleted not an array';
        return null;
      }
    },
    {
      name: `User Report (id=${userId})`,
      url: `/api/reports/user/${userId}`,
      validate: (d) => {
        if (!d.user) return 'Missing user';
        if (!d.summary) return 'Missing summary';
        if (typeof d.summary.totalTasks !== 'number') return 'summary.totalTasks not a number';
        return null;
      }
    },
    {
      name: 'Room Status',
      url: '/api/room-status',
      validate: (d) => {
        if (!Array.isArray(d.rooms)) return 'rooms not an array';
        return null;
      }
    },
    {
      name: 'Locations',
      url: '/api/room-status/locations/list',
      validate: (d) => {
        if (!Array.isArray(d.locations)) return 'locations not an array';
        return null;
      }
    },
    {
      name: 'Compliance Scorecard',
      url: '/api/room-status/compliance/scorecard',
      validate: (d) => {
        if (!d.summary) return 'Missing summary';
        if (typeof d.summary.total !== 'number') return 'summary.total not a number';
        return null;
      }
    },
    {
      name: 'Contacts',
      url: '/api/contacts',
      validate: (d) => {
        if (!Array.isArray(d.contacts)) return 'contacts not an array';
        return null;
      }
    },
    {
      name: 'Business Lines Settings',
      url: '/api/settings/business-lines',
      validate: (d) => {
        if (!Array.isArray(d.businessLines)) return 'businessLines not an array';
        if (d.businessLines.length === 0) return 'businessLines is empty';
        return null;
      }
    },
    {
      name: 'Standards',
      url: '/api/room-status/standards/list',
      validate: (d) => {
        if (!Array.isArray(d.standards)) return 'standards not an array';
        return null;
      }
    },
  ];

  let failures = 0;

  for (const check of checks) {
    try {
      const res = await fetch(`${API}${check.url}`, { headers });
      if (res.status !== 200) {
        results.push({ name: check.name, status: 'FAIL', detail: `HTTP ${res.status}` });
        failures++;
        continue;
      }
      const data = JSON.parse(res.body);
      const error = check.validate(data);
      if (error) {
        results.push({ name: check.name, status: 'FAIL', detail: error });
        failures++;
      } else {
        results.push({ name: check.name, status: 'OK', detail: '' });
      }
    } catch (e) {
      results.push({ name: check.name, status: 'FAIL', detail: e.message });
      failures++;
    }
  }

  // Output
  console.log('\n=== REPORT VALIDATION ===');
  const maxName = Math.max(...results.map(r => r.name.length));
  results.forEach(r => {
    const icon = r.status === 'OK' ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name.padEnd(maxName + 2)}${r.detail}`);
  });
  console.log(`\n  ${results.length - failures}/${results.length} passed${failures > 0 ? ` - ${failures} FAILED` : ' - all good'}\n`);

  process.exit(failures > 0 ? 1 : 0);
}

run().catch(e => { console.error('Script error:', e.message); process.exit(1); });
