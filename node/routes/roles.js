const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { validate, body, param } = require('../middleware/validate');
const router = express.Router();

// Default roles seeded on first run
const DEFAULT_ROLES = [
  { name: 'superadmin', display_name: 'Super Administrator', description: 'Full system access', permissions: ['*'], priority: 100, is_system: true },
  { name: 'admin', display_name: 'Administrator', description: 'Full system access', permissions: ['*'], priority: 90, is_system: true },
  { name: 'owner', display_name: 'Owner', description: 'Full system access', permissions: ['*'], priority: 95, is_system: true },
  { name: 'project_manager', display_name: 'Project Manager', description: 'Manage projects and teams', permissions: ['projects.view', 'projects.edit', 'tasks.view', 'tasks.edit', 'team.manage'], priority: 50, is_system: false },
  { name: 'field_ops', display_name: 'Field Operations', description: 'Field work and time tracking', permissions: ['projects.read.assigned', 'tasks.update.assigned', 'tasks.notes.view', 'tasks.notes.add', 'fieldops.timeentry'], priority: 40, is_system: false },
  { name: 'auditor', display_name: 'Auditor', description: 'Read-only audit access', permissions: ['projects.view', 'tasks.view', 'reports.read', 'audit.read'], priority: 30, is_system: false },
  { name: 'viewer', display_name: 'Viewer', description: 'Basic read-only access', permissions: ['projects.read.public', 'reports.read.basic'], priority: 10, is_system: false },
];

// Full permission catalog
const PERMISSION_CATALOG = [
  { name: 'Projects', permissions: [
    { key: 'projects.view', name: 'View Projects' },
    { key: 'projects.edit', name: 'Edit Projects' },
    { key: 'projects.delete', name: 'Delete Projects' },
    { key: 'projects.read.assigned', name: 'View Assigned Projects' },
    { key: 'projects.read.public', name: 'View Public Projects' },
  ]},
  { name: 'Tasks', permissions: [
    { key: 'tasks.view', name: 'View Tasks' },
    { key: 'tasks.edit', name: 'Edit Tasks' },
    { key: 'tasks.delete', name: 'Delete Tasks' },
    { key: 'tasks.update.assigned', name: 'Update Assigned Tasks' },
    { key: 'tasks.notes.view', name: 'View Task Notes' },
    { key: 'tasks.notes.add', name: 'Add Task Notes' },
  ]},
  { name: 'Reports', permissions: [
    { key: 'reports.read', name: 'View Reports' },
    { key: 'reports.read.basic', name: 'View Basic Reports' },
  ]},
  { name: 'Administration', permissions: [
    { key: 'audit.read', name: 'View Audit Log' },
    { key: 'settings.manage', name: 'Manage Settings' },
    { key: 'roles.manage', name: 'Manage Roles' },
    { key: 'team.manage', name: 'Manage Team' },
  ]},
  { name: 'Field Ops', permissions: [
    { key: 'fieldops.timeentry', name: 'Time Entry' },
  ]},
];

// Ensure Roles table exists and seed defaults
async function ensureRolesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      permissions JSONB NOT NULL DEFAULT '[]',
      priority INTEGER DEFAULT 0,
      is_system BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed defaults if table is empty
  const count = await pool.query('SELECT COUNT(*) as total FROM Roles');
  if (parseInt(count.rows[0].total) === 0) {
    for (const role of DEFAULT_ROLES) {
      await pool.query(
        'INSERT INTO Roles (name, display_name, description, permissions, priority, is_system) VALUES ($1, $2, $3, $4, $5, $6)',
        [role.name, role.display_name, role.description, JSON.stringify(role.permissions), role.priority, role.is_system]
      );
    }
    logger.info('Seeded default roles', { count: DEFAULT_ROLES.length });
  }
}

// Lazy init - runs on first request instead of module load
let rolesTableReady = false;

// Get all roles with user counts
router.get('/', async (req, res) => {
  try {
    if (!rolesTableReady) { await ensureRolesTable(); rolesTableReady = true; }
    const result = await pool.query(`
      SELECT r.*, COALESCE(uc.user_count, 0) as user_count
      FROM Roles r
      LEFT JOIN (
        SELECT role, COUNT(*) as user_count FROM Users GROUP BY role
      ) uc ON uc.role = r.name
      ORDER BY r.priority DESC, r.name
    `);

    const roles = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      displayName: r.display_name,
      description: r.description || '',
      permissions: r.permissions || [],
      priority: r.priority,
      userCount: parseInt(r.user_count) || 0,
      isSystem: r.is_system,
    }));

    res.json(roles);
  } catch (error) {
    logger.error('Get roles error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch roles', details: error.message });
  }
});

