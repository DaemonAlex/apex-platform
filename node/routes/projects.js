const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { validate, body, param } = require('../middleware/validate');
const router = express.Router();

// Validation chains for projects
const projectValidation = [
  body('id').trim().notEmpty().withMessage('Project ID is required')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Project ID must be alphanumeric (with underscores/hyphens)')
    .isLength({ max: 50 }),
  body('name').trim().notEmpty().withMessage('Project name is required')
    .isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters'),
  body('status').optional().isIn(['planning', 'active', 'in-progress', 'on-hold', 'completed', 'cancelled', 'scheduled']).withMessage('Invalid status'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be >= 0'),
  body('actualBudget').optional().isFloat({ min: 0 }).withMessage('Actual budget must be >= 0'),
  body('estimatedBudget').optional().isFloat({ min: 0 }).withMessage('Estimated budget must be >= 0'),
  body('startDate').optional({ values: 'null' }).isISO8601().withMessage('Start date must be valid ISO 8601'),
  body('endDate').optional({ values: 'null' }).isISO8601().withMessage('End date must be valid ISO 8601'),
  body('description').optional().isLength({ max: 5000 }).withMessage('Description max 5000 chars'),
  body('progress').optional().isInt({ min: 0, max: 100 }).withMessage('Progress must be 0-100')
];

const projectUpdateValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be 1-255 characters'),
  body('status').optional().isIn(['planning', 'active', 'in-progress', 'on-hold', 'completed', 'cancelled', 'scheduled']).withMessage('Invalid status'),
  body('budget').optional().isFloat({ min: 0 }).withMessage('Budget must be >= 0'),
  body('actualBudget').optional().isFloat({ min: 0 }).withMessage('Actual budget must be >= 0'),
  body('estimatedBudget').optional().isFloat({ min: 0 }).withMessage('Estimated budget must be >= 0'),
  body('startDate').optional({ values: 'null' }).isISO8601().withMessage('Start date must be valid ISO 8601'),
  body('endDate').optional({ values: 'null' }).isISO8601().withMessage('End date must be valid ISO 8601'),
  body('description').optional().isLength({ max: 5000 }).withMessage('Description max 5000 chars'),
  body('progress').optional().isInt({ min: 0, max: 100 }).withMessage('Progress must be 0-100')
];

// Helper function to find task recursively in project tasks (including subtasks)
function findTaskInProject(tasks, taskId) {
  for (let task of tasks) {
    if (String(task.id) === String(taskId)) {
      return { task, parent: null };
    }

    // Search in subtasks
    if (task.subtasks && task.subtasks.length > 0) {
      const found = findTaskInProject(task.subtasks, taskId);
      if (found) {
        return { task: found.task, parent: task };
      }
    }
  }
  return null;
}

// Helper function to remove task recursively from project tasks
function removeTaskFromProject(tasks, taskId) {
  for (let i = 0; i < tasks.length; i++) {
    if (String(tasks[i].id) === String(taskId)) {
      tasks.splice(i, 1);
      return true;
    }

    // Search in subtasks
    if (tasks[i].subtasks && tasks[i].subtasks.length > 0) {
      if (removeTaskFromProject(tasks[i].subtasks, taskId)) {
        return true;
      }
    }
  }
  return false;
}

// Initialize Projects table
async function initializeProjectsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS Projects (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      client VARCHAR(255),
      type VARCHAR(100),
      status VARCHAR(50) DEFAULT 'planning',
      budget NUMERIC(12,2) DEFAULT 0,
      actualBudget NUMERIC(12,2) DEFAULT 0,
      startDate TIMESTAMPTZ,
      endDate TIMESTAMPTZ,
      description TEXT,
      tasks JSONB, -- native JSON support
      requestorInfo VARCHAR(500),
      siteLocation VARCHAR(500),
      businessLine VARCHAR(255),
      progress INT DEFAULT 0,
      priority VARCHAR(50),
      requestDate TIMESTAMPTZ,
      dueDate TIMESTAMPTZ,
      estimatedBudget NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add missing columns if they don't exist (migration)
  const columns = [
    { name: 'requestorInfo', def: 'VARCHAR(500)' },
    { name: 'siteLocation', def: 'VARCHAR(500)' },
    { name: 'businessLine', def: 'VARCHAR(255)' },
    { name: 'progress', def: 'INT DEFAULT 0' },
    { name: 'requestDate', def: 'TIMESTAMPTZ' },
    { name: 'dueDate', def: 'TIMESTAMPTZ' },
    { name: 'estimatedBudget', def: 'NUMERIC(12,2) DEFAULT 0' },
    { name: 'costCenter', def: 'VARCHAR(255)' },
    { name: 'purchaseOrder', def: 'VARCHAR(255)' },
    { name: 'parent_project_id', def: 'VARCHAR(50)' }
  ];

  for (const column of columns) {
    // SECURITY: Validate column name contains only safe characters (defense in depth)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column.name)) {
      logger.error('SECURITY: Invalid column name detected', { columnName: column.name });
      continue;
    }

    try {
      await pool.query(`ALTER TABLE Projects ADD COLUMN IF NOT EXISTS ${column.name} ${column.def}`);
    } catch (err) {
      logger.warn('Column migration warning', { columnName: column.name, error: err.message });
    }
  }

  // pool kept open
}

