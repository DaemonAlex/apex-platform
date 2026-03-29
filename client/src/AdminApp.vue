<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { NMessageProvider, NConfigProvider, NTabs, NTabPane } from 'naive-ui';
import UsersTab from './components/admin/UsersTab.vue';
import RolesTab from './components/admin/RolesTab.vue';
import SettingsTab from './components/admin/SettingsTab.vue';
import AuditLogTab from './components/admin/AuditLogTab.vue';
import { useAdminStore } from './stores/admin';
import { useTheme } from './composables/useTheme';

defineProps<{ userName?: string }>();

const store = useAdminStore();
const activeTab = ref('users');
const loadedTabs = ref<Set<string>>(new Set());
const { naiveTheme, themeOverrides } = useTheme();

function handleTabChange(tab: string) {
  activeTab.value = tab;
  if (!loadedTabs.value.has(tab)) {
    loadedTabs.value.add(tab);
    if (tab === 'users') { store.fetchUsers(); store.fetchRoles(); }
    else if (tab === 'roles') { store.fetchRoles(); store.fetchPermissionCatalog(); }
    else if (tab === 'settings') store.fetchSettings();
    else if (tab === 'audit') store.fetchAuditLog();
  }
}

onMounted(() => {
  handleTabChange('users');
});
</script>

<template>
  <NMessageProvider>
    <NConfigProvider
      :theme="naiveTheme"
      :theme-overrides="themeOverrides"
    >
      <div style="background: transparent; min-height: 400px;">
        <NTabs
          type="line"
          :value="activeTab"
          @update:value="handleTabChange"
          style="margin-bottom: 16px;"
        >
          <NTabPane name="users" tab="Users">
            <UsersTab />
          </NTabPane>
          <NTabPane name="roles" tab="Roles & Permissions">
            <RolesTab />
          </NTabPane>
          <NTabPane name="settings" tab="System Settings">
            <SettingsTab />
          </NTabPane>
          <NTabPane name="audit" tab="Audit Log">
            <AuditLogTab />
          </NTabPane>
        </NTabs>
      </div>
    </NConfigProvider>
  </NMessageProvider>
</template>
