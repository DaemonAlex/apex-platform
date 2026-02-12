/**
 * APEX Audit Logging Middleware
 * ASRB 5.1.5 - Auto-triggered audit logging for security events
 */

const { pool } = require('../db');
const logger = require('../utils/logger');

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

      // Determine effective severity based on response
      const effectiveSeverity = statusCode >= 400 ? 'warning' : severity;

      const details = JSON.stringify({
        method: req.method,
        statusCode,
        userAgent: req.get('User-Agent') || ''
      });

      // Non-blocking write to database
      pool.query(`
        INSERT INTO AuditLog (id, timestamp, "user", action, resource, details, category, severity, ipAddress, created_at)
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auditlog')
      `, [
        `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        new Date(),
        String(user).substring(0, 255),
        `${action} [${statusCode}]`,
        resource,
        details,
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
