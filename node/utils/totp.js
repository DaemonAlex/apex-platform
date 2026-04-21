const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { pool } = require('../db');

const ENC_ALGO = 'aes-256-gcm';
const ENC_KEY_B64 = process.env.TOTP_ENC_KEY;
if (!ENC_KEY_B64) {
  // Not fatal at import time (lets drizzle-kit and test tools load), but
  // every call that needs encryption will throw below.
  // Logged by whichever handler touches encryption first.
}
function keyBuf() {
  if (!ENC_KEY_B64) throw new Error('TOTP_ENC_KEY env var not set');
  const buf = Buffer.from(ENC_KEY_B64, 'base64');
  if (buf.length !== 32) throw new Error('TOTP_ENC_KEY must decode to 32 bytes');
  return buf;
}

// Encrypt a UTF-8 string with AES-256-GCM. Output: iv:tag:ciphertext base64.
function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, keyBuf(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(packed) {
  const [ivB64, tagB64, encB64] = packed.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const enc = Buffer.from(encB64, 'base64');
  const decipher = crypto.createDecipheriv(ENC_ALGO, keyBuf(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// Status: { enrolled: bool, enabled: bool, backupCount: number }
async function getStatus(userId) {
  const r = await pool.query(
    'SELECT enabled_at, backup_codes_hash FROM user_totp WHERE user_id = $1',
    [userId]
  );
  if (!r.rows.length) return { enrolled: false, enabled: false, backupCount: 0 };
  const row = r.rows[0];
  const codes = Array.isArray(row.backup_codes_hash) ? row.backup_codes_hash : [];
  return {
    enrolled: true,
    enabled: !!row.enabled_at,
    backupCount: codes.filter(Boolean).length,
  };
}

// Start enrollment: generate a secret, store encrypted but NOT enabled yet.
// Return an otpauth URL + QR data-URL for the client to show.
async function startEnroll(userId, accountLabel) {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${process.env.TOTP_ISSUER || 'APEX'}:${accountLabel}`,
    issuer: process.env.TOTP_ISSUER || 'APEX',
  });
  const encrypted = encrypt(secret.base32);
  await pool.query(
    `INSERT INTO user_totp (user_id, secret_encrypted, enabled_at, backup_codes_hash)
     VALUES ($1, $2, NULL, '[]'::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted, enabled_at = NULL, updated_at = NOW()`,
    [userId, encrypted]
  );
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  return { otpauthUrl: secret.otpauth_url, qrDataUrl };
}

function verifyTotpCode(secretBase32, code) {
  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: 'base32',
    token: String(code).replace(/\s+/g, ''),
    window: 1,
  });
}

// Finalize enrollment: verify the 6-digit code, mark enabled, generate and
// return 10 backup codes (plaintext once, hashed into DB).
async function completeEnroll(userId, code) {
  const r = await pool.query('SELECT secret_encrypted FROM user_totp WHERE user_id = $1', [userId]);
  if (!r.rows.length) throw new Error('No enrollment in progress');
  const secret = decrypt(r.rows[0].secret_encrypted);
  if (!verifyTotpCode(secret, code)) return null;

  const backupCodes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-')
  );
  const hashed = await Promise.all(backupCodes.map(c => bcrypt.hash(c, 10)));
  await pool.query(
    `UPDATE user_totp SET enabled_at = NOW(), backup_codes_hash = $1::jsonb, updated_at = NOW() WHERE user_id = $2`,
    [JSON.stringify(hashed), userId]
  );
  return { backupCodes };
}

// Verify a 6-digit TOTP code OR a backup code. Returns true on match.
// Backup codes are single-use — matching entries are nulled.
async function verifyAtLogin(userId, code) {
  const r = await pool.query(
    'SELECT secret_encrypted, backup_codes_hash FROM user_totp WHERE user_id = $1 AND enabled_at IS NOT NULL',
    [userId]
  );
  if (!r.rows.length) return false;
  const row = r.rows[0];

  // Try TOTP first
  const secret = decrypt(row.secret_encrypted);
  if (verifyTotpCode(secret, code)) {
    await pool.query('UPDATE user_totp SET last_used_at = NOW() WHERE user_id = $1', [userId]);
    return true;
  }

  // Fall back to backup codes (case-insensitive, hyphens optional)
  const normalized = String(code).trim().toUpperCase().replace(/\s+/g, '');
  const codes = Array.isArray(row.backup_codes_hash) ? row.backup_codes_hash : [];
  for (let i = 0; i < codes.length; i++) {
    const h = codes[i];
    if (!h) continue;
    const raw = normalized.includes('-') ? normalized : normalized.replace(/^(.{5})(.{5})$/, '$1-$2');
    if (await bcrypt.compare(raw, h)) {
      const nextCodes = codes.slice();
      nextCodes[i] = null;
      await pool.query(
        'UPDATE user_totp SET backup_codes_hash = $1::jsonb, last_used_at = NOW() WHERE user_id = $2',
        [JSON.stringify(nextCodes), userId]
      );
      return true;
    }
  }
  return false;
}

// Admin or self may disable — clears the row so the user re-enrolls.
async function disable(userId) {
  await pool.query('DELETE FROM user_totp WHERE user_id = $1', [userId]);
}

module.exports = {
  getStatus,
  startEnroll,
  completeEnroll,
  verifyAtLogin,
  disable,
};
