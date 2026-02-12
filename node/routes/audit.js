const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { validate, body, query, isPositiveInt } = require('../middleware/validate');
const router = express.Router();

// Create audit log entry
router.post('/log',
  validate([
    body('action').notEmpty().withMessage('Action is required').isLength({ max: 500 }),
    body('user').optional().trim().isLength({ max: 255 }),
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
      user,
      action,
      resource,
      details,
      projectId,
      taskId,
      category = 'general',
      severity = 'info',
      ipAddress = req.ip || '127.0.0.1'
    } = req.body;

    // Insert audit log entry
    await pool.query(`
      INSERT INTO AuditLog (id, timestamp, "user", action, resource, details, projectId, taskId, category, severity, ipAddress, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    `, [
      `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      new Date(),
      user || 'System',
      action,
      resource || '',
      details || '',
      projectId || null,
      taskId || null,
      category,
      severity,
      ipAddress
    ]);

    res.json({ message: 'Audit log entry created successfully' });

    // Connection pool kept open for reuse
  } catch (error) {
    logger.error('Audit log error', { error: error.message });
    res.status(500).json({ error: 'Failed to create audit log entry', details: error.message });
  }
});

// Get audit log entries - ASRB 5.1.3: parameterized offset/limit + total count
router.get('/log',
  validate([
    isPositiveInt('limit', 'query'),
    isPositiveInt('offset', 'query'),
    query('projectId').optional().trim().isLength({ max: 50 }),
    query('category').optional().isIn(['general', 'auth', 'user', 'project', 'admin', 'security', 'system']),
    query('severity').optional().isIn(['info', 'warning', 'critical'])
  ]),
  async (req, res) => {
  try {
    const { limit = 100, offset = 0, projectId, category, severity } = req.query;

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

    // ASRB 5.1.5: Get total count for pagination
    const countResult = await pool.query(`SELECT COUNT(*) as total FROM AuditLog${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // ASRB 5.1.3: Parameterized offset/limit (fixes SQL injection risk)
    const limitVal = Math.min(parseInt(limit) || 100, 1000);
    const offsetVal = parseInt(offset) || 0;

    const result = await pool.query(
      `SELECT * FROM AuditLog${whereClause} ORDER BY timestamp DESC OFFSET $${paramIndex++} LIMIT $${paramIndex++}`,
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
