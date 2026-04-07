#!/usr/bin/env node
/**
 * APEX Platform Smoke Check
 * Runs build verification, health checks, and API endpoint validation.
 *
 * Usage: node scripts/check.js
 */
const { execSync } = require('child_process');
const path = require('path');

const BASE_URL = process.env.APEX_URL || 'http://localhost:3001';
const passed = [];
const failed = [];

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function pass(msg) { passed.push(msg); log('\x1b[32mPASS\x1b[0m', msg); }
function fail(msg, err) { failed.push(msg); log('\x1b[31mFAIL\x1b[0m', `${msg}${err ? ' - ' + err : ''}`); }

async function checkHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    if (data.status === 'healthy') pass('Backend health check');
    else fail('Backend health check', 'status: ' + data.status);
  } catch (e) { fail('Backend health check', e.message); }
}

// Credentials are read from environment variables. Set APEX_TEST_USER and
// APEX_TEST_PASSWORD before running this script. Do NOT hardcode credentials
// here - this file is committed to git.
const TEST_USER = process.env.APEX_TEST_USER;
const TEST_PASSWORD = process.env.APEX_TEST_PASSWORD;

let cachedToken = null;
async function getToken() {
  if (cachedToken) return cachedToken;
  if (!TEST_USER || !TEST_PASSWORD) {
    throw new Error('APEX_TEST_USER and APEX_TEST_PASSWORD environment variables must be set');
  }
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER, password: TEST_PASSWORD }),
  });
  const loginData = await loginRes.json();
  if (!loginData.token) throw new Error('Auth failed: ' + JSON.stringify(loginData));
  cachedToken = loginData.token;
  return cachedToken;
}

async function checkEndpoint(name, path, validate) {
  try {
    const token = await getToken();
    const res = await fetch(`${BASE_URL}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 200) { fail(name, `HTTP ${res.status}`); return; }
    const data = await res.json();
    if (validate(data)) pass(name);
    else fail(name, 'Validation failed');
  } catch (e) { fail(name, e.message); }
}

async function checkBuild() {
  try {
    const clientDir = path.resolve(__dirname, '..', 'client');
    execSync('npm run build', { cwd: clientDir, stdio: 'pipe', timeout: 60000 });
    pass('Frontend build');
  } catch (e) {
    fail('Frontend build', e.stderr?.toString().slice(0, 200) || e.message);
  }
}

async function checkPageContent() {
  try {
    const pageUrl = process.env.APEX_PAGE_URL || 'http://apex.localhost';
    const res = await fetch(pageUrl);
    const html = await res.text();
    const checks = [
      ['Page: dashboard mount point', html.includes('id="dashboard"') || html.includes('dashboard')],
      ['Page: Vue bundle reference', html.includes('apex-rooms.iife.js')],
      ['Page: login form', html.includes('login') || html.includes('Login')],
    ];
    checks.forEach(([name, ok]) => ok ? pass(name) : fail(name));
  } catch (e) {
    // Local HTML check - try via nginx
    fail('Page content check', e.message);
  }
}

async function run() {
  console.log('\n\x1b[1mAPEX Platform Smoke Check\x1b[0m\n');

  console.log('\x1b[36m[1/4] Health\x1b[0m');
  await checkHealth();

  console.log('\x1b[36m[2/4] API Endpoints\x1b[0m');
  await checkEndpoint('GET /api/fieldops', '/fieldops', d => d.scheduled && d.completed && d.pending);
  await checkEndpoint('GET /api/fieldops/report', '/fieldops/report', d => d.summary && d.byType && d.flags !== undefined);
  await checkEndpoint('GET /api/projects', '/projects?summary=true&limit=1', d => d.projects && d.pagination);
  await checkEndpoint('GET /api/room-status', '/room-status', d => d.rooms);
  await checkEndpoint('GET /api/vendors', '/vendors', d => Array.isArray(d.vendors || d));
  await checkEndpoint('GET /api/reports/portfolio', '/reports/portfolio', d => d.projects && d.budget);
  await checkEndpoint('GET /api/reports/attention', '/reports/attention', d => d.attention && d.counts);
  await checkEndpoint('GET /api/users', '/users', d => d.users);

  console.log('\x1b[36m[3/4] Frontend Build\x1b[0m');
  await checkBuild();

  console.log('\x1b[36m[4/4] Page Content\x1b[0m');
  await checkPageContent();

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`\x1b[32m${passed.length} passed\x1b[0m, \x1b[31m${failed.length} failed\x1b[0m`);
  if (failed.length > 0) {
    console.log('\nFailed checks:');
    failed.forEach(f => console.log(`  \x1b[31mx\x1b[0m ${f}`));
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll checks passed.\x1b[0m\n');
    process.exit(0);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
