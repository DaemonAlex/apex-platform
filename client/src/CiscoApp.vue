<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NTag, NButton, NSpace, NSpin, NNumberAnimation,
  NDataTable, NEmpty, NTabs, NTabPane, NProgress,
  NStatistic,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from './composables/useTheme';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { PieChart, BarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([PieChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer]);

defineProps<{ userName?: string }>();
const { naiveTheme, themeOverrides, colors } = useTheme();

const loading = ref(true);
const show = ref(false);
const status = ref<any>(null);
const devices = ref<any[]>([]);
const workspaces = ref<any[]>([]);
const locations = ref<any[]>([]);
const syncing = ref(false);

const tk = () => localStorage.getItem('apex_token');
async function api(path: string, method = 'GET') {
  const res = await fetch('/api' + path, { method, headers: { Authorization: 'Bearer ' + tk() } });
  return res.json();
}

async function loadAll() {
  loading.value = true;
  try {
    const [s, d, w, l] = await Promise.all([
      api('/cisco/status'),
      api('/cisco/devices'),
      api('/cisco/workspaces'),
      api('/cisco/locations'),
    ]);
    status.value = s;
    devices.value = d.devices || [];
    workspaces.value = w.workspaces || [];
    locations.value = l.locations || l.items || [];
  } finally {
    loading.value = false;
    setTimeout(() => { show.value = true; }, 60);
  }
}

async function syncDevices() {
  syncing.value = true;
  try {
    const d = await api('/cisco/devices');
    devices.value = d.devices || [];
    status.value = await api('/cisco/status');
  } finally { syncing.value = false; }
}

// ---- Computed stats ----

const totalDevices = computed(() => devices.value.length);

const onlineCount = computed(() =>
  devices.value.filter(d => (d.status || d.connectionStatus || '').toLowerCase() === 'connected').length
);

const issueCount = computed(() =>
  devices.value.filter(d => {
    const s = (d.status || d.connectionStatus || '').toLowerCase();
    return s.includes('issue') || s.includes('warn');
  }).length
);

const offlineCount = computed(() =>
  devices.value.filter(d => {
    const s = (d.status || d.connectionStatus || '').toLowerCase();
    return s === 'disconnected' || s === 'offline' || s === 'inactive';
  }).length
);

const locationCount = computed(() => {
  if (locations.value.length) return locations.value.length;
  const names = new Set(devices.value.map(d => d.raw_data?.locationName || d.raw_data?.locationId).filter(Boolean));
  return names.size;
});

// ---- Location health breakdown ----

const locationHealth = computed(() => {
  const map: Record<string, { name: string; address: string; total: number; online: number; issues: number; offline: number }> = {};

  for (const d of devices.value) {
    const locName = d.raw_data?.locationName || d.raw_data?.locationId || 'Unknown';
    const locId = d.raw_data?.locationId || locName;
    if (!map[locId]) {
      const locData = locations.value.find((l: any) => l.id === locId);
      const addr = locData?.address
        ? `${locData.address.city || ''}${locData.address.state ? ', ' + locData.address.state : ''}${locData.address.country && locData.address.country !== 'US' ? ', ' + locData.address.country : ''}`
        : '';
      map[locId] = { name: locName, address: addr, total: 0, online: 0, issues: 0, offline: 0 };
    }
    const s = (d.status || d.connectionStatus || '').toLowerCase();
    map[locId].total++;
    if (s === 'connected') map[locId].online++;
    else if (s.includes('issue') || s.includes('warn')) map[locId].issues++;
    else map[locId].offline++;
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
});

function locHealthColor(loc: any) {
  if (!loc.total) return '#64748b';
  const pct = loc.online / loc.total;
  if (pct >= 0.95) return '#22c55e';
  if (pct >= 0.80 || loc.issues > 0) return '#f59e0b';
  return '#ef4444';
}

function locHealthPct(loc: any) {
  if (!loc.total) return 0;
  return Math.round((loc.online / loc.total) * 100);
}

// ---- Charts ----

const healthChartOption = computed(() => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: colors.value.tooltipBg,
    borderColor: colors.value.tooltipBorder,
    textStyle: { color: colors.value.tooltipText },
  },
  legend: {
    orient: 'vertical', right: 0, top: 'center',
    textStyle: { color: colors.value.textSecondary, fontSize: 12 },
    icon: 'circle', itemWidth: 10, itemHeight: 10,
  },
  series: [{
    type: 'pie', radius: ['52%', '78%'], center: ['38%', '50%'],
    itemStyle: { borderRadius: 5, borderColor: colors.value.cardBg, borderWidth: 2 },
    label: { show: false },
    animationType: 'scale', animationEasing: 'elasticOut',
    animationDelay: () => Math.random() * 150,
    data: [
      { value: onlineCount.value, name: 'Online', itemStyle: { color: '#22c55e' } },
      { value: issueCount.value, name: 'Issues', itemStyle: { color: '#f59e0b' } },
      { value: offlineCount.value, name: 'Offline', itemStyle: { color: '#ef4444' } },
    ].filter(d => d.value > 0),
  }],
}));

