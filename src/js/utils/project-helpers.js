/**
 * APEX Project Helper Functions
 * Pure utility functions for project data manipulation
 * No DOM dependencies - can be used anywhere
 */

/**
 * Safely convert value to array
 */
export function toArrayMaybe(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (v && typeof v === 'object') return Object.values(v);
  return [];
}

/**
 * Get tasks array from a project object
 */
export function getTasks(project) {
  try {
    return toArrayMaybe(project?.tasks);
  } catch {
    return [];
  }
}

/**
 * Normalize project object ensuring tasks is always an array
 */
export function normalizeProject(project) {
  try {
    return { ...project, tasks: getTasks(project) };
  } catch {
    return { ...project, tasks: [] };
  }
}

/**
 * Calculate project progress based on task completion
 */
export function calculateProjectProgress(project) {
  const tasks = getTasks(project);
  if (tasks.length === 0) return 0;

  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress').length;

  // Give partial credit for in-progress tasks
  const totalProgress = completedTasks + (inProgressTasks * 0.5);
  return Math.round((totalProgress / tasks.length) * 100);
}

/**
 * Calculate project status based on task states
 */
export function calculateProjectStatus(project) {
  const tasks = getTasks(project);
  if (tasks.length === 0) {
    return project.status || 'draft';
  }

  const completedTasks = tasks.filter(task => task.status === 'completed').length;
  const inProgressTasks = tasks.filter(task => task.status === 'in-progress').length;
  const onHoldTasks = tasks.filter(task => task.status === 'on-hold').length;
  const notStartedTasks = tasks.filter(task => task.status === 'not-started').length;

  if (completedTasks === tasks.length) {
    return 'completed';
  } else if (inProgressTasks > 0) {
    return 'active';
  } else if (onHoldTasks === tasks.length) {
    return 'on-hold';
  } else if (notStartedTasks === tasks.length) {
    return project.status === 'completed' ? 'active' : project.status || 'draft';
  } else {
    return 'active';
  }
}

/**
 * Get color for progress percentage
 */
export function getProgressColor(progress) {
  if (progress >= 75) return '#10b981'; // green
  if (progress >= 50) return '#3b82f6'; // blue
  if (progress >= 25) return '#f59e0b'; // yellow
  return '#ef4444'; // red
}

/**
 * Get RAG status color
 */
export function getRagColor(status) {
  const colors = {
    green: '#22c55e',
    yellow: '#f59e0b',
    red: '#ef4444',
    gray: '#9ca3af'
  };
  return colors[status?.toLowerCase()] || colors.gray;
}

/**
 * Get status badge color
 */
export function getStatusColor(status) {
  const colors = {
    'active': '#22c55e',
    'in-progress': '#3b82f6',
    'completed': '#10b981',
    'on-hold': '#f59e0b',
    'cancelled': '#ef4444',
    'draft': '#9ca3af',
    'not-started': '#6b7280'
  };
  return colors[status?.toLowerCase()] || colors.draft;
}

/**
 * Format status string for display
 */
export function formatStatus(status) {
  if (status === null || status === undefined || status === '' ||
      status === 'null' || status === 'undefined') {
    return 'Not Started';
  }

  let safeStatus = '';
  try {
    if (typeof status === 'string') {
      safeStatus = status;
    } else if (typeof status === 'number') {
      safeStatus = status.toString();
    } else if (typeof status === 'boolean') {
      safeStatus = status ? 'true' : 'false';
    } else if (status && typeof status.toString === 'function') {
      safeStatus = status.toString();
    } else {
      safeStatus = String(status || '');
    }
  } catch {
    return 'Error';
  }

  safeStatus = (safeStatus || '').trim();
  if (!safeStatus || safeStatus.length === 0) {
    return 'Not Started';
  }

  try {
    const firstChar = safeStatus.length > 0 ? safeStatus.slice(0, 1) : '';
    const restChars = safeStatus.length > 1 ? safeStatus.slice(1) : '';
    const firstLetter = firstChar ? firstChar.toUpperCase() : '';
    const restLetters = restChars ? restChars.replace(/-/g, ' ') : '';
    return firstLetter + restLetters;
  } catch {
    return 'Status Error';
  }
}

/**
 * Format project type for display
 */
export function formatProjectType(type) {
  const typeMap = {
    'new-build': 'New Build',
    'upgrade': 'Upgrade',
    'breakfix': 'BreakFix',
    'refresh': 'Refresh',
    'custom': 'Custom Project'
  };
  return typeMap[type] || type || 'Unknown';
}

/**
 * Format business line for display
 */