// Get all projects
router.get('/', async (req, res) => {
  try {
    await initializeProjectsTable();

    const result = await pool.query("SELECT * FROM Projects WHERE id LIKE 'WTB_%' ORDER BY created_at DESC");

    const projects = result.rows.map(project => ({
      ...project,
      tasks: project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : []
    }));

    res.json({ projects });
  } catch (error) {
    logger.error('Get projects error', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM Projects WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.rows[0];
    project.tasks = project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : [];

    res.json(project);
    // pool kept open
  } catch (error) {
    logger.error('Get project error', { error: error.message, projectId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch project', details: error.message });
  }
});

// Get child projects of a parent project
router.get('/:id/children', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM Projects WHERE parent_project_id = $1 AND id LIKE 'WTB_%' ORDER BY created_at DESC",
      [req.params.id]
    );

    const projects = result.rows.map(project => ({
      ...project,
      tasks: project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : []
    }));

    res.json({ projects });
    // pool kept open
  } catch (error) {
    logger.error('Get child projects error', { error: error.message, parentId: req.params.id });
    res.status(500).json({ error: 'Failed to fetch child projects', details: error.message });
  }
});

// Create project
router.post('/',
  validate(projectValidation),
  auditLog('Project created', 'project', 'info'),
  async (req, res) => {
  try {
    await initializeProjectsTable();

    const { id, name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
            requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate, estimatedBudget,
            costCenter, purchaseOrder, parent_project_id } = req.body;

    const result = await pool.query(`
      INSERT INTO Projects (id, name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
                           requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate, estimatedBudget,
                           costCenter, purchaseOrder, parent_project_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16, $17, $18, $19,
              $20, $21, $22)
      RETURNING *
    `, [
      id, name, client || '', type || '', status || 'planning',
      budget || 0, actualBudget || 0,
      startDate ? new Date(startDate) : null, endDate ? new Date(endDate) : null,
      description || '', JSON.stringify(tasks || []),
      requestorInfo || '', siteLocation || '', businessLine || '',
      progress || 0, priority || '',
      requestDate ? new Date(requestDate) : null, dueDate ? new Date(dueDate) : null,
      estimatedBudget || 0,
      costCenter || '', purchaseOrder || '', parent_project_id || null
    ]);

    const project = result.rows[0];
    project.tasks = typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks;

    // If this is a location (has parent_project_id), update parent rollups
    if (parent_project_id) {
      await updateParentProjectRollups(parent_project_id);
    }

    logger.info('Project created', { projectId: id, name, userId: req.user?.email });

    res.status(201).json({ project });
    // pool kept open
  } catch (error) {
    logger.error('Create project error', { error: error.message });
    res.status(500).json({ error: 'Failed to create project', details: error.message });
  }
});

