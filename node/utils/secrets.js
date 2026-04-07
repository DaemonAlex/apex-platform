/**
 * Docker secrets / file-based secret loading.
 *
 * For each sensitive environment variable, allow a `*_FILE` companion that
 * points to a file containing the secret value. If `${VAR}_FILE` is set
 * and the corresponding `${VAR}` is not, the file is read and its trimmed
 * contents become `process.env[VAR]`. This is the standard Docker convention
 * used by official postgres / mysql / redis images.
 *
 * Usage:
 *   const { loadSecretsFromFiles } = require('./utils/secrets');
 *   loadSecretsFromFiles();
 *
 * Must be called BEFORE any module that reads these env vars (db.js,
 * middleware/auth.js, etc).
 *
 * docker-compose example:
 *   secrets:
 *     db_password:
 *       file: ./secrets/db_password.txt
 *   services:
 *     backend:
 *       environment:
 *         DB_PASSWORD_FILE: /run/secrets/db_password
 *       secrets:
 *         - db_password
 */

const fs = require('fs');

// Sensitive variables that support `*_FILE` companions. Add to this list
// when introducing a new secret env var.
const SECRET_VARS = [
  'DB_PASSWORD',
  'JWT_SECRET',
  'INITIAL_ADMIN_PASSWORD',
  'CISCO_CLIENT_SECRET',
  'CISCO_PERSONAL_TOKEN',
];

function loadSecretsFromFiles() {
  for (const name of SECRET_VARS) {
    const fileVar = `${name}_FILE`;
    const filePath = process.env[fileVar];
    if (!filePath) continue;
    if (process.env[name]) {
      // If both are set, prefer the direct env var and log a warning so
      // the operator notices the inconsistency.
      console.warn(`WARNING: both ${name} and ${fileVar} are set; using ${name} from env, ignoring file`);
      continue;
    }
    try {
      process.env[name] = fs.readFileSync(filePath, 'utf8').trim();
    } catch (err) {
      console.error(`CRITICAL: cannot read secret file ${filePath} for ${name}: ${err.message}`);
      process.exit(1);
    }
  }
}

module.exports = { loadSecretsFromFiles, SECRET_VARS };
