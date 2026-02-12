const express = require('express');
const { sql, poolPromise } = require('../db');
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

    const pool = await poolPromise;

    // Insert audit log entry
    await pool.request()
      .input('id', sql.NVarChar, `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
      .input('timestamp', sql.DateTime, new Date())
      .input('user', sql.NVarChar, user || 'System')
      .input('action', sql.NVarChar, action)
      .input('resource', sql.NVarChar, resource || '')
      .input('details', sql.NVarChar, details || '')
      .input('projectId', sql.NVarChar, projectId || null)
      .input('taskId', sql.NVarChar, taskId || null)
      .input('category', sql.NVarChar, category)
      .input('severity', sql.NVarChar, severity)
      .input('ipAddress', sql.NVarChar, ipAddress)
      .query(`
        INSERT INTO AuditLog (id, timestamp, [user], action, resource, details, projectId, taskId, category, severity, ipAddress, created_at)
        VALUES (@id, @timestamp, @user, @action, @resource, @details, @projectId, @taskId, @category, @severity, @ipAddress, GETDATE())
      `);

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

    const pool = await poolPromise;

    // Build WHERE clause for both queries
    let whereClause = ' WHERE 1=1';
    const addInputs = (request) => {
      if (projectId) {
        request.input('projectId', sql.NVarChar, projectId);
      }
      if (category) {
        request.input('category', sql.NVarChar, category);
      }
      if (severity) {
        request.input('severity', sql.NVarChar, severity);
      }
      return request;
    };

    if (projectId) whereClause += ' AND projectId = @projectId';
    if (category) whereClause += ' AND category = @category';
    if (severity) whereClause += ' AND severity = @severity';

    // ASRB 5.1.5: Get total count for pagination
    const countRequest = addInputs(pool.request());
    const countResult = await countRequest.query(`SELECT COUNT(*) as total FROM AuditLog${whereClause}`);
    const total = countResult.recordset[0].total;

    // ASRB 5.1.3: Parameterized offset/limit (fixes SQL injection risk)
    const dataRequest = addInputs(pool.request());
    dataRequest.input('offset', sql.Int, parseInt(offset) || 0);
    dataRequest.input('limit', sql.Int, Math.min(parseInt(limit) || 100, 1000));

    const result = await dataRequest.query(
      `SELECT * FROM AuditLog${whereClause} ORDER BY timestamp DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
    );

    res.json({
      auditLog: result.recordset,
      total
    });

    // Connection pool kept open for reuse
  } catch (error) {
    logger.error('Get audit log error', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve audit log', details: error.message });
  }
});

module.exports = router;
