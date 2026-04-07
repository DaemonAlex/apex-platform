const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { validate, body, query, isPositiveInt } = require('../middleware/validate');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// POST /log is admin-only. The audit middleware in middleware/audit.js
// writes to the AuditLog table directly via the pool, bypassing this
// endpoint, so server-side audit logging is unaffected. This endpoint
// exists for any frontend code that wants to log a custom event - prior
// to 2026-04 it accepted `user` from the request body, so any logged-in
// viewer could plant fake audit entries claiming an admin did things they
// didn't do (anti-forensics). Now restricted to admins.
const adminOnly = requireRole(['admin', 'superadmin', 'owner']);

// GET /log is admin OR auditor. The 'auditor' role exists specifically
// for read-only audit log access (see DEFAULT_ROLES in routes/roles.js).
const adminOrAuditor = requireRole(['admin', 'superadmin', 'owner', 'auditor']);

// Create audit log entry (admin only - prevents log forgery).
// The `user` field is ALWAYS taken from the authenticated session, never
// from the request body. The IP is ALWAYS taken from the request, never
// from the body. This prevents an admin (or anyone else) from planting
// fake audit entries claiming someone else did something they didn't.
router.post('/log',
  adminOnly,
  validate([
    body('action').notEmpty().withMessage('Action is required').isLength({ max: 500 }),
    body('resource').optional().trim().isLength({ max: 500 }),
    body('details').optional().trim().isLength({ max: 5000 }),
    body('projectId').optional().trim().isLength({ max: 50 }),
    body('taskId').optional().trim().isLength({ max: 50 }),
    body('category').optional().isIn(['general', 'auth', 'user', 'project', 'admin', 'security', 'system']).withMessage('Invalid category'),
    body('severity').optional().isIn(['info', 'warning', 'critical']).withMessage('Invalid severity')
  ]),
  async (req, res) => {
  try {
    const {
      action,
      resource,
      details,
      projectId,
      taskId,
      category = 'general',
      severity = 'info'
    } = req.body;

    // Insert audit log entry. user and ipAddress come from the
    // authenticated session, not the request body.
    await pool.query(`
      INSERT INTO AuditLog (id, timestamp, "user", action, resource, details, projectId, taskId, category, severity, ipAddress, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `, [
      `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      new Date(),
      req.user?.email || `userId:${req.user?.userId}` || 'unknown',
      action,
      resource || '',
      details || '',
      projectId || null,
      taskId || null,
      category,
      severity,
      req.ip || '127.0.0.1'
    ]);

    res.json({ message: 'Audit log entry created successfully' });

  } catch (error) {
    logger.error('Audit log error', { error: error.message });
    res.status(500).json({ error: 'Failed to create audit log entry', details: error.message });
  }
});

// Get audit log entries (admin or auditor) - ASRB 5.1.3: parameterized offset/limit + total count
router.get('/log',
  adminOrAuditor,
  validate([
    isPositiveInt('limit', 'query'),
    isPositiveInt('offset', 'query'),
    query('projectId').optional().trim().isLength({ max: 50 }),
    query('category').optional().isIn(['general', 'auth', 'user', 'project', 'admin', 'security', 'system']),
    query('severity').optional().isIn(['info', 'warning', 'critical'])
  ]),
  async (req, res) => {
  try {
    const { limit = 100, offset = 0, projectId, category, severity, fromDate, toDate } = req.query;

    // Build WHERE clause and params dynamically
    let whereClause = ' WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (projectId) {
      whereClause += ` AND projectId = $${paramIndex++}`;
      params.push(projectId);
    }
    if (category) {
      whereClause += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    if (severity) {
      whereClause += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }
    if (fromDate) {
      whereClause += ` AND timestamp >= $${paramIndex++}`;
      params.push(new Date(fromDate));
    }
    if (toDate) {
      whereClause += ` AND timestamp <= $${paramIndex++}`;
      params.push(new Date(toDate));
    }

    // ASRB 5.1.5: Get total count for pagination
    const countResult = await pool.query(`SELECT COUNT(*) as total FROM AuditLog${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // ASRB 5.1.3: Parameterized offset/limit (fixes SQL injection risk)
    const limitVal = Math.min(parseInt(limit) || 100, 1000);
    const offsetVal = parseInt(offset) || 0;

    const result = await pool.query(
      `SELECT id, timestamp, "user", action, resource, details,
              projectid AS "projectId", taskid AS "taskId",
              category, severity, ipaddress AS "ipAddress", created_at
       FROM AuditLog${whereClause} ORDER BY timestamp DESC OFFSET $${paramIndex++} LIMIT $${paramIndex++}`,
      [...params, offsetVal, limitVal]
    );

    res.json({
      auditLog: result.rows,
      total
    });

    // Connection pool kept open for reuse
  } catch (error) {
    logger.error('Get audit log error', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve audit log', details: error.message });
  }
});

module.exports = router;