const typeChartOption = computed(() => {
  const counts: Record<string, number> = {};
  for (const d of devices.value) {
    const p = d.product || d.raw_data?.product || 'Unknown';
    const key = p.replace('Cisco ', '');
    counts[key] = (counts[key] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const palette = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#64748b', '#ec4899'];
  return {
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'none' },
      backgroundColor: colors.value.tooltipBg,
      borderColor: colors.value.tooltipBorder,
      textStyle: { color: colors.value.tooltipText, fontSize: 12 },
    },
    grid: { left: 8, right: 32, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: sorted.map(([k]) => k),
      inverse: true,
      axisLabel: { color: colors.value.textSecondary, fontSize: 11 },
      axisLine: { show: false }, axisTick: { show: false },
    },
    series: [{
      type: 'bar', barWidth: 14,
      data: sorted.map(([, v], i) => ({
        value: v,
        itemStyle: { color: palette[i % palette.length], borderRadius: [0, 4, 4, 0] },
      })),
      label: {
        show: true, position: 'right',
        color: colors.value.textMuted, fontSize: 11,
        formatter: (p: any) => p.value,
      },
    }],
  };
});

// ---- Device table ----

function statusType(s: string): 'success' | 'error' | 'warning' | 'default' {
  if (!s) return 'default';
  const v = s.toLowerCase();
  if (v === 'connected') return 'success';
  if (v.includes('disconnected') || v.includes('offline') || v.includes('inactive')) return 'error';
  if (v.includes('issue') || v.includes('warn') || v.includes('standby')) return 'warning';
  return 'default';
}

function statusLabel(s: string) {
  if (!s) return 'Unknown';
  const v = s.toLowerCase();
  if (v === 'connected') return 'Online';
  if (v === 'connected_with_issues') return 'Issues';
  if (v === 'disconnected') return 'Offline';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const deviceColumns: DataTableColumns<any> = [
  {
    title: 'Device', key: 'displayName', sorter: 'default', minWidth: 220,
    render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500;' }, row.display_name || row.displayName || row.device_id),
      h('div', { style: 'font-size:0.78rem;color:#94a3b8;margin-top:1px;' }, row.product || row.raw_data?.product || ''),
    ]),
  },
  {
    title: 'Status', key: 'status', width: 110,
    render: (row) => {
      const s = row.status || row.connectionStatus || '';
      return h(NTag, { type: statusType(s), size: 'small', round: true }, () => statusLabel(s));
    },
  },
  {
    title: 'Location', key: 'location', width: 180,
    render: (row) => h('span', { style: 'font-size:0.85rem;' }, row.raw_data?.locationName || '-'),
  },
  {
    title: 'Workspace', key: 'workspace', width: 180,
    render: (row) => h('span', { style: 'font-size:0.85rem;' }, row.raw_data?.workspaceName || '-'),
  },
  { title: 'IP', key: 'ip', width: 120, render: (row) => h('code', { style: 'font-size:0.8rem;' }, row.ip || '-') },
  {
    title: 'Firmware', key: 'firmware', width: 160,
    render: (row) => h('span', { style: 'font-size:0.78rem;color:#94a3b8;' }, row.raw_data?.firmware || '-'),
  },
];