// Update project
router.put('/:id',
  validate(projectUpdateValidation),
  async (req, res) => {
  try {
    const { name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
            requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate,
            estimatedBudget, costCenter, purchaseOrder, parent_project_id } = req.body;

    const result = await pool.query(`
      UPDATE Projects
      SET name = $1, client = $2, type = $3, status = $4,
          budget = $5, actualBudget = $6, startDate = $7,
          endDate = $8, description = $9, tasks = $10,
          requestorInfo = $11, siteLocation = $12, businessLine = $13,
          progress = $14, priority = $15, requestDate = $16, dueDate = $17,
          estimatedBudget = $18, costCenter = $19, purchaseOrder = $20,
          parent_project_id = $21,
          updated_at = NOW()
      WHERE id = $22
      RETURNING *
    `, [
      name, client || '', type || '', status || 'planning',
      budget || 0, actualBudget || 0,
      startDate ? new Date(startDate) : null, endDate ? new Date(endDate) : null,
      description || '', JSON.stringify(tasks || []),
      requestorInfo || '', siteLocation || '', businessLine || '',
      progress || 0, priority || '',
      requestDate ? new Date(requestDate) : null, dueDate ? new Date(dueDate) : null,
      estimatedBudget || 0, costCenter || '', purchaseOrder || '',
      parent_project_id || null,
      req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.rows[0];
    project.tasks = typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks;

    // If this is a location (has parent_project_id), update parent rollups
    if (parent_project_id) {
      await updateParentProjectRollups(parent_project_id);
    }

    res.json({ project });
    // pool kept open
  } catch (error) {
    logger.error('Update project error', { error: error.message, projectId: req.params.id });
    res.status(500).json({ error: 'Failed to update project', details: error.message });
  }
});

// Delete project
router.delete('/:id',
  auditLog('Project deleted', 'project', 'warning'),
  async (req, res) => {
  try {
    // First get the project to check if it has a parent
    const getResult = await pool.query('SELECT parent_project_id FROM Projects WHERE id = $1', [req.params.id]);

    if (getResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const parentProjectId = getResult.rows[0].parent_project_id;

    // Delete the project
    const result = await pool.query('DELETE FROM Projects WHERE id = $1', [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // If this was a location (had parent_project_id), update parent rollups
    if (parentProjectId) {
      await updateParentProjectRollups(parentProjectId);
    }

    logger.info('Project deleted', { projectId: req.params.id, userId: req.user?.email });

    res.json({ message: 'Project deleted successfully' });
    // pool kept open
  } catch (error) {
    logger.error('Delete project error', { error: error.message, projectId: req.params.id });
    res.status(500).json({ error: 'Failed to delete project', details: error.message });
  }
});

// Add time entry to project
router.post('/:projectId/time-entry', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { taskId, employee, hours, date, description } = req.body;

    // Get current project
    const result = await pool.query('SELECT * FROM Projects WHERE id = $1', [projectId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.rows[0];
    let timeEntries = project.timeEntries ? (typeof project.timeEntries === 'string' ? JSON.parse(project.timeEntries) : project.timeEntries) : [];
    let tasks = project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : [];

    // Add new time entry
    const newEntry = {
      id: `TE_${Date.now()}`,
      taskId,
      employee,
      hours: parseFloat(hours),
      date: date || new Date().toISOString(),
      description
    };

    timeEntries.push(newEntry);

    // Update task actual hours
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      tasks[taskIndex].actualHours = (tasks[taskIndex].actualHours || 0) + parseFloat(hours);

      // If this is a subtask, roll up hours to parent task
      const task = tasks[taskIndex];
      if (task.parentTaskId) {
        const parentIndex = tasks.findIndex(t => t.id === task.parentTaskId);
        if (parentIndex !== -1) {
          // Recalculate parent's actual hours from all its children
          const childTasks = tasks.filter(t => t.parentTaskId === task.parentTaskId);
          const childrenHours = childTasks.reduce((sum, child) => sum + (child.actualHours || 0), 0);
          tasks[parentIndex].actualHours = childrenHours;
        }
      }
    }

    // Calculate total actual hours for project (only count root-level tasks to avoid double-counting)
    const totalActualHours = tasks
      .filter(t => !t.parentTaskId) // Only root tasks
      .reduce((sum, task) => sum + (task.actualHours || 0), 0);

    // Update project
    await pool.query(`
      UPDATE Projects
      SET tasks = $1,
          timeEntries = $2,
          actualHours = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [JSON.stringify(tasks), JSON.stringify(timeEntries), totalActualHours, projectId]);

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.json({ message: 'Time entry added successfully', entry: newEntry });
  } catch (error) {
    logger.error('Add time entry error', { error: error.message, projectId: req.params.projectId });
    res.status(500).json({ error: 'Failed to add time entry', details: error.message });
  }
});

// Update specific task in project
router.put('/:projectId/tasks/:taskId', async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const taskUpdate = req.body;

    // Get current project
    const projectResult = await pool.query('SELECT * FROM Projects WHERE id = $1', [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    let tasks = project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : [];

    // Find and update the specific task (including subtasks)
    const found = findTaskInProject(tasks, taskId);
    if (!found) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update the task with provided data
    Object.assign(found.task, taskUpdate, { updatedAt: new Date().toISOString() });

    // Save back to database
    await pool.query('UPDATE Projects SET tasks = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(tasks), projectId]);

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.json({
      message: 'Task updated successfully',
      task: found.task
    });

    // pool kept open
  } catch (error) {
    logger.error('Update task error', { error: error.message, projectId: req.params.projectId, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to update task', details: error.message });
  }
});

// Create task in project
router.post('/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const newTask = req.body;

    // Get current project
    const projectResult = await pool.query('SELECT * FROM Projects WHERE id = $1', [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    let tasks = project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : [];

    // Add timestamp and ensure task has required fields
    const taskWithDefaults = {
      ...newTask,
      id: newTask.id || 't_' + Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notesThread: newTask.notesThread || []
    };

    tasks.push(taskWithDefaults);

    // Save back to database
    await pool.query('UPDATE Projects SET tasks = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(tasks), projectId]);

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.status(201).json({
      message: 'Task created successfully',
      task: taskWithDefaults
    });

    // pool kept open
  } catch (error) {
    logger.error('Create task error', { error: error.message, projectId: req.params.projectId });
    res.status(500).json({ error: 'Failed to create task', details: error.message });
  }
});

// Delete task from project
router.delete('/:projectId/tasks/:taskId', async (req, res) => {
  try {
    const { projectId, taskId } = req.params;

    // Get current project
    const projectResult = await pool.query('SELECT * FROM Projects WHERE id = $1', [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    let tasks = project.tasks ? (typeof project.tasks === 'string' ? JSON.parse(project.tasks) : project.tasks) : [];

    // Remove the specific task (including subtasks)
    const removed = removeTaskFromProject(tasks, taskId);
    if (!removed) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Save back to database
    await pool.query('UPDATE Projects SET tasks = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(tasks), projectId]);

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.json({ message: 'Task deleted successfully' });

    // pool kept open
  } catch (error) {
    logger.error('Delete task error', { error: error.message, projectId: req.params.projectId, taskId: req.params.taskId });
    res.status(500).json({ error: 'Failed to delete task', details: error.message });
  }
});

// Helper function to calculate and update parent project rollups
async function updateParentProjectRollups(parentProjectId) {
  try {
    // Get all child projects (locations)
    const childrenResult = await pool.query('SELECT * FROM Projects WHERE parent_project_id = $1', [parentProjectId]);

    const children = childrenResult.rows;

    if (children.length === 0) {
      // pool kept open
      return; // No children, nothing to rollup
    }

    // Calculate aggregated values
    let totalEstimatedBudget = 0;
    let totalActualBudget = 0;
    let totalActualHours = 0;
    let totalProgress = 0;
    let worstStatus = 'planning'; // planning < in-progress < on-hold < completed

    const statusPriority = {
      'cancelled': 0,
      'on-hold': 1,
      'planning': 2,
      'in-progress': 3,
      'completed': 4
    };

    children.forEach(child => {
      totalEstimatedBudget += parseFloat(child.estimatedBudget) || 0;
      totalActualBudget += parseFloat(child.actualBudget) || 0;
      totalActualHours += parseFloat(child.actualHours) || 0;
      totalProgress += parseInt(child.progress) || 0;

      // Worst status wins (lowest priority number)
      const childStatusPriority = statusPriority[child.status] || 2;
      const currentWorstPriority = statusPriority[worstStatus] || 2;
      if (childStatusPriority < currentWorstPriority) {
        worstStatus = child.status;
      }
    });

    // Calculate average progress
    const avgProgress = children.length > 0 ? Math.round(totalProgress / children.length) : 0;

    // Update parent project with rolled up values
    await pool.query(`
      UPDATE Projects
      SET estimatedBudget = $1,
          actualBudget = $2,
          actualHours = $3,
          progress = $4,
          status = $5,
          updated_at = NOW()
      WHERE id = $6
    `, [totalEstimatedBudget, totalActualBudget, totalActualHours, avgProgress, worstStatus, parentProjectId]);

    // pool kept open
    logger.info('Updated rollups for parent project', { parentProjectId });
  } catch (error) {
    logger.error('Update parent rollups error', { error: error.message, parentProjectId });
  }
}

module.exports = router;
