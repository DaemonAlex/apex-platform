/**
 * APEX Structured Security Logger
 * ASRB 5.1.6 - Replaces console.log/error with structured JSON logging
 */

const { pool } = require('../db');

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
    pool.query(`
      INSERT INTO AuditLog (id, timestamp, "user", action, resource, details, category, severity, ipAddress, created_at)
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auditlog')
    `, [
      `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      new Date(),
      context.userId || context.email || 'System',
      message,
      context.route || context.resource || '',
      JSON.stringify(context),
      'security',
      context.severity || 'warning',
      context.ip || '127.0.0.1'
    ]).catch(err => {
      process.stderr.write(formatLog(LOG_LEVELS.error, 'Failed to write security log to database', { error: err.message }) + '\n');
    });
  }
};

module.exports = logger;