// ---- Workspace table ----

const workspaceColumns: DataTableColumns<any> = [
  {
    title: 'Workspace', key: 'displayName', sorter: 'default',
    render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500;' }, row.display_name || row.displayName || row.workspace_id),
      h('div', { style: 'font-size:0.78rem;color:#94a3b8;margin-top:1px;' }, row.raw_data?.locationName || ''),
    ]),
  },
  {
    title: 'Type', key: 'type', width: 130,
    render: (row) => {
      const t = row.type || '-';
      const label: Record<string, string> = { meetingRoom: 'Meeting Room', boardRoom: 'Board Room', focusRoom: 'Focus Room', other: 'Other' };
      return h(NTag, { size: 'small', bordered: false }, () => label[t] || t);
    },
  },
  { title: 'Cap.', key: 'capacity', width: 70, align: 'center', render: (row) => row.capacity ?? '-' },
  {
    title: 'Floor', key: 'floor', width: 120,
    render: (row) => {
      const floorId = row.floor_id || row.floorId || '';
      const floors: Record<string, string> = {
        'floor-wacker-10': 'Floor 10', 'floor-wacker-11': 'Floor 11', 'floor-wacker-12': 'Floor 12',
        'floor-lasalle-5': 'Floor 5', 'floor-lasalle-6': 'Floor 6',
        'floor-dublin-1': 'Floor 1', 'floor-dublin-2': 'Floor 2',
        'floor-miami-3': 'Floor 3',
      };
      return h('span', { style: 'font-size:0.85rem;color:#94a3b8;' }, floors[floorId] || floorId || '-');
    },
  },
  {
    title: 'Extension', key: 'ext', width: 110,
    render: (row) => h('code', { style: 'font-size:0.8rem;' }, row.raw_data?.extension || '-'),
  },
];

