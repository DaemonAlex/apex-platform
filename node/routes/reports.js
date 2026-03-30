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

// GET /reports/my-projects - Projects where the user has assigned tasks
router.get('/my-projects', async (req, res) => {
  try {
    let userName = req.user?.name || '';
    if (!userName && req.user?.userId) {
      const u = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
      userName = u.rows[0]?.name || '';
    }
    if (!userName) return res.json({ projects: [] });

    const result = await pool.query(`
      SELECT id, name, status, type, sitelocation, progress, duedate, tasks, project_manager
      FROM projects
      WHERE parent_project_id IS NULL
        AND status IN ('active', 'in-progress', 'planning', 'scheduled', 'on-hold')
    `);

    const myProjects = [];
    for (const row of result.rows) {
      const tasks = typeof row.tasks === 'string' ? JSON.parse(row.tasks) : (row.tasks || []);
      const myTasks = tasks.filter(t => t.assignee === userName && t.status !== 'completed');
      const isPM = row.project_manager === userName;
      if (myTasks.length === 0 && !isPM) continue;

      const overdueTasks = myTasks.filter(t => t.endDate && new Date(t.endDate) < new Date());
      const nextTask = myTasks
        .filter(t => t.endDate)
        .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0];

      myProjects.push({
        id: row.id, name: row.name, status: row.status, type: row.type,
        siteLocation: row.sitelocation, progress: row.progress || 0,
        dueDate: row.duedate,
        isPM: isPM,
        myTaskCount: myTasks.length,
        myOverdueCount: overdueTasks.length,
        nextTaskName: nextTask?.name || null,
        nextTaskDue: nextTask?.endDate || null,
      });
    }

    // Sort: projects with overdue tasks first, then by next due date
    myProjects.sort((a, b) => {
      if (a.myOverdueCount > 0 && b.myOverdueCount === 0) return -1;
      if (a.myOverdueCount === 0 && b.myOverdueCount > 0) return 1;
      if (a.nextTaskDue && b.nextTaskDue) return new Date(a.nextTaskDue).getTime() - new Date(b.nextTaskDue).getTime();
      return 0;
    });

    res.json({ projects: myProjects });
  } catch (error) {
    console.error('My projects error:', error);
    res.status(500).json({ error: 'Failed to fetch my projects' });
  }
});

// GET /reports/action-queue - Cross-project urgency view from real task data
router.get('/action-queue', async (req, res) => {
  try {
    const now = new Date();
    const result = await pool.query(`
      SELECT id, name, status, type, sitelocation, duedate, tasks
      FROM projects
      WHERE parent_project_id IS NULL
        AND status IN ('active', 'in-progress', 'planning', 'scheduled')
    `);

    const items = [];

    for (const project of result.rows) {
      const tasks = typeof project.tasks === 'string' ? JSON.parse(project.tasks) : (project.tasks || []);

      for (const task of tasks) {
        if (task.status === 'completed') continue;
        if (!task.endDate) continue;

        const due = new Date(task.endDate);
        const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Calculate urgency
        let urgency = 'normal';
        if (daysUntil < 0) urgency = 'overdue';
        else if (daysUntil <= 2) urgency = 'critical';
        else if (daysUntil <= 7) urgency = 'soon';

        // Only surface items that need attention (overdue, critical, or soon)
        if (urgency === 'normal') continue;

        // Check for prerequisites
        const prereqs = task.prerequisites || [];
        const blockedPrereqs = prereqs.filter(p => p.status !== 'completed');

        items.push({
          projectId: project.id,
          projectName: project.name,
          projectType: project.type,
          siteLocation: project.sitelocation,
          taskId: task.id,
          taskName: task.name,
          taskStatus: task.status,
          assignee: task.assignee || null,
          priority: task.priority || null,
          phase: task.phase || null,
          dueDate: task.endDate,
          daysUntil,
          urgency,
          ragStatus: task.ragStatus || null,
          notes: task.notes || null,
          prerequisites: prereqs,
          blockedBy: blockedPrereqs.length > 0 ? blockedPrereqs.map(p => p.name).join(', ') : null,
          isBlocked: blockedPrereqs.length > 0,
        });
      }
    }

    // Sort: overdue first, then by days until due
    items.sort((a, b) => {
      const urgencyOrder = { overdue: 0, critical: 1, soon: 2, normal: 3 };
      if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      return a.daysUntil - b.daysUntil;
    });

    res.json({
      items,
      summary: {
        overdue: items.filter(i => i.urgency === 'overdue').length,
        critical: items.filter(i => i.urgency === 'critical').length,
        soon: items.filter(i => i.urgency === 'soon').length,
        blocked: items.filter(i => i.isBlocked).length,
        total: items.length,
      },
    });
  } catch (error) {
    console.error('Action queue error:', error);
    res.status(500).json({ error: 'Failed to generate action queue' });
  }
});

