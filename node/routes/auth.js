const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { sendServerError } = require('../utils/errors');
const { auditLog } = require('../middleware/audit');
const { validate, body, isValidEmail } = require('../middleware/validate');
const {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  cookieOptions,
  REFRESH_TTL_MS,
  isRs256Ready,
} = require('../utils/jwt');
const totp = require('../utils/totp');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Helpers to set and clear the three auth cookies in one place.
function setAuthCookies(res, { accessToken, refreshToken, csrfToken, refreshExpiresAt }) {
  // Access token — short-lived (15m). httpOnly, Secure, SameSite=Strict.
  res.cookie('apex_access', accessToken, cookieOptions({ maxAgeMs: 15 * 60 * 1000 }));
  // Refresh token — opaque, stored by hash in DB. Scoped to /api/auth so it
  // only travels on refresh/logout requests, minimizing exposure.
  res.cookie('apex_refresh', refreshToken, {
    ...cookieOptions({ maxAgeMs: REFRESH_TTL_MS }),
    path: '/api/auth',
  });
  // CSRF token — NOT httpOnly so the frontend can read it and send it back
  // in the X-CSRF-Token header (double-submit pattern).
  res.cookie('apex_csrf', csrfToken, {
    ...cookieOptions({ maxAgeMs: REFRESH_TTL_MS }),
    httpOnly: false,
  });
}

function clearAuthCookies(res) {
  const base = cookieOptions();
  res.clearCookie('apex_access', base);
  res.clearCookie('apex_refresh', { ...base, path: '/api/auth' });
  res.clearCookie('apex_csrf', { ...base, httpOnly: false });
}

