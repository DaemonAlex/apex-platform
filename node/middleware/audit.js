/**
 * APEX Audit Logging Middleware
 * ASRB 5.1.5 - Auto-triggered audit logging for security events
 */

const { pool } = require('../db');
const logger = require('../utils/logger');

// Eagerly ensure the audit table exists. Prior to 2026-04 this table was
// referenced everywhere but never created, so all audit middleware writes
// silently failed and admin actions were not persisted - a compliance gap
// for any production deployment.
//
// Fire-and-forget: the pool will queue the query until the DB is reachable.
// We retry briefly on connection errors to handle the docker startup race
// where the backend boots before the DB has finished accepting connections.
let auditTableReady = false;
async function ensureAuditTable(retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS AuditLog (
          id VARCHAR(255) PRIMARY KEY,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "user" VARCHAR(255),
          action TEXT NOT NULL,
          resource TEXT,
          details TEXT,
          projectId VARCHAR(50),
          taskId VARCHAR(50),
          category VARCHAR(50) DEFAULT 'general',
          severity VARCHAR(20) DEFAULT 'info',
          ipAddress VARCHAR(45),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS audit_timestamp_idx ON AuditLog (timestamp DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS audit_category_idx ON AuditLog (category)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS audit_severity_idx ON AuditLog (severity)`);
      auditTableReady = true;
      logger.info('Audit log table ready');
      return;
    } catch (err) {
      if (attempt === retries - 1) {
        logger.error('Failed to ensure AuditLog table exists', { error: err.message });
        return;
      }
      // Backoff: 1s, 2s, 4s, 8s, 16s
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
ensureAuditTable();

/**
 * Create audit middleware that logs after response is sent
 * @param {string} action - Description of the action being logged
 * @param {string} category - Category: 'auth', 'user', 'project', 'admin', 'general'
 * @param {string} severity - Severity: 'info', 'warning', 'critical'
 */
function auditLog(action, category = 'general', severity = 'info') {
  return (req, res, next) => {
    res.on('finish', () => {
      const user = req.user
        ? (req.user.email || req.user.userId || 'authenticated')
        : (req.body.email || 'anonymous');
      const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
      const resource = req.originalUrl;
      const statusCode = res.statusCode;
      const projectId = req.params.projectId || null;
      const taskId = req.params.taskId || null;

      // Determine effective severity based on response
      const effectiveSeverity = statusCode >= 400 ? 'warning' : severity;

      const details = JSON.stringify({
        method: req.method,
        statusCode,
        userAgent: req.get('User-Agent') || ''
      });

      // Non-blocking write to database
      pool.query(`
        INSERT INTO AuditLog (id, timestamp, "user", action, resource, details, projectId, taskId, category, severity, ipAddress, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      `, [
        `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        new Date(),
        String(user).substring(0, 255),
        `${action} [${statusCode}]`,
        resource,
        details,
        projectId,
        taskId,
        category,
        effectiveSeverity,
        ip
      ]).catch(err => {
        logger.error('Audit middleware: failed to write audit log', { error: err.message });
      });
    });

    next();
  };
}

module.exports = { auditLog };
