const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const router = express.Router();

// Contact types: internal, vendor, gc, architect, oac_rep, consultant, client
const VALID_TYPES = ['internal', 'vendor', 'gc', 'architect', 'oac_rep', 'consultant', 'client'];

// ==================== CONTACTS ====================

// GET /api/contacts - List all contacts
router.get('/', async (req, res) => {
  try {
    const { type, search } = req.query;
    let query = `
      SELECT c.*,
        COUNT(DISTINCT pa.project_id) FILTER (WHERE pa.is_active = true) as active_projects
      FROM Contacts c
      LEFT JOIN ProjectAssignments pa ON pa.contact_id = c.id
    `;
    const conditions = [];
    const params = [];

    if (type) {
      params.push(type);
      conditions.push(`c.type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(c.name ILIKE $${params.length} OR c.organization ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY c.id ORDER BY c.name';

    const result = await pool.query(query, params);
    res.json({
      contacts: result.rows.map(r => ({
        id: r.id,
        name: r.name,
        organization: r.organization,
        role: r.role,
        email: r.email,
        phone: r.phone,
        type: r.type,
        notes: r.notes,
        activeProjects: parseInt(r.active_projects),
        createdAt: r.created_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching contacts', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

// GET /api/contacts/:id - Get single contact with assignments
router.get('/:id', async (req, res) => {
  try {
    const contactResult = await pool.query('SELECT * FROM Contacts WHERE id = $1', [req.params.id]);
    if (contactResult.rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

    const assignmentResult = await pool.query(`
      SELECT pa.*, p.name as project_name, p.status as project_status
      FROM ProjectAssignments pa
      JOIN Projects p ON p.id = pa.project_id
      WHERE pa.contact_id = $1
      ORDER BY pa.is_active DESC, pa.start_date DESC
    `, [req.params.id]);

    const c = contactResult.rows[0];
    res.json({
      contact: {
        id: c.id, name: c.name, organization: c.organization, role: c.role,
        email: c.email, phone: c.phone, type: c.type, notes: c.notes,
        createdAt: c.created_at,
      },
      assignments: assignmentResult.rows.map(a => ({
        id: a.id, projectId: a.project_id, projectName: a.project_name,
        projectStatus: a.project_status, role: a.role,
        startDate: a.start_date, endDate: a.end_date,
        isActive: a.is_active, notes: a.notes,
      }))
    });
  } catch (error) {
    logger.error('Error fetching contact', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// POST /api/contacts - Create contact
router.post('/', async (req, res) => {
  try {
    const { name, organization, role, email, phone, type, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (type && !VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid contact type' });

    const result = await pool.query(
      `INSERT INTO Contacts (name, organization, role, email, phone, type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, organization || null, role || null, email || null, phone || null, type || 'internal', notes || null]
    );
    res.status(201).json({ contact: result.rows[0] });
  } catch (error) {
    logger.error('Error creating contact', { error: error.message });
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', async (req, res) => {
  try {
    const { name, organization, role, email, phone, type, notes } = req.body;
    await pool.query(
      `UPDATE Contacts SET
        name = COALESCE($1, name), organization = $2, role = $3,
        email = $4, phone = $5, type = COALESCE($6, type),
        notes = $7, updated_at = NOW()
      WHERE id = $8`,
      [name, organization, role, email, phone, type, notes, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating contact', { error: error.message });
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM Contacts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting contact', { error: error.message });
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

// ==================== PROJECT ASSIGNMENTS ====================

// GET /api/contacts/assignments/project/:projectId - Get all contacts assigned to a project
router.get('/assignments/project/:projectId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pa.*, c.name, c.organization, c.email, c.phone, c.type as contact_type
      FROM ProjectAssignments pa
      JOIN Contacts c ON c.id = pa.contact_id
      WHERE pa.project_id = $1
      ORDER BY pa.is_active DESC, c.name
    `, [req.params.projectId]);

    res.json({
      assignments: result.rows.map(r => ({
        id: r.id, projectId: r.project_id,
        contactId: r.contact_id, contactName: r.name,
        organization: r.organization, email: r.email, phone: r.phone,
        contactType: r.contact_type,
        role: r.role, startDate: r.start_date, endDate: r.end_date,
        isActive: r.is_active, notes: r.notes,
      }))
    });
  } catch (error) {
    logger.error('Error fetching project assignments', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

// POST /api/contacts/assignments - Assign contact to project
router.post('/assignments', async (req, res) => {
  try {
    const { projectId, contactId, role, startDate, endDate, notes } = req.body;
    if (!projectId || !contactId) return res.status(400).json({ error: 'projectId and contactId are required' });

    const result = await pool.query(
      `INSERT INTO ProjectAssignments (project_id, contact_id, role, start_date, end_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [projectId, parseInt(contactId), role || null, startDate || null, endDate || null, notes || null]
    );
    res.status(201).json({ assignment: result.rows[0] });
  } catch (error) {
    logger.error('Error creating assignment', { error: error.message });
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

// PUT /api/contacts/assignments/:id - Update assignment
router.put('/assignments/:id', async (req, res) => {
  try {
    const { role, startDate, endDate, isActive, notes } = req.body;
    await pool.query(
      `UPDATE ProjectAssignments SET
        role = COALESCE($1, role), start_date = $2, end_date = $3,
        is_active = COALESCE($4, is_active), notes = $5
      WHERE id = $6`,
      [role, startDate, endDate, isActive, notes, req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating assignment', { error: error.message });
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// DELETE /api/contacts/assignments/:id - Remove assignment
router.delete('/assignments/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ProjectAssignments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting assignment', { error: error.message });
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

module.exports = router;
