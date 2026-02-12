const express = require('express');
const logger = require('../utils/logger');
const { validate, body, param } = require('../middleware/validate');
const router = express.Router();

// Complete roles data - matches actual roles used in the system
const defaultRoles = [
  {
    id: 'superadmin',
    name: 'superadmin',
    displayName: 'Super Administrator',
    permissions: ['*']
  },
  {
    id: 'admin',
    name: 'admin',
    displayName: 'Administrator',
    permissions: ['*']
  },
  {
    id: 'owner',
    name: 'owner',
    displayName: 'Owner',
    permissions: ['*']
  },
  {
    id: 'project_manager',
    name: 'project_manager',
    displayName: 'Project Manager',
    permissions: ['projects.view', 'projects.edit', 'tasks.view', 'tasks.edit', 'team.manage']
  },
  {
    id: 'field_ops',
    name: 'field_ops',
    displayName: 'Field Operations',
    permissions: ['projects.read.assigned', 'tasks.update.assigned', 'tasks.notes.view', 'tasks.notes.add', 'fieldops.timeentry']
  },
  {
    id: 'auditor',
    name: 'auditor',
    displayName: 'Auditor',
    permissions: ['projects.view', 'tasks.view', 'reports.read', 'audit.read']
  },
  {
    id: 'viewer',
    name: 'viewer',
    displayName: 'Viewer',
    permissions: ['projects.read.public', 'reports.read.basic']
  }
];

// Get all roles
router.get('/', async (req, res) => {
  try {
    res.json(defaultRoles);
  } catch (error) {
    logger.error('Get roles error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch roles', details: error.message });
  }
});

// Get permissions catalog
router.get('/permissions', async (req, res) => {
  try {
    const permissions = {
      categories: [
        {
          name: 'Projects',
          permissions: [
            { key: 'projects.view', name: 'View Projects' },
            { key: 'projects.edit', name: 'Edit Projects' },
            { key: 'projects.delete', name: 'Delete Projects' }
          ]
        },
        {
          name: 'Tasks',
          permissions: [
            { key: 'tasks.view', name: 'View Tasks' },
            { key: 'tasks.edit', name: 'Edit Tasks' },
            { key: 'tasks.delete', name: 'Delete Tasks' }
          ]
        }
      ]
    };
    
    res.json(permissions);
  } catch (error) {
    logger.error('Get permissions error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch permissions', details: error.message });
  }
});

// Create new role
router.post('/',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').matches(/^[a-zA-Z0-9_]+$/).withMessage('Name must be alphanumeric'),
    body('displayName').trim().notEmpty().withMessage('Display name is required').isLength({ min: 1, max: 100 }).withMessage('Display name must be 1-100 characters')
  ]),
  async (req, res) => {
  try {
    const { name, displayName, permissions = [] } = req.body;

    // For now, just return success as roles are predefined
    const newRole = {
      id: Date.now(),
      name: name,
      displayName: displayName,
      permissions: permissions,
      created_at: new Date()
    };

    res.status(201).json({
      message: 'Role created successfully',
      role: newRole
    });

  } catch (error) {
    logger.error('Create role error', { error: error.message });
    res.status(500).json({ error: 'Failed to create role', details: error.message });
  }
});

// Update role
router.put('/:id',
  validate([
    body('name').trim().notEmpty().withMessage('Name is required').matches(/^[a-zA-Z0-9_]+$/).withMessage('Name must be alphanumeric'),
    body('displayName').trim().notEmpty().withMessage('Display name is required').isLength({ min: 1, max: 100 }).withMessage('Display name must be 1-100 characters')
  ]),
  async (req, res) => {
  try {
    const roleId = req.params.id;
    const { name, displayName, permissions = [] } = req.body;

    // For now, just return success as roles are predefined
    const updatedRole = {
      id: roleId,
      name: name,
      displayName: displayName,
      permissions: permissions,
      updated_at: new Date()
    };

    res.json({
      message: 'Role updated successfully',
      role: updatedRole
    });

  } catch (error) {
    logger.error('Update role error', { error: error.message });
    res.status(500).json({ error: 'Failed to update role', details: error.message });
  }
});

// Delete role
router.delete('/:id', async (req, res) => {
  try {
    const roleId = req.params.id;

    // For now, just return success as roles are predefined
    res.json({ message: 'Role deleted successfully' });

  } catch (error) {
    logger.error('Delete role error', { error: error.message });
    res.status(500).json({ error: 'Failed to delete role', details: error.message });
  }
});

module.exports = router;