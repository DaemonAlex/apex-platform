const express = require('express');
const { pool } = require('../db');
const { sendServerError } = require('../utils/errors');
const { auditLog } = require('../middleware/audit');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Reads stay open to all logged-in users (the frontend needs business
// lines, project prefix, etc., to render forms). Writes are admin-only.
// Prior to 2026-04 the catch-all `PUT /:key` had no role check, so any
// logged-in viewer could write arbitrary AppConfig keys including the
// project_id_prefix that the WTB_ filter relies on.
const adminOnly = requireRole(['admin', 'superadmin', 'owner']);

// GET /api/settings - All settings
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM AppConfig');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (error) {
    return sendServerError(res, 'Failed to fetch settings', error);
  }
});

// GET /api/settings/business-lines - Business lines list
router.get('/business-lines', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM AppConfig WHERE key = 'business_lines'");
    res.json({ businessLines: result.rows[0]?.value || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch business lines' });
  }
});

// PUT /api/settings/business-lines - Update business lines (admin only)
router.put('/business-lines', adminOnly, auditLog('Business lines updated', 'admin', 'info'), async (req, res) => {
  try {
    const { businessLines } = req.body;
    if (!Array.isArray(businessLines)) return res.status(400).json({ error: 'businessLines must be an array' });
    await pool.query(
      "INSERT INTO AppConfig (key, value) VALUES ('business_lines', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
      [JSON.stringify(businessLines)]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update business lines' });
  }
});

// GET /api/settings/project-prefix - Project ID prefix
router.get('/project-prefix', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM AppConfig WHERE key = 'project_id_prefix'");
    res.json({ prefix: result.rows[0]?.value || 'WTB' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prefix' });
  }
});

// PUT /api/settings/project-prefix - Update prefix (admin only)
router.put('/project-prefix', adminOnly, auditLog('Project prefix updated', 'admin', 'info'), async (req, res) => {
  try {
    const { prefix } = req.body;
    if (!prefix || typeof prefix !== 'string') return res.status(400).json({ error: 'prefix is required' });
    await pool.query(
      "INSERT INTO AppConfig (key, value) VALUES ('project_id_prefix', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()",
      [JSON.stringify(prefix)]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update prefix' });
  }
});

// PUT /api/settings/:key - Generic config update (admin only - this is the
// catch-all that lets admins write any AppConfig key. Must NOT be reachable
// by non-admin users or the entire app config is forge-able.)
router.put('/:key', adminOnly, auditLog('Setting updated', 'admin', 'info'), async (req, res) => {
  try {
    const { value } = req.body;
    await pool.query(
      'INSERT INTO AppConfig (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
      [req.params.key, JSON.stringify(value)]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

module.exports = router;
