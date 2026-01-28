const express = require('express');
const { sql, poolPromise } = require('../db');
const router = express.Router();

// Get all users
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;

    // First, ensure avatar column exists
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'avatar')
        BEGIN
          ALTER TABLE Users ADD avatar NVARCHAR(MAX) NULL;
        END
      `);
    } catch (e) {
      console.log('Avatar column may already exist:', e.message);
    }

    const result = await pool.request().query(`
      SELECT id, name, email, role, preferences, avatar, created_at, updated_at
      FROM Users
      ORDER BY created_at DESC
    `);
    
    const users = result.recordset.map(user => {
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
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users', details: error.message });
  }
});

// Update a user
router.put('/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, role, roleId } = req.body;

    // Accept either role or roleId for compatibility
    const userRole = role || roleId;

    if (!name || !email || !userRole) {
      return res.status(400).json({ error: 'Name, email, and role are required' });
    }

    const pool = await poolPromise;

    // Check if user exists
    const existingUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id FROM Users WHERE id = @id');

    if (existingUser.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user
    const result = await pool.request()
      .input('id', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('role', sql.NVarChar, userRole)
      .query(`
        UPDATE Users
        SET name = @name, email = @email, role = @role, updated_at = GETDATE()
        WHERE id = @id
      `);

    // Return updated user
    const updatedUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id, name, email, role FROM Users WHERE id = @id');

    const user = updatedUser.recordset[0];
    const responseUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      Role: {
        name: user.role,
        displayName: user.role.charAt(0).toUpperCase() + user.role.slice(1)
      }
    };

    res.json({ user: responseUser, message: 'User updated successfully' });
    // Connection pool kept open for reuse
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});

// Change user password
router.put('/:id/password', async (req, res) => {
  try {
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    const pool = await poolPromise;

    // Get current user password hash
    const userResult = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT password FROM Users WHERE id = @id');

    if (userResult.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    const currentUser = userResult.recordset[0];

    // Verify current password
    const bcrypt = require('bcrypt');
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentUser.password);

    if (!isCurrentPasswordValid) {
      // Connection pool kept open for reuse
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await pool.request()
      .input('id', sql.Int, userId)
      .input('password', sql.NVarChar, newPasswordHash)
      .query('UPDATE Users SET password = @password, updated_at = GETDATE() WHERE id = @id');

    // Connection pool kept open for reuse
    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password', details: error.message });
  }
});

// Update user preferences
router.put('/:id/preferences', async (req, res) => {
  try {
    const userId = req.params.id;
    const preferences = req.body;

    const pool = await poolPromise;

    // Check if user exists
    const existingUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id FROM Users WHERE id = @id');

    if (existingUser.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Update preferences (stored as JSON string)
    const preferencesJson = JSON.stringify(preferences);

    await pool.request()
      .input('id', sql.Int, userId)
      .input('preferences', sql.NVarChar, preferencesJson)
      .query(`
        UPDATE Users
        SET preferences = @preferences, updated_at = GETDATE()
        WHERE id = @id
      `);

    // Connection pool kept open for reuse
    res.json({ message: 'Preferences updated successfully', preferences });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences', details: error.message });
  }
});

// Update user avatar
router.put('/:id/avatar', async (req, res) => {
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

    const pool = await poolPromise;

    // Check if user exists
    const existingUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id FROM Users WHERE id = @id');

    if (existingUser.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Update avatar
    await pool.request()
      .input('id', sql.Int, userId)
      .input('avatar', sql.NVarChar(sql.MAX), avatar)
      .query(`
        UPDATE Users
        SET avatar = @avatar, updated_at = GETDATE()
        WHERE id = @id
      `);

    // Connection pool kept open for reuse
    res.json({ message: 'Avatar updated successfully' });

  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ error: 'Failed to update avatar', details: error.message });
  }
});

// Remove user avatar
router.delete('/:id/avatar', async (req, res) => {
  try {
    const userId = req.params.id;

    const pool = await poolPromise;

    // Check if user exists
    const existingUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id FROM Users WHERE id = @id');

    if (existingUser.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove avatar
    await pool.request()
      .input('id', sql.Int, userId)
      .query(`
        UPDATE Users
        SET avatar = NULL, updated_at = GETDATE()
        WHERE id = @id
      `);

    // Connection pool kept open for reuse
    res.json({ message: 'Avatar removed successfully' });

  } catch (error) {
    console.error('Remove avatar error:', error);
    res.status(500).json({ error: 'Failed to remove avatar', details: error.message });
  }
});

// Create new user
router.post('/', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const pool = await poolPromise;

    // Check if user already exists
    const existingUser = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id FROM users WHERE email = @email');

    if (existingUser.recordset.length > 0) {
      // Connection pool kept open for reuse
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert new user
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, hashedPassword)
      .input('role', sql.NVarChar, role)
      .input('passwordExpires', sql.DateTime, new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)) // 60 days
      .query(`
        INSERT INTO users (name, email, password, role, password_expires_at, created_at, updated_at)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.role, INSERTED.created_at
        VALUES (@name, @email, @password, @role, @passwordExpires, GETDATE(), GETDATE())
      `);

    // Connection pool kept open for reuse

    const newUser = result.recordset[0];
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
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.params.id;

    const pool = await poolPromise;

    // Check if user exists
    const existingUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id, email FROM users WHERE id = @id');

    if (existingUser.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user
    await pool.request()
      .input('id', sql.Int, userId)
      .query('DELETE FROM users WHERE id = @id');

    // Connection pool kept open for reuse
    res.json({ message: 'User deleted successfully' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

// Reset user password
router.post('/:id/reset-password', async (req, res) => {
  try {
    const userId = req.params.id;

    const pool = await poolPromise;

    // Check if user exists
    const existingUser = await pool.request()
      .input('id', sql.Int, userId)
      .query('SELECT id, email FROM users WHERE id = @id');

    if (existingUser.recordset.length === 0) {
      // Connection pool kept open for reuse
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync(tempPassword, 10);

    // Update user password
    await pool.request()
      .input('id', sql.Int, userId)
      .input('password', sql.NVarChar, hashedPassword)
      .input('passwordExpires', sql.DateTime, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) // 7 days
      .query(`
        UPDATE users
        SET password = @password,
            password_expires_at = @passwordExpires,
            force_password_change = 1,
            password_changed_at = GETDATE(),
            updated_at = GETDATE()
        WHERE id = @id
      `);

    // Connection pool kept open for reuse
    res.json({
      message: 'Password reset successfully',
      temporaryPassword: tempPassword
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password', details: error.message });
  }
});

module.exports = router;