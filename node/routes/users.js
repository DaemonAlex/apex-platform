const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { validate, body, param } = require('../middleware/validate');
const { requireRole, requireSelfOrAdmin } = require('../middleware/auth');
const router = express.Router();

// Admin role gate reused throughout this file for user-management routes.
// Mounting it per-route (instead of on the router) lets /me, /:id/preferences,
// /:id/avatar, and /:id/password remain reachable for the user themselves
// while still blocking cross-user actions.
const adminOnly = requireRole(['admin', 'superadmin', 'owner']);

// Import validatePassword from auth module pattern (inline for standardization)
function validatePassword(password) {
  const errors = [];
  if (password.length < 12) errors.push('Password must be at least 12 characters long');
  if (!/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('Password must contain at least one special character');
  if (/(.)\1{2,}/.test(password)) errors.push('Password cannot contain three or more consecutive identical characters');
  if (/123|abc|qwe|asd|zxc/i.test(password)) errors.push('Password cannot contain common sequences');
  return { isValid: errors.length === 0, errors };
}

const validRoles = ['superadmin', 'admin', 'owner', 'project_manager', 'field_ops', 'auditor', 'viewer'];

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, preferences, avatar, created_at, updated_at FROM Users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = result.rows[0];
    let preferences = {};
    try { preferences = user.preferences ? JSON.parse(user.preferences) : {}; } catch { preferences = {}; }
    res.json({
      id: user.id, name: user.name, email: user.email, preferences,
      avatar: user.avatar, created_at: user.created_at,
      Role: { name: user.role, displayName: user.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
    });
  } catch (error) {
    logger.error('Get current user error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get all users
router.get('/', async (req, res) => {
  try {
    // First, ensure avatar column exists
    try {
      await pool.query(`
        ALTER TABLE Users ADD COLUMN IF NOT EXISTS avatar TEXT
      `);
    } catch (e) {
      logger.warn('Avatar column may already exist', { error: e.message });
    }

    const result = await pool.query(`
      SELECT id, name, email, role, preferences, avatar, created_at, updated_at
      FROM Users
      ORDER BY created_at DESC
    `);

    const users = result.rows.map(user => {
      let preferences = {};
      try {
        preferences = user.preferences ? JSON.parse(user.preferences) : {};
      } catch (e) {
        preferences = {};
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        preferences: preferences,
        avatar: user.avatar,
        Role: {
          name: user.role,
          displayName: user.role.charAt(0).toUpperCase() + user.role.slice(1)
        }
      };
    });

    res.json({ users });
    // Connection pool kept open for reuse
  } catch (error) {
    logger.error('Get users error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Update a user (admin only - changes name/email/role for any user)
router.put('/:id',
  adminOnly,
  validate([
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters'),
    body('email').isEmail().withMessage('Must be a valid email address').normalizeEmail(),
    body('role').optional(),
    body('roleId').optional()
  ]),
  auditLog('User updated', 'user', 'info'),
  async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role, roleId } = req.body;

    // Accept either role or roleId for compatibility
    const userRole = role || roleId;

    if (!userRole) {
      return res.status(400).json({ error: 'Role is required' });
    }

    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: 'Invalid role', validRoles });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM Users WHERE id = $1', [userId]);

    if (existingUser.rows.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    await pool.query(`
      UPDATE Users
      SET name = $1, email = $2, role = $3, updated_at = NOW()
      WHERE id = $4
    `, [name, email, userRole, userId]);

    // Return updated user
    const updatedUser = await pool.query('SELECT id, name, email, role FROM Users WHERE id = $1', [userId]);

    const user = updatedUser.rows[0];
    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      Role: {
        name: user.role,
        displayName: user.role.charAt(0).toUpperCase() + user.role.slice(1)
      }
    };

    logger.info('User updated', { userId, email, role: userRole, updatedBy: req.user?.email });

    res.json({ user: responseUser, message: 'User updated successfully' });
    // Connection pool kept open for reuse
  } catch (error) {
    logger.error('Update user error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});

// Change user password (self-service - users may only change their own)
// Admin password reset for OTHER users goes through POST /:id/reset-password.
router.put('/:id/password',
  requireSelfOrAdmin('id'),
  validate([
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').notEmpty().withMessage('New password is required')
  ]),
  auditLog('Password changed', 'auth', 'warning'),
  async (req, res) => {
  try {
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    // ASRB 5.1.3: Use standardized 12-char password validation (was 8-char)
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    // Get current user password hash
    const userResult = await pool.query('SELECT password FROM Users WHERE id = $1', [userId]);

    if (userResult.rows.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = userResult.rows[0];

    // Verify current password
    const bcrypt = require('bcryptjs');
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);

    if (!isCurrentPasswordValid) {
      logger.security('Failed password change - incorrect current password', { userId, ip: req.ip });
      // Connection pool kept open for reuse
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Calculate new password expiration (60 days from now)
    const passwordExpiresAt = new Date();
    passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 60);

    // Update password in database
    await pool.query(`
      UPDATE Users
      SET password = $1, password_changed_at = NOW(), password_expires_at = $2, force_password_change = FALSE, updated_at = NOW()
      WHERE id = $3
    `, [newPasswordHash, passwordExpiresAt, userId]);

    logger.info('Password changed successfully', { userId });

    // Connection pool kept open for reuse
    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    logger.error('Change password error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to change password', details: error.message });
  }
});

// Update user preferences (self-service or admin)
router.put('/:id/preferences', requireSelfOrAdmin('id'), async (req, res) => {
  try {
    const userId = req.params.id;
    const preferences = req.body;

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM Users WHERE id = $1', [userId]);

    if (existingUser.rows.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Update preferences (stored as JSON string)
    const preferencesJson = JSON.stringify(preferences);

    await pool.query(`
      UPDATE Users
      SET preferences = $1, updated_at = NOW()
      WHERE id = $2
    `, [preferencesJson, userId]);

    // Connection pool kept open for reuse
    res.json({ message: 'Preferences updated successfully', preferences });

  } catch (error) {
    logger.error('Update preferences error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to update preferences', details: error.message });
  }
});

// Update user avatar (self-service or admin)
router.put('/:id/avatar', requireSelfOrAdmin('id'), async (req, res) => {
  try {
    const userId = req.params.id;
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({ error: 'Avatar data is required' });
    }

    // Validate base64 image format
    if (!avatar.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Avatar must be a valid base64 image' });
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM Users WHERE id = $1', [userId]);

    if (existingUser.rows.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Update avatar
    await pool.query(`
      UPDATE Users
      SET avatar = $1, updated_at = NOW()
      WHERE id = $2
    `, [avatar, userId]);

    // Connection pool kept open for reuse
    res.json({ message: 'Avatar updated successfully' });

  } catch (error) {
    logger.error('Update avatar error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to update avatar', details: error.message });
  }
});

// Remove user avatar (self-service or admin)
router.delete('/:id/avatar', requireSelfOrAdmin('id'), async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM Users WHERE id = $1', [userId]);

    if (existingUser.rows.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove avatar
    await pool.query(`
      UPDATE Users
      SET avatar = NULL, updated_at = NOW()
      WHERE id = $1
    `, [userId]);

    // Connection pool kept open for reuse
    res.json({ message: 'Avatar removed successfully' });

  } catch (error) {
    logger.error('Remove avatar error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to remove avatar', details: error.message });
  }
});

// Create new user (admin only)
router.post('/',
  adminOnly,
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 1, max: 255 }),
    body('email').isEmail().withMessage('Must be a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    body('role').optional().isIn(validRoles).withMessage('Invalid role')
  ]),
  auditLog('User created', 'user', 'info'),
  async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    // ASRB 5.1.3: Validate password with standardized 12-char rules
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    // Check if user already exists
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (existingUser.rows.length > 0) {
      // Connection pool kept open for reuse
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert new user
    const result = await pool.query(`
      INSERT INTO users (name, email, password, role, password_expires_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, name, email, role, created_at
    `, [name, email, hashedPassword, role, new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)]);

    // Connection pool kept open for reuse

    const newUser = result.rows[0];

    logger.info('User created', { userId: newUser.id, email: newUser.email, role: newUser.role, createdBy: req.user?.email });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        Role: { name: newUser.role, displayName: newUser.role },
        created_at: newUser.created_at
      }
    });

  } catch (error) {
    logger.error('Create user error', { error: error.message });
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id',
  adminOnly,
  validate([
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer')
  ]),
  auditLog('User deleted', 'user', 'warning'),
  async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const existingUser = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);

    if (existingUser.rows.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    logger.info('User deleted', { userId, deletedEmail: existingUser.rows[0].email, deletedBy: req.user?.email });

    // Connection pool kept open for reuse
    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    logger.error('Delete user error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

// Admin-driven password reset for another user.
//
// Returns a one-time temporary password that the admin must securely
// communicate to the user out-of-band (chat, in person, encrypted email).
// `force_password_change = TRUE` means the user is forced to set a new
// password on their first login with this temp value.
//
// The temp password is generated from crypto.randomBytes (NOT Math.random).
//
// Gated to admin/superadmin/owner only - prior to 2026-04 this endpoint
// was reachable by any logged-in user, which made every account in the
// system trivially compromisable.
router.post('/:id/reset-password',
  adminOnly,
  validate([
    param('id').isInt({ min: 1 }).withMessage('User ID must be a positive integer')
  ]),
  auditLog('Admin password reset', 'auth', 'critical'),
  async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const existingUser = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate a cryptographically secure temporary password that satisfies
    // the standard validator (>=12 chars, mixed case, digit, special). 16
    // base64url chars from 12 random bytes + a fixed Aa1! suffix to
    // guarantee class coverage without weakening entropy.
    const crypto = require('crypto');
    const randomPart = crypto.randomBytes(12).toString('base64')
      .replace(/\+/g, '0').replace(/\//g, '0').replace(/=/g, '');
    const tempPassword = `${randomPart}Aa1!`;

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await pool.query(`
      UPDATE users
      SET password = $1,
          password_expires_at = $2,
          force_password_change = TRUE,
          password_changed_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
    `, [hashedPassword, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), userId]);

    logger.security('Admin password reset issued', {
      userId,
      targetEmail: existingUser.rows[0].email,
      resetBy: req.user?.email,
      resetByUserId: req.user?.userId
    });

    res.json({
      message: 'Password reset successfully',
      temporaryPassword: tempPassword,
      mustChangeOnLogin: true,
      expiresInDays: 7
    });

  } catch (error) {
    logger.error('Reset password error', { error: error.message, userId: req.params.id });
    res.status(500).json({ error: 'Failed to reset password', details: error.message });
  }
});

module.exports = router;
