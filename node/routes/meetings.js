const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const router = express.Router();

// ==================== MEETINGS ====================

// GET /api/meetings/project/:projectId - Meetings for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM Meetings WHERE project_id = $1 ORDER BY meeting_date DESC',
      [req.params.projectId]
    );
    res.json({
      meetings: result.rows.map(r => ({
        id: r.id,
        projectId: r.project_id,
        meetingType: r.meeting_type,
        title: r.title,
        meetingDate: r.meeting_date,
        attendees: r.attendees || [],
        agenda: r.agenda || [],
        notes: r.notes,
        actionItems: r.action_items || [],
        createdBy: r.created_by,
        createdAt: r.created_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching meetings', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// GET /api/meetings/:id - Single meeting
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Meetings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meeting not found' });
    const r = result.rows[0];
    res.json({
      meeting: {
        id: r.id, projectId: r.project_id, meetingType: r.meeting_type,
        title: r.title, meetingDate: r.meeting_date,
        attendees: r.attendees || [], agenda: r.agenda || [],
        notes: r.notes, actionItems: r.action_items || [],
        createdBy: r.created_by, createdAt: r.created_at,
      }
    });
  } catch (error) {
    logger.error('Error fetching meeting', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// POST /api/meetings - Create meeting
router.post('/', auditLog('Meeting created', 'project', 'info'), async (req, res) => {
  try {
    const { projectId, meetingType, title, meetingDate, attendees, agenda, notes, actionItems } = req.body;
    if (!projectId || !title || !meetingDate) {
      return res.status(400).json({ error: 'projectId, title, and meetingDate are required' });
    }

    const result = await pool.query(
      `INSERT INTO Meetings (project_id, meeting_type, title, meeting_date, attendees, agenda, notes, action_items, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [projectId, meetingType || 'oac', title, new Date(meetingDate),
       JSON.stringify(attendees || []), JSON.stringify(agenda || []),
       notes || null, JSON.stringify(actionItems || []),
       req.user?.name || req.user?.email || null]
    );
    res.status(201).json({ meeting: result.rows[0] });
  } catch (error) {
    logger.error('Error creating meeting', { error: error.message });
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// PUT /api/meetings/:id - Update meeting
router.put('/:id', auditLog('Meeting updated', 'project', 'info'), async (req, res) => {
  try {
    const { title, meetingType, meetingDate, attendees, agenda, notes, actionItems } = req.body;
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(title); }
    if (meetingType !== undefined) { setClauses.push(`meeting_type = $${idx++}`); values.push(meetingType); }
    if (meetingDate !== undefined) { setClauses.push(`meeting_date = $${idx++}`); values.push(new Date(meetingDate)); }
    if (attendees !== undefined) { setClauses.push(`attendees = $${idx++}`); values.push(JSON.stringify(attendees)); }
    if (agenda !== undefined) { setClauses.push(`agenda = $${idx++}`); values.push(JSON.stringify(agenda)); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(notes); }
    if (actionItems !== undefined) { setClauses.push(`action_items = $${idx++}`); values.push(JSON.stringify(actionItems)); }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });

    setClauses.push('updated_at = NOW()');
    values.push(req.params.id);

    await pool.query(`UPDATE Meetings SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating meeting', { error: error.message });
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// DELETE /api/meetings/:id
router.delete('/:id', auditLog('Meeting deleted', 'project', 'warning'), async (req, res) => {
  try {
    await pool.query('DELETE FROM Meetings WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting meeting', { error: error.message });
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// ==================== SUBMITTALS & RFIs ====================

// GET /api/meetings/submittals/project/:projectId
router.get('/submittals/project/:projectId', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name as submitted_by_name, c.organization as submitted_by_org
      FROM Submittals s
      LEFT JOIN Contacts c ON c.id = s.submitted_by
      WHERE s.project_id = $1
      ORDER BY s.created_at DESC
    `, [req.params.projectId]);

    res.json({
      submittals: result.rows.map(r => ({
        id: r.id, projectId: r.project_id, type: r.type,
        number: r.number, title: r.title,
        submittedBy: r.submitted_by, submittedByName: r.submitted_by_name,
        submittedByOrg: r.submitted_by_org,
        status: r.status, submittedDate: r.submitted_date,
        responseDate: r.response_date, notes: r.notes,
        createdAt: r.created_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching submittals', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch submittals' });
  }
});

// POST /api/meetings/submittals - Create submittal or RFI
router.post('/submittals', auditLog('Submittal created', 'project', 'info'), async (req, res) => {
  try {
    const { projectId, type, number, title, submittedBy, status, submittedDate, notes } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: 'projectId and title are required' });

    const result = await pool.query(
      `INSERT INTO Submittals (project_id, type, number, title, submitted_by, status, submitted_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [projectId, type || 'submittal', number || null, title,
       submittedBy || null, status || 'pending',
       submittedDate ? new Date(submittedDate) : null, notes || null]
    );
    res.status(201).json({ submittal: result.rows[0] });
  } catch (error) {
    logger.error('Error creating submittal', { error: error.message });
    res.status(500).json({ error: 'Failed to create submittal' });
  }
});

// PUT /api/meetings/submittals/:id - Update submittal status
router.put('/submittals/:id', auditLog('Submittal updated', 'project', 'info'), async (req, res) => {
  try {
    const { status, responseDate, notes, number, title } = req.body;
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (status !== undefined) { setClauses.push(`status = $${idx++}`); values.push(status); }
    if (responseDate !== undefined) { setClauses.push(`response_date = $${idx++}`); values.push(responseDate ? new Date(responseDate) : null); }
    if (notes !== undefined) { setClauses.push(`notes = $${idx++}`); values.push(notes); }
    if (number !== undefined) { setClauses.push(`number = $${idx++}`); values.push(number); }
    if (title !== undefined) { setClauses.push(`title = $${idx++}`); values.push(title); }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });

    setClauses.push('updated_at = NOW()');
    values.push(req.params.id);

    await pool.query(`UPDATE Submittals SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error updating submittal', { error: error.message });
    res.status(500).json({ error: 'Failed to update submittal' });
  }
});

// DELETE /api/meetings/submittals/:id
router.delete('/submittals/:id', auditLog('Submittal deleted', 'project', 'warning'), async (req, res) => {
  try {
    await pool.query('DELETE FROM Submittals WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting submittal', { error: error.message });
    res.status(500).json({ error: 'Failed to delete submittal' });
  }
});

module.exports = router;
