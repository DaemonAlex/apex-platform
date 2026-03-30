const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const router = express.Router();

// Get all field ops (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { status, assignee, from, to } = req.query;
    let query = 'SELECT * FROM fieldops WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    if (assignee) {
      paramCount++;
      query += ` AND assignee ILIKE $${paramCount}`;
      params.push(`%${assignee}%`);
    }
    if (from) {
      paramCount++;
      query += ` AND scheduled_date >= $${paramCount}`;
      params.push(from);
    }
    if (to) {
      paramCount++;
      query += ` AND scheduled_date <= $${paramCount}`;
      params.push(to);
    }

    query += ' ORDER BY scheduled_date ASC';

    const result = await pool.query(query, params);

    // Group into scheduled, completed, pending
    const scheduled = [];
    const completed = [];
    const pending = [];

    result.rows.forEach(row => {
      const mapped = mapFieldOpsRow(row);
      if (row.status === 'completed') completed.push(mapped);
      else if (row.status === 'pending') pending.push(mapped);
      else scheduled.push(mapped);
    });

    res.json({ scheduled, completed, pending });
  } catch (error) {
    logger.error('Get field ops error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch field ops', details: error.message });
  }
});

// Get today's field ops
router.get('/today', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM fieldops WHERE DATE(scheduled_date) = CURRENT_DATE ORDER BY start_time ASC"
    );
    res.json({ jobs: result.rows.map(mapFieldOpsRow) });
  } catch (error) {
    logger.error('Get today field ops error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch today field ops' });
  }
});

