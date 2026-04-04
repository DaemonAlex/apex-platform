/**
 * APEX API Test Setup
 * Authenticates as the service account and provides helpers for tests.
 */
const BASE_URL = process.env.APEX_TEST_URL || 'http://localhost:3001';

let authToken = null;

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'service@apex.local', password: '***REDACTED-PASSWORD***' }),
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
