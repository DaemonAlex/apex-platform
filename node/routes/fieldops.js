const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Reads open to all logged-in users so auditors can see field op state.
// Mutations require writer role. Prior to 2026-04 any logged-in user could
// create field ops jobs, mark them complete, or update vendor info.
const writers = ['admin', 'superadmin', 'owner', 'project_manager', 'field_ops'];
const writerGate = requireRole(writers);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return writerGate(req, res, next);
});

// Auto-migration: ensure fieldops table exists, then add any newer columns.
// Prior to 2026-04 the table itself was assumed to exist somewhere else
// (it never actually was), so the migration logged "relation fieldops does
// not exist" on every backend startup and the field ops feature failed
// silently on the first request from a fresh DB.
let migrationDone = false;
async function ensureFieldOpColumns(retries = 5) {
  if (migrationDone) return;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS fieldops (
          id SERIAL PRIMARY KEY,
          project_id VARCHAR(50),
          task_id VARCHAR(50),
          task_name TEXT,
          project_name TEXT,
          type VARCHAR(50) DEFAULT 'service',
          location TEXT,
          scheduled_date DATE,
          start_time VARCHAR(20),
          end_time VARCHAR(20),
          assignee VARCHAR(255),
          notes TEXT,
          estimated_duration NUMERIC(6,2),
          status VARCHAR(20) DEFAULT 'scheduled',
          completed_at TIMESTAMPTZ,
          completed_by VARCHAR(255),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='vendor_id') THEN
            ALTER TABLE fieldops ADD COLUMN vendor_id INTEGER NULL;
          END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='vendor_contact') THEN
          ALTER TABLE fieldops ADD COLUMN vendor_contact VARCHAR(255) NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='assigned_type') THEN
          ALTER TABLE fieldops ADD COLUMN assigned_type VARCHAR(20) DEFAULT 'internal';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='room_id') THEN
          ALTER TABLE fieldops ADD COLUMN room_id INTEGER NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='service_category') THEN
          ALTER TABLE fieldops ADD COLUMN service_category VARCHAR(50) DEFAULT 'project';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='priority') THEN
          ALTER TABLE fieldops ADD COLUMN priority VARCHAR(20) DEFAULT 'normal';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='response_time_hours') THEN
          ALTER TABLE fieldops ADD COLUMN response_time_hours NUMERIC(6,1) NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fieldops' AND column_name='vendor_name') THEN
          ALTER TABLE fieldops ADD COLUMN vendor_name VARCHAR(255) NULL;
        END IF;
      END $$;
    `);
      migrationDone = true;
      logger.info('Field ops table and migrations ready');
      return;
    } catch (err) {
      if (attempt === retries - 1) {
        logger.error('Field ops migration failed', { error: err.message });
        return;
      }
      // Backoff: 1s, 2s, 4s, 8s, 16s - tolerate slow DB startup
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
ensureFieldOpColumns();

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
router.post('/', auditLog('Field op created', 'fieldops', 'info'), async (req, res) => {
  try {
    const { projectId, taskId, taskName, projectName, type, location,
            scheduledDate, startTime, endTime, assignee, notes, estimatedDuration,
            vendorId, vendorContact, vendorName, assignedType, roomId, serviceCategory, priority } = req.body;

    const result = await pool.query(`
      INSERT INTO fieldops (project_id, task_id, task_name, project_name, type, location,
        scheduled_date, start_time, end_time, assignee, notes, estimated_duration,
        vendor_id, vendor_contact, vendor_name, assigned_type, room_id, service_category, priority)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [projectId, taskId, taskName, projectName, type || 'service', location,
        scheduledDate, startTime || '9:00 AM', endTime || '5:00 PM', assignee, notes, estimatedDuration,
        vendorId || null, vendorContact || null, vendorName || null,
        assignedType || 'internal', roomId || null, serviceCategory || 'project', priority || 'normal']);

    res.status(201).json({ fieldOp: mapFieldOpsRow(result.rows[0]) });
  } catch (error) {
    logger.error('Create field op error', { error: error.message });
    res.status(500).json({ error: 'Failed to create field op', details: error.message });
  }
});