// Create field op
router.post('/', async (req, res) => {
  try {
    const { projectId, taskId, taskName, projectName, type, location,
            scheduledDate, startTime, endTime, assignee, notes, estimatedDuration } = req.body;

    const result = await pool.query(`
      INSERT INTO fieldops (project_id, task_id, task_name, project_name, type, location,
        scheduled_date, start_time, end_time, assignee, notes, estimated_duration)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [projectId, taskId, taskName, projectName, type || 'service', location,
        scheduledDate, startTime || '9:00 AM', endTime || '5:00 PM', assignee, notes, estimatedDuration]);

    res.status(201).json({ fieldOp: mapFieldOpsRow(result.rows[0]) });
  } catch (error) {
    logger.error('Create field op error', { error: error.message });
    res.status(500).json({ error: 'Failed to create field op', details: error.message });
  }
});

// Update field op - all fields
router.put('/:id', async (req, res) => {
  try {
    const { status, notes, completedBy, taskName, type, location,
            scheduledDate, startTime, endTime, assignee, estimatedDuration } = req.body;
    const updates = [];
    const params = [];
    let i = 0;

    if (status) {
      updates.push(`status = $${++i}`); params.push(status);
      if (status === 'completed') {
        updates.push(`completed_at = $${++i}`); params.push(new Date().toISOString());
        if (completedBy) { updates.push(`completed_by = $${++i}`); params.push(completedBy); }
      }
    }
    if (notes !== undefined) { updates.push(`notes = $${++i}`); params.push(notes); }
    if (taskName !== undefined) { updates.push(`task_name = $${++i}`); params.push(taskName); }
    if (type !== undefined) { updates.push(`type = $${++i}`); params.push(type); }
    if (location !== undefined) { updates.push(`location = $${++i}`); params.push(location); }
    if (scheduledDate !== undefined) { updates.push(`scheduled_date = $${++i}`); params.push(scheduledDate); }
    if (startTime !== undefined) { updates.push(`start_time = $${++i}`); params.push(startTime); }
    if (endTime !== undefined) { updates.push(`end_time = $${++i}`); params.push(endTime); }
    if (assignee !== undefined) { updates.push(`assignee = $${++i}`); params.push(assignee); }
    if (estimatedDuration !== undefined) { updates.push(`estimated_duration = $${++i}`); params.push(estimatedDuration); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE fieldops SET ${updates.join(', ')} WHERE id = $${++i} RETURNING *`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Field op not found' });
    res.json({ fieldOp: mapFieldOpsRow(result.rows[0]) });
  } catch (error) {
    logger.error('Update field op error', { error: error.message });
    res.status(500).json({ error: 'Failed to update field op' });
  }
});

// GET /api/fieldops/report - Field ops reporting summary
router.get('/report', async (req, res) => {
  try {
    const { from, to } = req.query;
    let dateFilter = '';
    const params = [];
    if (from) { params.push(from); dateFilter += ` AND scheduled_date >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND scheduled_date <= $${params.length}`; }

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'in-progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM fieldops WHERE 1=1 ${dateFilter}
    `, params);

    const byType = await pool.query(`
      SELECT type, COUNT(*) as count, COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM fieldops WHERE 1=1 ${dateFilter} GROUP BY type ORDER BY count DESC
    `, params);

    const byAssignee = await pool.query(`
      SELECT assignee, COUNT(*) as count, COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM fieldops WHERE assignee IS NOT NULL ${dateFilter} GROUP BY assignee ORDER BY count DESC
    `, params);

    const byMonth = await pool.query(`
      SELECT TO_CHAR(scheduled_date, 'YYYY-MM') as month, COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM fieldops WHERE scheduled_date IS NOT NULL ${dateFilter}
      GROUP BY month ORDER BY month DESC LIMIT 12
    `, params);

    const s = stats.rows[0];
    res.json({
      summary: {
        total: parseInt(s.total), completed: parseInt(s.completed),
        scheduled: parseInt(s.scheduled), inProgress: parseInt(s.in_progress),
        pending: parseInt(s.pending), cancelled: parseInt(s.cancelled),
        completionRate: parseInt(s.total) > 0 ? Math.round((parseInt(s.completed) / parseInt(s.total)) * 100) : 0,
      },
      byType: byType.rows.map(r => ({ type: r.type, count: parseInt(r.count), completed: parseInt(r.completed) })),
      byAssignee: byAssignee.rows.map(r => ({ assignee: r.assignee, count: parseInt(r.count), completed: parseInt(r.completed) })),
      byMonth: byMonth.rows.map(r => ({ month: r.month, count: parseInt(r.count), completed: parseInt(r.completed) })),
    });
  } catch (error) {
    logger.error('Field ops report error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Delete field op
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM fieldops WHERE id = $1', [req.params.id]);
    res.json({ message: 'Field op deleted' });
  } catch (error) {
    logger.error('Delete field op error', { error: error.message });
    res.status(500).json({ error: 'Failed to delete field op' });
  }
});

// Map DB row to frontend field names
// Frontend expects: workType, title, client, assignedTo, projectCode
function mapFieldOpsRow(row) {
  const typeMap = {
    'installation': 'Installation',
    'service': 'Service/Repair',
    'site_survey': 'Site Survey',
    'inspection': 'Inspection',
    'commissioning': 'Commissioning',
    'training': 'Training',
    'event': 'Event Support',
    'cre_visit': 'CRE Coordination',
    'network': 'Network Visit'
  };

  return {
    id: `field_${row.id}`,
    dbId: row.id,
    projectId: row.project_id,
    projectCode: row.project_id,
    projectName: row.project_name,
    taskId: row.task_id,
    taskName: row.task_name,
    title: row.task_name,
    client: row.project_name,
    workType: typeMap[row.type] || row.type,
    type: row.type,
    location: row.location,
    date: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    assignee: row.assignee,
    assignedTo: row.assignee,
    vendor: row.assignee && !['Damon Alexander', 'Mike Chen', 'Lisa Park', 'Network Team (Jake Willis)'].some(n => row.assignee.includes(n)),
    status: row.status,
    notes: row.notes,
    estimatedDuration: row.estimated_duration,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ==================== FIELD OP NOTES ====================

// Ensure notes table
async function ensureNotesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS FieldOpNotes (
      id SERIAL PRIMARY KEY,
      fieldop_id INTEGER NOT NULL,
      author VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
let notesTableReady = false;

// GET /api/fieldops/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    if (!notesTableReady) { await ensureNotesTable(); notesTableReady = true; }
    const result = await pool.query(
      'SELECT * FROM FieldOpNotes WHERE fieldop_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({
      notes: result.rows.map(r => ({
        id: r.id, fieldopId: r.fieldop_id, author: r.author,
        content: r.content, createdAt: r.created_at,
      })),
    });
  } catch (error) {
    logger.error('Error fetching field op notes', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /api/fieldops/:id/notes
router.post('/:id/notes', async (req, res) => {
  try {
    if (!notesTableReady) { await ensureNotesTable(); notesTableReady = true; }
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
    const author = req.user?.name || req.user?.email || 'Unknown';

    const result = await pool.query(
      'INSERT INTO FieldOpNotes (fieldop_id, author, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, author, content.trim()]
    );
    res.json({ note: { id: result.rows[0].id, author, content: content.trim(), createdAt: result.rows[0].created_at } });
  } catch (error) {
    logger.error('Error creating field op note', { error: error.message });
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// DELETE /api/fieldops/notes/:id
router.delete('/notes/:noteId', async (req, res) => {
  try {
    await pool.query('DELETE FROM FieldOpNotes WHERE id = $1', [req.params.noteId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting field op note', { error: error.message });
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
