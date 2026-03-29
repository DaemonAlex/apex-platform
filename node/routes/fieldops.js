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

// Update field op status
router.put('/:id', async (req, res) => {
  try {
    const { status, notes, completedBy } = req.body;
    const updates = [];
    const params = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      params.push(status);
      if (status === 'completed') {
        paramCount++;
        updates.push(`completed_at = $${paramCount}`);
        params.push(new Date().toISOString());
        if (completedBy) {
          paramCount++;
          updates.push(`completed_by = $${paramCount}`);
          params.push(completedBy);
        }
      }
    }
    if (notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      params.push(notes);
    }

    updates.push('updated_at = NOW()');
    paramCount++;
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE fieldops SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Field op not found' });
    }

    res.json({ fieldOp: mapFieldOpsRow(result.rows[0]) });
  } catch (error) {
    logger.error('Update field op error', { error: error.message });
    res.status(500).json({ error: 'Failed to update field op' });
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

module.exports = router;