onMounted(loadAll);
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">

  <!-- Header -->
  <NSpace justify="space-between" align="center" style="margin-bottom:20px;">
    <div>
      <h1 style="margin:0 0 4px;font-size:1.5rem;font-weight:700;">Cisco Control Hub</h1>
      <span style="font-size:0.85rem;color:#94a3b8;">Live infrastructure visibility - powered by Webex API</span>
    </div>
    <NSpace align="center">
      <NSpin v-if="loading" size="small" />
      <template v-else-if="status">
        <NTag :type="status.connected || status.mock ? 'success' : 'error'" size="medium" :bordered="false" round>
          <i :class="status.connected || status.mock ? 'ph ph-check-circle' : 'ph ph-x-circle'"
             style="margin-right:5px;" />
          {{ status.mock ? 'Live (Mock)' : status.connected ? 'Connected' : 'Disconnected' }}
        </NTag>
        <NTag size="small" :bordered="false" style="color:#94a3b8;">
          <i class="ph ph-shield-check" style="margin-right:4px;color:#22c55e;" />TLS 1.2+
        </NTag>
      </template>
      <NButton size="small" :loading="syncing" @click="syncDevices" style="margin-left:4px;">
        <i class="ph ph-arrows-clockwise" style="margin-right:4px;" />Sync
      </NButton>
    </NSpace>
  </NSpace>

  <NSpin :show="loading">
  <Transition name="fade-slide">
  <div v-if="show">

    <!-- Stat Cards -->
    <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom:20px;">
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #0ea5e9', textAlign:'center' }">
          <NStatistic label="Total Devices">
            <template #default>
              <NNumberAnimation :from="0" :to="totalDevices" :duration="900" />
            </template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">across all locations</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #22c55e', textAlign:'center' }">
          <NStatistic label="Online">
            <template #default>
              <span style="color:#22c55e;">
                <NNumberAnimation :from="0" :to="onlineCount" :duration="900" />
              </span>
            </template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">
            {{ totalDevices ? Math.round(onlineCount / totalDevices * 100) : 0 }}% availability
          </div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :style="{ borderTop: (issueCount + offlineCount) > 0 ? '3px solid #ef4444' : '3px solid #22c55e', textAlign:'center' }">
          <NStatistic label="Alerts">
            <template #default>
              <span :style="{ color: (issueCount + offlineCount) > 0 ? '#ef4444' : '#22c55e' }">
                <NNumberAnimation :from="0" :to="issueCount + offlineCount" :duration="900" />
              </span>
            </template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">
            {{ issueCount }} w/ issues, {{ offlineCount }} offline
          </div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #8b5cf6', textAlign:'center' }">
          <NStatistic label="Locations">
            <template #default>
              <span style="color:#8b5cf6;">
                <NNumberAnimation :from="0" :to="locationCount" :duration="900" />
              </span>
            </template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">
            {{ workspaces.length }} workspaces managed
          </div>
        </NCard>
      </NGi>
    </NGrid>

    <NTabs type="line" animated default-value="overview">

      <!-- OVERVIEW TAB -->
      <NTabPane name="overview" tab="Overview">
        <!-- Charts row -->
        <NGrid :x-gap="12" :y-gap="12" :cols="2" style="margin-bottom:20px;">
          <NGi>
            <NCard size="small" title="Device Health">
              <div style="position:relative;height:200px;">
                <VChart :option="healthChartOption" autoresize style="height:100%;" />
                <div style="position:absolute;top:50%;left:38%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;">
                  <div style="font-size:1.6rem;font-weight:700;">{{ onlineCount }}</div>
                  <div style="font-size:0.72rem;color:#94a3b8;">online</div>
                </div>
              </div>
            </NCard>
          </NGi>
          <NGi>
            <NCard size="small" title="Devices by Model">
              <div style="height:200px;">
                <VChart :option="typeChartOption" autoresize style="height:100%;" />
              </div>
            </NCard>
          </NGi>
        </NGrid>

        <!-- Location health cards -->
        <div style="margin-bottom:8px;font-size:0.85rem;font-weight:600;color:#94a3b8;letter-spacing:0.05em;text-transform:uppercase;">
          Location Health
        </div>
        <NGrid :x-gap="12" :y-gap="12" :cols="2">
          <NGi v-for="loc in locationHealth" :key="loc.name">
            <NCard size="small">
              <NSpace justify="space-between" align="start" style="margin-bottom:10px;">
                <div>
                  <div style="font-weight:600;font-size:1rem;">{{ loc.name }}</div>
                  <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px;">
                    <i class="ph ph-map-pin" style="margin-right:3px;" />{{ loc.address || 'Office Location' }}
                  </div>
                </div>
                <NTag :color="{ color: locHealthColor(loc) + '20', textColor: locHealthColor(loc), borderColor: 'transparent' }" size="small" round>
                  {{ locHealthPct(loc) }}% online
                </NTag>
              </NSpace>
              <NProgress
                type="line"
                :percentage="locHealthPct(loc)"
                :color="locHealthColor(loc)"
                :rail-color="colors.railColor"
                :height="6"
                :show-indicator="false"
                style="margin-bottom:10px;"
              />
              <NGrid :cols="3" :x-gap="8">
                <NGi style="text-align:center;">
                  <div style="font-size:1.2rem;font-weight:700;color:#22c55e;">{{ loc.online }}</div>
                  <div style="font-size:0.72rem;color:#94a3b8;">Online</div>
                </NGi>
                <NGi style="text-align:center;">
                  <div style="font-size:1.2rem;font-weight:700;color:#f59e0b;">{{ loc.issues }}</div>
                  <div style="font-size:0.72rem;color:#94a3b8;">Issues</div>
                </NGi>
                <NGi style="text-align:center;">
                  <div style="font-size:1.2rem;font-weight:700;color:#ef4444;">{{ loc.offline }}</div>
                  <div style="font-size:0.72rem;color:#94a3b8;">Offline</div>
                </NGi>
              </NGrid>
            </NCard>
          </NGi>
        </NGrid>
      </NTabPane>

      <!-- DEVICES TAB -->
      <NTabPane name="devices" tab="Devices">
        <NSpace justify="space-between" align="center" style="margin-bottom:12px;">
          <span style="font-size:0.85rem;color:#94a3b8;">
            {{ totalDevices }} devices synced from Control Hub
          </span>
          <NButton size="small" :loading="syncing" @click="syncDevices">
            <i class="ph ph-arrows-clockwise" style="margin-right:4px;" />Refresh
          </NButton>
        </NSpace>
        <NDataTable
          :columns="deviceColumns"
          :data="devices"
          :row-key="(r: any) => r.id || r.device_id"
          :bordered="false"
          size="small"
          striped
          :pagination="{ pageSize: 15 }"
        />
        <NEmpty
          v-if="!loading && devices.length === 0"
          description="No devices found. Click Sync to fetch from Control Hub."
          style="margin-top:40px;"
        />
      </NTabPane>

      <!-- WORKSPACES TAB -->
      <NTabPane name="workspaces" tab="Workspaces">
        <NSpace justify="space-between" align="center" style="margin-bottom:12px;">
          <span style="font-size:0.85rem;color:#94a3b8;">
            {{ workspaces.length }} workspaces across {{ locationCount }} locations
          </span>
        </NSpace>
        <NDataTable
          :columns="workspaceColumns"
          :data="workspaces"
          :row-key="(r: any) => r.id || r.workspace_id"
          :bordered="false"
          size="small"
          striped
          :pagination="{ pageSize: 15 }"
        />
        <NEmpty
          v-if="!loading && workspaces.length === 0"
          description="No workspaces found."
          style="margin-top:40px;"
        />
      </NTabPane>

      <!-- SECURITY TAB -->
      <NTabPane name="security" tab="Why It's Safe">
        <NGrid :x-gap="16" :y-gap="12" :cols="2" style="margin-top:4px;">

          <NGi>
            <NCard size="small" title="How Credentials Work">
              <div style="font-size:0.9rem;line-height:1.7;">
                <div style="margin-bottom:12px;color:#94a3b8;">
                  Your Cisco credentials never touch the browser. Here is the full path a request takes:
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:#0ea5e920;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <i class="ph ph-monitor" style="color:#0ea5e9;" />
                    </div>
                    <div>
                      <div style="font-weight:600;font-size:0.85rem;">Your Browser</div>
                      <div style="font-size:0.78rem;color:#94a3b8;">Sends JWT - no Cisco credentials here</div>
                    </div>
                  </div>
                  <div style="margin-left:15px;color:#64748b;font-size:0.8rem;">
                    <i class="ph ph-arrow-down" /> HTTPS + JWT auth
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:#8b5cf620;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <i class="ph ph-server" style="color:#8b5cf6;" />
                    </div>
                    <div>
                      <div style="font-weight:600;font-size:0.85rem;">APEX Backend</div>
                      <div style="font-size:0.78rem;color:#94a3b8;">Holds credentials, enforces rate limits, logs all calls</div>
                    </div>
                  </div>
                  <div style="margin-left:15px;color:#64748b;font-size:0.8rem;">
                    <i class="ph ph-arrow-down" /> TLS 1.2+ minimum
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:#22c55e20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <i class="ph ph-cloud" style="color:#22c55e;" />
                    </div>
                    <div>
                      <div style="font-weight:600;font-size:0.85rem;">Cisco Webex API</div>
                      <div style="font-size:0.78rem;color:#94a3b8;">Returns device and workspace data</div>
                    </div>
                  </div>
                </div>
              </div>
            </NCard>
          </NGi>

          <NGi>
            <NCard size="small" title="Security Controls">
              <div style="display:flex;flex-direction:column;gap:12px;">
                <div v-for="item in [
                  { icon: 'ph-lock', color: '#22c55e', title: 'TLS 1.2 Minimum Enforced', desc: 'All outbound connections to Webex use TLS 1.2 or higher - set in code, cannot be downgraded' },
                  { icon: 'ph-eye', color: '#0ea5e9', title: 'Read-Only by Default', desc: 'Device monitoring uses read-only API scopes. Write actions (reboot, config push) require explicit admin approval' },
                  { icon: 'ph-vault', color: '#8b5cf6', title: 'Credentials Server-Side Only', desc: 'OAuth tokens and API keys live in the backend .env file. No credential is ever sent to the browser' },
                  { icon: 'ph-gauge', color: '#f59e0b', title: 'Built-In Rate Limiting', desc: 'Requests are queued with a 310ms minimum interval - stays under Cisco\'s 200 req/min limit automatically' },
                  { icon: 'ph-clock-clockwise', color: '#ec4899', title: 'Token Auto-Refresh', desc: 'OAuth access tokens refresh automatically before expiry. No manual intervention required' },
                  { icon: 'ph-list-magnifying-glass', color: '#64748b', title: 'Full Audit Trail', desc: 'Every sync and API call is logged in cisco_sync_log with timestamp, type, and record count' },
                ]" :key="item.title" style="display:flex;gap:10px;align-items:flex-start;">
                  <div :style="{ width:'30px', height:'30px', borderRadius:'6px', background: item.color + '20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0' }">
                    <i :class="'ph ' + item.icon" :style="{ color: item.color }" />
                  </div>
                  <div>
                    <div style="font-weight:600;font-size:0.85rem;">{{ item.title }}</div>
                    <div style="font-size:0.78rem;color:#94a3b8;margin-top:2px;line-height:1.5;">{{ item.desc }}</div>
                  </div>
                </div>
              </div>
            </NCard>
          </NGi>

          <NGi :span="2">
            <NCard size="small" title="What This Integration Replaces">
              <NGrid :cols="3" :x-gap="12">
                <NGi v-for="item in [
                  { icon: 'ph-table', color: '#ef4444', title: 'Manual Spreadsheets', desc: 'No more tracking 40+ devices in Excel. Every device, IP, firmware version, and status is live from Control Hub.' },
                  { icon: 'ph-browser', color: '#f59e0b', title: 'Logging into Control Hub', desc: 'Leadership and field ops never need to touch Cisco Control Hub. Status is visible right here in APEX.' },
                  { icon: 'ph-phone', color: '#0ea5e9', title: 'Calling for Status Updates', desc: 'Is the boardroom device online before the 9am call? Check it here in 3 seconds - not 3 phone calls.' },
                ]" :key="item.title">
                  <div style="display:flex;gap:10px;align-items:flex-start;">
                    <div :style="{ width:'32px', height:'32px', borderRadius:'6px', background: item.color + '20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0' }">
                      <i :class="'ph ' + item.icon" :style="{ color: item.color, fontSize:'1.1rem' }" />
                    </div>
                    <div>
                      <div style="font-weight:600;font-size:0.85rem;">{{ item.title }}</div>
                      <div style="font-size:0.78rem;color:#94a3b8;margin-top:3px;line-height:1.5;">{{ item.desc }}</div>
                    </div>
                  </div>
                </NGi>
              </NGrid>
            </NCard>
          </NGi>

        </NGrid>
      </NTabPane>

    </NTabs>
  </div>
  </Transition>
  </NSpin>

</div>
</NConfigProvider>
</NMessageProvider>
</template>

<style scoped>
.fade-slide-enter-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(12px); }
</style>
