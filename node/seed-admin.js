/**
 * APEX Initial Admin Bootstrap
 *
 * Creates a single admin user from environment variables on a fresh
 * deployment. Safe to run multiple times - refuses to do anything if
 * any user already exists in the Users table.
 *
 * Required env vars:
 *   INITIAL_ADMIN_EMAIL     - email address (must be valid format)
 *   INITIAL_ADMIN_PASSWORD  - password (min 12 chars, mixed case, digit, special)
 *   INITIAL_ADMIN_NAME      - display name (optional, defaults to "APEX Administrator")
 *
 * Plus the standard DB_* and JWT_SECRET vars the backend uses.
 *
 * Usage:
 *   docker compose exec backend node seed-admin.js
 *   # or in a non-docker setup:
 *   cd node && node seed-admin.js
 *
 * Exit codes:
 *   0 - admin created OR users already exist (idempotent success)
 *   1 - configuration error (missing env vars, weak password, etc.)
 *   2 - database error
 */

require('dotenv').config();
const { loadSecretsFromFiles } = require('./utils/secrets');
loadSecretsFromFiles();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

function fail(message, code = 1) {
  console.error(`ERROR: ${message}`);
  process.exit(code);
}

function validatePassword(password) {
  const errors = [];
  if (password.length < 12) errors.push('at least 12 characters');
  if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('one number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('one special character');
  if (/(.)\1{2,}/.test(password)) errors.push('no three or more repeated characters');
  if (/123|abc|qwe|asd|zxc/i.test(password)) errors.push('no common sequences (123, abc, qwe, ...)');
  return errors;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || '';
  const name = (process.env.INITIAL_ADMIN_NAME || 'APEX Administrator').trim();

  if (!email) fail('INITIAL_ADMIN_EMAIL is not set');
  if (!password) fail('INITIAL_ADMIN_PASSWORD is not set');
  if (!validateEmail(email)) fail(`INITIAL_ADMIN_EMAIL is not a valid email: ${email}`);

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) {
    fail(`INITIAL_ADMIN_PASSWORD does not meet requirements - needs: ${pwErrors.join(', ')}`);
  }

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`ERROR: cannot connect to database: ${err.message}`);
    process.exit(2);
  }

  try {
    // Ensure the Users table exists. Schema must match the one auth.js
    // creates lazily on first login attempt - keep these in sync.
    await client.query(`
      CREATE TABLE IF NOT EXISTS Users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'auditor',
        preferences TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`ALTER TABLE Users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW()`);
    await client.query(`ALTER TABLE Users ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE Users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE`);

    // Refuse to do anything if any user already exists. This makes the
    // script idempotent and safe to re-run, and prevents accidental
    // privilege escalation by re-running it on a populated DB.
    const existing = await client.query('SELECT COUNT(*)::int AS count FROM Users');
    if (existing.rows[0].count > 0) {
      console.log(`Users table already has ${existing.rows[0].count} user(s). Bootstrap is a no-op.`);
      console.log('To create additional users, log in and use the Admin section.');
      return;
    }

    // Hash and insert. Cost factor 12 matches the rest of the codebase.
    const hashed = await bcrypt.hash(password, 12);
    const expires = new Date();
    expires.setDate(expires.getDate() + 60); // 60-day password policy

    const result = await client.query(
      `INSERT INTO Users (name, email, password, role, password_changed_at, password_expires_at)
       VALUES ($1, $2, $3, 'admin', NOW(), $4)
       RETURNING id, email, role`,
      [name, email, hashed, expires]
    );

    const user = result.rows[0];
    console.log('Initial admin created:');
    console.log(`  id:    ${user.id}`);
    console.log(`  email: ${user.email}`);
    console.log(`  role:  ${user.role}`);
    console.log('');
    console.log('Log in at the web UI with the email and password from your .env file.');
    console.log('Change the password from the Profile page after first login.');
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(2);
});
