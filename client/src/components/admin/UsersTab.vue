<script setup lang="ts">
import { ref, computed, h } from 'vue';
import {
  NDataTable, NInput, NSelect, NButton, NSpace, NTag, NModal,
  NForm, NFormItem, NSpin, NPagination, useMessage, NAlert
} from 'naive-ui';
import type { DataTableColumns, DataTableRowKey } from 'naive-ui';
import { useAdminStore } from '../../stores/admin';
import type { User } from '../../types/admin';
import { VALID_ROLES } from '../../types/admin';

const store = useAdminStore();
const message = useMessage();

// Bulk selection
const checkedRowKeys = ref<DataTableRowKey[]>([]);
const bulkRoleValue = ref<string | null>(null);
const bulkActionLoading = ref(false);

// Pagination
const pageSize = 20;
const currentPage = ref(1);

const paginatedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  return store.filteredUsers.slice(start, start + pageSize);
});

// Create user modal
const showCreateModal = ref(false);
const createForm = ref({ name: '', email: '', password: '', role: 'viewer' });
const createLoading = ref(false);

// Edit user modal
const showEditModal = ref(false);
const editForm = ref({ id: 0, name: '', email: '', role: '' });
const editLoading = ref(false);

// Delete confirmation
const showDeleteModal = ref(false);
const deleteTarget = ref<User | null>(null);
const deleteLoading = ref(false);

// Password reset
const showResetModal = ref(false);
const resetTarget = ref<User | null>(null);
const resetLoading = ref(false);
const showTempPassword = ref(false);
const tempPassword = ref('');

// Password validation
const passwordErrors = computed(() => {
  const pw = createForm.value.password;
  if (!pw) return [];
  const errors: string[] = [];
  if (pw.length < 12) errors.push('At least 12 characters');
  if (!/[A-Z]/.test(pw)) errors.push('One uppercase letter');
  if (!/[a-z]/.test(pw)) errors.push('One lowercase letter');
  if (!/[0-9]/.test(pw)) errors.push('One number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) errors.push('One special character');
  if (/(.)\1{2,}/.test(pw)) errors.push('No 3+ consecutive identical characters');
  if (/123|abc|qwe|asd|zxc/i.test(pw)) errors.push('No common sequences');
  return errors;
});

const passwordValid = computed(() => createForm.value.password.length > 0 && passwordErrors.value.length === 0);

const roleSelectOptions = computed(() =>
  VALID_ROLES.map(r => ({ label: r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value: r }))
);

function formatRole(user: User) {
  return user.Role?.displayName || user.role || 'Unknown';
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Bulk actions
async function bulkDelete() {
  if (!checkedRowKeys.value.length) return;
  bulkActionLoading.value = true;
  let succeeded = 0;
  let failed = 0;
  for (const id of checkedRowKeys.value) {
    try {
      await store.deleteUser(Number(id));
      succeeded++;
    } catch {
      failed++;
    }
  }
  bulkActionLoading.value = false;
  checkedRowKeys.value = [];
  if (failed === 0) {
    message.success(`Deleted ${succeeded} user(s)`);
  } else {
    message.warning(`Deleted ${succeeded}, failed ${failed}`);
  }
}

async function bulkChangeRole() {
  if (!checkedRowKeys.value.length || !bulkRoleValue.value) return;
  bulkActionLoading.value = true;
  let succeeded = 0;
  let failed = 0;
  for (const id of checkedRowKeys.value) {
    try {
      const user = store.users.find(u => u.id === Number(id));
      if (user) {
        await store.updateUser(Number(id), { name: user.name, email: user.email, role: bulkRoleValue.value! });
        succeeded++;
      }
    } catch {
      failed++;
    }
  }
  bulkActionLoading.value = false;
  checkedRowKeys.value = [];
  bulkRoleValue.value = null;
  if (failed === 0) {
    message.success(`Updated role for ${succeeded} user(s)`);
  } else {
    message.warning(`Updated ${succeeded}, failed ${failed}`);
  }
}

// Table columns
const columns: DataTableColumns<User> = [
  { type: 'selection' },
  {
    title: 'User',
    key: 'name',
    render(row) {
      const initials = row.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      return h('div', { style: 'display:flex;align-items:center;gap:10px' }, [
        h('div', {
          style: 'width:32px;height:32px;border-radius:50%;background:#38bdf8;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#fff;flex-shrink:0',
        }, initials),
        h('div', {}, [
          h('div', { style: 'font-weight:500' }, row.name),
        ]),
      ]);
    },
  },
  { title: 'Email', key: 'email' },
  {
    title: 'Role',
    key: 'role',
    width: 160,
    render(row) {
      const roleName = row.Role?.name || row.role || '';
      const type = ['superadmin', 'admin', 'owner'].includes(roleName) ? 'error'
        : roleName === 'project_manager' ? 'info'
        : roleName === 'field_ops' ? 'warning'
        : 'default';
      return h(NTag, { size: 'small', type, bordered: true }, () => formatRole(row));
    },
  },
  {
    title: 'Created',
    key: 'created_at',
    width: 130,
    render(row) { return formatDate(row.created_at); },
  },
  {
    title: 'Actions',
    key: 'actions',
    width: 260,
    render(row) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { size: 'small', secondary: true, onClick: () => openEdit(row) }, () => 'Edit'),
        h(NButton, { size: 'small', secondary: true, onClick: () => openReset(row) }, () => 'Reset Password'),
        h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => openDelete(row) }, () => 'Delete'),
      ]);
    },
  },
];

