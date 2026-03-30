const express = require('express');
const { pool } = require('../db');
const logger = require('../utils/logger');
const { auditLog } = require('../middleware/audit');
const { validate, body, param } = require('../middleware/validate');
const router = express.Router();

// Map PostgreSQL lowercase columns to camelCase for frontend compatibility
function mapProjectRow(row) {
  return {
    id: row.id,
    name: row.name,
    client: row.client,
    type: row.type,
    status: row.status,
    budget: row.budget,
    actualBudget: row.actualbudget,
    startDate: row.startdate,
    endDate: row.enddate,
    description: row.description,
    tasks: row.tasks ? (typeof row.tasks === 'string' ? JSON.parse(row.tasks) : row.tasks) : [],
    requestorInfo: row.requestorinfo,
    siteLocation: row.sitelocation,
    businessLine: row.businessline,
    progress: row.progress,
    priority: row.priority,
    requestDate: row.requestdate,
    dueDate: row.duedate,
    estimatedBudget: row.estimatedbudget,
    costCenter: row.costcenter,
    purchaseOrder: row.purchaseorder,
    parentProjectId: row.parent_project_id,
    locationId: row.location_id || null,
    projectManager: row.project_manager || null,
    stakeholders: row.stakeholders || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

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

    const { page, limit, status, type, businessLine, search, location_id, sort, order, summary } = req.query;

    // If no pagination params, return all (backward compat with monolith)
    if (!page && !summary) {
      const result = await pool.query("SELECT * FROM Projects ORDER BY created_at DESC");
      return res.json({ projects: result.rows.map(mapProjectRow) });
    }

    // Paginated query with filters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 25));
    const offset = (pageNum - 1) * pageSize;

    const conditions = ['parent_project_id IS NULL'];
    const params = [];
    let paramIdx = 1;

    if (status) { conditions.push(`status = $${paramIdx++}`); params.push(status); }
    if (type) { conditions.push(`type = $${paramIdx++}`); params.push(type); }
    if (businessLine) { conditions.push(`businessline = $${paramIdx++}`); params.push(businessLine); }
    if (location_id) { conditions.push(`location_id = $${paramIdx++}`); params.push(parseInt(location_id)); }
    if (search) {
      conditions.push(`(name ILIKE $${paramIdx} OR sitelocation ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Sort
    const sortableColumns = { name: 'name', status: 'status', type: 'type', dueDate: 'duedate', progress: 'progress', budget: 'estimatedbudget', priority: 'priority', created: 'created_at' };
    const sortCol = sortableColumns[sort] || 'created_at';
    const sortDir = order === 'asc' ? 'ASC' : 'DESC';

    // Count total
    const countResult = await pool.query(`SELECT COUNT(*) as total FROM Projects ${where}`, params);
    const total = parseInt(countResult.rows[0].total);

    // Fetch page - exclude tasks JSONB for performance (summary mode)
    const selectCols = summary === 'true'
      ? 'id, name, type, status, budget, actualbudget, estimatedbudget, progress, priority, sitelocation, businessline, duedate, startdate, location_id, created_at, updated_at'
      : '*';

    const result = await pool.query(
      `SELECT ${selectCols} FROM Projects ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, pageSize, offset]
    );

    const projects = result.rows.map(row => {
      const mapped = {
        id: row.id,
        name: row.name,
        type: row.type,
        status: row.status,
        budget: row.budget,
        actualBudget: row.actualbudget,
        estimatedBudget: row.estimatedbudget,
        progress: row.progress,
        priority: row.priority,
        siteLocation: row.sitelocation,
        businessLine: row.businessline,
        dueDate: row.duedate,
        startDate: row.startdate,
        locationId: row.location_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      // Include tasks only if not summary mode
      if (row.tasks !== undefined) {
        mapped.tasks = typeof row.tasks === 'string' ? JSON.parse(row.tasks) : (row.tasks || []);
        mapped.taskCount = mapped.tasks.length;
      }
      return mapped;
    });

    res.json({
      projects,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      }
    });
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

    const project = mapProjectRow(result.rows[0]);

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
      "SELECT * FROM Projects WHERE parent_project_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );

    const projects = result.rows.map(mapProjectRow).map(project => ({
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
            costCenter, purchaseOrder, parent_project_id, projectManager, stakeholders } = req.body;

    const result = await pool.query(`
      INSERT INTO Projects (id, name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
                           requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate, estimatedBudget,
                           costCenter, purchaseOrder, parent_project_id, project_manager, stakeholders)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16, $17, $18, $19,
              $20, $21, $22, $23, $24)
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
      costCenter || '', purchaseOrder || '', parent_project_id || null,
      projectManager || null, JSON.stringify(stakeholders || [])
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

// Update project (partial updates supported)
router.put('/:id',
  async (req, res) => {
  try {
    const updates = req.body;
    const fieldMap = {
      name: 'name', client: 'client', type: 'type', status: 'status',
      budget: 'budget', actualBudget: 'actualbudget', estimatedBudget: 'estimatedbudget',
      startDate: 'startdate', endDate: 'enddate', dueDate: 'duedate',
      description: 'description', tasks: 'tasks',
      requestorInfo: 'requestorinfo', siteLocation: 'sitelocation',
      businessLine: 'businessline', progress: 'progress', priority: 'priority',
      requestDate: 'requestdate', costCenter: 'costcenter', purchaseOrder: 'purchaseorder',
      parent_project_id: 'parent_project_id', locationId: 'location_id',
      projectManager: 'project_manager', stakeholders: 'stakeholders',
    };

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (jsKey in updates) {
        let val = updates[jsKey];
        // Handle special types
        if ((dbCol === 'tasks' || dbCol === 'stakeholders') && val) val = JSON.stringify(val);
        if (['startdate','enddate','duedate','requestdate'].includes(dbCol) && val) val = new Date(val);
        setClauses.push(`${dbCol} = $${idx}`);
        values.push(val);
        idx++;
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    setClauses.push('updated_at = NOW()');
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE Projects SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = mapProjectRow(result.rows[0]);

    // Update parent rollups if needed
    if (project.parentProjectId) {
      await updateParentProjectRollups(project.parentProjectId);
    }

    res.json({ project });
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

// ==================== PROJECT NOTES ====================

// GET /api/projects/:projectId/notes - Dated notes for a project
router.get('/:projectId/notes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ProjectNotes WHERE project_id = $1 ORDER BY created_at DESC',
      [req.params.projectId]
    );
    res.json({
      notes: result.rows.map(r => ({
        id: r.id, projectId: r.project_id, author: r.author,
        content: r.content, createdAt: r.created_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching project notes', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /api/projects/:projectId/notes - Add a dated note
router.post('/:projectId/notes', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });
    const author = req.user?.name || req.user?.email || 'Unknown';

    const result = await pool.query(
      'INSERT INTO ProjectNotes (project_id, author, content) VALUES ($1, $2, $3) RETURNING *',
      [req.params.projectId, author, content.trim()]
    );
    res.status(201).json({ note: result.rows[0] });
  } catch (error) {
    logger.error('Error creating project note', { error: error.message });
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// DELETE /api/projects/:projectId/notes/:noteId
router.delete('/:projectId/notes/:noteId', async (req, res) => {
  try {
    await pool.query('DELETE FROM ProjectNotes WHERE id = $1 AND project_id = $2', [req.params.noteId, req.params.projectId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting note', { error: error.message });
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ==================== SITE VISITS ====================

// GET /api/projects/:projectId/visits
router.get('/:projectId/visits', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM SiteVisits WHERE project_id = $1 ORDER BY visit_date DESC',
      [req.params.projectId]
    );
    res.json({
      visits: result.rows.map(r => ({
        id: r.id, projectId: r.project_id, visitor: r.visitor,
        visitDate: r.visit_date, purpose: r.purpose, summary: r.summary,
        ticketNumber: r.ticket_number, createdAt: r.created_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching site visits', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

// POST /api/projects/:projectId/visits
router.post('/:projectId/visits', async (req, res) => {
  try {
    const { visitor, visitDate, purpose, summary, ticketNumber } = req.body;
    if (!visitor?.trim() || !visitDate) return res.status(400).json({ error: 'visitor and visitDate are required' });

    const result = await pool.query(
      `INSERT INTO SiteVisits (project_id, visitor, visit_date, purpose, summary, ticket_number)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.projectId, visitor.trim(), new Date(visitDate),
       purpose?.trim() || null, summary?.trim() || null, ticketNumber?.trim() || null]
    );
    res.status(201).json({ visit: result.rows[0] });
  } catch (error) {
    logger.error('Error creating site visit', { error: error.message });
    res.status(500).json({ error: 'Failed to create visit' });
  }
});

