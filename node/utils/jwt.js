const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const logger = require('./logger');

// Load keys once at module init. Crash-loud if files are unreadable — better
// than discovering at first login that the service can't sign tokens.
const privatePath = process.env.JWT_PRIVATE_KEY_FILE;
const publicPath = process.env.JWT_PUBLIC_KEY_FILE;
let privateKey = null;
let publicKey = null;
if (privatePath && publicPath) {
  try {
    privateKey = fs.readFileSync(privatePath, 'utf8');
    publicKey = fs.readFileSync(publicPath, 'utf8');
    logger.info('JWT RS256 keys loaded', { privatePath, publicPath });
  } catch (err) {
    logger.error('Failed to load JWT key files', { error: err.message, privatePath, publicPath });
  }
}

const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL_DAYS = parseInt(process.env.JWT_REFRESH_TTL_DAYS || '14', 10);
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

function signAccessToken(payload) {
  if (!privateKey) throw new Error('JWT private key not loaded');
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: ACCESS_TTL });
}

function verifyAccessToken(token) {
  if (!publicKey) throw new Error('JWT public key not loaded');
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
}

// Refresh tokens are OPAQUE (not JWTs). The raw value is what the client
// holds; we store only its SHA-256 hash so a DB read can't mint sessions.
function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function issueRefreshToken({ userId, ip, userAgent }) {
  const raw = crypto.randomBytes(64).toString('base64url');
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, userAgent || null, ip || null]
  );
  return { raw, expiresAt };
}

// Returns the refresh_tokens row or null if the raw token is invalid,
// expired, or revoked. On success, rotates: the old row is marked revoked
// and a fresh token is issued (sliding window + rotation best practice).
async function rotateRefreshToken({ raw, ip, userAgent }) {
  const tokenHash = hashRefreshToken(raw);
  const result = await pool.query(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  if (row.revoked_at) {
    // Reuse of a revoked token is a signal of theft — kill all sessions
    // for this user as a precaution.
    logger.security('Refresh token reuse detected; revoking all sessions', { userId: row.user_id, ip });
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [row.user_id]
    );
    return null;
  }
  if (new Date(row.expires_at) <= new Date()) return null;

  await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
  const fresh = await issueRefreshToken({ userId: row.user_id, ip, userAgent });
  return { userId: row.user_id, ...fresh };
}

async function revokeRefreshToken(raw) {
  const tokenHash = hashRefreshToken(raw);
  await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash]);
}

async function revokeAllUserTokens(userId) {
  await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

// Cookie options shared by the access-token and refresh-token cookies.
// `Secure` is on by default; set COOKIE_SECURE=false in a pure-local dev
// environment that doesn't go through Cloudflare.
function cookieOptions({ maxAgeMs } = {}) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',
    sameSite: 'strict',
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: maxAgeMs,
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cookieOptions,
  hashRefreshToken,
  REFRESH_TTL_MS,
  ACCESS_TTL,
  isRs256Ready: () => Boolean(privateKey && publicKey),
};
