const express = require('express');
const { sql, poolPromise } = require('../db');
const router = express.Router();

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
  const pool = await poolPromise;

  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Projects' AND xtype='U')
    BEGIN
      CREATE TABLE Projects (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        client NVARCHAR(255),
        type NVARCHAR(100),
        status NVARCHAR(50) DEFAULT 'planning',
        budget DECIMAL(12,2) DEFAULT 0,
        actualBudget DECIMAL(12,2) DEFAULT 0,
        startDate DATETIME2,
        endDate DATETIME2,
        description NVARCHAR(MAX),
        tasks NVARCHAR(MAX), -- JSON string
        requestorInfo NVARCHAR(500),
        siteLocation NVARCHAR(500),
        businessLine NVARCHAR(255),
        progress INT DEFAULT 0,
        priority NVARCHAR(50),
        requestDate DATETIME2,
        dueDate DATETIME2,
        estimatedBudget DECIMAL(12,2) DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      );
    END
  `);

  // Add missing columns if they don't exist (migration)
  // NOTE: These are hardcoded trusted values, but we validate them for defense in depth
  const columns = [
    'requestorInfo NVARCHAR(500)',
    'siteLocation NVARCHAR(500)',
    'businessLine NVARCHAR(255)',
    'progress INT DEFAULT 0',
    'requestDate DATETIME2',
    'dueDate DATETIME2',
    'estimatedBudget DECIMAL(12,2) DEFAULT 0',
    'costCenter NVARCHAR(255)',
    'purchaseOrder NVARCHAR(255)',
    'parent_project_id NVARCHAR(50)'
  ];

  for (const column of columns) {
    const columnName = column.split(' ')[0];

    // SECURITY: Validate column name contains only safe characters (defense in depth)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
      console.error(`❌ SECURITY: Invalid column name detected: ${columnName}`);
      continue;
    }

    // Validate full column definition doesn't contain suspicious patterns
    if (/;|--|\/\*|\*\/|xp_|sp_|exec|execute/i.test(column)) {
      console.error(`❌ SECURITY: Suspicious pattern in column definition: ${column}`);
      continue;
    }

    try {
      // Use parameterized query for column name check
      const checkResult = await pool.request()
        .input('columnName', sql.NVarChar, columnName)
        .query(`
          SELECT COUNT(*) as exists
          FROM sys.columns
          WHERE object_id = OBJECT_ID('Projects') AND name = @columnName
        `);

      if (checkResult.recordset[0].exists === 0) {
        // Column doesn't exist, add it (column definition is validated above)
        await pool.request().query(`ALTER TABLE Projects ADD ${column}`);
        console.log(`✅ Added column: ${columnName}`);
      }
    } catch (err) {
      console.warn(`⚠️ Column migration warning for ${columnName}:`, err.message);
    }
  }

  await pool.close();
}

// Get all projects
router.get('/', async (req, res) => {
  let pool;
  try {
    await initializeProjectsTable();
    
    pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Projects WHERE id LIKE \'WTB_%\' ORDER BY created_at DESC');
    
    const projects = result.recordset.map(project => ({
      ...project,
      tasks: project.tasks ? JSON.parse(project.tasks) : []
    }));
    
    res.json({ projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (e) {
        console.error('Error closing pool:', e);
      }
    }
  }
});

// Get single project
router.get('/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('SELECT * FROM Projects WHERE id = @id');

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.recordset[0];
    project.tasks = project.tasks ? JSON.parse(project.tasks) : [];

    res.json(project);
    await pool.close();
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to fetch project', details: error.message });
  }
});

// Get child projects of a parent project
router.get('/:id/children', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('parent_id', sql.NVarChar, req.params.id)
      .query('SELECT * FROM Projects WHERE parent_project_id = @parent_id AND id LIKE \'WTB_%\' ORDER BY created_at DESC');

    const projects = result.recordset.map(project => ({
      ...project,
      tasks: project.tasks ? JSON.parse(project.tasks) : []
    }));

    res.json({ projects });
    await pool.close();
  } catch (error) {
    console.error('Get child projects error:', error);
    res.status(500).json({ error: 'Failed to fetch child projects', details: error.message });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    await initializeProjectsTable();
    
    const { id, name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
            requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate, estimatedBudget,
            costCenter, purchaseOrder, parent_project_id } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'Project ID and name are required' });
    }

    const pool = await poolPromise;

    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('client', sql.NVarChar, client || '')
      .input('type', sql.NVarChar, type || '')
      .input('status', sql.NVarChar, status || 'planning')
      .input('budget', sql.Decimal(12,2), budget || 0)
      .input('actualBudget', sql.Decimal(12,2), actualBudget || 0)
      .input('startDate', sql.DateTime2, startDate ? new Date(startDate) : null)
      .input('endDate', sql.DateTime2, endDate ? new Date(endDate) : null)
      .input('description', sql.NVarChar, description || '')
      .input('tasks', sql.NVarChar, JSON.stringify(tasks || []))
      .input('requestorInfo', sql.NVarChar, requestorInfo || '')
      .input('siteLocation', sql.NVarChar, siteLocation || '')
      .input('businessLine', sql.NVarChar, businessLine || '')
      .input('progress', sql.Int, progress || 0)
      .input('priority', sql.NVarChar, priority || '')
      .input('requestDate', sql.DateTime2, requestDate ? new Date(requestDate) : null)
      .input('dueDate', sql.DateTime2, dueDate ? new Date(dueDate) : null)
      .input('estimatedBudget', sql.Decimal(12,2), estimatedBudget || 0)
      .input('costCenter', sql.NVarChar, costCenter || '')
      .input('purchaseOrder', sql.NVarChar, purchaseOrder || '')
      .input('parent_project_id', sql.NVarChar, parent_project_id || null)
      .query(`
        INSERT INTO Projects (id, name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
                             requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate, estimatedBudget,
                             costCenter, purchaseOrder, parent_project_id)
        OUTPUT INSERTED.*
        VALUES (@id, @name, @client, @type, @status, @budget, @actualBudget, @startDate, @endDate, @description, @tasks,
                @requestorInfo, @siteLocation, @businessLine, @progress, @priority, @requestDate, @dueDate, @estimatedBudget,
                @costCenter, @purchaseOrder, @parent_project_id)
      `);
    
    const project = result.recordset[0];
    project.tasks = JSON.parse(project.tasks);

    // If this is a location (has parent_project_id), update parent rollups
    if (parent_project_id) {
      await updateParentProjectRollups(parent_project_id);
    }

    res.status(201).json({ project });
    await pool.close();
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project', details: error.message });
  }
});

// Update project
router.put('/:id', async (req, res) => {
  try {
    const { name, client, type, status, budget, actualBudget, startDate, endDate, description, tasks,
            requestorInfo, siteLocation, businessLine, progress, priority, requestDate, dueDate,
            estimatedBudget, costCenter, purchaseOrder, parent_project_id } = req.body;

    const pool = await poolPromise;

    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('client', sql.NVarChar, client || '')
      .input('type', sql.NVarChar, type || '')
      .input('status', sql.NVarChar, status || 'planning')
      .input('budget', sql.Decimal(12,2), budget || 0)
      .input('actualBudget', sql.Decimal(12,2), actualBudget || 0)
      .input('startDate', sql.DateTime2, startDate ? new Date(startDate) : null)
      .input('endDate', sql.DateTime2, endDate ? new Date(endDate) : null)
      .input('description', sql.NVarChar, description || '')
      .input('tasks', sql.NVarChar, JSON.stringify(tasks || []))
      .input('requestorInfo', sql.NVarChar, requestorInfo || '')
      .input('siteLocation', sql.NVarChar, siteLocation || '')
      .input('businessLine', sql.NVarChar, businessLine || '')
      .input('progress', sql.Int, progress || 0)
      .input('priority', sql.NVarChar, priority || '')
      .input('requestDate', sql.DateTime2, requestDate ? new Date(requestDate) : null)
      .input('dueDate', sql.DateTime2, dueDate ? new Date(dueDate) : null)
      .input('estimatedBudget', sql.Decimal(12,2), estimatedBudget || 0)
      .input('costCenter', sql.NVarChar, costCenter || '')
      .input('purchaseOrder', sql.NVarChar, purchaseOrder || '')
      .input('parent_project_id', sql.NVarChar, parent_project_id || null)
      .query(`
        UPDATE Projects
        SET name = @name, client = @client, type = @type, status = @status,
            budget = @budget, actualBudget = @actualBudget, startDate = @startDate,
            endDate = @endDate, description = @description, tasks = @tasks,
            requestorInfo = @requestorInfo, siteLocation = @siteLocation, businessLine = @businessLine,
            progress = @progress, priority = @priority, requestDate = @requestDate, dueDate = @dueDate,
            estimatedBudget = @estimatedBudget, costCenter = @costCenter, purchaseOrder = @purchaseOrder,
            parent_project_id = @parent_project_id,
            updated_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = result.recordset[0];
    project.tasks = JSON.parse(project.tasks);

    // If this is a location (has parent_project_id), update parent rollups
    if (parent_project_id) {
      await updateParentProjectRollups(parent_project_id);
    }

    res.json({ project });
    await pool.close();
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project', details: error.message });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const pool = await poolPromise;

    // First get the project to check if it has a parent
    const getResult = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('SELECT parent_project_id FROM Projects WHERE id = @id');

    if (getResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const parentProjectId = getResult.recordset[0].parent_project_id;

    // Delete the project
    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM Projects WHERE id = @id');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // If this was a location (had parent_project_id), update parent rollups
    if (parentProjectId) {
      await updateParentProjectRollups(parentProjectId);
    }

    res.json({ message: 'Project deleted successfully' });
    await pool.close();
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project', details: error.message });
  }
});