export function formatBusinessLine(businessLine) {
  if (!businessLine) return 'N/A';
  return businessLine
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Calculate task aggregates for a task with subtasks
 */
export function calculateTaskAggregates(task) {
  if (!task.subtasks || task.subtasks.length === 0) {
    return {
      estimatedHours: task.estimatedHours || 0,
      actualHours: task.actualHours || 0,
      progress: task.status === 'completed' ? 100 : 0
    };
  }

  let totalEstimated = 0;
  let totalActual = 0;
  let totalProgress = 0;

  task.subtasks.forEach(subtask => {
    const subAggregates = calculateTaskAggregates(subtask);
    totalEstimated += subAggregates.estimatedHours;
    totalActual += subAggregates.actualHours;
    totalProgress += subAggregates.progress;
  });

  return {
    estimatedHours: totalEstimated,
    actualHours: totalActual,
    progress: Math.round(totalProgress / task.subtasks.length)
  };
}

/**
 * Calculate project health (RAG status)
 */
export function calculateProjectHealth(project) {
  const tasks = getTasks(project);

  // No tasks = gray/unknown
  if (tasks.length === 0) return 'gray';

  // Check for any red flags
  const hasOverdue = tasks.some(task => {
    if (!task.endDate || task.status === 'completed') return false;
    return new Date(task.endDate) < new Date();
  });

  const hasRedTasks = tasks.some(task =>
    task.ragStatus?.toLowerCase() === 'red'
  );

  if (hasOverdue || hasRedTasks) return 'red';

  // Check for yellow flags
  const hasYellowTasks = tasks.some(task =>
    task.ragStatus?.toLowerCase() === 'yellow'
  );

  const progress = calculateProjectProgress(project);
  const isSlipping = progress < 25 && project.status === 'active';

  if (hasYellowTasks || isSlipping) return 'yellow';

  return 'green';
}

/**
 * Get default tasks for a project type
 */
export function getDefaultTasksForType(projectType) {
  const defaultTasks = {
    'new-build': [
      { name: 'Site Survey', phase: 1, estimatedHours: 8 },
      { name: 'Design Review', phase: 1, estimatedHours: 16 },
      { name: 'Equipment Procurement', phase: 2, estimatedHours: 24 },
      { name: 'Installation', phase: 2, estimatedHours: 40 },
      { name: 'Testing & Commissioning', phase: 3, estimatedHours: 16 },
      { name: 'Training', phase: 4, estimatedHours: 8 },
      { name: 'Documentation', phase: 4, estimatedHours: 8 }
    ],
    'upgrade': [
      { name: 'Assessment', phase: 1, estimatedHours: 4 },
      { name: 'Planning', phase: 1, estimatedHours: 8 },
      { name: 'Upgrade Execution', phase: 2, estimatedHours: 16 },
      { name: 'Testing', phase: 3, estimatedHours: 8 },
      { name: 'Sign-off', phase: 4, estimatedHours: 2 }
    ],
    'breakfix': [
      { name: 'Diagnosis', phase: 1, estimatedHours: 2 },
      { name: 'Parts Sourcing', phase: 1, estimatedHours: 4 },
      { name: 'Repair', phase: 2, estimatedHours: 8 },
      { name: 'Verification', phase: 3, estimatedHours: 2 }
    ],
    'refresh': [
      { name: 'Inventory', phase: 1, estimatedHours: 4 },
      { name: 'Replacement Planning', phase: 1, estimatedHours: 8 },
      { name: 'Swap Out', phase: 2, estimatedHours: 16 },
      { name: 'Testing', phase: 3, estimatedHours: 4 },
      { name: 'Disposal', phase: 4, estimatedHours: 4 }
    ]
  };

  return defaultTasks[projectType] || defaultTasks['new-build'];
}

/**
 * Sort projects by various criteria
 */
export function sortProjects(projects, sortBy = 'created_at', order = 'desc') {
  const sorted = [...projects];

  sorted.sort((a, b) => {
    let aVal, bVal;

    switch (sortBy) {
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        break;
      case 'progress':
        aVal = calculateProjectProgress(a);
        bVal = calculateProjectProgress(b);
        break;
      case 'budget':
        aVal = a.estimatedBudget || a.budget || 0;
        bVal = b.estimatedBudget || b.budget || 0;
        break;
      case 'startDate':
        aVal = new Date(a.startDate || 0);
        bVal = new Date(b.startDate || 0);
        break;
      case 'endDate':
        aVal = new Date(a.endDate || 0);
        bVal = new Date(b.endDate || 0);
        break;
      case 'created_at':
      default:
        aVal = new Date(a.created_at || 0);
        bVal = new Date(b.created_at || 0);
        break;
    }

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}

/**
 * Filter projects by search query
 */
export function filterProjectsBySearch(projects, query) {
  if (!query || query.trim() === '') return projects;

  const searchLower = query.toLowerCase().trim();

  return projects.filter(project => {
    const searchableFields = [
      project.id,
      project.name,
      project.client,
      project.description,
      project.siteLocation,
      project.businessLine
    ];

    return searchableFields.some(field =>
      field && String(field).toLowerCase().includes(searchLower)
    );
  });
}

/**
 * Filter projects by status
 */
export function filterProjectsByStatus(projects, status) {
  if (!status || status === 'all') return projects;
  return projects.filter(project => project.status === status);
}

/**
 * Get project statistics
 */
export function getProjectStats(projects) {
  const total = projects.length;
  const byStatus = {
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    onHold: projects.filter(p => p.status === 'on-hold').length,
    draft: projects.filter(p => p.status === 'draft').length
  };

  const totalBudget = projects.reduce((sum, p) =>
    sum + (p.estimatedBudget || p.budget || 0), 0
  );

  const totalActual = projects.reduce((sum, p) =>
    sum + (p.actualBudget || 0), 0
  );

  const avgProgress = total > 0
    ? Math.round(projects.reduce((sum, p) =>
        sum + calculateProjectProgress(p), 0) / total)
    : 0;

  return {
    total,
    byStatus,
    totalBudget,
    totalActual,
    budgetVariance: totalActual - totalBudget,
    avgProgress
  };
}
