'use strict';

const {
  ORG_ID,
  LOCATIONS,
  WORKSPACES,
  DEVICES,
  buildDeviceConfig,
  buildXapiStatus,
  enrichWorkspace,
  enrichDevice,
} = require('./ciscoMockData');

function isConfigured() {
  return true;
}

async function checkStatus() {
  return {
    configured: true,
    connected: true,
    mock: true,
    tokenExpiry: new Date(Date.now() + 3600000).toISOString(),
    orgId: ORG_ID,
  };
}

async function getDevices(params = {}) {
  let devices = DEVICES.map(enrichDevice);
  if (params.workspaceId) {
    devices = devices.filter(d => d.workspaceId === params.workspaceId);
  }
  if (params.locationId) {
    devices = devices.filter(d => d.locationId === params.locationId);
  }
  if (params.connectionStatus) {
    devices = devices.filter(d => d.connectionStatus === params.connectionStatus);
  }
  return { items: devices };
}

async function getDevice(deviceId) {
  const device = DEVICES.find(d => d.id === deviceId);
  if (!device) {
    const err = new Error(`Mock: device ${deviceId} not found`);
    err.status = 404;
    throw err;
  }
  return enrichDevice(device);
}

async function getWorkspaces(params = {}) {
  let workspaces = WORKSPACES.map(enrichWorkspace);
  if (params.locationId) {
    workspaces = workspaces.filter(w => w.locationId === params.locationId);
  }
  if (params.floorId) {
    workspaces = workspaces.filter(w => w.floorId === params.floorId);
  }
  if (params.type) {
    workspaces = workspaces.filter(w => w.type === params.type);
  }
  return { items: workspaces };
}

async function createWorkspace(data) {
  const id = `ws-mock-${Date.now()}`;
  return {
    id,
    orgId: ORG_ID,
    displayName: data.displayName,
    type: data.type || 'meetingRoom',
    capacity: data.capacity || 0,
    locationId: data.locationId || null,
    floorId: data.floorId || null,
    created: new Date().toISOString(),
  };
}

async function updateWorkspace(workspaceId, data) {
  const ws = WORKSPACES.find(w => w.id === workspaceId);
  if (!ws) {
    const err = new Error(`Mock: workspace ${workspaceId} not found`);
    err.status = 404;
    throw err;
  }
  return { ...enrichWorkspace(ws), ...data };
}

async function executeXapiCommand(deviceId, commandPath, args = {}) {
  const device = DEVICES.find(d => d.id === deviceId);
  if (!device) {
    const err = new Error(`Mock: device ${deviceId} not found`);
    err.status = 404;
    throw err;
  }
  // Simulate realistic responses per command type
  const cmd = commandPath.toLowerCase();
  if (cmd.includes('reboot') || cmd.includes('restart')) {
    return { result: { status: 'OK' }, commandId: `mock-cmd-${Date.now()}` };
  }
  if (cmd.includes('standby')) {
    return { result: { status: 'OK' }, commandId: `mock-cmd-${Date.now()}` };
  }
  if (cmd.includes('diagnostics')) {
    return {
      result: { status: 'OK' },
      diagnostics: { overallStatus: 'OK', items: [] },
      commandId: `mock-cmd-${Date.now()}`,
    };
  }
  return { result: { status: 'OK' }, commandId: `mock-cmd-${Date.now()}` };
}

async function getXapiStatus(deviceId, statusPath) {
  const device = DEVICES.find(d => d.id === deviceId);
  if (!device) {
    const err = new Error(`Mock: device ${deviceId} not found`);
    err.status = 404;
    throw err;
  }
  const fullStatus = buildXapiStatus(device);
  // If a specific path was requested, try to return only that branch
  if (statusPath) {
    const keys = statusPath.split('.');
    let val = fullStatus;
    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        val = null;
        break;
      }
    }
    return val !== null ? { [statusPath]: val } : fullStatus;
  }
  return fullStatus;
}

async function getDeviceConfig(deviceId, keyPattern) {
  const device = DEVICES.find(d => d.id === deviceId);
  if (!device) {
    const err = new Error(`Mock: device ${deviceId} not found`);
    err.status = 404;
    throw err;
  }
  const config = buildDeviceConfig(device);
  if (keyPattern) {
    const pattern = keyPattern.replace(/\*/g, '.*');
    const re = new RegExp(`^${pattern}$`, 'i');
    config.items = config.items.filter(item => re.test(item.key));
  }
  return config;
}

async function updateDeviceConfig(deviceId, items) {
  const device = DEVICES.find(d => d.id === deviceId);
  if (!device) {
    const err = new Error(`Mock: device ${deviceId} not found`);
    err.status = 404;
    throw err;
  }
  return { deviceId, items, updated: new Date().toISOString() };
}

async function activateDevice(workspaceId) {
  const ws = WORKSPACES.find(w => w.id === workspaceId);
  if (!ws) {
    const err = new Error(`Mock: workspace ${workspaceId} not found`);
    err.status = 404;
    throw err;
  }
  return { code: `MOCK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, expirationDate: new Date(Date.now() + 3600000).toISOString() };
}

// Extra mock-only methods for the new endpoints
async function getLocations() {
  return {
    items: LOCATIONS.map(loc => ({
      id: loc.id,
      orgId: ORG_ID,
      displayName: loc.displayName,
      address: loc.address,
      floors: loc.floors,
    })),
  };
}

async function getWorkspaceDevices(workspaceId) {
  const ws = WORKSPACES.find(w => w.id === workspaceId);
  if (!ws) {
    const err = new Error(`Mock: workspace ${workspaceId} not found`);
    err.status = 404;
    throw err;
  }
  const devices = DEVICES.filter(d => d.workspaceId === workspaceId).map(enrichDevice);
  return { workspaceId, devices };
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