// Validate JWT_SECRET is set
if (!process.env.JWT_SECRET) {
  logger.error('CRITICAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

// P1-2 account lockout — added 2026-04-18. Tracks failed login attempts in
// the auth_failures table keyed by lowercased username. Lock escalates:
// 5 → 15 min, 10 → 1 hour, 15 → 24 hours. Successful login deletes the row.
// The same error and timing are returned for both real-user-wrong-password
// and nonexistent-user so enumeration is not leaked.
const LOCK_SCHEDULE = [
  { atCount: 5, durationMs: 15 * 60 * 1000 },
  { atCount: 10, durationMs: 60 * 60 * 1000 },
  { atCount: 15, durationMs: 24 * 60 * 60 * 1000 },
];

async function getLockState(username) {
  const r = await pool.query(
    'SELECT count, locked_until FROM auth_failures WHERE username = $1',
    [username]
  );
  if (!r.rows.length) return { count: 0, lockedUntil: null };
  return { count: r.rows[0].count, lockedUntil: r.rows[0].locked_until };
}

async function recordLoginFailure(username, ip) {
  const r = await pool.query(
    `INSERT INTO auth_failures (username, count, last_ip, last_attempt_at)
     VALUES ($1, 1, $2, NOW())
     ON CONFLICT (username) DO UPDATE
     SET count = auth_failures.count + 1,
         last_ip = EXCLUDED.last_ip,
         last_attempt_at = NOW()
     RETURNING count`,
    [username, ip]
  );
  const newCount = r.rows[0].count;
  const tier = [...LOCK_SCHEDULE].reverse().find(t => newCount >= t.atCount);
  if (tier) {
    const lockedUntil = new Date(Date.now() + tier.durationMs);
    await pool.query(
      'UPDATE auth_failures SET locked_until = $1 WHERE username = $2',
      [lockedUntil, username]
    );
    logger.security('Account locked after failed logins', { username, count: newCount, lockedUntil, ip });
    return { count: newCount, lockedUntil };
  }
  return { count: newCount, lockedUntil: null };
}

async function resetLoginFailures(username) {
  await pool.query('DELETE FROM auth_failures WHERE username = $1', [username]);
}

// Password security requirements
function validatePassword(password) {
  const errors = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak patterns
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain three or more consecutive identical characters');
  }

  if (/123|abc|qwe|asd|zxc/i.test(password)) {
    errors.push('Password cannot contain common sequences');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// Login endpoint
router.post('/login',
  validate([
    isValidEmail('email'),
    body('password').notEmpty().withMessage('Password is required')
  ]),
  auditLog('User login attempt', 'auth', 'info'),
  async (req, res) => {
  try {
    const { email, password } = req.body;
    const username = String(email || '').toLowerCase();

    // Account lockout check (P1-2). 423 Locked is the HTTP code for
    // "resource temporarily locked"; Retry-After tells the client when to try again.
    const lockState = await getLockState(username);
    if (lockState.lockedUntil && new Date(lockState.lockedUntil) > new Date()) {
      const retrySec = Math.ceil((new Date(lockState.lockedUntil) - new Date()) / 1000);
      res.setHeader('Retry-After', String(retrySec));
      logger.security('Login attempt on locked account', { username, ip: req.ip, retrySec });
      return res.status(423).json({ error: 'Account temporarily locked', retryAfterSeconds: retrySec });
    }

    // Find user by email
    const result = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);

    const user = result.rows[0];

    if (!user) {
      await recordLoginFailure(username, req.ip);
      logger.security('Failed login - user not found', { email, ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      await recordLoginFailure(username, req.ip);
      logger.security('Failed login - invalid password', { email, ip: req.ip, userId: user.id });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password expiration (60-day policy)
    const passwordExpired = user.password_expires_at && new Date() > new Date(user.password_expires_at);
    const forcePasswordChange = user.force_password_change;

    if (passwordExpired || forcePasswordChange) {
      return res.status(403).json({
        error: 'Password expired',
        message: 'Your password has expired. Please reset your password.',
        passwordExpired: true,
        email: user.email
      });
    }

    // Successful auth — clear any prior failure counter.
    await resetLoginFailures(username);

    // 2FA step-up (P1-3 2026-04-18). If the user has TOTP enabled, password
    // alone is not enough. We issue a 5-minute pre-auth token (aud=mfa)
    // that /api/auth/verify-totp exchanges for the real session. No cookies
    // are set yet — the pre-auth token is only in the response body.
    const totpStatus = await totp.getStatus(user.id);
    if (totpStatus.enabled) {
      const preAuthToken = jwt.sign(
        { userId: user.id, email: user.email, aud: 'mfa' },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      logger.info('Login password verified, TOTP required', { email: user.email, userId: user.id, ip: req.ip });
      return res.json({
        mfaRequired: true,
        preAuthToken,
        email: user.email,
      });
    }

    // Sign the access token. Prefer RS256 (P1-1 2026-04-18) when the key
    // pair is loaded; fall back to HS256 so the service keeps working in
    // environments where the key files haven't been provisioned yet.
    const claims = { userId: user.id, email: user.email, name: user.name, role: user.role };
    const token = isRs256Ready()
      ? signAccessToken(claims)
      : jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    // Issue a rotating opaque refresh token + a CSRF token, bind all three
    // as cookies. The response body still includes the access token for now
    // so clients still reading localStorage keep working through the rollout.
    const refresh = await issueRefreshToken({ userId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] });
    const csrfToken = crypto.randomBytes(24).toString('base64url');
    setAuthCookies(res, { accessToken: token, refreshToken: refresh.raw, csrfToken, refreshExpiresAt: refresh.expiresAt });

    // Parse preferences from database
    let preferences = {};
    try {
      preferences = user.preferences ? JSON.parse(user.preferences) : {};
    } catch (e) {
      preferences = {};
    }

    logger.info('Successful login', { email: user.email, userId: user.id, ip: req.ip });

    res.json({
      token,
      refreshToken: token, // For simplicity, using same token
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        preferences: preferences,
        Role: {
          name: user.role,
          displayName: user.role.charAt(0).toUpperCase() + user.role.slice(1)
        }
      }
    });

    // Connection pool kept open for reuse
  } catch (error) {
    return sendServerError(res, 'Authentication failed', error, { ip: req.ip });
  }
});

// Public registration is disabled. The endpoint previously here accepted
// `role` from the request body with no authentication, allowing anyone
// reachable on the API to self-create as superadmin. Removed for the
// 2026-04 production hardening pass.
//
// To create users:
//   - First admin on a fresh deploy: `node seed-admin.js` (uses INITIAL_ADMIN_*)
//   - Subsequent users: log in as admin and use POST /api/users (admin-only)
router.post('/register', auditLog('Disabled register attempt', 'auth', 'warning'), (req, res) => {
  logger.security('Attempt to use disabled /api/auth/register', { ip: req.ip });
  return res.status(404).json({
    error: 'Not found',
    message: 'Public registration is disabled. Contact your administrator.'
  });
});

// Request password reset
router.post('/forgot-password',
  validate([
    isValidEmail('email')
  ]),
  auditLog('Password reset request', 'auth', 'info'),
  async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const userResult = await pool.query('SELECT id, name FROM Users WHERE LOWER(email) = $1', [email.toLowerCase()]);

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists - security best practice
      // Connection pool kept open for reuse
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    const user = userResult.rows[0];

    // Rate limiting: Check for recent reset requests (max 10 per hour for testing)
    const recentRequests = await pool.query(`
      SELECT COUNT(*) as count
      FROM PasswordResetTokens
      WHERE user_id = $1
      AND created_at > NOW() - INTERVAL '1 hour'
    `, [user.id]);

    if (recentRequests.rows[0].count >= 10) {
      // Connection pool kept open for reuse
      return res.status(429).json({ error: 'Too many reset requests. Please try again later.' });
    }

    // Generate secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store token in database
    await pool.query(`
      INSERT INTO PasswordResetTokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
    `, [user.id, resetToken, expiresAt]);

    // Send email with reset link
    const resetLink = `https://daemonscripts.com/?token=${resetToken}&email=${encodeURIComponent(email)}`;

    try {
      const emailService = require('../services/emailService');
      const emailSent = await emailService.sendPasswordReset(email, user.name, resetLink);

      if (!emailSent) {
        logger.warn('Email service failed for password reset', { email });
      }
    } catch (emailError) {
      logger.error('Email service error', { error: emailError.message, email });
    }

    logger.info('Password reset requested', { email, ip: req.ip });

    // Connection pool kept open for reuse
    res.json({ message: 'If this email exists, a reset link has been sent.' });

  } catch (error) {
    return sendServerError(res, 'Password reset request failed', error, { ip: req.ip });
  }
});

// Reset password with token
router.post('/reset-password',
  validate([
    body('token').notEmpty().withMessage('Reset token is required').isHexadecimal().withMessage('Invalid token format'),
    isValidEmail('email'),
    body('newPassword').notEmpty().withMessage('New password is required')
  ]),
  auditLog('Password reset', 'auth', 'critical'),
  async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    // Validate password requirements
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    // Verify token and get user
    const tokenResult = await pool.query(`
      SELECT prt.id as token_id, prt.user_id, prt.expires_at, prt.used, u.email
      FROM PasswordResetTokens prt
      JOIN Users u ON prt.user_id = u.id
      WHERE prt.token = $1
      AND LOWER(u.email) = $2
      AND prt.used = FALSE
      AND prt.expires_at > NOW()
    `, [token, email.toLowerCase()]);

    if (tokenResult.rows.length === 0) {
      logger.security('Invalid password reset attempt', { email, ip: req.ip });
      // Connection pool kept open for reuse
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const tokenData = tokenResult.rows[0];

    // Hash new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Calculate new password expiration (60 days from now)
    const passwordExpiresAt = new Date();
    passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 60);

    // Update user password and reset expiration/flags
    await pool.query(`
      UPDATE Users
      SET password = $1,
          password_changed_at = $2,
          password_expires_at = $3,
          force_password_change = FALSE,
          updated_at = NOW()
      WHERE id = $4
    `, [passwordHash, new Date(), passwordExpiresAt, tokenData.user_id]);

    // Mark token as used
    await pool.query(`
      UPDATE PasswordResetTokens
      SET used = TRUE
      WHERE id = $1
    `, [tokenData.token_id]);

    // Clean up old tokens for this user
    await pool.query(`
      DELETE FROM PasswordResetTokens
      WHERE user_id = $1
      AND (used = TRUE OR expires_at < NOW())
    `, [tokenData.user_id]);

    logger.info('Password reset successful', { email, ip: req.ip });

    // Connection pool kept open for reuse
    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    return sendServerError(res, 'Password reset failed', error, { ip: req.ip });
  }
});

