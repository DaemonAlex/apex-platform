<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { NMessageProvider, NConfigProvider, NTabs, NTabPane, darkTheme } from 'naive-ui';
import type { GlobalThemeOverrides } from 'naive-ui';
import UsersTab from './components/admin/UsersTab.vue';
import RolesTab from './components/admin/RolesTab.vue';
import SettingsTab from './components/admin/SettingsTab.vue';
import AuditLogTab from './components/admin/AuditLogTab.vue';
import { useAdminStore } from './stores/admin';

defineProps<{ userName?: string }>();

const store = useAdminStore();
const activeTab = ref('users');
const loadedTabs = ref<Set<string>>(new Set());

const isDark = computed(() => document.documentElement.getAttribute('data-theme') === 'dark');

const themeOverrides: GlobalThemeOverrides = {
  common: {
    bodyColor: 'transparent',
    cardColor: '#1e2130',
    modalColor: '#1e2130',
    popoverColor: '#1e2130',
    tableColor: '#1e2130',
    inputColor: '#161822',
    borderColor: '#2a2d3e',
    textColorBase: '#eef0f4',
    textColor1: '#eef0f4',
    textColor2: '#c0c6d4',
    textColor3: '#8890a4',
    primaryColor: '#38bdf8',
    primaryColorHover: '#0ea5e9',
    primaryColorPressed: '#0284c7',
    successColor: '#4ade80',
    warningColor: '#fbbf24',
    errorColor: '#f87171',
  },
  Card: { colorEmbedded: '#161822' },
  DataTable: {
    thColor: '#161822', tdColor: 'transparent',
    tdColorStriped: 'rgba(255,255,255,0.02)',
    tdColorHover: 'rgba(255,255,255,0.04)',
    borderColor: '#2a2d3e', thTextColor: '#a0a8bc',
  },
  Tabs: {
    tabTextColorLine: '#a0a8bc',
    tabTextColorActiveLine: '#38bdf8',
    tabTextColorHoverLine: '#38bdf8',
    barColor: '#38bdf8',
  },
  Tag: { colorBordered: 'transparent' },
  Input: {
    color: '#161822', border: '1px solid #2a2d3e',
    colorFocus: '#161822', borderFocus: '1px solid #38bdf8',
    textColor: '#eef0f4', placeholderColor: '#4a4d5e',
  },
  InternalSelection: {
    color: '#161822', border: '1px solid #2a2d3e',
    textColor: '#eef0f4', placeholderColor: '#4a4d5e', colorActive: '#161822',
  },
  Button: { textColorPrimary: '#fff' },
  Collapse: { titleTextColor: '#eef0f4' },
  Descriptions: { thColor: '#161822', tdColor: 'transparent', borderColor: '#2a2d3e' },
  Progress: { railColor: '#2a2d3e' },
};

const lightOverrides: GlobalThemeOverrides = {
  common: { bodyColor: 'transparent' },
};

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
      :theme="isDark ? darkTheme : undefined"
      :theme-overrides="isDark ? themeOverrides : lightOverrides"
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
