const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// Ensure AppConfig table exists
async function ensureConfigTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS AppConfig (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// GET /api/settings - All settings
router.get('/', async (req, res) => {
  try {
    await ensureConfigTable();
    const result = await pool.query('SELECT key, value FROM AppConfig');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings', details: error.message });
  }
});

// GET /api/settings/business-lines - Business lines list
router.get('/business-lines', async (req, res) => {
  try {
    await ensureConfigTable();
    const result = await pool.query("SELECT value FROM AppConfig WHERE key = 'business_lines'");
    res.json({ businessLines: result.rows[0]?.value || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch business lines' });
  }
});

// PUT /api/settings/business-lines - Update business lines
router.put('/business-lines', async (req, res) => {
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
    await ensureConfigTable();
    const result = await pool.query("SELECT value FROM AppConfig WHERE key = 'project_id_prefix'");
    res.json({ prefix: result.rows[0]?.value || 'WTB' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prefix' });
  }
});

// PUT /api/settings/project-prefix - Update prefix
router.put('/project-prefix', async (req, res) => {
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

// PUT /api/settings/:key - Generic config update
router.put('/:key', async (req, res) => {
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
