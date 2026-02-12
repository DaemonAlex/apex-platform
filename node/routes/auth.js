const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { validate, body, isValidEmail } = require('../middleware/validate');
const router = express.Router();

// Validate JWT_SECRET is set
if (!process.env.JWT_SECRET) {
  logger.error('CRITICAL: JWT_SECRET environment variable is not set');
  process.exit(1);
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

    // Check if Users table exists, create if not
    await pool.query(`
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

    // Add preferences column if it doesn't exist (migration)
    await pool.query(`
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS preferences TEXT
    `);

    // Add password expiration tracking columns
    await pool.query(`
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW()
    `);

    await pool.query(`
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMPTZ
    `);

    await pool.query(`
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT FALSE
    `);

    // Create password reset tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS PasswordResetTokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);


    // Find user by email
    const result = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);

    const user = result.rows[0];

    if (!user) {
      logger.security('Failed login - user not found', { email, ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
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

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

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
    logger.error('Login error', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Register endpoint (for testing)
router.post('/register',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 255 }),
    isValidEmail('email'),
    body('password').notEmpty().withMessage('Password is required'),
    body('role').optional().isIn(['auditor', 'viewer', 'field_ops', 'project_manager', 'admin', 'superadmin', 'owner']).withMessage('Invalid role')
  ]),
  auditLog('User registration', 'auth', 'info'),
  async (req, res) => {
  try {
    const { name, email, password, role = 'auditor' } = req.body;

    // Validate password requirements
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM Users WHERE email = $1', [email]);

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Calculate password expiration (60 days from now)
    const passwordExpiresAt = new Date();
    passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 60);

    // Create user
    const result = await pool.query(`
      INSERT INTO Users (name, email, password, role, password_changed_at, password_expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, email, hashedPassword, role, new Date(), passwordExpiresAt]);

    const newUser = result.rows[0];

    logger.info('User registered', { email: newUser.email, userId: newUser.id, role: newUser.role });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });

    // Connection pool kept open for reuse
  } catch (error) {
    logger.error('Register error', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
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
    const crypto = require('crypto');
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
    logger.error('Forgot password error', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Password reset request failed', details: error.message });
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
    logger.error('Reset password error', { error: error.message, ip: req.ip });
    res.status(500).json({ error: 'Password reset failed', details: error.message });
  }
});

module.exports = router;