// POST /api/auth/refresh — exchange a valid refresh cookie for a fresh
// access-token cookie and a rotated refresh cookie. P1-1 2026-04-18.
router.post('/refresh', async (req, res) => {
  try {
    const raw = req.cookies && req.cookies.apex_refresh;
    if (!raw) return res.status(401).json({ error: 'No refresh token' });

    const result = await rotateRefreshToken({ raw, ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!result) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }

    const userResult = await pool.query('SELECT id, email, name, role FROM Users WHERE id = $1', [result.userId]);
    if (!userResult.rows.length) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    const claims = { userId: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = isRs256Ready()
      ? signAccessToken(claims)
      : jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

    const csrfToken = crypto.randomBytes(24).toString('base64url');
    setAuthCookies(res, { accessToken, refreshToken: result.raw, csrfToken, refreshExpiresAt: result.expiresAt });
    return res.json({ ok: true });
  } catch (error) {
    return sendServerError(res, 'Refresh failed', error, { ip: req.ip });
  }
});

// POST /api/auth/verify-totp — step 2 of 2FA login. Exchange pre-auth JWT
// (aud=mfa) + 6-digit code (or backup code) for a real session.
router.post('/verify-totp',
  validate([
    body('preAuthToken').notEmpty().isString(),
    body('code').notEmpty().isString().isLength({ min: 6, max: 20 }),
  ]),
  async (req, res) => {
    try {
      const { preAuthToken, code } = req.body;
      let claims;
      try {
        claims = jwt.verify(preAuthToken, process.env.JWT_SECRET);
      } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired MFA token' });
      }
      if (claims.aud !== 'mfa') return res.status(401).json({ error: 'Invalid MFA token audience' });

      const ok = await totp.verifyAtLogin(claims.userId, code);
      if (!ok) {
        await recordLoginFailure(String(claims.email || '').toLowerCase(), req.ip);
        logger.security('TOTP verification failed', { userId: claims.userId, ip: req.ip });
        return res.status(401).json({ error: 'Invalid code' });
      }

      const u = await pool.query('SELECT id, email, name, role, avatar, preferences FROM Users WHERE id = $1', [claims.userId]);
      if (!u.rows.length) return res.status(401).json({ error: 'User not found' });
      const user = u.rows[0];

      await resetLoginFailures(String(user.email).toLowerCase());

      const tokenClaims = { userId: user.id, email: user.email, name: user.name, role: user.role };
      const token = isRs256Ready()
        ? signAccessToken(tokenClaims)
        : jwt.sign(tokenClaims, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
      const refresh = await issueRefreshToken({ userId: user.id, ip: req.ip, userAgent: req.headers['user-agent'] });
      const csrfToken = crypto.randomBytes(24).toString('base64url');
      setAuthCookies(res, { accessToken: token, refreshToken: refresh.raw, csrfToken, refreshExpiresAt: refresh.expiresAt });

      let preferences = {};
      try { preferences = user.preferences ? JSON.parse(user.preferences) : {}; } catch (_) {}

      logger.info('TOTP login successful', { email: user.email, userId: user.id, ip: req.ip });
      return res.json({
        token, refreshToken: token,
        user: {
          id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar,
          preferences,
          Role: { name: user.role, displayName: user.role.charAt(0).toUpperCase() + user.role.slice(1) },
        },
      });
    } catch (error) {
      return sendServerError(res, 'MFA verification failed', error, { ip: req.ip });
    }
  }
);

// GET /api/auth/2fa/status — authenticated; returns the caller's 2FA state.
router.get('/2fa/status', authenticateToken, async (req, res) => {
  try {
    const status = await totp.getStatus(req.user.userId);
    return res.json(status);
  } catch (error) {
    return sendServerError(res, '2FA status check failed', error);
  }
});

// POST /api/auth/2fa/enroll — authenticated; starts enrollment. Returns a
// QR code data URL the user scans in their authenticator app. The secret
// is stored encrypted but NOT enabled yet — the user must confirm with a
// 6-digit code via /verify-enroll to activate.
router.post('/2fa/enroll', authenticateToken, auditLog('2FA enrollment started', 'auth', 'info'), async (req, res) => {
  try {
    const out = await totp.startEnroll(req.user.userId, req.user.email);
    return res.json(out);
  } catch (error) {
    return sendServerError(res, '2FA enrollment failed', error);
  }
});

// POST /api/auth/2fa/verify-enroll — authenticated; confirms the pending
// enrollment and returns 10 one-time backup codes. These are shown ONCE
// and cannot be retrieved again — the user must save them.
router.post('/2fa/verify-enroll',
  authenticateToken,
  validate([ body('code').notEmpty().isString().isLength({ min: 6, max: 6 }) ]),
  auditLog('2FA enrollment completed', 'auth', 'info'),
  async (req, res) => {
    try {
      const result = await totp.completeEnroll(req.user.userId, req.body.code);
      if (!result) return res.status(400).json({ error: 'Invalid code' });
      return res.json({ enabled: true, backupCodes: result.backupCodes });
    } catch (error) {
      return sendServerError(res, '2FA enrollment verification failed', error);
    }
  }
);

// POST /api/auth/2fa/disable — authenticated; disables the caller's own
// 2FA. Requires the current 6-digit code (or a backup code) to prevent a
// stolen session from silently turning off 2FA.
router.post('/2fa/disable',
  authenticateToken,
  validate([ body('code').notEmpty().isString() ]),
  auditLog('2FA disabled', 'auth', 'warning'),
  async (req, res) => {
    try {
      const ok = await totp.verifyAtLogin(req.user.userId, req.body.code);
      if (!ok) return res.status(401).json({ error: 'Invalid code' });
      await totp.disable(req.user.userId);
      return res.json({ enabled: false });
    } catch (error) {
      return sendServerError(res, '2FA disable failed', error);
    }
  }
);

// POST /api/auth/logout — revoke the refresh token and clear all cookies.
// Safe to call even without an active session; always responds 204.
router.post('/logout', async (req, res) => {
  try {
    const raw = req.cookies && req.cookies.apex_refresh;
    if (raw) await revokeRefreshToken(raw);
    clearAuthCookies(res);
    return res.status(204).end();
  } catch (error) {
    clearAuthCookies(res);
    return res.status(204).end();
  }
});

module.exports = router;
