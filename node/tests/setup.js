/**
 * APEX API Test Setup
 * Authenticates as the test service account and provides helpers for tests.
 *
 * Credentials are read from environment variables. Set APEX_TEST_USER and
 * APEX_TEST_PASSWORD before running tests. Do NOT hardcode credentials here.
 */
const BASE_URL = process.env.APEX_TEST_URL || 'http://localhost:3001';
const TEST_USER = process.env.APEX_TEST_USER;
const TEST_PASSWORD = process.env.APEX_TEST_PASSWORD;
const VIEWER_USER = process.env.APEX_VIEWER_USER;
const VIEWER_PASSWORD = process.env.APEX_VIEWER_PASSWORD;

let authToken = null;
let viewerToken = null;

async function loginAs(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Login failed: ' + JSON.stringify(data));
  return data.token;
}

async function login() {
  if (!TEST_USER || !TEST_PASSWORD) {
    throw new Error('APEX_TEST_USER and APEX_TEST_PASSWORD environment variables must be set');
  }
  authToken = await loginAs(TEST_USER, TEST_PASSWORD);
  return authToken;
}

// Log in as a non-admin viewer/auditor account, used by IDOR regression tests.
// Returns null if APEX_VIEWER_USER / APEX_VIEWER_PASSWORD are not set so tests
// can skip cleanly rather than fail on environments without a second account.
async function loginViewer() {
  if (!VIEWER_USER || !VIEWER_PASSWORD) return null;
  if (viewerToken) return viewerToken;
  viewerToken = await loginAs(VIEWER_USER, VIEWER_PASSWORD);
  return viewerToken;
}

async function api(path, options = {}) {
  if (!authToken) await login();
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function apiAs(token, path, options = {}) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

// Run login before all tests
beforeAll(async () => {
  await login();
}, 10000);

module.exports = { api, apiAs, login, loginViewer, BASE_URL };
