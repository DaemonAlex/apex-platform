import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiFetch } from '../composables/useApi';
import type { User, Role, PermissionCategory, AuditEntry, AuditFilters, Pagination } from '../types/admin';

export const useAdminStore = defineStore('admin', () => {
  // Users state
  const users = ref<User[]>([]);
  const usersLoading = ref(false);
  const userSearch = ref('');
  const userRoleFilter = ref<string | null>(null);

  // Roles state
  const roles = ref<Role[]>([]);
  const rolesLoading = ref(false);
  const permissionCatalog = ref<PermissionCategory[]>([]);

  // Settings state
  const settings = ref<Record<string, any>>({});
  const settingsLoading = ref(false);

  // Audit state
  const auditEntries = ref<AuditEntry[]>([]);
  const auditLoading = ref(false);
  const auditFilters = ref<AuditFilters>({
    category: null,
    severity: null,
    fromDate: null,
    toDate: null,
  });
  const auditPagination = ref<Pagination>({ page: 1, limit: 50, total: 0 });

  // Computed
  const filteredUsers = computed(() => {
    let result = users.value;
    if (userSearch.value) {
      const q = userSearch.value.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (userRoleFilter.value) {
      result = result.filter(u => (u.Role?.name || u.role) === userRoleFilter.value);
    }
    return result;
  });

  const roleOptions = computed(() =>
    roles.value.map(r => ({ label: r.displayName, value: r.name }))
  );

  // ---------- User actions ----------
  async function fetchUsers() {
    usersLoading.value = true;
    try {
      const data = await apiFetch<{ users: User[] }>('/users');
      users.value = data.users;
    } finally {
      usersLoading.value = false;
    }
  }

  async function createUser(payload: { name: string; email: string; password: string; role: string }) {
    await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
    await fetchUsers();
  }

  async function updateUser(id: number, payload: { name: string; email: string; role: string }) {
    await apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    await fetchUsers();
  }

  async function deleteUser(id: number) {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
    await fetchUsers();
  }

  async function resetPassword(id: number): Promise<string> {
    const data = await apiFetch<{ temporaryPassword: string }>(`/users/${id}/reset-password`, { method: 'POST' });
    return data.temporaryPassword;
  }

  // ---------- Role actions ----------
  async function fetchRoles() {
    rolesLoading.value = true;
    try {
      const data = await apiFetch<Role[]>('/roles');
      roles.value = data;
    } finally {
      rolesLoading.value = false;
    }
  }

  async function fetchPermissionCatalog() {
    try {
      const data = await apiFetch<{ categories: PermissionCategory[] }>('/roles/permissions');
      permissionCatalog.value = data.categories;
    } catch {
      // Fallback catalog if endpoint fails
      permissionCatalog.value = [
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
    }
  }

  async function createRole(payload: { name: string; displayName: string; permissions: string[] }) {
    await apiFetch('/roles', { method: 'POST', body: JSON.stringify(payload) });
    await fetchRoles();
  }

  async function updateRole(id: string | number, payload: { name: string; displayName: string; permissions: string[] }) {
    await apiFetch(`/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    await fetchRoles();
  }

  async function deleteRole(id: string | number) {
    await apiFetch(`/roles/${id}`, { method: 'DELETE' });
    await fetchRoles();
  }

  // ---------- Settings actions ----------
  async function fetchSettings() {
    settingsLoading.value = true;
    try {
      const data = await apiFetch<Record<string, any>>('/settings');
      settings.value = data;
    } finally {
      settingsLoading.value = false;
    }
  }

  async function saveSetting(key: string, value: any) {
    await apiFetch(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) });
    settings.value[key] = value;
  }

  // ---------- Audit actions ----------
  async function fetchAuditLog() {
    auditLoading.value = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', String(auditPagination.value.limit));
      params.set('offset', String((auditPagination.value.page - 1) * auditPagination.value.limit));
      if (auditFilters.value.category) params.set('category', auditFilters.value.category);
      if (auditFilters.value.severity) params.set('severity', auditFilters.value.severity);
      if (auditFilters.value.fromDate) params.set('fromDate', new Date(auditFilters.value.fromDate).toISOString());
      if (auditFilters.value.toDate) params.set('toDate', new Date(auditFilters.value.toDate).toISOString());

      const data = await apiFetch<{ auditLog: AuditEntry[]; total: number }>(`/audit/log?${params}`);
      auditEntries.value = data.auditLog;
      auditPagination.value.total = data.total;
    } finally {
      auditLoading.value = false;
    }
  }

  function exportAuditCsv() {
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Category', 'Severity', 'Details', 'IP Address'];
    const rows = auditEntries.value.map(e => [
      e.timestamp, e.user, e.action, e.resource || '', e.category || '', e.severity || '', e.details || '', e.ipAddress || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    // Users
    users, usersLoading, userSearch, userRoleFilter, filteredUsers,
    fetchUsers, createUser, updateUser, deleteUser, resetPassword,
    // Roles
    roles, rolesLoading, permissionCatalog, roleOptions,
    fetchRoles, fetchPermissionCatalog, createRole, updateRole, deleteRole,
    // Settings
    settings, settingsLoading,
    fetchSettings, saveSetting,
    // Audit
    auditEntries, auditLoading, auditFilters, auditPagination,
    fetchAuditLog, exportAuditCsv,
  };
});
