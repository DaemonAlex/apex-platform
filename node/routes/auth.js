const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../db');
const router = express.Router();

// Validate JWT_SECRET is set
if (!process.env.JWT_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET environment variable is not set');
  console.error('❌ Application cannot start without JWT secret for token signing');
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Connect to database using centralized pool
    const pool = await poolPromise;
    
    // Check if Users table exists, create if not
    const tableCheck = await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
      BEGIN
        CREATE TABLE Users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(255) NOT NULL,
          email NVARCHAR(255) UNIQUE NOT NULL,
          password NVARCHAR(255) NOT NULL,
          role NVARCHAR(50) DEFAULT 'auditor',
          preferences NVARCHAR(MAX),
          created_at DATETIME2 DEFAULT GETDATE(),
          updated_at DATETIME2 DEFAULT GETDATE()
        );
      END
    `);

    // Add preferences column if it doesn't exist (migration)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'preferences')
      BEGIN
        ALTER TABLE Users ADD preferences NVARCHAR(MAX);
      END
    `);

    // Add password expiration tracking columns
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'password_changed_at')
      BEGIN
        ALTER TABLE Users ADD password_changed_at DATETIME2 DEFAULT GETDATE();
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'password_expires_at')
      BEGIN
        ALTER TABLE Users ADD password_expires_at DATETIME2;
      END
    `);

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'force_password_change')
      BEGIN
        ALTER TABLE Users ADD force_password_change BIT DEFAULT 0;
      END
    `);

    // Create password reset tokens table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PasswordResetTokens' AND xtype='U')
      BEGIN
        CREATE TABLE PasswordResetTokens (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL,
          token NVARCHAR(255) NOT NULL UNIQUE,
          expires_at DATETIME2 NOT NULL,
          used BIT DEFAULT 0,
          created_at DATETIME2 DEFAULT GETDATE(),
          FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
        );
      END
    `);


    // Find user by email
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT * FROM Users WHERE email = @email');

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
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
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Register endpoint (for testing)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'auditor' } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Validate password requirements
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    const pool = await poolPromise;
    
    // Check if user exists
    const existingUser = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id FROM Users WHERE email = @email');
      
    if (existingUser.recordset.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Calculate password expiration (60 days from now)
    const passwordExpiresAt = new Date();
    passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 60);

    // Create user
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, role)
      .input('passwordChangedAt', sql.DateTime2, new Date())
      .input('passwordExpiresAt', sql.DateTime2, passwordExpiresAt)
      .query(`
        INSERT INTO Users (name, email, password, role, password_changed_at, password_expires_at)
        OUTPUT INSERTED.*
        VALUES (@name, @email, @password, @role, @passwordChangedAt, @passwordExpiresAt)
      `);

    const newUser = result.recordset[0];
    
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
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const pool = await poolPromise;

    // Check if user exists
    const userResult = await pool.request()
      .input('email', sql.NVarChar, email.toLowerCase())
      .query('SELECT id, name FROM Users WHERE LOWER(email) = @email');

    if (userResult.recordset.length === 0) {
      // Don't reveal if email exists - security best practice
      // Connection pool kept open for reuse
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    const user = userResult.recordset[0];

    // Rate limiting: Check for recent reset requests (max 10 per hour for testing)
    const recentRequests = await pool.request()
      .input('userId', sql.Int, user.id)
      .query(`
        SELECT COUNT(*) as count
        FROM PasswordResetTokens
        WHERE user_id = @userId
        AND created_at > DATEADD(hour, -1, GETDATE())
      `);

    if (recentRequests.recordset[0].count >= 10) {
      // Connection pool kept open for reuse
      return res.status(429).json({ error: 'Too many reset requests. Please try again later.' });
    }

    // Generate secure token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store token in database
    await pool.request()
      .input('userId', sql.Int, user.id)
      .input('token', sql.NVarChar, resetToken)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .query(`
        INSERT INTO PasswordResetTokens (user_id, token, expires_at)
        VALUES (@userId, @token, @expiresAt)
      `);

    // Send email with reset link
    const resetLink = `https://daemonscripts.com/?token=${resetToken}&email=${encodeURIComponent(email)}`;

    try {
      const emailService = require('../services/emailService');
      const emailSent = await emailService.sendPasswordReset(email, user.name, resetLink);

      if (!emailSent) {
        console.log(`⚠️ Email service failed, fallback: Password reset link for ${email}: ${resetLink}`);
      }
    } catch (emailError) {
      console.error('Email service error:', emailError);
      console.log(`⚠️ Fallback: Password reset link for ${email}: ${resetLink}`);
    }

    // Connection pool kept open for reuse
    res.json({ message: 'If this email exists, a reset link has been sent.' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Password reset request failed', details: error.message });
  }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ error: 'Token, email, and new password are required' });
    }

    // Validate password requirements
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements',
        details: passwordValidation.errors
      });
    }

    const pool = await poolPromise;

    // Verify token and get user
    const tokenResult = await pool.request()
      .input('token', sql.NVarChar, token)
      .input('email', sql.NVarChar, email.toLowerCase())
      .query(`
        SELECT prt.id as token_id, prt.user_id, prt.expires_at, prt.used, u.email
        FROM PasswordResetTokens prt
        JOIN Users u ON prt.user_id = u.id
        WHERE prt.token = @token
        AND LOWER(u.email) = @email
        AND prt.used = 0
        AND prt.expires_at > GETDATE()
      `);

    if (tokenResult.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const tokenData = tokenResult.recordset[0];

    // Hash new password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Calculate new password expiration (60 days from now)
    const passwordExpiresAt = new Date();
    passwordExpiresAt.setDate(passwordExpiresAt.getDate() + 60);

    // Update user password and reset expiration/flags
    await pool.request()
      .input('userId', sql.Int, tokenData.user_id)
      .input('password', sql.NVarChar, passwordHash)
      .input('passwordChangedAt', sql.DateTime2, new Date())
      .input('passwordExpiresAt', sql.DateTime2, passwordExpiresAt)
      .query(`
        UPDATE Users
        SET password = @password,
            password_changed_at = @passwordChangedAt,
            password_expires_at = @passwordExpiresAt,
            force_password_change = 0,
            updated_at = GETDATE()
        WHERE id = @userId
      `);

    // Mark token as used
    await pool.request()
      .input('tokenId', sql.Int, tokenData.token_id)
      .query(`
        UPDATE PasswordResetTokens
        SET used = 1
        WHERE id = @tokenId
      `);

    // Clean up old tokens for this user
    await pool.request()
      .input('userId', sql.Int, tokenData.user_id)
      .query(`
        DELETE FROM PasswordResetTokens
        WHERE user_id = @userId
        AND (used = 1 OR expires_at < GETDATE())
      `);

    // Connection pool kept open for reuse
    res.json({ message: 'Password reset successfully' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed', details: error.message });
  }
});

module.exports = router;