// DELETE /api/projects/:projectId/visits/:visitId
router.delete('/:projectId/visits/:visitId', async (req, res) => {
  try {
    await pool.query('DELETE FROM SiteVisits WHERE id = $1 AND project_id = $2', [req.params.visitId, req.params.projectId]);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting visit', { error: error.message });
    res.status(500).json({ error: 'Failed to delete visit' });
  }
});

// ==================== PROJECT ROOMS ====================

// GET /api/projects/:projectId/rooms - Rooms linked to a project
router.get('/:projectId/rooms', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pr.id as link_id, pr.notes as link_notes, pr.created_at as linked_at,
             r.room_id, r.name, r.room_type, r.capacity,
             r.location_id, r.floor_id,
             l.name as location_name,
             f.name as floor_name
      FROM ProjectRooms pr
      JOIN Rooms r ON r.room_id = pr.room_id
      LEFT JOIN Locations l ON l.id = r.location_id
      LEFT JOIN Floors f ON f.id = r.floor_id
      WHERE pr.project_id = $1
      ORDER BY l.name, f.name, r.name
    `, [req.params.projectId]);

    res.json({
      rooms: result.rows.map(r => ({
        linkId: r.link_id,
        roomId: r.room_id,
        name: r.name,
        roomType: r.room_type,
        capacity: r.capacity,
        location: r.location_name,
        floor: r.floor_name,
        notes: r.link_notes,
        linkedAt: r.linked_at,
      }))
    });
  } catch (error) {
    logger.error('Error fetching project rooms', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch project rooms' });
  }
});

// POST /api/projects/:projectId/rooms - Link room(s) to a project
router.post('/:projectId/rooms', async (req, res) => {
  try {
    const { roomId, roomIds, notes } = req.body;
    const ids = roomIds || (roomId ? [roomId] : []);
    if (ids.length === 0) return res.status(400).json({ error: 'roomId or roomIds required' });

    for (const rid of ids) {
      await pool.query(
        'INSERT INTO ProjectRooms (project_id, room_id, notes) VALUES ($1, $2, $3) ON CONFLICT (project_id, room_id) DO NOTHING',
        [req.params.projectId, rid, notes || null]
      );
    }

    res.status(201).json({ success: true, linked: ids.length });
  } catch (error) {
    logger.error('Error linking rooms', { error: error.message });
    res.status(500).json({ error: 'Failed to link rooms' });
  }
});

// DELETE /api/projects/:projectId/rooms/:roomId - Unlink room from project
router.delete('/:projectId/rooms/:roomId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM ProjectRooms WHERE project_id = $1 AND room_id = $2',
      [req.params.projectId, req.params.roomId]
    );
    res.json({ success: true });
  } catch (error) {
    logger.error('Error unlinking room', { error: error.message });
    res.status(500).json({ error: 'Failed to unlink room' });
  }
});

module.exports = router;