// Add time entry to project
router.post('/:projectId/time-entry', async (req, res) => {
  let pool;
  try {
    const { projectId } = req.params;
    const { taskId, employee, hours, date, description } = req.body;
    
    pool = await poolPromise;
    
    // Get current project
    const result = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .query('SELECT * FROM Projects WHERE id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = result.recordset[0];
    let timeEntries = project.timeEntries ? JSON.parse(project.timeEntries) : [];
    let tasks = project.tasks ? JSON.parse(project.tasks) : [];
    
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
    await pool.request()
      .input('id', sql.NVarChar, projectId)
      .input('tasks', sql.NVarChar, JSON.stringify(tasks))
      .input('timeEntries', sql.NVarChar, JSON.stringify(timeEntries))
      .input('actualHours', sql.Decimal(10,2), totalActualHours)
      .query(`
        UPDATE Projects
        SET tasks = @tasks,
            timeEntries = @timeEntries,
            actualHours = @actualHours,
            updated_at = GETDATE()
        WHERE id = @id
      `);

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.json({ message: 'Time entry added successfully', entry: newEntry });
  } catch (error) {
    console.error('Add time entry error:', error);
    res.status(500).json({ error: 'Failed to add time entry', details: error.message });
  } finally {
    if (pool) await pool.close();
  }
});

// Update specific task in project
router.put('/:projectId/tasks/:taskId', async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    const taskUpdate = req.body;
    
    const pool = await poolPromise;
    
    // Get current project
    const projectResult = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .query('SELECT * FROM Projects WHERE id = @id');
    
    if (projectResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = projectResult.recordset[0];
    let tasks = project.tasks ? JSON.parse(project.tasks) : [];

    // Find and update the specific task (including subtasks)
    const found = findTaskInProject(tasks, taskId);
    if (!found) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update the task with provided data
    Object.assign(found.task, taskUpdate, { updatedAt: new Date().toISOString() });
    
    // Save back to database
    const updateResult = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .input('tasks', sql.NVarChar, JSON.stringify(tasks))
      .query('UPDATE Projects SET tasks = @tasks, updated_at = GETDATE() WHERE id = @id');

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.json({
      message: 'Task updated successfully',
      task: found.task
    });

    await pool.close();
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task', details: error.message });
  }
});