// Update field op - all fields
router.put('/:id', auditLog('Field op updated', 'fieldops', 'info'), async (req, res) => {
  try {
    const { status, notes, completedBy, taskName, type, location,
            scheduledDate, startTime, endTime, assignee, estimatedDuration,
            vendorId, vendorContact, vendorName, assignedType, roomId, serviceCategory, priority,
            projectId, projectName } = req.body;
    const updates = [];
    const params = [];
    let i = 0;

    if (status) {
      updates.push(`status = $${++i}`); params.push(status);
      if (status === 'completed') {
        updates.push(`completed_at = $${++i}`); params.push(new Date().toISOString());
        if (completedBy) { updates.push(`completed_by = $${++i}`); params.push(completedBy); }
        // Auto-calculate response time
        updates.push(`response_time_hours = $${++i}`);
        params.push(null); // placeholder, calculated below
        const rtIdx = i;
        // We'll calculate after the update using created_at
        const existing = await pool.query('SELECT created_at FROM fieldops WHERE id = $1', [req.params.id]);
        if (existing.rows.length > 0 && existing.rows[0].created_at) {
          const hours = (Date.now() - new Date(existing.rows[0].created_at).getTime()) / 3600000;
          params[rtIdx - 1] = Math.round(hours * 10) / 10;
        }
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
    if (vendorId !== undefined) { updates.push(`vendor_id = $${++i}`); params.push(vendorId || null); }
    if (vendorContact !== undefined) { updates.push(`vendor_contact = $${++i}`); params.push(vendorContact); }
    if (vendorName !== undefined) { updates.push(`vendor_name = $${++i}`); params.push(vendorName); }
    if (assignedType !== undefined) { updates.push(`assigned_type = $${++i}`); params.push(assignedType); }
    if (roomId !== undefined) { updates.push(`room_id = $${++i}`); params.push(roomId || null); }
    if (serviceCategory !== undefined) { updates.push(`service_category = $${++i}`); params.push(serviceCategory); }
    if (priority !== undefined) { updates.push(`priority = $${++i}`); params.push(priority); }
    if (projectId !== undefined) { updates.push(`project_id = $${++i}`); params.push(projectId); }
    if (projectName !== undefined) { updates.push(`project_name = $${++i}`); params.push(projectName); }

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

    // By vendor (JOIN Vendors table)
    const byVendor = await pool.query(`
      SELECT f.vendor_id, COALESCE(f.vendor_name, v.name, 'Unknown') as vendor_name,
        COUNT(*) as count, COUNT(*) FILTER (WHERE f.status = 'completed') as completed,
        ROUND(AVG(f.response_time_hours)::numeric, 1) as avg_response_hours
      FROM fieldops f LEFT JOIN vendors v ON f.vendor_id = v.id
      WHERE f.assigned_type = 'vendor' AND f.vendor_id IS NOT NULL ${dateFilter}
      GROUP BY f.vendor_id, f.vendor_name, v.name ORDER BY count DESC
    `, params);

    // By service category
    const byCategory = await pool.query(`
      SELECT COALESCE(service_category, 'project') as category, COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM fieldops WHERE 1=1 ${dateFilter} GROUP BY category ORDER BY count DESC
    `, params);

    // Team workload (internal only, open assignments)
    const teamWorkload = await pool.query(`
      SELECT assignee,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) as open_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= NOW() - INTERVAL '30 days') as completed_this_month,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND scheduled_date < NOW()) as overdue_count,
        ROUND(AVG(response_time_hours) FILTER (WHERE status = 'completed')::numeric, 1) as avg_response_hours
      FROM fieldops WHERE assigned_type = 'internal' AND assignee IS NOT NULL
      GROUP BY assignee ORDER BY open_count DESC
    `);

    // Vendor performance comparison (last 90 days vs prior 90)
    const vendorPerf = await pool.query(`
      SELECT
        COALESCE(f.vendor_name, v.name, 'Unknown') as vendor_name,
        COUNT(*) FILTER (WHERE f.scheduled_date >= NOW() - INTERVAL '90 days') as recent_total,
        COUNT(*) FILTER (WHERE f.status = 'completed' AND f.scheduled_date >= NOW() - INTERVAL '90 days') as recent_completed,
        COUNT(*) FILTER (WHERE f.scheduled_date >= NOW() - INTERVAL '180 days' AND f.scheduled_date < NOW() - INTERVAL '90 days') as prior_total,
        COUNT(*) FILTER (WHERE f.status = 'completed' AND f.scheduled_date >= NOW() - INTERVAL '180 days' AND f.scheduled_date < NOW() - INTERVAL '90 days') as prior_completed,
        ROUND(AVG(f.response_time_hours) FILTER (WHERE f.scheduled_date >= NOW() - INTERVAL '90 days')::numeric, 1) as recent_avg_hours,
        ROUND(AVG(f.response_time_hours) FILTER (WHERE f.scheduled_date >= NOW() - INTERVAL '180 days' AND f.scheduled_date < NOW() - INTERVAL '90 days')::numeric, 1) as prior_avg_hours
      FROM fieldops f LEFT JOIN vendors v ON f.vendor_id = v.id
      WHERE f.assigned_type = 'vendor' AND f.vendor_id IS NOT NULL
      GROUP BY f.vendor_name, v.name
    `);

    // Build flags
    const flags = [];
    vendorPerf.rows.forEach(v => {
      const recentRate = parseInt(v.recent_total) > 0 ? (parseInt(v.recent_completed) / parseInt(v.recent_total)) * 100 : 0;
      const priorRate = parseInt(v.prior_total) > 0 ? (parseInt(v.prior_completed) / parseInt(v.prior_total)) * 100 : 0;
      if (priorRate > 0 && recentRate < priorRate - 10) {
        flags.push({ type: 'vendor_slipping', severity: 'warning', message: `${v.vendor_name} completion rate dropped from ${Math.round(priorRate)}% to ${Math.round(recentRate)}%` });
      }
    });
    teamWorkload.rows.forEach(t => {
      if (parseInt(t.open_count) > 8) {
        flags.push({ type: 'overloaded', severity: 'warning', message: `${t.assignee} has ${t.open_count} open assignments` });
      }
      if (parseInt(t.overdue_count) > 3) {
        flags.push({ type: 'overdue', severity: 'critical', message: `${t.assignee} has ${t.overdue_count} overdue field ops` });
      }
    });

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
      byVendor: byVendor.rows.map(r => ({ vendorId: r.vendor_id, vendorName: r.vendor_name, count: parseInt(r.count), completed: parseInt(r.completed), avgResponseHours: parseFloat(r.avg_response_hours) || null })),
      byCategory: byCategory.rows.map(r => ({ category: r.category, count: parseInt(r.count), completed: parseInt(r.completed) })),
      teamWorkload: teamWorkload.rows.map(r => ({ assignee: r.assignee, openCount: parseInt(r.open_count), completedThisMonth: parseInt(r.completed_this_month), overdueCount: parseInt(r.overdue_count), avgResponseHours: parseFloat(r.avg_response_hours) || null })),
      vendorPerformance: vendorPerf.rows.map(r => {
        const recentRate = parseInt(r.recent_total) > 0 ? Math.round((parseInt(r.recent_completed) / parseInt(r.recent_total)) * 100) : 0;
        const priorRate = parseInt(r.prior_total) > 0 ? Math.round((parseInt(r.prior_completed) / parseInt(r.prior_total)) * 100) : 0;
        return { vendorName: r.vendor_name, recentTotal: parseInt(r.recent_total), recentCompleted: parseInt(r.recent_completed), recentRate, priorRate, trend: recentRate >= priorRate ? 'up' : 'down', recentAvgHours: parseFloat(r.recent_avg_hours) || null, priorAvgHours: parseFloat(r.prior_avg_hours) || null };
      }),
      flags,
    });
  } catch (error) {
    logger.error('Field ops report error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Delete field op
router.delete('/:id', auditLog('Field op deleted', 'fieldops', 'warning'), async (req, res) => {
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
    assignedType: row.assigned_type || 'internal',
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    vendorContact: row.vendor_contact,
    isVendor: (row.assigned_type === 'vendor'),
    roomId: row.room_id,
    serviceCategory: row.service_category || 'project',
    priority: row.priority || 'normal',
    responseTimeHours: row.response_time_hours,
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
router.post('/:id/notes', auditLog('Field op note added', 'fieldops', 'info'), async (req, res) => {
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
router.delete('/notes/:noteId', auditLog('Field op note deleted', 'fieldops', 'info'), async (req, res) => {
  try {
    await pool.query('DELETE FROM FieldOpNotes WHERE id = $1', [req.params.noteId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting field op note', { error: error.message });
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
