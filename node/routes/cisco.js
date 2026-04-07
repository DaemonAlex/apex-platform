const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const cisco = require('../services/ciscoClient');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Cisco Control Hub talks to live network infrastructure (devices, workspaces,
// schedules). Reads (status, device list, etc.) are open to writers and above
// because field ops and project managers need to see device state. Mutations
// (POST/PUT/PATCH/DELETE) require admin since they push device commands and
// configuration changes to real hardware. Prior to 2026-04 any logged-in
// user could call POST /api/cisco/devices/:id/command and execute arbitrary
// commands on Webex devices in the org.
const ciscoReaders = ['admin', 'superadmin', 'owner', 'project_manager', 'field_ops', 'auditor'];
const ciscoAdmins = ['admin', 'superadmin', 'owner'];
const readerGate = requireRole(ciscoReaders);
const adminGate = requireRole(ciscoAdmins);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return readerGate(req, res, next);
  }
  return adminGate(req, res, next);
});

async function ensureCiscoTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cisco_devices (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      product VARCHAR(255),
      type VARCHAR(100),
      status VARCHAR(50),
      serial VARCHAR(100),
      mac VARCHAR(50),
      ip VARCHAR(50),
      workspace_id VARCHAR(255),
      org_id VARCHAR(255),
      last_seen TIMESTAMPTZ,
      raw_data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cisco_sync_log (
      id SERIAL PRIMARY KEY,
      sync_type VARCHAR(50) NOT NULL,
      records_synced INTEGER DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      error_message TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cisco_locations (
      id SERIAL PRIMARY KEY,
      location_id VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      org_id VARCHAR(255),
      address JSONB DEFAULT '{}',
      floors JSONB DEFAULT '[]',
      raw_data JSONB DEFAULT '{}',
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cisco_workspaces (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(255) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      org_id VARCHAR(255),
      type VARCHAR(100),
      capacity INTEGER DEFAULT 0,
      location_id VARCHAR(255),
      floor_id VARCHAR(255),
      calling JSONB DEFAULT '{}',
      sip_address VARCHAR(255),
      raw_data JSONB DEFAULT '{}',
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cisco_room_checks (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(255) NOT NULL,
      workspace_name VARCHAR(255),
      checked_by VARCHAR(255),
      status VARCHAR(20) DEFAULT 'pass',
      notes TEXT,
      snow_ticket VARCHAR(100),
      checked_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cisco_room_schedules (
      workspace_id VARCHAR(255) PRIMARY KEY,
      workspace_name VARCHAR(255),
      check_frequency VARCHAR(20) DEFAULT 'weekly',
      check_day INT DEFAULT 1,
      last_checked_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let tablesReady = false;

// Load persisted Cisco config from DB into process.env on startup
async function loadCiscoConfigFromDB() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS AppConfig (key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);
    const result = await pool.query(`SELECT key, value FROM AppConfig WHERE key IN ('cisco_personal_token', 'cisco_mock_mode')`);
    for (const row of result.rows) {
      const val = typeof row.value === 'string' ? row.value : JSON.stringify(row.value).replace(/^"|"$/g, '');
      if (row.key === 'cisco_personal_token' && val && val !== 'null') process.env.CISCO_PERSONAL_TOKEN = val;
      if (row.key === 'cisco_mock_mode') process.env.CISCO_MOCK_MODE = val === 'true' || val === true ? 'true' : 'false';
    }
  } catch (e) { /* non-fatal - fall back to .env values */ }
}
loadCiscoConfigFromDB();

// GET /api/cisco/config - Read current integration config (token masked)
router.get('/config', async (req, res) => {
  try {
    const token = process.env.CISCO_PERSONAL_TOKEN || '';
    res.json({
      mockMode: process.env.CISCO_MOCK_MODE === 'true',
      hasToken: !!token,
      tokenPreview: token ? token.slice(0, 8) + '...' + token.slice(-4) : null,
      orgId: process.env.CISCO_ORG_ID || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cisco/config - Update integration config (persists to DB + takes effect immediately)
router.post('/config', async (req, res) => {
  try {
    const { personalToken, mockMode } = req.body;
    await pool.query(`CREATE TABLE IF NOT EXISTS AppConfig (key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW())`);

    if (typeof mockMode === 'boolean') {
      process.env.CISCO_MOCK_MODE = mockMode ? 'true' : 'false';
      await pool.query(`INSERT INTO AppConfig (key, value) VALUES ('cisco_mock_mode', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(String(mockMode))]);
    }

    if (personalToken !== undefined) {
      const token = (personalToken || '').trim();
      process.env.CISCO_PERSONAL_TOKEN = token;
      await pool.query(`INSERT INTO AppConfig (key, value) VALUES ('cisco_personal_token', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(token)]);
    }

    const current = process.env.CISCO_PERSONAL_TOKEN || '';
    res.json({
      ok: true,
      mockMode: process.env.CISCO_MOCK_MODE === 'true',
      hasToken: !!current,
      tokenPreview: current ? current.slice(0, 8) + '...' + current.slice(-4) : null,
      message: 'Configuration saved. Restart the backend to apply mock mode changes.',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cisco/status - Check connection and return cache stats
router.get('/status', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }

    const status = await cisco.checkStatus();

    const deviceCountResult = await pool.query('SELECT COUNT(*) FROM cisco_devices');
    const lastSyncResult = await pool.query(`
      SELECT completed_at FROM cisco_sync_log
      WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1
    `);

    res.json({
      ...status,
      mockMode: process.env.CISCO_MOCK_MODE === 'true',
      cachedDeviceCount: parseInt(deviceCountResult.rows[0].count),
      lastSync: lastSyncResult.rows[0]?.completed_at || null,
    });
  } catch (error) {
    logger.error('Error checking Cisco status', { error: error.message });
    res.status(500).json({ error: 'Failed to check Cisco status' });
  }
});

// GET /api/cisco/devices - Sync from Control Hub and return devices
router.get('/devices', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }

    const logRow = await pool.query(
      `INSERT INTO cisco_sync_log (sync_type, status) VALUES ('devices', 'running') RETURNING id`
    );
    const logId = logRow.rows[0].id;

    try {
      const result = await cisco.getDevices();
      const devices = result.items || [];

      for (const device of devices) {
        await pool.query(`
          INSERT INTO cisco_devices
            (device_id, display_name, product, type, status, serial, mac, ip, workspace_id, org_id, last_seen, raw_data, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (device_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            product = EXCLUDED.product,
            type = EXCLUDED.type,
            status = EXCLUDED.status,
            serial = EXCLUDED.serial,
            mac = EXCLUDED.mac,
            ip = EXCLUDED.ip,
            workspace_id = EXCLUDED.workspace_id,
            org_id = EXCLUDED.org_id,
            last_seen = EXCLUDED.last_seen,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()
        `, [
          device.id,
          device.displayName || null,
          device.product || null,
          device.type || null,
          device.connectionStatus || null,
          device.serial || null,
          device.mac || null,
          device.ip || null,
          device.workspaceId || null,
          device.orgId || null,
          device.lastSeen || null,
          JSON.stringify(device),
        ]);
      }

      await pool.query(
        `UPDATE cisco_sync_log SET status = 'success', records_synced = $1, completed_at = NOW() WHERE id = $2`,
        [devices.length, logId]
      );

      res.json({ devices, fromCache: false, synced: devices.length });
    } catch (syncError) {
      await pool.query(
        `UPDATE cisco_sync_log SET status = 'error', error_message = $1, completed_at = NOW() WHERE id = $2`,
        [syncError.message, logId]
      );
      // Fall back to cached data
      const cached = await pool.query('SELECT * FROM cisco_devices ORDER BY display_name');
      res.json({ devices: cached.rows, fromCache: true, error: syncError.message });
    }
  } catch (error) {
    logger.error('Error fetching Cisco devices', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

// GET /api/cisco/devices/:id - Get single device from Control Hub
router.get('/devices/:id', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }
    const device = await cisco.getDevice(req.params.id);
    res.json(device);
  } catch (error) {
    logger.error('Error fetching Cisco device', { error: error.message, deviceId: req.params.id });
    if (error.status === 404) return res.status(404).json({ error: 'Device not found' });
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

// GET /api/cisco/workspaces - List workspaces from Control Hub
router.get('/workspaces', async (req, res) => {
  try {
    const result = await cisco.getWorkspaces();
    const workspaces = result.items || [];

    // Cache into cisco_workspaces
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }
    for (const ws of workspaces) {
      await pool.query(`
        INSERT INTO cisco_workspaces
          (workspace_id, display_name, org_id, type, capacity, location_id, floor_id, calling, sip_address, raw_data, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (workspace_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          type = EXCLUDED.type,
          capacity = EXCLUDED.capacity,
          location_id = EXCLUDED.location_id,
          floor_id = EXCLUDED.floor_id,
          calling = EXCLUDED.calling,
          sip_address = EXCLUDED.sip_address,
          raw_data = EXCLUDED.raw_data,
          synced_at = NOW()
      `, [
        ws.id,
        ws.displayName || null,
        ws.orgId || null,
        ws.type || null,
        ws.capacity || 0,
        ws.locationId || null,
        ws.floorId || null,
        JSON.stringify(ws.calling || {}),
        ws.sipAddress || null,
        JSON.stringify(ws),
      ]);
    }

    res.json({ workspaces });
  } catch (error) {
    logger.error('Error fetching Cisco workspaces', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

// POST /api/cisco/workspaces - Create a workspace in Control Hub
router.post('/workspaces', async (req, res) => {
  try {
    const { displayName, floorId, capacity, type, notes } = req.body;
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    const workspace = await cisco.createWorkspace({ displayName, floorId, capacity, type, notes });
    logger.info('Cisco workspace created', { displayName, user: req.user?.id });
    res.json({ success: true, workspace });
  } catch (error) {
    logger.error('Error creating Cisco workspace', { error: error.message });
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// GET /api/cisco/locations - Return location hierarchy (buildings > floors)
router.get('/locations', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }

    const result = await cisco.getLocations();
    const locations = result.items || [];

    // Cache into cisco_locations
    for (const loc of locations) {
      await pool.query(`
        INSERT INTO cisco_locations
          (location_id, display_name, org_id, address, floors, raw_data, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (location_id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          address = EXCLUDED.address,
          floors = EXCLUDED.floors,
          raw_data = EXCLUDED.raw_data,
          synced_at = NOW()
      `, [
        loc.id,
        loc.displayName || null,
        loc.orgId || null,
        JSON.stringify(loc.address || {}),
        JSON.stringify(loc.floors || []),
        JSON.stringify(loc),
      ]);
    }

    res.json({ locations });
  } catch (error) {
    logger.error('Error fetching Cisco locations', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET /api/cisco/workspaces/:id/devices - Devices assigned to a workspace
router.get('/workspaces/:id/devices', async (req, res) => {
  try {
    const result = await cisco.getWorkspaceDevices(req.params.id);
    res.json(result);
  } catch (error) {
    logger.error('Error fetching workspace devices', { error: error.message, workspaceId: req.params.id });
    if (error.status === 404) return res.status(404).json({ error: 'Workspace not found' });
    res.status(500).json({ error: 'Failed to fetch workspace devices' });
  }
});

// POST /api/cisco/devices/:id/command - Execute xAPI command on a device
router.post('/devices/:id/command', async (req, res) => {
  try {
    const { command, arguments: args } = req.body;
    if (!command) return res.status(400).json({ error: 'command is required' });
    const result = await cisco.executeXapiCommand(req.params.id, command, args || {});
    logger.info('Cisco xAPI command executed', { deviceId: req.params.id, command, user: req.user?.id });
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error executing Cisco command', { error: error.message, deviceId: req.params.id });
    res.status(500).json({ error: 'Failed to execute command' });
  }
});

// GET /api/cisco/devices/:id/config - Get device configuration
router.get('/devices/:id/config', async (req, res) => {
  try {
    const config = await cisco.getDeviceConfig(req.params.id, req.query.key);
    res.json(config);
  } catch (error) {
    logger.error('Error fetching device config', { error: error.message, deviceId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch device configuration' });
  }
});

// PATCH /api/cisco/devices/:id/config - Push configuration to device
router.patch('/devices/:id/config', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items array is required' });
    const result = await cisco.updateDeviceConfig(req.params.id, items);
    logger.info('Cisco device config updated', { deviceId: req.params.id, itemCount: items.length, user: req.user?.id });
    res.json({ success: true, result });
  } catch (error) {
    logger.error('Error updating device config', { error: error.message, deviceId: req.params.id });
    res.status(500).json({ error: 'Failed to update device configuration' });
  }
});

// GET /api/cisco/checks - Room check history
router.get('/checks', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }
    const result = await pool.query(`SELECT * FROM cisco_room_checks ORDER BY checked_at DESC LIMIT 200`);
    res.json({ checks: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cisco/checks - Log a room check
router.post('/checks', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }
    const { workspaceId, workspaceName, checkedBy, status, notes, snowTicket } = req.body;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
    const result = await pool.query(
      `INSERT INTO cisco_room_checks (workspace_id, workspace_name, checked_by, status, notes, snow_ticket)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [workspaceId, workspaceName || null, checkedBy || 'Manual', status || 'pass', notes || null, snowTicket || null]
    );
    await pool.query(
      `UPDATE cisco_room_schedules SET last_checked_at = NOW(), updated_at = NOW() WHERE workspace_id = $1`,
      [workspaceId]
    );
    res.json({ success: true, check: result.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cisco/schedules - All check schedules
router.get('/schedules', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }
    const result = await pool.query(`SELECT * FROM cisco_room_schedules`);
    res.json({ schedules: result.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/cisco/workspaces/:workspaceId/schedule - Set check schedule for a workspace
router.put('/workspaces/:workspaceId/schedule', async (req, res) => {
  try {
    if (!tablesReady) { await ensureCiscoTables(); tablesReady = true; }
    const { workspaceId } = req.params;
    const { workspaceName, checkFrequency, checkDay } = req.body;
    await pool.query(
      `INSERT INTO cisco_room_schedules (workspace_id, workspace_name, check_frequency, check_day)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id) DO UPDATE SET
         workspace_name = COALESCE(EXCLUDED.workspace_name, cisco_room_schedules.workspace_name),
         check_frequency = EXCLUDED.check_frequency,
         check_day = EXCLUDED.check_day,
         updated_at = NOW()`,
      [workspaceId, workspaceName || null, checkFrequency || 'weekly', checkDay ?? 1]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