// Create task in project
router.post('/:projectId/tasks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const newTask = req.body;
    
    const pool = await poolPromise;
    
    // Get current project
    const projectResult = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .query('SELECT * FROM Projects WHERE id = @id');
    
    if (projectResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = projectResult.recordset[0];
    let tasks = project.tasks ? JSON.parse(project.tasks) : [];
    
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
    const updateResult = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .input('tasks', sql.NVarChar, JSON.stringify(tasks))
      .query('UPDATE Projects SET tasks = @tasks, updated_at = GETDATE() WHERE id = @id');

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.status(201).json({
      message: 'Task created successfully',
      task: taskWithDefaults
    });

    await pool.close();
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to create task', details: error.message });
  }
});

// Delete task from project
router.delete('/:projectId/tasks/:taskId', async (req, res) => {
  try {
    const { projectId, taskId } = req.params;
    
    const pool = await poolPromise;
    
    // Get current project
    const projectResult = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .query('SELECT * FROM Projects WHERE id = @id');
    
    if (projectResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = projectResult.recordset[0];
    let tasks = project.tasks ? JSON.parse(project.tasks) : [];

    // Remove the specific task (including subtasks)
    const removed = removeTaskFromProject(tasks, taskId);
    if (!removed) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Save back to database
    const updateResult = await pool.request()
      .input('id', sql.NVarChar, projectId)
      .input('tasks', sql.NVarChar, JSON.stringify(tasks))
      .query('UPDATE Projects SET tasks = @tasks, updated_at = GETDATE() WHERE id = @id');

    // If this is a location (has parent_project_id), update parent rollups
    if (project.parent_project_id) {
      await updateParentProjectRollups(project.parent_project_id);
    }

    res.json({ message: 'Task deleted successfully' });

    await pool.close();
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task', details: error.message });
  }
});

// Helper function to calculate and update parent project rollups
async function updateParentProjectRollups(parentProjectId) {
  try {
    const pool = await poolPromise;

    // Get all child projects (locations)
    const childrenResult = await pool.request()
      .input('parent_id', sql.NVarChar, parentProjectId)
      .query('SELECT * FROM Projects WHERE parent_project_id = @parent_id');

    const children = childrenResult.recordset;

    if (children.length === 0) {
      await pool.close();
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
    await pool.request()
      .input('id', sql.NVarChar, parentProjectId)
      .input('estimatedBudget', sql.Decimal(12, 2), totalEstimatedBudget)
      .input('actualBudget', sql.Decimal(12, 2), totalActualBudget)
      .input('actualHours', sql.Decimal(10, 2), totalActualHours)
      .input('progress', sql.Int, avgProgress)
      .input('status', sql.NVarChar, worstStatus)
      .query(`
        UPDATE Projects
        SET estimatedBudget = @estimatedBudget,
            actualBudget = @actualBudget,
            actualHours = @actualHours,
            progress = @progress,
            status = @status,
            updated_at = GETDATE()
        WHERE id = @id
      `);

    await pool.close();
    console.log(`✅ Updated rollups for parent project ${parentProjectId}`);
  } catch (error) {
    console.error('Update parent rollups error:', error);
  }
}

module.exports = router;