// Get permissions catalog
router.get('/permissions', async (req, res) => {
  try {
    res.json({ categories: PERMISSION_CATALOG });
  } catch (error) {
    logger.error('Get permissions error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch permissions', details: error.message });
  }
});

// Create new role
router.post('/',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').matches(/^[a-zA-Z0-9_]+$/).withMessage('Name must be alphanumeric with underscores'),
    body('displayName').trim().notEmpty().withMessage('Display name is required').isLength({ min: 1, max: 100 }).withMessage('Display name must be 1-100 characters')
  ]),
  auditLog('Role created', 'admin', 'info'),
  async (req, res) => {
  try {
    if (!rolesTableReady) { await ensureRolesTable(); rolesTableReady = true; }
    const { name, displayName, description = '', permissions = [], priority = 0 } = req.body;

    // Check for duplicate name
    const existing = await pool.query('SELECT id FROM Roles WHERE name = $1', [name]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    const result = await pool.query(
      'INSERT INTO Roles (name, display_name, description, permissions, priority) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, displayName, description, JSON.stringify(permissions), priority]
    );

    const r = result.rows[0];
    logger.info('Role created', { name, createdBy: req.user?.email });

    res.status(201).json({
      message: 'Role created successfully',
      role: {
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        description: r.description,
        permissions: r.permissions,
        priority: r.priority,
        isSystem: r.is_system,
      }
    });
  } catch (error) {
    logger.error('Create role error', { error: error.message });
    res.status(500).json({ error: 'Failed to create role', details: error.message });
  }
});

// Update role
router.put('/:id',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').matches(/^[a-zA-Z0-9_]+$/).withMessage('Name must be alphanumeric with underscores'),
    body('displayName').trim().notEmpty().withMessage('Display name is required').isLength({ min: 1, max: 100 }).withMessage('Display name must be 1-100 characters')
  ]),
  auditLog('Role updated', 'admin', 'info'),
  async (req, res) => {
  try {
    if (!rolesTableReady) { await ensureRolesTable(); rolesTableReady = true; }
    const roleId = req.params.id;
    const { name, displayName, description, permissions = [] } = req.body;

    // Check role exists
    const existing = await pool.query('SELECT * FROM Roles WHERE id = $1', [roleId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    const current = existing.rows[0];

    // System roles: allow permission changes but not name changes
    if (current.is_system && name !== current.name) {
      return res.status(403).json({ error: 'Cannot rename system roles' });
    }

    // Check name uniqueness if changed
    if (name !== current.name) {
      const dup = await pool.query('SELECT id FROM Roles WHERE name = $1 AND id != $2', [name, roleId]);
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'A role with this name already exists' });
      }
    }

    const result = await pool.query(
      'UPDATE Roles SET name = $1, display_name = $2, description = $3, permissions = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
      [name, displayName, description || current.description, JSON.stringify(permissions), roleId]
    );

    const r = result.rows[0];
    logger.info('Role updated', { roleId, name, updatedBy: req.user?.email });

    res.json({
      message: 'Role updated successfully',
      role: {
        id: r.id,
        name: r.name,
        displayName: r.display_name,
        description: r.description,
        permissions: r.permissions,
        priority: r.priority,
        isSystem: r.is_system,
      }
    });
  } catch (error) {
    logger.error('Update role error', { error: error.message });
    res.status(500).json({ error: 'Failed to update role', details: error.message });
  }
});

// Delete role
router.delete('/:id', auditLog('Role deleted', 'admin', 'warning'), async (req, res) => {
  try {
    if (!rolesTableReady) { await ensureRolesTable(); rolesTableReady = true; }
    const roleId = req.params.id;

    const existing = await pool.query('SELECT * FROM Roles WHERE id = $1', [roleId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }

    if (existing.rows[0].is_system) {
      return res.status(403).json({ error: 'Cannot delete system roles' });
    }

    // Check if any users have this role
    const users = await pool.query('SELECT COUNT(*) as count FROM Users WHERE role = $1', [existing.rows[0].name]);
    if (parseInt(users.rows[0].count) > 0) {
      return res.status(409).json({ error: 'Cannot delete role while users are assigned to it' });
    }

    await pool.query('DELETE FROM Roles WHERE id = $1', [roleId]);
    logger.info('Role deleted', { roleId, name: existing.rows[0].name, deletedBy: req.user?.email });

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    logger.error('Delete role error', { error: error.message });
    res.status(500).json({ error: 'Failed to delete role', details: error.message });
  }
});

module.exports = router;
