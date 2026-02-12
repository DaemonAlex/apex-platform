/**
 * APEX Audit Logging Middleware
 * ASRB 5.1.5 - Auto-triggered audit logging for security events
 */

const { sql, poolPromise } = require('../db');
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
      poolPromise.then(pool => {
        pool.request()
          .input('id', sql.NVarChar, `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
          .input('timestamp', sql.DateTime, new Date())
          .input('user', sql.NVarChar, String(user).substring(0, 255))
          .input('action', sql.NVarChar, `${action} [${statusCode}]`)
          .input('resource', sql.NVarChar, resource)
          .input('details', sql.NVarChar, details)
          .input('category', sql.NVarChar, category)
          .input('severity', sql.NVarChar, effectiveSeverity)
          .input('ipAddress', sql.NVarChar, ip)
          .query(`
            IF EXISTS (SELECT * FROM sysobjects WHERE name='AuditLog' AND xtype='U')
            BEGIN
              INSERT INTO AuditLog (id, timestamp, [user], action, resource, details, category, severity, ipAddress, created_at)
              VALUES (@id, @timestamp, @user, @action, @resource, @details, @category, @severity, @ipAddress, GETDATE())
            END
          `)
          .catch(err => {
            logger.error('Audit middleware: failed to write audit log', { error: err.message });
          });
      }).catch(() => {
        // Database not available
      });
    });

    next();
  };
}

module.exports = { auditLog };
