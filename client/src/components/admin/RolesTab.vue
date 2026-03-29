<script setup lang="ts">
import { ref } from 'vue';
import {
  NCard, NGrid, NGi, NTag, NButton, NSpace, NModal,
  NForm, NFormItem, NInput, NCheckbox, NSpin, NBadge, useMessage
} from 'naive-ui';
import { useAdminStore } from '../../stores/admin';
import { PERMISSION_LABELS } from '../../types/admin';
import type { Role } from '../../types/admin';

const store = useAdminStore();
const message = useMessage();

// Modal state
const showModal = ref(false);
const modalMode = ref<'create' | 'edit'>('create');
const modalLoading = ref(false);
const modalForm = ref({
  id: '' as string | number,
  name: '',
  displayName: '',
  description: '',
  priority: 0,
  permissions: [] as string[],
});

// Delete state
const showDeleteModal = ref(false);
const deleteTarget = ref<Role | null>(null);
const deleteLoading = ref(false);

function permLabel(key: string): string {
  return PERMISSION_LABELS[key] || key.replace(/\./g, ' > ').replace(/\b\w/g, c => c.toUpperCase());
}

function openCreate() {
  modalMode.value = 'create';
  modalForm.value = { id: '', name: '', displayName: '', description: '', priority: 0, permissions: [] };
  showModal.value = true;
}

function openEdit(role: Role) {
  modalMode.value = 'edit';
  modalForm.value = {
    id: role.id,
    name: role.name,
    displayName: role.displayName,
    description: role.description || '',
    priority: role.priority || 0,
    permissions: [...role.permissions],
  };
  showModal.value = true;
}

function openDelete(role: Role) {
  deleteTarget.value = role;
  showDeleteModal.value = true;
}

async function submitModal() {
  modalLoading.value = true;
  try {
    const payload = {
      name: modalForm.value.name,
      displayName: modalForm.value.displayName,
      permissions: modalForm.value.permissions,
    };
    if (modalMode.value === 'create') {
      await store.createRole(payload);
      message.success('Role created');
    } else {
      await store.updateRole(modalForm.value.id, payload);
      message.success('Role updated');
    }
    showModal.value = false;
  } catch (e: any) {
    message.error(e.message || 'Failed to save role');
  } finally {
    modalLoading.value = false;
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  deleteLoading.value = true;
  try {
    await store.deleteRole(deleteTarget.value.id);
    message.success('Role deleted');
    showDeleteModal.value = false;
    deleteTarget.value = null;
  } catch (e: any) {
    message.error(e.message || 'Failed to delete role');
  } finally {
    deleteLoading.value = false;
  }
}

function isChecked(key: string) {
  return modalForm.value.permissions.includes(key) || modalForm.value.permissions.includes('*');
}

function togglePermission(key: string, checked: boolean) {
  if (checked) {
    if (!modalForm.value.permissions.includes(key)) modalForm.value.permissions.push(key);
  } else {
    modalForm.value.permissions = modalForm.value.permissions.filter(p => p !== key);
  }
}


</script>

<template>
  <div>
    <NSpace justify="space-between" align="center" style="margin-bottom: 16px;">
      <span style="font-size: 13px; color: var(--n-text-color-3, #8890a4);">
        {{ store.roles.length }} roles configured
      </span>
      <NButton type="primary" @click="openCreate">Create Role</NButton>
    </NSpace>

    <NSpin :show="store.rolesLoading">
      <NGrid :x-gap="16" :y-gap="16" :cols="3" responsive="screen" :item-responsive="true">
        <NGi v-for="role in store.roles" :key="role.id" span="3 m:1">
          <NCard :title="role.displayName" hoverable size="small">
            <template #header-extra>
              <NBadge :value="role.userCount || 0" :max="99" :type="(role.userCount || 0) > 0 ? 'info' : 'default'" />
            </template>

            <div style="margin-bottom: 12px;">
              <NSpace size="small" :wrap="true">
                <template v-if="role.permissions.includes('*')">
                  <NTag type="success" size="small" :bordered="true">Full Access</NTag>
                </template>
                <template v-else>
                  <NTag
                    v-for="perm in role.permissions.slice(0, 4)"
                    :key="perm"
                    size="small"
                    :bordered="true"
                  >{{ permLabel(perm) }}</NTag>
                  <NTag v-if="role.permissions.length > 4" size="small" type="info">
                    +{{ role.permissions.length - 4 }} more
                  </NTag>
                </template>
              </NSpace>
            </div>

            <template #action>
              <NSpace justify="end" size="small">
                <NButton size="small" secondary @click="openEdit(role)">Edit</NButton>
                <NButton
                  size="small"
                  type="error"
                  ghost
                  :disabled="role.isSystem"
                  @click="openDelete(role)"
                >Delete</NButton>
              </NSpace>
            </template>
          </NCard>
        </NGi>
      </NGrid>
    </NSpin>

    <!-- Create/Edit Role Modal -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="modalMode === 'create' ? 'Create Role' : 'Edit Role'"
      style="width: 600px; max-height: 80vh;"
      :mask-closable="false"
    >
      <div style="max-height: 60vh; overflow-y: auto;">
        <NForm>
          <NFormItem label="Role Key" required v-if="modalMode === 'create'">
            <NInput v-model:value="modalForm.name" placeholder="e.g. project_lead (lowercase, underscores)" />
          </NFormItem>
          <NFormItem label="Display Name" required>
            <NInput v-model:value="modalForm.displayName" placeholder="e.g. Project Lead" />
          </NFormItem>

          <div style="font-weight: 600; margin: 16px 0 8px;">Permissions</div>
          <div v-for="category in store.permissionCatalog" :key="category.name" style="margin-bottom: 16px;">
            <div style="font-weight: 500; margin-bottom: 6px; color: var(--n-text-color-2, #c0c6d4);">{{ category.name }}</div>
            <NSpace size="small" :wrap="true">
              <NCheckbox
                v-for="perm in category.permissions"
                :key="perm.key"
                :checked="isChecked(perm.key)"
                @update:checked="(val: boolean) => togglePermission(perm.key, val)"
              >{{ perm.name }}</NCheckbox>
            </NSpace>
          </div>
        </NForm>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">Cancel</NButton>
          <NButton
            type="primary"
            :loading="modalLoading"
            :disabled="!modalForm.name || !modalForm.displayName"
            @click="submitModal"
          >{{ modalMode === 'create' ? 'Create' : 'Save' }}</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Delete Confirmation -->
    <NModal
      v-model:show="showDeleteModal"
      preset="dialog"
      type="warning"
      title="Delete Role"
      :content="`Are you sure you want to delete the role '${deleteTarget?.displayName}'? This action cannot be undone.`"
      positive-text="Delete"
      negative-text="Cancel"
      :loading="deleteLoading"
      @positive-click="confirmDelete"
      @negative-click="showDeleteModal = false"
    />
  </div>
</template>
