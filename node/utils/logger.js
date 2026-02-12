/**
 * APEX Structured Security Logger
 * ASRB 5.1.6 - Replaces console.log/error with structured JSON logging
 */

const { sql, poolPromise } = require('../db');

const LOG_LEVELS = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  security: 'SECURITY'
};

function formatLog(level, message, context = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  });
}

const logger = {
  info(message, context = {}) {
    process.stdout.write(formatLog(LOG_LEVELS.info, message, context) + '\n');
  },

  warn(message, context = {}) {
    process.stdout.write(formatLog(LOG_LEVELS.warn, message, context) + '\n');
  },

  error(message, context = {}) {
    process.stderr.write(formatLog(LOG_LEVELS.error, message, context) + '\n');
  },

  /**
   * Security-level log - also writes to AuditLog table
   */
  security(message, context = {}) {
    const logEntry = formatLog(LOG_LEVELS.security, message, context);
    process.stderr.write(logEntry + '\n');

    // Async write to audit log table (non-blocking, fire-and-forget)
    poolPromise.then(pool => {
      pool.request()
        .input('id', sql.NVarChar, `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
        .input('timestamp', sql.DateTime, new Date())
        .input('user', sql.NVarChar, context.userId || context.email || 'System')
        .input('action', sql.NVarChar, message)
        .input('resource', sql.NVarChar, context.route || context.resource || '')
        .input('details', sql.NVarChar, JSON.stringify(context))
        .input('category', sql.NVarChar, 'security')
        .input('severity', sql.NVarChar, context.severity || 'warning')
        .input('ipAddress', sql.NVarChar, context.ip || '127.0.0.1')
        .query(`
          IF EXISTS (SELECT * FROM sysobjects WHERE name='AuditLog' AND xtype='U')
          BEGIN
            INSERT INTO AuditLog (id, timestamp, [user], action, resource, details, category, severity, ipAddress, created_at)
            VALUES (@id, @timestamp, @user, @action, @resource, @details, @category, @severity, @ipAddress, GETDATE())
          END
        `)
        .catch(err => {
          process.stderr.write(formatLog(LOG_LEVELS.error, 'Failed to write security log to database', { error: err.message }) + '\n');
        });
    }).catch(() => {
      // Database not available - log already written to stderr
    });
  }
};

module.exports = logger;
