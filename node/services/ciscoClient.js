'use strict';

// Enforce TLS 1.2 minimum for all outbound TLS connections from this process.
// Node's built-in fetch (undici) and the https module both respect this setting.
// Node 12+ defaults to TLSv1.2, but we set it explicitly as a security assertion
// so the minimum cannot be silently downgraded by flags or future defaults.
const tls = require('node:tls');
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';

const logger = require('../utils/logger');

// When CISCO_MOCK_MODE=true, delegate all calls to the mock service
if (process.env.CISCO_MOCK_MODE === 'true') {
  module.exports = require('./ciscoMock');
  return;
}

const BASE_URL = 'https://webexapis.com/v1';
const TOKEN_URL = 'https://webexapis.com/v1/access_token';

// Cisco rate limit: 200 req/min. Enforce 310ms min between requests (~193/min).
const MIN_REQUEST_INTERVAL_MS = 310;

// Token cache
let accessToken = null;
let tokenExpiry = null;

// Serial request queue - ensures rate limit is respected even under concurrent calls
let requestQueue = Promise.resolve();
let lastRequestTime = 0;

function isConfigured() {
  return !!(process.env.CISCO_PERSONAL_TOKEN || (process.env.CISCO_CLIENT_ID && process.env.CISCO_CLIENT_SECRET));
}

async function getAccessToken() {
  // Personal Access Token takes priority - skip OAuth entirely
  if (process.env.CISCO_PERSONAL_TOKEN) {
    return process.env.CISCO_PERSONAL_TOKEN;
  }

  // Return cached token if still valid (60s buffer for clock skew)
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }

  if (!isConfigured()) {
    throw new Error('Cisco credentials not configured. Set CISCO_CLIENT_ID and CISCO_CLIENT_SECRET in .env');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.CISCO_CLIENT_ID,
    client_secret: process.env.CISCO_CLIENT_SECRET,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cisco token request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  logger.info('Cisco access token refreshed', { expiresIn: data.expires_in });
  return accessToken;
}

// All API requests go through this queue to enforce rate limiting
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      const elapsed = Date.now() - lastRequestTime;
      if (elapsed < MIN_REQUEST_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
      }
      lastRequestTime = Date.now();

      try {
        const token = await getAccessToken();
        const url = `${BASE_URL}${path}`;
        const options = {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        };
        if (body !== undefined) options.body = JSON.stringify(body);

        const res = await fetch(url, options);

        if (!res.ok) {
          const errText = await res.text();
          const err = new Error(`Cisco API error (${res.status}): ${errText}`);
          err.status = res.status;
          throw err;
        }

        // 204 No Content
        if (res.status === 204) { resolve(null); return; }

        resolve(await res.json());
      } catch (e) {
        reject(e);
      }
    });
  });
}

function buildQuery(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? `?${q}` : '';
}

// --- Status ---

async function checkStatus() {
  if (!isConfigured()) {
    return { configured: false, connected: false };
  }
  try {
    await getAccessToken();
    return {
      configured: true,
      connected: true,
      tokenExpiry: new Date(tokenExpiry).toISOString(),
      orgId: process.env.CISCO_ORG_ID || null,
    };
  } catch (error) {
    return { configured: true, connected: false, error: error.message };
  }
}

// --- Devices ---

function getDevices(params = {}) {
  const q = buildQuery({ orgId: process.env.CISCO_ORG_ID, ...params });
  return request('GET', `/devices${q}`);
}

function getDevice(deviceId) {
  return request('GET', `/devices/${deviceId}`);
}

// --- Workspaces ---

function getWorkspaces(params = {}) {
  const q = buildQuery({ orgId: process.env.CISCO_ORG_ID, ...params });
  return request('GET', `/workspaces${q}`);
}

function createWorkspace(data) {
  return request('POST', '/workspaces', data);
}

function updateWorkspace(workspaceId, data) {
  return request('PUT', `/workspaces/${workspaceId}`, data);
}

// --- xAPI ---

function executeXapiCommand(deviceId, commandPath, args = {}) {
  return request('POST', `/xapi/command/${commandPath}`, { deviceId, arguments: args });
}

function getXapiStatus(deviceId, statusPath) {
  const q = buildQuery({ deviceId, name: statusPath });
  return request('GET', `/xapi/status${q}`);
}

// --- Device Configurations ---

function getDeviceConfig(deviceId, keyPattern) {
  const q = buildQuery({ deviceId, key: keyPattern });
  return request('GET', `/deviceConfigurations${q}`);
}

function updateDeviceConfig(deviceId, items) {
  // items: [{ key: 'Audio.Volume', value: '50' }, ...]
  const q = buildQuery({ deviceId });
  return request('PATCH', `/deviceConfigurations${q}`, { items });
}

// --- Activation ---

function activateDevice(workspaceId) {
  return request('POST', '/devices/activationCode', { workspaceId });
}

// --- Locations (Control Hub locations + floors) ---

function getLocations() {
  const q = buildQuery({ orgId: process.env.CISCO_ORG_ID });
  return request('GET', `/locations${q}`);
}

// Returns devices assigned to a workspace
function getWorkspaceDevices(workspaceId) {
  return getDevices({ workspaceId }).then(result => ({
    workspaceId,
    devices: result.items || [],
  }));
}

module.exports = {
  isConfigured,
  checkStatus,
  getDevices,
  getDevice,
  getWorkspaces,
  createWorkspace,
  updateWorkspace,
  executeXapiCommand,
  getXapiStatus,
  getDeviceConfig,
  updateDeviceConfig,
  activateDevice,
  getLocations,
  getWorkspaceDevices,
};
