const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const router = express.Router();

// Auto-create tables
async function ensureVendorTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Vendors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'external',
      category VARCHAR(100),
      website VARCHAR(255),
      address VARCHAR(500),
      notes TEXT,
      contacts JSONB DEFAULT '[]',
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS VendorAssignments (
      id SERIAL PRIMARY KEY,
      vendor_id INTEGER NOT NULL REFERENCES Vendors(id),
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      role VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let tablesReady = false;

// GET /api/vendors - List all vendors
router.get('/', async (req, res) => {
  try {
    if (!tablesReady) { await ensureVendorTables(); tablesReady = true; }
    const result = await pool.query(`
      SELECT v.*,
        (SELECT COUNT(*) FROM VendorAssignments va WHERE va.vendor_id = v.id AND va.entity_type = 'project') as project_count,
        (SELECT COUNT(*) FROM VendorAssignments va WHERE va.vendor_id = v.id AND va.entity_type = 'room') as room_count
      FROM Vendors v
      WHERE v.deleted_at IS NULL
      ORDER BY v.name
    `);
    res.json({
      vendors: result.rows.map(r => ({
        id: r.id, name: r.name, type: r.type, category: r.category,
        website: r.website, address: r.address, notes: r.notes,
        contacts: r.contacts || [],
        projectCount: parseInt(r.project_count), roomCount: parseInt(r.room_count),
        createdAt: r.created_at, updatedAt: r.updated_at,
      })),
    });
  } catch (error) {
    logger.error('Error fetching vendors', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

// GET /api/vendors/:id - Get vendor detail with assignments
router.get('/:id', async (req, res) => {
  try {
    if (!tablesReady) { await ensureVendorTables(); tablesReady = true; }
    const vResult = await pool.query('SELECT * FROM Vendors WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (vResult.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    const v = vResult.rows[0];

    const aResult = await pool.query('SELECT * FROM VendorAssignments WHERE vendor_id = $1 ORDER BY created_at DESC', [req.params.id]);

    res.json({
      id: v.id, name: v.name, type: v.type, category: v.category,
      website: v.website, address: v.address, notes: v.notes,
      contacts: v.contacts || [],
      assignments: aResult.rows.map(a => ({
        id: a.id, entityType: a.entity_type, entityId: a.entity_id,
        role: a.role, notes: a.notes, createdAt: a.created_at,
      })),
    });
  } catch (error) {
    logger.error('Error fetching vendor', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendor' });
  }
});

// POST /api/vendors - Create vendor
router.post('/', async (req, res) => {
  try {
    if (!tablesReady) { await ensureVendorTables(); tablesReady = true; }
    const { name, type, category, website, address, notes, contacts } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = await pool.query(
      `INSERT INTO Vendors (name, type, category, website, address, notes, contacts)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, type || 'external', category || null, website || null, address || null, notes || null, JSON.stringify(contacts || [])]
    );
    res.json({ success: true, vendor: result.rows[0] });
  } catch (error) {
    logger.error('Error creating vendor', { error: error.message });
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

// PUT /api/vendors/:id - Update vendor
router.put('/:id', async (req, res) => {
  try {
    const { name, type, category, website, address, notes, contacts } = req.body;
    const result = await pool.query(
      `UPDATE Vendors SET
        name = COALESCE($1, name), type = COALESCE($2, type), category = COALESCE($3, category),
        website = $4, address = $5, notes = $6,
        contacts = COALESCE($7, contacts), updated_at = NOW()
       WHERE id = $8 AND deleted_at IS NULL RETURNING *`,
      [name, type, category, website || null, address || null, notes || null, contacts ? JSON.stringify(contacts) : null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ success: true, vendor: result.rows[0] });
  } catch (error) {
    logger.error('Error updating vendor', { error: error.message });
    res.status(500).json({ error: 'Failed to update vendor' });
  }
});

// DELETE /api/vendors/:id - Soft delete
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE Vendors SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting vendor', { error: error.message });
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// ==================== ASSIGNMENTS ====================

// POST /api/vendors/:id/assign - Assign vendor to project or room
router.post('/:id/assign', async (req, res) => {
  try {
    const { entityType, entityId, role, notes } = req.body;
    if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId required' });

    const result = await pool.query(
      'INSERT INTO VendorAssignments (vendor_id, entity_type, entity_id, role, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, entityType, entityId, role || null, notes || null]
    );
    res.json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    logger.error('Error assigning vendor', { error: error.message });
    res.status(500).json({ error: 'Failed to assign vendor' });
  }
});

// DELETE /api/vendors/assignments/:id - Remove assignment
router.delete('/assignments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM VendorAssignments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error removing assignment', { error: error.message });
    res.status(500).json({ error: 'Failed to remove assignment' });
  }
});

// GET /api/vendors/for/:entityType/:entityId - Get vendors assigned to an entity
router.get('/for/:entityType/:entityId', async (req, res) => {
  try {
    if (!tablesReady) { await ensureVendorTables(); tablesReady = true; }
    const { entityType, entityId } = req.params;
    const result = await pool.query(`
      SELECT v.id, v.name, v.type, v.category, v.contacts, va.role, va.notes as assignment_notes, va.id as assignment_id
      FROM VendorAssignments va
      JOIN Vendors v ON v.id = va.vendor_id AND v.deleted_at IS NULL
      WHERE va.entity_type = $1 AND va.entity_id = $2
      ORDER BY v.name
    `, [entityType, entityId]);
    res.json({
      vendors: result.rows.map(r => ({
        id: r.id, name: r.name, type: r.type, category: r.category,
        contacts: r.contacts || [], role: r.role, assignmentNotes: r.assignment_notes,
        assignmentId: r.assignment_id,
      })),
    });
  } catch (error) {
    logger.error('Error fetching entity vendors', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
});

module.exports = router;
