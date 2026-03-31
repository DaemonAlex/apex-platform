<script setup lang="ts">
import { ref, onMounted, h } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NStatistic, NButton, NSpace, NSpin,
  NDataTable, NTag, NEmpty, NTabs, NTabPane, NAlert,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from './composables/useTheme';
import { apiFetch } from './composables/useApi';

defineProps<{ userName?: string }>();
const { naiveTheme, themeOverrides, colors } = useTheme();

const statusLoading = ref(true);
const status = ref<any>(null);

const devicesLoading = ref(false);
const devices = ref<any[]>([]);

const workspacesLoading = ref(false);
const workspaces = ref<any[]>([]);

async function fetchStatus() {
  statusLoading.value = true;
  try {
    status.value = await apiFetch<any>('/cisco/status');
  } finally { statusLoading.value = false; }
}

async function fetchDevices() {
  devicesLoading.value = true;
  try {
    const data = await apiFetch<{ devices: any[] }>('/cisco/devices');
    devices.value = data.devices;
    // Refresh status counts after sync
    status.value = await apiFetch<any>('/cisco/status');
  } finally { devicesLoading.value = false; }
}

async function fetchWorkspaces() {
  workspacesLoading.value = true;
  try {
    const data = await apiFetch<{ workspaces: any[] }>('/cisco/workspaces');
    workspaces.value = data.workspaces;
  } finally { workspacesLoading.value = false; }
}

function onTabChange(tab: string) {
  if (tab === 'devices' && devices.value.length === 0) fetchDevices();
  if (tab === 'workspaces' && workspaces.value.length === 0) fetchWorkspaces();
}

function statusTagType(s: string): 'success' | 'error' | 'warning' | 'default' {
  if (!s) return 'default';
  const v = s.toLowerCase();
  if (v === 'connected' || v === 'active') return 'success';
  if (v.includes('offline') || v.includes('error') || v.includes('disconnect')) return 'error';
  if (v.includes('standby') || v.includes('idle') || v.includes('unknown')) return 'warning';
  return 'default';
}

const deviceColumns: DataTableColumns<any> = [
  {
    title: 'Device', key: 'displayName', sorter: 'default',
    render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500;' }, row.displayName || row.display_name || row.device_id || row.id),
      h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, row.product || ''),
    ]),
  },
  {
    title: 'Type', key: 'type', width: 130,
    render: (row) => h(NTag, { size: 'small', bordered: false }, () => row.type || '-'),
  },
  {
    title: 'Status', key: 'status', width: 140,
    render: (row) => {
      const s = row.connectionStatus || row.status || '';
      return h(NTag, { type: statusTagType(s), size: 'small' }, () => s || 'Unknown');
    },
  },
  { title: 'Serial', key: 'serial', width: 160, render: (row) => row.serial || '-' },
  { title: 'IP', key: 'ip', width: 130, render: (row) => row.ip || '-' },
];

const workspaceColumns: DataTableColumns<any> = [
  {
    title: 'Workspace', key: 'displayName', sorter: 'default',
    render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500;' }, row.displayName || row.id),
      row.notes ? h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, row.notes) : null,
    ]),
  },
  { title: 'Type', key: 'type', width: 130, render: (row) => row.type || '-' },
  { title: 'Capacity', key: 'capacity', width: 100, align: 'center', render: (row) => row.capacity ?? '-' },
  { title: 'Floor', key: 'floorId', width: 150, render: (row) => row.floorId || '-' },
];