// GET /reports/custom - Flexible report builder endpoint
router.get('/custom', async (req, res) => {
  try {
    const { source, groupBy, metric, status, type, businessLine, from, to, assignee, client, priority } = req.query;
    const dataSource = source || 'projects';

    if (dataSource === 'projects') {
      let where = 'WHERE parent_project_id IS NULL';
      const params = [];
      let i = 0;
      if (status) { where += ` AND status = $${++i}`; params.push(status); }
      if (type) { where += ` AND type = $${++i}`; params.push(type); }
      if (businessLine) { where += ` AND businessline = $${++i}`; params.push(businessLine); }
      if (client) { where += ` AND client ILIKE $${++i}`; params.push('%' + client + '%'); }
      if (priority) { where += ` AND priority = $${++i}`; params.push(priority); }
      if (from) { where += ` AND created_at >= $${++i}`; params.push(from); }
      if (to) { where += ` AND created_at <= $${++i}`; params.push(to); }

      const groupCol = {
        status: 'status', type: 'type', businessLine: 'businessline',
        client: 'client', priority: 'priority', costCenter: 'costcenter',
        siteLocation: 'sitelocation',
        month: "TO_CHAR(created_at, 'YYYY-MM')",
        quarter: "TO_CHAR(created_at, 'YYYY-\"Q\"Q')",
        year: "TO_CHAR(created_at, 'YYYY')",
      }[groupBy] || 'status';

      const metricSql = {
        budget: 'COALESCE(SUM(estimatedbudget), 0) as metric_value, COUNT(*) as count',
        actual: 'COALESCE(SUM(actualbudget), 0) as metric_value, COUNT(*) as count',
        variance: 'COALESCE(SUM(actualbudget - estimatedbudget), 0) as metric_value, COUNT(*) as count',
        avgProgress: 'ROUND(AVG(COALESCE(progress, 0))) as metric_value, COUNT(*) as count',
        taskCount: 'SUM(jsonb_array_length(COALESCE(tasks, \'[]\'::jsonb))) as metric_value, COUNT(*) as count',
      }[metric] || 'COUNT(*) as metric_value, COUNT(*) as count';

      const result = await pool.query(`
        SELECT ${groupCol} as group_key, ${metricSql}
        FROM projects ${where}
        GROUP BY group_key ORDER BY metric_value DESC
      `, params);

      const rows = await pool.query(`
        SELECT id, name, status, type, businessline, client, priority, costcenter, sitelocation,
               estimatedbudget, actualbudget, progress, startdate, enddate, duedate, requestdate,
               purchaseorder, jsonb_array_length(COALESCE(tasks, '[]'::jsonb)) as task_count,
               created_at, updated_at
        FROM projects ${where}
        ORDER BY created_at DESC LIMIT 200
      `, params);

      res.json({
        source: 'projects', groupBy: groupBy || 'status', metric: metric || 'count',
        groups: result.rows.map(r => ({
          key: r.group_key || 'Unknown', value: parseFloat(r.metric_value), count: parseInt(r.count),
        })),
        rows: rows.rows.map(r => ({
          id: r.id, name: r.name, status: r.status, type: r.type,
          businessLine: r.businessline, client: r.client, priority: r.priority,
          costCenter: r.costcenter, siteLocation: r.sitelocation,
          budget: parseFloat(r.estimatedbudget || 0), actual: parseFloat(r.actualbudget || 0),
          variance: parseFloat(r.actualbudget || 0) - parseFloat(r.estimatedbudget || 0),
          progress: r.progress || 0, taskCount: parseInt(r.task_count || 0),
          startDate: r.startdate, endDate: r.enddate, dueDate: r.duedate,
          requestDate: r.requestdate, purchaseOrder: r.purchaseorder,
          createdAt: r.created_at, updatedAt: r.updated_at,
        })),
        total: rows.rows.length,
      });

    } else if (dataSource === 'fieldops') {
      let where = 'WHERE 1=1';
      const params = [];
      let i = 0;
      if (status) { where += ` AND status = $${++i}`; params.push(status); }
      if (type) { where += ` AND type = $${++i}`; params.push(type); }
      if (assignee) { where += ` AND assignee ILIKE $${++i}`; params.push('%' + assignee + '%'); }
      if (from) { where += ` AND scheduled_date >= $${++i}`; params.push(from); }
      if (to) { where += ` AND scheduled_date <= $${++i}`; params.push(to); }

      const groupCol = {
        status: 'status', type: 'type', assignee: 'assignee',
        month: "TO_CHAR(scheduled_date, 'YYYY-MM')",
        location: 'location', project: 'project_name',
        completedBy: 'completed_by',
      }[groupBy] || 'status';

      const metricSql = metric === 'duration'
        ? 'COALESCE(SUM(estimated_duration), 0) as metric_value, COUNT(*) as count'
        : 'COUNT(*) as metric_value, COUNT(*) as count';

      const result = await pool.query(`
        SELECT ${groupCol} as group_key, ${metricSql}
        FROM fieldops ${where} GROUP BY group_key ORDER BY metric_value DESC
      `, params);

      const rows = await pool.query(`
        SELECT f.id, f.task_name, f.project_name, f.project_id, f.type, f.status,
               f.assignee, f.location, f.scheduled_date, f.start_time, f.end_time,
               f.estimated_duration, f.completed_at, f.completed_by, f.created_at,
               (SELECT COUNT(*) FROM FieldOpNotes n WHERE n.fieldop_id = f.id) as note_count
        FROM fieldops f ${where} ORDER BY scheduled_date DESC LIMIT 200
      `, params);

      res.json({
        source: 'fieldops', groupBy: groupBy || 'status', metric: metric || 'count',
        groups: result.rows.map(r => ({
          key: r.group_key || 'Unknown', value: parseInt(r.metric_value), count: parseInt(r.count),
        })),
        rows: rows.rows.map(r => ({
          id: r.id, name: r.task_name, projectName: r.project_name, projectId: r.project_id,
          type: r.type, status: r.status, assignee: r.assignee, location: r.location,
          date: r.scheduled_date, startTime: r.start_time, endTime: r.end_time,
          duration: r.estimated_duration, completedAt: r.completed_at,
          completedBy: r.completed_by, noteCount: parseInt(r.note_count || 0),
          createdAt: r.created_at,
        })),
        total: rows.rows.length,
      });

    } else if (dataSource === 'rooms') {
      const result = await pool.query(`
        SELECT r.room_id, r.name, r.room_type, r.location, r.capacity,
               r.check_frequency, l.name as loc_name, f.name as floor_name,
               s.name as standard_name,
               lc.rag_status, lc.checked_at as last_checked,
               (SELECT COUNT(*) FROM RoomEquipment e WHERE e.room_id = r.room_id AND e.status = 'active') as equip_count,
               (SELECT COUNT(*) FROM RoomCheckHistory h WHERE h.room_id = r.room_id) as check_count
        FROM Rooms r
        LEFT JOIN Locations l ON r.location_id = l.id
        LEFT JOIN Floors f ON r.floor_id = f.id
        LEFT JOIN RoomStandards s ON r.standard_id = s.id
        LEFT JOIN LATERAL (
          SELECT rag_status, checked_at FROM RoomCheckHistory
          WHERE room_id = r.room_id ORDER BY checked_at DESC LIMIT 1
        ) lc ON true
        WHERE r.deleted_at IS NULL
        ORDER BY l.name, f.name, r.name
      `);

      const gcol = { location: 'loc_name', type: 'room_type', status: 'rag_status',
        standard: 'standard_name', floor: 'floor_name', frequency: 'check_frequency' }[groupBy] || 'loc_name';
      const groups = {};
      result.rows.forEach(r => {
        const key = r[gcol] || 'Unknown';
        if (!groups[key]) groups[key] = { count: 0 };
        groups[key].count++;
      });

      res.json({
        source: 'rooms', groupBy: groupBy || 'location', metric: 'count',
        groups: Object.entries(groups).map(([key, val]) => ({ key, value: val.count, count: val.count })).sort((a, b) => b.value - a.value),
        rows: result.rows.map(r => ({
          id: r.room_id, name: r.name, type: r.room_type,
          location: r.loc_name, floor: r.floor_name,
          capacity: r.capacity, standard: r.standard_name,
          frequency: r.check_frequency, equipCount: parseInt(r.equip_count),
          checkCount: parseInt(r.check_count),
          ragStatus: r.rag_status, lastChecked: r.last_checked,
        })),
        total: result.rows.length,
      });

    } else if (dataSource === 'equipment') {
      const result = await pool.query(`
        SELECT e.*, r.name as room_name, r.location, l.name as loc_name
        FROM RoomEquipment e
        JOIN Rooms r ON r.room_id = e.room_id AND r.deleted_at IS NULL
        LEFT JOIN Locations l ON r.location_id = l.id
        WHERE e.status = 'active'
        ORDER BY e.category, e.make, e.model
      `);

      const gcol = { category: 'category', make: 'make', location: 'loc_name', room: 'room_name' }[groupBy] || 'category';
      const groups = {};
      result.rows.forEach(r => {
        const key = r[gcol] || 'Unknown';
        if (!groups[key]) groups[key] = { count: 0 };
        groups[key].count++;
      });

      const warrantyExpiring = result.rows.filter(r => {
        if (!r.warranty_end) return false;
        const diff = new Date(r.warranty_end).getTime() - Date.now();
        return diff > 0 && diff < 90 * 86400000;
      }).length;

      const warrantyExpired = result.rows.filter(r => r.warranty_end && new Date(r.warranty_end) < new Date()).length;

      res.json({
        source: 'equipment', groupBy: groupBy || 'category', metric: 'count',
        groups: Object.entries(groups).map(([key, val]) => ({ key, value: val.count, count: val.count })).sort((a, b) => b.value - a.value),
        rows: result.rows.map(r => ({
          id: r.id, category: r.category, make: r.make, model: r.model,
          serialNumber: r.serial_number, firmware: r.firmware_version,
          roomName: r.room_name, location: r.loc_name,
          installDate: r.install_date, warrantyEnd: r.warranty_end,
          warrantyStatus: !r.warranty_end ? 'unknown' : new Date(r.warranty_end) < new Date() ? 'expired' : 'active',
        })),
        total: result.rows.length,
        summary: { warrantyExpiring, warrantyExpired },
      });

    } else if (dataSource === 'vendors') {
      const result = await pool.query(`
        SELECT v.id, v.name, v.type, v.category, v.contacts,
          (SELECT COUNT(*) FROM VendorAssignments va WHERE va.vendor_id = v.id AND va.entity_type = 'project') as project_count,
          (SELECT COUNT(*) FROM VendorAssignments va WHERE va.vendor_id = v.id AND va.entity_type = 'room') as room_count,
          (SELECT COALESCE(SUM(p.estimatedbudget), 0) FROM VendorAssignments va
           JOIN projects p ON p.id = va.entity_id WHERE va.vendor_id = v.id AND va.entity_type = 'project') as total_budget
        FROM Vendors v WHERE v.deleted_at IS NULL ORDER BY v.name
      `);

      const gcol = { type: 'type', category: 'category' }[groupBy] || 'type';
      const groups = {};
      result.rows.forEach(r => {
        const key = r[gcol] || 'Unknown';
        if (!groups[key]) groups[key] = { count: 0 };
        groups[key].count++;
      });

      res.json({
        source: 'vendors', groupBy: groupBy || 'type', metric: 'count',
        groups: Object.entries(groups).map(([key, val]) => ({ key, value: val.count, count: val.count })).sort((a, b) => b.value - a.value),
        rows: result.rows.map(r => ({
          id: r.id, name: r.name, type: r.type, category: r.category,
          contactCount: (r.contacts || []).length,
          projectCount: parseInt(r.project_count), roomCount: parseInt(r.room_count),
          totalBudget: parseFloat(r.total_budget || 0),
        })),
        total: result.rows.length,
      });

    } else {
      res.status(400).json({ error: 'Invalid source. Use: projects, fieldops, rooms, equipment, vendors' });
    }
  } catch (error) {
    console.error('Custom report error:', error);
    res.status(500).json({ error: 'Failed to generate custom report', details: error.message });
  }
});

module.exports = router;
