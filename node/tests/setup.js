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

let authToken = null;

async function login() {
  if (!TEST_USER || !TEST_PASSWORD) {
    throw new Error('APEX_TEST_USER and APEX_TEST_PASSWORD environment variables must be set');
  }
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_USER, password: TEST_PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Login failed: ' + JSON.stringify(data));
  authToken = data.token;
  return authToken;
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

// Run login before all tests
beforeAll(async () => {
  await login();
}, 10000);

module.exports = { api, login, BASE_URL };
