const fs = require('fs');
const { Pool } = require('pg');

// Validate required environment variables
const requiredEnvVars = ['DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_DATABASE'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('CRITICAL: Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Application cannot start without database credentials.');
  console.error('Please set the following environment variables:');
  missingEnvVars.forEach(envVar => console.error(`   - ${envVar}`));
  process.exit(1);
}

/**
 * Build the optional ssl block for the pg Pool from environment variables.
 *
 * Env vars (all optional):
 *   DB_SSL                       - "true" / "1" to enable SSL. Default: off.
 *   DB_SSL_REJECT_UNAUTHORIZED   - "false" / "0" to skip cert verification.
 *                                  Default: true (verify the server cert).
 *                                  Set to false ONLY for self-signed certs in
 *                                  trusted private networks.
 *   DB_SSL_CA                    - path to a PEM file containing the CA cert
 *                                  to trust. Required for managed PostgreSQL
 *                                  with a private CA (RDS, Azure DB, etc.) if
 *                                  REJECT_UNAUTHORIZED is true.
 *   DB_SSL_CERT, DB_SSL_KEY      - paths to client cert and key files for
 *                                  mutual TLS (rare, only when the DB
 *                                  requires it).
 *
 * Node.js negotiates TLS 1.2+ by default since the v12 line, so we do not
 * need to set minVersion explicitly here. server.js applies a global TLS
 * minimum to be defensive.
 */
function buildSslConfig() {
  const enabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.DB_SSL || '').toLowerCase()
  );
  if (!enabled) return false;

  const reject = String(
    process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true'
  ).toLowerCase();
  const rejectUnauthorized = !['0', 'false', 'no', 'off'].includes(reject);

  const ssl = { rejectUnauthorized };

  if (process.env.DB_SSL_CA) {
    try {
      ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
    } catch (err) {
      console.error(`CRITICAL: cannot read DB_SSL_CA file at ${process.env.DB_SSL_CA}: ${err.message}`);
      process.exit(1);
    }
  }
  if (process.env.DB_SSL_CERT) {
    try {
      ssl.cert = fs.readFileSync(process.env.DB_SSL_CERT, 'utf8');
    } catch (err) {
      console.error(`CRITICAL: cannot read DB_SSL_CERT file at ${process.env.DB_SSL_CERT}: ${err.message}`);
      process.exit(1);
    }
  }
  if (process.env.DB_SSL_KEY) {
    try {
      ssl.key = fs.readFileSync(process.env.DB_SSL_KEY, 'utf8');
    } catch (err) {
      console.error(`CRITICAL: cannot read DB_SSL_KEY file at ${process.env.DB_SSL_KEY}: ${err.message}`);
      process.exit(1);
    }
  }

  if (rejectUnauthorized && !ssl.ca) {
    console.warn('WARNING: DB_SSL is enabled with DB_SSL_REJECT_UNAUTHORIZED=true but no DB_SSL_CA provided. The system trust store will be used. Set DB_SSL_CA to pin a private CA.');
  }

  return ssl;
}

const ssl = buildSslConfig();

// Database configuration - NO HARDCODED CREDENTIALS
const pool = new Pool({
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE,
  // pg accepts ssl: false to mean "no SSL" or an object to enable it.
  ssl: ssl || false,
  // Connection pool sizing - tunable via env, sensible defaults.
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
});

pool.on('connect', () => {
  console.log(`Connected to PostgreSQL database (ssl=${ssl ? 'on' : 'off'})`);
});

pool.on('error', (err) => {
  console.error('Database connection error:', err.message);
});

module.exports = {
  pool,
};
