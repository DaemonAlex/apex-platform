const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// GET /reports/portfolio - Executive-level aggregate stats
router.get('/portfolio', async (req, res) => {
  try {
    // Project counts by status
    const statusResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active' OR status = 'in-progress') AS active,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'on-hold') AS on_hold,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'planning' OR status = 'scheduled') AS planning,
        COUNT(*) AS total
      FROM projects
      WHERE parent_project_id IS NULL
    `);

    // Budget health
    const budgetResult = await pool.query(`
      SELECT
        COALESCE(SUM(COALESCE(estimatedbudget, budget, 0)), 0) AS total_budget,
        COALESCE(SUM(COALESCE(actualbudget, 0)), 0) AS total_actual,
        COUNT(*) FILTER (WHERE COALESCE(actualbudget, 0) > COALESCE(estimatedbudget, budget, 0) AND COALESCE(estimatedbudget, budget, 0) > 0) AS over_budget_count
      FROM projects
      WHERE parent_project_id IS NULL
    `);

    // At-risk projects (tasks with red RAG status)
    const atRiskResult = await pool.query(`
      SELECT COUNT(DISTINCT p.id) AS at_risk_count
      FROM projects p, jsonb_array_elements(p.tasks) AS t
      WHERE parent_project_id IS NULL
        AND (t->>'ragStatus') = 'red'
        AND p.status IN ('active', 'in-progress')
    `);

    // Business line breakdown
    const businessLineResult = await pool.query(`
      SELECT
        COALESCE(businessline, 'Unassigned') AS business_line,
        COUNT(*) AS count,
        COALESCE(SUM(COALESCE(estimatedbudget, budget, 0)), 0) AS budget
      FROM projects
      WHERE parent_project_id IS NULL
      GROUP BY businessline
      ORDER BY count DESC
    `);

    // Task completion aggregate
    const taskResult = await pool.query(`
      SELECT
        COUNT(*) AS total_tasks,
        COUNT(*) FILTER (WHERE (t->>'status') = 'completed') AS completed_tasks,
        COUNT(*) FILTER (WHERE (t->>'status') = 'not-started') AS not_started_tasks,
        COUNT(*) FILTER (WHERE (t->>'status') = 'in-progress') AS in_progress_tasks
      FROM projects p, jsonb_array_elements(p.tasks) AS t
      WHERE parent_project_id IS NULL
    `);

    // On-time completion rate (completed projects where completedDate <= dueDate)
    const onTimeResult = await pool.query(`
      SELECT
        COUNT(*) AS total_completed,
        COUNT(*) FILTER (WHERE enddate IS NOT NULL AND duedate IS NOT NULL AND enddate <= duedate) AS on_time
      FROM projects
      WHERE parent_project_id IS NULL AND status = 'completed'
    `);

    // Project type breakdown
    const typeResult = await pool.query(`
      SELECT
        COALESCE(type, 'custom') AS project_type,
        COUNT(*) AS count
      FROM projects
      WHERE parent_project_id IS NULL
      GROUP BY type
      ORDER BY count DESC
    `);

    const status = statusResult.rows[0];
    const budget = budgetResult.rows[0];
    const tasks = taskResult.rows[0];
    const onTime = onTimeResult.rows[0];

    res.json({
      projects: {
        total: parseInt(status.total),
        active: parseInt(status.active),
        completed: parseInt(status.completed),
        onHold: parseInt(status.on_hold),
        cancelled: parseInt(status.cancelled),
        planning: parseInt(status.planning)
      },
      budget: {
        totalPlanned: parseFloat(budget.total_budget),
        totalActual: parseFloat(budget.total_actual),
        variance: parseFloat(budget.total_actual) - parseFloat(budget.total_budget),
        overBudgetCount: parseInt(budget.over_budget_count)
      },
      atRisk: parseInt(atRiskResult.rows[0].at_risk_count),
      tasks: {
        total: parseInt(tasks.total_tasks),
        completed: parseInt(tasks.completed_tasks),
        notStarted: parseInt(tasks.not_started_tasks),
        inProgress: parseInt(tasks.in_progress_tasks),
        completionRate: parseInt(tasks.total_tasks) > 0
          ? Math.round((parseInt(tasks.completed_tasks) / parseInt(tasks.total_tasks)) * 100)
          : 0
      },
      onTimeRate: parseInt(onTime.total_completed) > 0
        ? Math.round((parseInt(onTime.on_time) / parseInt(onTime.total_completed)) * 100)
        : 0,
      businessLines: businessLineResult.rows.map(r => ({
        name: r.business_line,
        count: parseInt(r.count),
        budget: parseFloat(r.budget)
      })),
      projectTypes: typeResult.rows.map(r => ({
        type: r.project_type,
        count: parseInt(r.count)
      }))
    });
  } catch (error) {
    console.error('Portfolio report error:', error);
    res.status(500).json({ error: 'Failed to generate portfolio report' });
  }
});

// GET /reports/project/:id - Deep dive for one project
router.get('/project/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const row = projectResult.rows[0];
    const tasks = row.tasks ? (typeof row.tasks === 'string' ? JSON.parse(row.tasks) : row.tasks) : [];

    // Task stats by phase
    const phaseStats = {};
    tasks.forEach(task => {
      const phase = task.phase || 'unassigned';
      if (!phaseStats[phase]) {
        phaseStats[phase] = { total: 0, completed: 0, inProgress: 0, notStarted: 0, totalHours: 0 };
      }
      phaseStats[phase].total++;
      if (task.status === 'completed') phaseStats[phase].completed++;
      else if (task.status === 'in-progress') phaseStats[phase].inProgress++;
      else phaseStats[phase].notStarted++;
      phaseStats[phase].totalHours += parseFloat(task.estimatedHours) || 0;
    });

    // Task stats by priority
    const priorityStats = { low: 0, medium: 0, high: 0, critical: 0 };
    tasks.forEach(task => {
      const p = task.priority || 'medium';
      if (priorityStats[p] !== undefined) priorityStats[p]++;
    });

    // RAG summary
    const ragStats = { green: 0, yellow: 0, red: 0 };
    tasks.forEach(task => {
      const r = task.ragStatus || 'green';
      if (ragStats[r] !== undefined) ragStats[r]++;
    });

    // Hours summary
    const totalEstimated = tasks.reduce((sum, t) => sum + (parseFloat(t.estimatedHours) || 0), 0);

    // Blocked / overdue tasks
    const now = new Date();
    const overdueTasks = tasks.filter(t =>
      t.status !== 'completed' && t.endDate && new Date(t.endDate) < now
    ).map(t => ({ id: t.id, name: t.name, endDate: t.endDate, status: t.status }));

    // Budget
    const planned = parseFloat(row.estimatedbudget || row.budget || 0);
    const actual = parseFloat(row.actualbudget || 0);

    // Locations (child projects)
    const locationsResult = await pool.query(
      'SELECT id, name, sitelocation, status, progress FROM projects WHERE parent_project_id = $1',
      [id]
    );

    res.json({
      id: row.id,
      name: row.name,
      status: row.status,
      type: row.type,
      progress: row.progress || 0,
      budget: { planned, actual, variance: actual - planned },
      tasks: {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        notStarted: tasks.filter(t => t.status === 'not-started').length
      },
      phaseStats,
      priorityStats,
      ragStats,
      hours: { estimated: totalEstimated },
      overdueTasks,
      locations: locationsResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        location: r.sitelocation,
        status: r.status,
        progress: r.progress || 0
      }))
    });
  } catch (error) {
    console.error('Project report error:', error);
    res.status(500).json({ error: 'Failed to generate project report' });
  }
});

// GET /reports/user/:userId - IC-level task/hours summary
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user info
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [parseInt(userId)]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];
    const userName = user.name;

    // Find all tasks assigned to this user across all projects
    const taskResult = await pool.query(`
      SELECT p.id AS project_id, p.name AS project_name, t.*
      FROM projects p, jsonb_array_elements(p.tasks) AS t
      WHERE parent_project_id IS NULL
        AND LOWER(t->>'assignee') = LOWER($1)
    `, [userName]);

    const tasks = taskResult.rows.map(row => ({
      projectId: row.project_id,
      projectName: row.project_name,
      id: row.t?.id || row.value?.id,
      ...row.t,
      ...(row.value || {})
    }));

    // Parse the JSONB task data properly
    const parsedTasks = taskResult.rows.map(row => {
      const task = typeof row.t === 'string' ? JSON.parse(row.t) : row.t;
      return {
        projectId: row.project_id,
        projectName: row.project_name,
        ...task
      };
    });

    const now = new Date();
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const completed = parsedTasks.filter(t => t.status === 'completed');
    const active = parsedTasks.filter(t => t.status !== 'completed');
    const dueSoon = active.filter(t => t.endDate && new Date(t.endDate) <= sevenDaysOut && new Date(t.endDate) >= now);
    const overdue = active.filter(t => t.endDate && new Date(t.endDate) < now);

    const totalEstimatedHours = parsedTasks.reduce((sum, t) => sum + (parseFloat(t.estimatedHours) || 0), 0);
    const completedHours = completed.reduce((sum, t) => sum + (parseFloat(t.estimatedHours) || 0), 0);

    res.json({
      user: { id: user.id, name: userName, email: user.email },
      summary: {
        totalTasks: parsedTasks.length,
        completed: completed.length,
        active: active.length,
        dueSoon: dueSoon.length,
        overdue: overdue.length,
        estimatedHours: totalEstimatedHours,
        completedHours: completedHours
      },
      tasks: parsedTasks.map(t => ({
        id: t.id,
        name: t.name,
        projectId: t.projectId,
        projectName: t.projectName,
        status: t.status,
        priority: t.priority,
        phase: t.phase,
        endDate: t.endDate,
        estimatedHours: t.estimatedHours
      })),
      dueSoon: dueSoon.map(t => ({ id: t.id, name: t.name, projectName: t.projectName, endDate: t.endDate })),
      overdue: overdue.map(t => ({ id: t.id, name: t.name, projectName: t.projectName, endDate: t.endDate }))
    });
  } catch (error) {
    console.error('User report error:', error);
    res.status(500).json({ error: 'Failed to generate user report' });
  }
});

// GET /reports/budget - Budget health across portfolio
router.get('/budget', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, name, type, status, businessline,
        COALESCE(estimatedbudget, budget, 0) AS planned,
        COALESCE(actualbudget, 0) AS actual
      FROM projects
      WHERE parent_project_id IS NULL
        AND COALESCE(estimatedbudget, budget, 0) > 0
      ORDER BY COALESCE(actualbudget, 0) - COALESCE(estimatedbudget, budget, 0) DESC
    `);

    const projects = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      status: r.status,
      businessLine: r.businessline,
      planned: parseFloat(r.planned),
      actual: parseFloat(r.actual),
      variance: parseFloat(r.actual) - parseFloat(r.planned),
      variancePercent: parseFloat(r.planned) > 0
        ? Math.round(((parseFloat(r.actual) - parseFloat(r.planned)) / parseFloat(r.planned)) * 100)
        : 0
    }));

    const totalPlanned = projects.reduce((sum, p) => sum + p.planned, 0);
    const totalActual = projects.reduce((sum, p) => sum + p.actual, 0);

    res.json({
      totals: {
        planned: totalPlanned,
        actual: totalActual,
        variance: totalActual - totalPlanned,
        variancePercent: totalPlanned > 0 ? Math.round(((totalActual - totalPlanned) / totalPlanned) * 100) : 0
      },
      projects,
      overBudget: projects.filter(p => p.variance > 0),
      underBudget: projects.filter(p => p.variance < 0)
    });
  } catch (error) {
    console.error('Budget report error:', error);
    res.status(500).json({ error: 'Failed to generate budget report' });
  }
});