// Actions
function openEdit(user: User) {
  editForm.value = { id: user.id, name: user.name, email: user.email, role: user.Role?.name || user.role || '' };
  showEditModal.value = true;
}

function openDelete(user: User) {
  deleteTarget.value = user;
  showDeleteModal.value = true;
}

function openReset(user: User) {
  resetTarget.value = user;
  tempPassword.value = '';
  showTempPassword.value = false;
  showResetModal.value = true;
}

async function submitCreate() {
  if (!passwordValid.value) return;
  createLoading.value = true;
  try {
    await store.createUser(createForm.value);
    message.success('User created');
    showCreateModal.value = false;
    createForm.value = { name: '', email: '', password: '', role: 'viewer' };
  } catch (e: any) {
    message.error(e.message || 'Failed to create user');
  } finally {
    createLoading.value = false;
  }
}

async function submitEdit() {
  editLoading.value = true;
  try {
    await store.updateUser(editForm.value.id, {
      name: editForm.value.name,
      email: editForm.value.email,
      role: editForm.value.role,
    });
    message.success('User updated');
    showEditModal.value = false;
  } catch (e: any) {
    message.error(e.message || 'Failed to update user');
  } finally {
    editLoading.value = false;
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteLoading.value = true;
  try {
    await store.deleteUser(deleteTarget.value.id);
    message.success('User deleted');
    showDeleteModal.value = false;
    deleteTarget.value = null;
  } catch (e: any) {
    message.error(e.message || 'Failed to delete user');
  } finally {
    deleteLoading.value = false;
  }
}

async function confirmReset() {
  if (!resetTarget.value) return;
  resetLoading.value = true;
  try {
    tempPassword.value = await store.resetPassword(resetTarget.value.id);
    showTempPassword.value = true;
    message.success('Password reset');
  } catch (e: any) {
    message.error(e.message || 'Failed to reset password');
  } finally {
    resetLoading.value = false;
  }
}

function copyTempPassword() {
  navigator.clipboard.writeText(tempPassword.value);
  message.success('Copied to clipboard');
}
</script>

<template>
  <div>
    <!-- Header bar -->
    <NSpace justify="space-between" align="center" style="margin-bottom: 16px;">
      <NSpace align="center">
        <NInput
          v-model:value="store.userSearch"
          placeholder="Search users..."
          clearable
          style="width: 250px;"
        />
        <NSelect
          v-model:value="store.userRoleFilter"
          :options="[{ label: 'All Roles', value: null as any }, ...roleSelectOptions]"
          placeholder="Filter by role"
          clearable
          style="width: 180px;"
        />
        <span style="color: var(--n-text-color-3, #8890a4); font-size: 13px;">
          Showing {{ paginatedUsers.length }} of {{ store.filteredUsers.length }} users
        </span>
      </NSpace>
      <NButton type="primary" @click="showCreateModal = true">Add User</NButton>
    </NSpace>

    <!-- Bulk actions bar -->
    <NAlert v-if="checkedRowKeys.length > 0" type="info" style="margin-bottom: 12px;" :show-icon="false">
      <NSpace align="center">
        <span style="font-weight: 500;">{{ checkedRowKeys.length }} user(s) selected</span>
        <NSelect
          v-model:value="bulkRoleValue"
          :options="roleSelectOptions"
          placeholder="Change role to..."
          clearable
          size="small"
          style="width: 180px;"
        />
        <NButton size="small" type="primary" secondary :disabled="!bulkRoleValue" :loading="bulkActionLoading" @click="bulkChangeRole">Apply Role</NButton>
        <NButton size="small" type="error" ghost :loading="bulkActionLoading" @click="bulkDelete">Delete Selected</NButton>
        <NButton size="small" quaternary @click="checkedRowKeys = []">Clear</NButton>
      </NSpace>
    </NAlert>

    <!-- Users table -->
    <NSpin :show="store.usersLoading">
      <NDataTable
        v-model:checked-row-keys="checkedRowKeys"
        :columns="columns"
        :data="paginatedUsers"
        :row-key="(row: User) => row.id"
        :bordered="false"
        striped
      />
    </NSpin>

    <div v-if="store.filteredUsers.length > pageSize" style="margin-top: 16px; display: flex; justify-content: flex-end;">
      <NPagination
        v-model:page="currentPage"
        :page-count="Math.ceil(store.filteredUsers.length / pageSize)"
        :page-size="pageSize"
      />
    </div>

    <!-- Create User Modal -->
    <NModal
      v-model:show="showCreateModal"
      preset="card"
      title="Create User"
      style="width: 480px;"
      :mask-closable="false"
    >
      <NForm>
        <NFormItem label="Full Name" required>
          <NInput v-model:value="createForm.name" placeholder="Enter full name" />
        </NFormItem>
        <NFormItem label="Email" required>
          <NInput v-model:value="createForm.email" placeholder="Enter email address" />
        </NFormItem>
        <NFormItem label="Role" required>
          <NSelect v-model:value="createForm.role" :options="roleSelectOptions" />
        </NFormItem>
        <NFormItem label="Password" required :validation-status="createForm.password && !passwordValid ? 'error' : undefined">
          <NInput v-model:value="createForm.password" type="password" show-password-on="click" placeholder="Min 12 chars, upper, lower, number, special" />
        </NFormItem>
        <div v-if="createForm.password && passwordErrors.length > 0" style="margin-bottom: 16px;">
          <div v-for="err in passwordErrors" :key="err" style="color: #f87171; font-size: 12px; margin-bottom: 2px;">
            - {{ err }}
          </div>
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateModal = false">Cancel</NButton>
          <NButton type="primary" :loading="createLoading" :disabled="!createForm.name || !createForm.email || !passwordValid" @click="submitCreate">Create</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Edit User Modal -->
    <NModal
      v-model:show="showEditModal"
      preset="card"
      title="Edit User"
      style="width: 480px;"
      :mask-closable="false"
    >
      <NForm>
        <NFormItem label="Full Name" required>
          <NInput v-model:value="editForm.name" placeholder="Enter full name" />
        </NFormItem>
        <NFormItem label="Email" required>
          <NInput v-model:value="editForm.email" placeholder="Enter email address" />
        </NFormItem>
        <NFormItem label="Role" required>
          <NSelect v-model:value="editForm.role" :options="roleSelectOptions" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showEditModal = false">Cancel</NButton>
          <NButton type="primary" :loading="editLoading" :disabled="!editForm.name || !editForm.email" @click="submitEdit">Save</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Delete Confirmation Modal -->
    <NModal
      v-model:show="showDeleteModal"
      preset="dialog"
      type="warning"
      title="Delete User"
      :content="`Are you sure you want to delete ${deleteTarget?.name || 'this user'}? This action cannot be undone.`"
      positive-text="Delete"
      negative-text="Cancel"
      :loading="deleteLoading"
      @positive-click="confirmDelete"
      @negative-click="showDeleteModal = false"
    />

    <!-- Password Reset Modal -->
    <NModal
      v-model:show="showResetModal"
      preset="card"
      :title="showTempPassword ? 'Password Reset Complete' : 'Reset Password'"
      style="width: 440px;"
    >
      <div v-if="!showTempPassword">
        <p>Reset the password for <strong>{{ resetTarget?.name }}</strong> ({{ resetTarget?.email }})?</p>
        <p style="color: var(--n-text-color-3, #8890a4); font-size: 13px;">A temporary password will be generated. The user will be required to change it on next login.</p>
      </div>
      <div v-else>
        <p style="margin-bottom: 12px;">Temporary password for <strong>{{ resetTarget?.name }}</strong>:</p>
        <NSpace align="center">
          <NInput :value="tempPassword" readonly style="width: 260px; font-family: monospace;" />
          <NButton secondary @click="copyTempPassword">Copy</NButton>
        </NSpace>
        <p style="color: #fbbf24; font-size: 13px; margin-top: 12px;">This password will only be shown once. Make sure to share it securely.</p>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton v-if="!showTempPassword" @click="showResetModal = false">Cancel</NButton>
          <NButton v-if="!showTempPassword" type="warning" :loading="resetLoading" @click="confirmReset">Reset Password</NButton>
          <NButton v-if="showTempPassword" type="primary" @click="showResetModal = false">Done</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