onMounted(fetchStatus);
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">
  <NSpace justify="space-between" align="center" style="margin-bottom:16px;">
    <h1 style="margin:0;font-size:1.5rem;">Cisco Control Hub</h1>
    <NSpin v-if="statusLoading" size="small" />
    <NTag v-else-if="status" :type="status.connected ? 'success' : status.configured ? 'error' : 'warning'" size="medium">
      {{ status.connected ? 'Connected' : status.configured ? 'Auth Failed' : 'Not Configured' }}
    </NTag>
  </NSpace>

  <NTabs type="line" animated @update:value="onTabChange">

    <!-- Dashboard Tab -->
    <NTabPane name="dashboard" tab="Dashboard">
      <NSpin :show="statusLoading">
        <NAlert v-if="status && !status.configured" type="warning" style="margin-bottom:16px;">
          Cisco credentials are not configured. Set CISCO_CLIENT_ID, CISCO_CLIENT_SECRET, and CISCO_ORG_ID in node/.env, then restart the backend.
        </NAlert>
        <NAlert v-else-if="status && !status.connected" type="error" style="margin-bottom:16px;">
          Cannot connect to Control Hub: {{ status.error }}
        </NAlert>

        <NGrid :x-gap="12" :y-gap="12" :cols="3" style="margin-bottom:20px;">
          <NGi>
            <NCard size="small" style="text-align:center;">
              <NStatistic label="Cached Devices" :value="status?.cachedDeviceCount ?? 0" />
            </NCard>
          </NGi>
          <NGi>
            <NCard size="small" style="text-align:center;">
              <NStatistic label="Connection" :value="status?.connected ? 'Active' : 'Offline'" />
            </NCard>
          </NGi>
          <NGi>
            <NCard size="small" style="text-align:center;">
              <NStatistic
                label="Last Sync"
                :value="status?.lastSync ? new Date(status.lastSync).toLocaleDateString() : 'Never'"
              />
            </NCard>
          </NGi>
        </NGrid>

        <NCard size="small" title="Integration Details" v-if="status">
          <div :style="{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 16px', fontSize: '0.9rem' }">
            <span :style="{ color: colors.textMuted }">Org ID</span>
            <span style="font-family:monospace;font-size:0.85rem;">{{ status.orgId || 'Not set' }}</span>
            <span :style="{ color: colors.textMuted }">Token Expires</span>
            <span>{{ status.tokenExpiry ? new Date(status.tokenExpiry).toLocaleString() : '-' }}</span>
            <span :style="{ color: colors.textMuted }">API Base URL</span>
            <span style="font-family:monospace;font-size:0.85rem;">https://webexapis.com/v1/</span>
          </div>
        </NCard>
      </NSpin>
    </NTabPane>

    <!-- Devices Tab -->
    <NTabPane name="devices" tab="Devices">
      <NSpace justify="end" style="margin-bottom:12px;">
        <NButton size="small" :loading="devicesLoading" @click="fetchDevices">
          <i class="ph ph-arrow-clockwise" style="margin-right:4px;" /> Sync Devices
        </NButton>
      </NSpace>
      <NSpin :show="devicesLoading">
        <NDataTable
          :columns="deviceColumns"
          :data="devices"
          :row-key="(r: any) => r.id || r.device_id"
          :bordered="false"
          size="small"
          striped
        />
        <NEmpty
          v-if="!devicesLoading && devices.length === 0"
          description="No devices synced yet. Click Sync Devices to fetch from Control Hub."
          style="margin-top:32px;"
        />
      </NSpin>
    </NTabPane>

    <!-- Workspaces Tab -->
    <NTabPane name="workspaces" tab="Workspaces">
      <NSpace justify="end" style="margin-bottom:12px;">
        <NButton size="small" :loading="workspacesLoading" @click="fetchWorkspaces">
          <i class="ph ph-arrow-clockwise" style="margin-right:4px;" /> Refresh
        </NButton>
      </NSpace>
      <NSpin :show="workspacesLoading">
        <NDataTable
          :columns="workspaceColumns"
          :data="workspaces"
          :row-key="(r: any) => r.id"
          :bordered="false"
          size="small"
          striped
        />
        <NEmpty
          v-if="!workspacesLoading && workspaces.length === 0"
          description="No workspaces found. Workspaces must be configured in Cisco Control Hub."
          style="margin-top:32px;"
        />
      </NSpin>
    </NTabPane>

  </NTabs>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
