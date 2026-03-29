// Admin types

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  Role?: { name: string; displayName: string };
  preferences?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Role {
  id: string | number;
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  priority?: number;
  userCount?: number;
  isSystem?: boolean;
}

export interface PermissionItem {
  key: string;
  name: string;
}

export interface PermissionCategory {
  name: string;
  permissions: PermissionItem[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource?: string;
  details?: string;
  projectId?: string;
  taskId?: string;
  category?: string;
  severity?: 'info' | 'warning' | 'critical';
  ipAddress?: string;
}

export interface AuditFilters {
  category: string | null;
  severity: string | null;
  fromDate: number | null;
  toDate: number | null;
}

export interface FinancialSettings {
  breakfixBudget: number;
  breakfixWarningThreshold: number;
  refreshBudget: number;
  refreshWarningThreshold: number;
  budgetReportingPeriod: string;
  currencyFormat: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export const VALID_ROLES = ['superadmin', 'admin', 'owner', 'project_manager', 'field_ops', 'auditor', 'viewer'] as const;

export const PERMISSION_LABELS: Record<string, string> = {
  '*': 'Full Access (All Permissions)',
  'projects.view': 'View Projects',
  'projects.edit': 'Edit Projects',
  'projects.delete': 'Delete Projects',
  'projects.read.assigned': 'View Assigned Projects',
  'projects.read.public': 'View Public Projects',
  'tasks.view': 'View Tasks',
  'tasks.edit': 'Edit Tasks',
  'tasks.delete': 'Delete Tasks',
  'tasks.update.assigned': 'Update Assigned Tasks',
  'tasks.notes.view': 'View Task Notes',
  'tasks.notes.add': 'Add Task Notes',
  'reports.read': 'View Reports',
  'reports.read.basic': 'View Basic Reports',
  'audit.read': 'View Audit Log',
  'settings.manage': 'Manage System Settings',
  'roles.manage': 'Manage Roles',
  'team.manage': 'Manage Team',
  'fieldops.timeentry': 'Field Ops Time Entry',
};

export const AUDIT_CATEGORIES = [
  { label: 'All Categories', value: '' },
  { label: 'General', value: 'general' },
  { label: 'Authentication', value: 'auth' },
  { label: 'User Management', value: 'user' },
  { label: 'Projects', value: 'project' },
  { label: 'Administration', value: 'admin' },
  { label: 'Security', value: 'security' },
  { label: 'System', value: 'system' },
] as const;

export const AUDIT_SEVERITIES = [
  { label: 'All Severities', value: '' },
  { label: 'Info', value: 'info' },
  { label: 'Warning', value: 'warning' },
  { label: 'Critical', value: 'critical' },
] as const;