// GET /reports/timeline - Milestone/deadline tracking
router.get('/timeline', async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Projects with upcoming due dates
    const upcomingResult = await pool.query(`
      SELECT id, name, type, status, duedate, progress
      FROM projects
      WHERE parent_project_id IS NULL
        AND status IN ('active', 'in-progress', 'planning')
        AND duedate IS NOT NULL
      ORDER BY duedate ASC
    `);

    // Recently completed
    const completedResult = await pool.query(`
      SELECT id, name, type, duedate, updated_at
      FROM projects
      WHERE parent_project_id IS NULL
        AND status = 'completed'
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    // Overdue projects
    const overdueResult = await pool.query(`
      SELECT id, name, type, status, duedate, progress
      FROM projects
      WHERE parent_project_id IS NULL
        AND status IN ('active', 'in-progress')
        AND duedate IS NOT NULL
        AND duedate < NOW()
      ORDER BY duedate ASC
    `);

    res.json({
      upcoming: upcomingResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        status: r.status,
        dueDate: r.duedate,
        progress: r.progress || 0,
        daysUntilDue: r.duedate ? Math.ceil((new Date(r.duedate) - now) / (1000 * 60 * 60 * 24)) : null
      })),
      recentlyCompleted: completedResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        dueDate: r.duedate,
        completedAt: r.updated_at
      })),
      overdue: overdueResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        status: r.status,
        dueDate: r.duedate,
        progress: r.progress || 0,
        daysOverdue: Math.ceil((now - new Date(r.duedate)) / (1000 * 60 * 60 * 24))
      }))
    });
  } catch (error) {
    console.error('Timeline report error:', error);
    res.status(500).json({ error: 'Failed to generate timeline report' });
  }
});

module.exports = router;
