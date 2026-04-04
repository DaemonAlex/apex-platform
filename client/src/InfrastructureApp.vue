<script setup lang="ts">
import { ref, computed, onMounted, h, watch } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NTag, NButton, NSpace, NSpin, NNumberAnimation,
  NDataTable, NEmpty, NTabs, NTabPane, NProgress, NStatistic,
  NModal, NForm, NFormItem, NSelect, NInput, NRadioGroup, NRadio,
  NSwitch, NDivider, createDiscreteApi,
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
const { message: msg } = createDiscreteApi(['message']);

// ---- State ----
const loading = ref(true);
const show = ref(false);
const syncing = ref(false);
const status = ref<any>(null);
const devices = ref<any[]>([]);
const workspaces = ref<any[]>([]);
const locations = ref<any[]>([]);
const ciscoChecks = ref<any[]>([]);
const schedules = ref<any[]>([]);
const activeTab = ref('overview');

// Log check modal
const showCheckModal = ref(false);
const checkForm = ref({
  workspaceId: null as string | null,
  checkStatus: 'pass',
  notes: '',
  snowTicket: '',
  checkedBy: '',
  setSchedule: false,
  checkFrequency: 'weekly',
  checkDay: 1,
});
const savingCheck = ref(false);

// Set schedule modal
const showScheduleModal = ref(false);
const scheduleTarget = ref<any>(null);
const scheduleForm = ref({ checkFrequency: 'weekly', checkDay: 1 });
const savingSchedule = ref(false);

// Calendar
const calDate = ref(new Date());

// ---- API ----
const tk = () => localStorage.getItem('apex_token');
async function api(path: string, method = 'GET', body?: any) {
  const res = await fetch('/api' + path, {
    method,
    headers: { Authorization: 'Bearer ' + tk(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

async function loadAll() {
  loading.value = true;
  try {
    const [s, d, w, l, c, sc] = await Promise.all([
      api('/cisco/status'),
      api('/cisco/devices'),
      api('/cisco/workspaces'),
      api('/cisco/locations'),
      api('/cisco/checks').catch(() => ({ checks: [] })),
      api('/cisco/schedules').catch(() => ({ schedules: [] })),
    ]);
    status.value = s;
    devices.value = d.devices || [];
    workspaces.value = w.workspaces || [];
    locations.value = l.locations || l.items || [];
    ciscoChecks.value = c.checks || [];
    schedules.value = sc.schedules || [];
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

function onWorkspaceSelect(wsId: string | null) {
  if (wsId) {
    const existing = schedules.value.find((s: any) => s.workspace_id === wsId);
    if (existing) {
      checkForm.value.checkFrequency = existing.check_frequency || 'weekly';
      checkForm.value.checkDay = existing.check_day ?? 1;
      checkForm.value.setSchedule = true;
    }
  }
}

async function saveCheck() {
  if (!checkForm.value.workspaceId) return;
  savingCheck.value = true;
  try {
    const ws = workspaces.value.find((w: any) => (w.workspace_id || w.id) === checkForm.value.workspaceId);
    const wsName = ws?.display_name || ws?.displayName || checkForm.value.workspaceId;

    await api('/cisco/checks', 'POST', {
      workspaceId: checkForm.value.workspaceId,
      workspaceName: wsName,
      checkedBy: checkForm.value.checkedBy || 'Manual',
      status: checkForm.value.checkStatus,
      notes: checkForm.value.notes,
      snowTicket: checkForm.value.snowTicket,
    });

    if (checkForm.value.setSchedule) {
      await api(`/cisco/workspaces/${checkForm.value.workspaceId}/schedule`, 'PUT', {
        workspaceName: wsName,
        checkFrequency: checkForm.value.checkFrequency,
        checkDay: checkForm.value.checkDay,
      });
    }

    msg.success('Check logged');
    showCheckModal.value = false;
    checkForm.value = { workspaceId: null, checkStatus: 'pass', notes: '', snowTicket: '', checkedBy: '', setSchedule: false, checkFrequency: 'weekly', checkDay: 1 };
    const [c, sc] = await Promise.all([
      api('/cisco/checks').catch(() => ({ checks: [] })),
      api('/cisco/schedules').catch(() => ({ schedules: [] })),
    ]);
    ciscoChecks.value = c.checks || [];
    schedules.value = sc.schedules || [];
  } catch (e: any) {
    msg.error(e.message || 'Failed to save check');
  } finally { savingCheck.value = false; }
}

function openCheckForSpace(ws: any) {
  const wsId = ws.workspace_id || ws.id;
  checkForm.value.workspaceId = wsId;
  onWorkspaceSelect(wsId);
  showCheckModal.value = true;
}

async function openScheduleModal(ws: any) {
  scheduleTarget.value = ws;
  const wsId = ws.workspace_id || ws.id;
  const existing = schedules.value.find((s: any) => s.workspace_id === wsId);
  scheduleForm.value = { checkFrequency: existing?.check_frequency || 'weekly', checkDay: existing?.check_day ?? 1 };
  showScheduleModal.value = true;
}

async function saveSchedule() {
  if (!scheduleTarget.value) return;
  savingSchedule.value = true;
  try {
    const wsId = scheduleTarget.value.workspace_id || scheduleTarget.value.id;
    const wsName = scheduleTarget.value.display_name || scheduleTarget.value.displayName || wsId;
    await api(`/cisco/workspaces/${wsId}/schedule`, 'PUT', {
      workspaceName: wsName,
      checkFrequency: scheduleForm.value.checkFrequency,
      checkDay: scheduleForm.value.checkDay,
    });
    msg.success('Schedule saved');
    showScheduleModal.value = false;
    const sc = await api('/cisco/schedules').catch(() => ({ schedules: [] }));
    schedules.value = sc.schedules || [];
  } catch (e: any) {
    msg.error(e.message || 'Failed to save schedule');
  } finally { savingSchedule.value = false; }
}

watch(() => scheduleForm.value.checkFrequency, (freq) => {
  scheduleForm.value.checkDay = freq === 'monthly' ? 1 : 1;
});

watch(() => checkForm.value.checkFrequency, (freq) => {
  checkForm.value.checkDay = freq === 'monthly' ? 1 : 1;
});

// ---- Calendar ----
const calMonthName = computed(() =>
  calDate.value.toLocaleString('default', { month: 'long', year: 'numeric' })
);

function prevMonth() {
  const d = new Date(calDate.value);
  d.setMonth(d.getMonth() - 1);
  calDate.value = d;
}

function nextMonth() {
  const d = new Date(calDate.value);
  d.setMonth(d.getMonth() + 1);
  calDate.value = d;
}

function goToToday() { calDate.value = new Date(); }
function goToSpaces() { activeTab.value = 'spaces'; }

const calendarEvents = computed(() => {
  const map: Record<string, Array<{ name: string; color: string; status: string; checkType: string }>> = {};
  const year = calDate.value.getFullYear();
  const month = calDate.value.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Index actual checks: workspace_id -> date string -> status
  const doneMap: Record<string, Record<string, string>> = {};
  for (const chk of ciscoChecks.value) {
    const d = new Date(chk.checked_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!doneMap[chk.workspace_id]) doneMap[chk.workspace_id] = {};
      // Keep the best status if multiple checks on same day
      if (!doneMap[chk.workspace_id][dateStr] || chk.status === 'pass') {
        doneMap[chk.workspace_id][dateStr] = chk.status;
      }
    }
  }

  for (const sched of schedules.value) {
    const wsId = sched.workspace_id;
    const name = sched.workspace_name || wsId;
    const freq = sched.check_frequency || 'weekly';
    const checkDay = parseInt(sched.check_day) || 1;
    const scheduledDates: string[] = [];

    if (freq === 'daily') {
      for (let d = 1; d <= daysInMonth; d++) {
        scheduledDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    } else if (freq === 'weekly') {
      // checkDay is 0-6 (Sun-Sat)
      for (let d = 1; d <= daysInMonth; d++) {
        if (new Date(year, month, d).getDay() === checkDay) {
          scheduledDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
      }
    } else if (freq === 'monthly') {
      if (checkDay >= 1 && checkDay <= daysInMonth) {
        scheduledDates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(checkDay).padStart(2, '0')}`);
      }
    }

    for (const dateStr of scheduledDates) {
      if (!map[dateStr]) map[dateStr] = [];
      const dayDate = new Date(dateStr + 'T00:00:00');
      const done = doneMap[wsId]?.[dateStr];
      let color: string, evtStatus: string;
      if (done) {
        color = done === 'pass' ? '#22c55e' : '#ef4444';
        evtStatus = done === 'pass' ? 'done-pass' : 'done-fail';
      } else if (dayDate < today) {
        color = '#ef4444'; evtStatus = 'overdue';
      } else if (dayDate.getTime() === today.getTime()) {
        color = '#f59e0b'; evtStatus = 'due-today';
      } else {
        color = '#64748b'; evtStatus = 'scheduled';
      }
      map[dateStr].push({ name, color, status: evtStatus, checkType: freq });
    }
  }
  return map;
});

const calDays = computed(() => {
  const year = calDate.value.getFullYear();
  const month = calDate.value.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const start = new Date(firstDay);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const days = [];
  let d = new Date(start);
  while (d <= end) {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({
      dateStr,
      dayNum: d.getDate(),
      currentMonth: d.getMonth() === month,
      isToday: dateStr === todayStr,
      events: calendarEvents.value[dateStr] || [],
    });
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    d = next;
  }
  return days;
});

// Schedule option lists
const weekDayOptions = [
  { label: 'Sunday', value: 0 },
  { label: 'Monday', value: 1 },
  { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 },
  { label: 'Friday', value: 5 },
  { label: 'Saturday', value: 6 },
];

const monthDayOptions = Array.from({ length: 28 }, (_, i) => ({ label: String(i + 1), value: i + 1 }));

// ---- Stats ----
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

// ---- Location health ----
const locationHealth = computed(() => {
  const map: Record<string, { name: string; address: string; total: number; online: number; issues: number; offline: number }> = {};
  for (const d of devices.value) {
    const locId = d.locationId || d.location_id || d.raw_data?.locationId || 'Unknown';
    if (!map[locId]) {
      const locData = locations.value.find((l: any) => l.id === locId);
      const locName = locData?.displayName || locData?.name || d.raw_data?.locationName || locId;
      const addr = locData?.address
        ? `${locData.address.city || ''}${locData.address.state ? ', ' + locData.address.state : ''}`
        : (locData?.city ? `${locData.city}${locData.state ? ', ' + locData.state : ''}` : '');
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

// ---- Spaces ----
const spacesData = computed(() =>
  workspaces.value.map(ws => {
    const wsId = ws.workspace_id || ws.id;
    const wsName = ws.display_name || ws.displayName || wsId;
    const wsDevices = devices.value.filter(d => {
      const devWsId = d.workspaceId || d.workspace_id || d.raw_data?.workspaceId;
      return devWsId === wsId || d.raw_data?.workspaceName === wsName;
    });
    const onlineD = wsDevices.filter(d => (d.status || d.connectionStatus || '').toLowerCase() === 'connected').length;
    const issueD = wsDevices.filter(d => {
      const s = (d.status || d.connectionStatus || '').toLowerCase();
      return s.includes('issue') || s.includes('warn');
    }).length;
    const pct = wsDevices.length > 0 ? Math.round((onlineD / wsDevices.length) * 100) : null;
    const color = wsDevices.length === 0 ? '#64748b'
      : pct! >= 95 ? '#22c55e'
      : pct! >= 70 || issueD > 0 ? '#f59e0b'
      : '#ef4444';
    return { ...ws, _devices: wsDevices, _onlineCount: onlineD, _issueCount: issueD, _healthPct: pct, _healthColor: color };
  }).sort((a, b) => b._devices.length - a._devices.length)
);

// ---- Recent checks ----
const recentChecks = computed(() =>
  [...ciscoChecks.value]
    .sort((a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime())
    .slice(0, 100)
);

const checkOptions = computed(() =>
  workspaces.value.map(ws => ({
    label: ws.display_name || ws.displayName || ws.workspace_id,
    value: ws.workspace_id || ws.id,
  }))
);

// ---- Charts ----
const healthChartOption = computed(() => ({
  tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
  legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { color: colors.value.textSecondary, fontSize: 12 }, icon: 'circle', itemWidth: 10, itemHeight: 10 },
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
    const key = (d.product || d.raw_data?.product || 'Unknown').replace('Cisco ', '');
    counts[key] = (counts[key] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const palette = ['#0ea5e9', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#64748b', '#ec4899'];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'none' }, backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText, fontSize: 12 } },
    grid: { left: 8, right: 32, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: sorted.map(([k]) => k), inverse: true, axisLabel: { color: colors.value.textSecondary, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar', barWidth: 14,
      data: sorted.map(([, v], i) => ({ value: v, itemStyle: { color: palette[i % palette.length], borderRadius: [0, 4, 4, 0] } })),
      label: { show: true, position: 'right', color: colors.value.textMuted, fontSize: 11, formatter: (p: any) => p.value },
    }],
  };
});

// ---- Helpers ----
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

function devWorkspaceName(row: any) {
  if (row.raw_data?.workspaceName) return row.raw_data.workspaceName;
  const wsId = row.workspaceId || row.workspace_id || row.raw_data?.workspaceId;
  if (!wsId) return '-';
  const ws = workspaces.value.find((w: any) => (w.workspace_id || w.id) === wsId);
  return ws?.display_name || ws?.displayName || wsId;
}

function devLocationName(row: any) {
  if (row.raw_data?.locationName) return row.raw_data.locationName;
  const locId = row.locationId || row.location_id || row.raw_data?.locationId;
  if (!locId) return '-';
  const loc = locations.value.find((l: any) => l.id === locId);
  return loc?.displayName || loc?.name || locId;
}

function devFirmware(row: any) {
  return row.firmware || row.raw_data?.firmware || row.raw_data?.softwareVersion || '-';
}

// ---- Device columns ----
const deviceColumns: DataTableColumns<any> = [
  {
    title: 'Device', key: 'displayName', sorter: 'default', minWidth: 200,
    render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500;' }, row.display_name || row.displayName || row.device_id),
      h('div', { style: 'font-size:0.78rem;color:#94a3b8;margin-top:1px;' }, row.product || row.raw_data?.product || ''),
    ]),
  },
  { title: 'Status', key: 'status', width: 110, render: (row) => { const s = row.status || row.connectionStatus || ''; return h(NTag, { type: statusType(s), size: 'small', round: true }, () => statusLabel(s)); } },
  { title: 'Space', key: 'workspace', width: 200, render: (row) => h('span', { style: 'font-size:0.85rem;' }, devWorkspaceName(row)) },
  { title: 'Location', key: 'location', width: 160, render: (row) => h('span', { style: 'font-size:0.85rem;color:#94a3b8;' }, devLocationName(row)) },
  { title: 'IP', key: 'ip', width: 120, render: (row) => h('code', { style: 'font-size:0.8rem;' }, row.ip || '-') },
  { title: 'Firmware', key: 'firmware', width: 180, render: (row) => h('span', { style: 'font-size:0.78rem;color:#94a3b8;' }, devFirmware(row)) },
];

// ---- Space columns ----
const spaceColumns: DataTableColumns<any> = [
  {
    type: 'expand',
    renderExpand: (row) => {
      if (!row._devices.length) return h('div', { style: 'padding:8px 20px;color:#64748b;font-size:0.85rem;' }, 'No devices assigned to this space.');
      return h('div', { style: 'padding:6px 20px 10px;display:flex;flex-wrap:wrap;gap:8px;' },
        row._devices.map((d: any) => {
          const s = d.status || d.connectionStatus || '';
          return h('div', { style: 'display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.04);border-radius:6px;padding:5px 10px;' }, [
            h(NTag, { type: statusType(s), size: 'tiny', round: true }, () => statusLabel(s)),
            h('span', { style: 'font-size:0.82rem;font-weight:500;' }, d.display_name || d.displayName || d.device_id),
            h('span', { style: 'font-size:0.78rem;color:#64748b;' }, d.product || d.raw_data?.product || ''),
            d.ip ? h('code', { style: 'font-size:0.75rem;color:#64748b;' }, d.ip) : null,
          ].filter(Boolean));
        })
      );
    },
  },
  {
    title: 'Space', key: 'name', sorter: 'default', minWidth: 200,
    render: (row) => {
      const locId = row.locationId || row.location_id || row.raw_data?.locationId;
      const locData = locations.value.find((l: any) => l.id === locId);
      const locName = locData?.displayName || locData?.name || row.raw_data?.locationName || '';
      return h('div', {}, [
        h('div', { style: 'font-weight:500;' }, row.display_name || row.displayName || row.workspace_id),
        h('div', { style: 'font-size:0.78rem;color:#94a3b8;margin-top:1px;' }, locName),
      ]);
    },
  },
  {
    title: 'Type', key: 'type', width: 130,
    render: (row) => {
      const t = row.type || '-';
      const label: Record<string, string> = { meetingRoom: 'Meeting Room', boardRoom: 'Board Room', focusRoom: 'Focus Room', other: 'Other' };
      return h(NTag, { size: 'small', bordered: false }, () => label[t] || t);
    },
  },
  { title: 'Cap', key: 'capacity', width: 60, align: 'center', render: (row) => h('span', { style: 'color:#94a3b8;' }, row.capacity ?? '-') },
  {
    title: 'Devices', key: '_deviceCount', width: 80, align: 'center',
    render: (row) => h('span', { style: 'font-weight:600;' }, String(row._devices.length)),
  },
  {
    title: 'Schedule', key: 'schedule', width: 140,
    render: (row) => {
      const wsId = row.workspace_id || row.id;
      const sched = schedules.value.find((s: any) => s.workspace_id === wsId);
      if (!sched) {
        return h(NButton, { size: 'tiny', ghost: true, onClick: () => openScheduleModal(row) }, () => [
          h('i', { class: 'ph ph-calendar-plus', style: 'margin-right:3px;' }),
          'Set Schedule',
        ]);
      }
      const freqLabel: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayStr = sched.check_frequency === 'weekly'
        ? (dayLabels[sched.check_day] ?? '')
        : sched.check_frequency === 'monthly'
          ? `Day ${sched.check_day}`
          : '';
      return h('div', { style: 'cursor:pointer;', onClick: () => openScheduleModal(row) }, [
        h(NTag, { size: 'tiny', type: 'info', bordered: false }, () =>
          `${freqLabel[sched.check_frequency] || sched.check_frequency}${dayStr ? ' / ' + dayStr : ''}`
        ),
      ]);
    },
  },
  {
    title: 'Health', key: 'health', minWidth: 140,
    render: (row) => {
      if (!row._devices.length) return h('span', { style: 'color:#64748b;font-size:0.82rem;' }, 'No devices');
      const pct = row._healthPct ?? 0;
      return h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
        h('div', { style: 'flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden;' }, [
          h('div', { style: `width:${pct}%;height:100%;border-radius:3px;background:${row._healthColor};transition:width 0.8s;` }),
        ]),
        h('span', { style: `font-size:0.8rem;color:${row._healthColor};font-weight:600;min-width:36px;` }, pct + '%'),
      ]);
    },
  },
  {
    title: 'Status', key: 'healthBadge', width: 110,
    render: (row) => {
      if (!row._devices.length) return h(NTag, { size: 'small', bordered: false }, () => 'No devices');
      if (row._healthPct === 100) return h(NTag, { type: 'success', size: 'small', round: true }, () => 'All Online');
      if (row._issueCount > 0) return h(NTag, { type: 'warning', size: 'small', round: true }, () => 'Issues');
      if (row._onlineCount === 0) return h(NTag, { type: 'error', size: 'small', round: true }, () => 'Offline');
      return h(NTag, { type: 'warning', size: 'small', round: true }, () => 'Partial');
    },
  },
  {
    title: '', key: 'actions', width: 80,
    render: (row) => h(NButton, { size: 'tiny', type: 'primary', ghost: true, onClick: () => openCheckForSpace(row) }, () => 'Log Check'),
  },
];

// ---- Check history columns ----
const checkColumns: DataTableColumns<any> = [
  { title: 'Space', key: 'workspace_name', sorter: 'default', minWidth: 180, render: (row) => h('span', {}, row.workspace_name || row.workspace_id) },
  {
    title: 'Result', key: 'status', width: 100,
    render: (row) => {
      const s = (row.status || '').toLowerCase();
      return h(NTag, { type: s === 'pass' ? 'success' : s === 'fail' ? 'error' : 'default', size: 'small', round: true }, () =>
        s === 'pass' ? 'Pass' : s === 'fail' ? 'Fail' : row.status
      );
    },
  },
  { title: 'Checked By', key: 'checked_by', width: 130 },
  { title: 'Notes', key: 'notes', minWidth: 200, render: (row) => h('span', { style: 'font-size:0.82rem;color:#94a3b8;' }, row.notes || '-') },
  { title: 'SNOW Ticket', key: 'snow_ticket', width: 130, render: (row) => h('span', { style: 'font-size:0.82rem;' }, row.snow_ticket || '-') },
  {
    title: 'Date', key: 'checked_at', width: 170,
    sorter: (a, b) => new Date(b.checked_at).getTime() - new Date(a.checked_at).getTime(),
    render: (row) => h('span', { style: 'font-size:0.82rem;color:#94a3b8;' }, new Date(row.checked_at).toLocaleString()),
  },
];

// ---- Security data ----
const securityItems = [
  { icon: 'ph-lock', color: '#22c55e', title: 'TLS 1.2 Minimum Enforced', desc: 'All outbound connections to Webex use TLS 1.2 or higher - set in code, cannot be downgraded.' },
  { icon: 'ph-eye', color: '#0ea5e9', title: 'Read-Only by Default', desc: 'Device monitoring uses read-only API scopes. Write actions require explicit admin approval.' },
  { icon: 'ph-vault', color: '#8b5cf6', title: 'Credentials Server-Side Only', desc: 'OAuth tokens and API keys live in the backend .env file. No credential is ever sent to the browser.' },
  { icon: 'ph-gauge', color: '#f59e0b', title: 'Built-In Rate Limiting', desc: "Requests are queued with a 310ms minimum interval - stays under Cisco's 200 req/min limit automatically." },
  { icon: 'ph-clock-clockwise', color: '#ec4899', title: 'Token Auto-Refresh', desc: 'OAuth access tokens refresh automatically before expiry. No manual intervention required.' },
  { icon: 'ph-list-magnifying-glass', color: '#64748b', title: 'Full Audit Trail', desc: 'Every sync and API call is logged with timestamp, type, and record count.' },
];

const replacesItems = [
  { icon: 'ph-table', color: '#ef4444', title: 'Manual Spreadsheets', desc: 'No more tracking 40+ devices in Excel. Every device, IP, firmware version, and status is live from Control Hub.' },
  { icon: 'ph-browser', color: '#f59e0b', title: 'Logging into Control Hub', desc: 'Leadership and field ops never need to touch Cisco Control Hub. Status is visible right here in APEX.' },
  { icon: 'ph-phone', color: '#0ea5e9', title: 'Calling for Status Updates', desc: 'Is the boardroom device online before the 9am call? Check it here in 3 seconds - not 3 phone calls.' },
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
      <h1 style="margin:0 0 4px;font-size:1.5rem;font-weight:700;">Infrastructure</h1>
      <span style="font-size:0.85rem;color:#94a3b8;">Live device and workspace visibility - powered by Cisco Webex</span>
    </div>
    <NSpace align="center">
      <NSpin v-if="loading" size="small" />
      <template v-else-if="status">
        <NTag :type="status.connected || status.mock ? 'success' : 'error'" size="medium" :bordered="false" round>
          <i :class="status.connected || status.mock ? 'ph ph-check-circle' : 'ph ph-x-circle'" style="margin-right:5px;" />
          {{ status.mock ? 'Live (Mock)' : status.connected ? 'Connected' : 'Disconnected' }}
        </NTag>
        <NTag size="small" :bordered="false" style="color:#94a3b8;">
          <i class="ph ph-shield-check" style="margin-right:4px;color:#22c55e;" />TLS 1.2+
        </NTag>
      </template>
      <NButton size="small" :loading="syncing" @click="syncDevices">
        <i class="ph ph-arrows-clockwise" style="margin-right:4px;" />Sync
      </NButton>
    </NSpace>
  </NSpace>

  <NSpin :show="loading">
  <Transition name="fade-slide">
  <div v-if="show">

    <!-- Stats row -->
    <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:20px;">
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #0ea5e9', textAlign:'center' }">
          <NStatistic label="Devices">
            <template #default><NNumberAnimation :from="0" :to="totalDevices" :duration="900" /></template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">total managed</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #22c55e', textAlign:'center' }">
          <NStatistic label="Online">
            <template #default>
              <span style="color:#22c55e;"><NNumberAnimation :from="0" :to="onlineCount" :duration="900" /></span>
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
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">{{ issueCount }} issues, {{ offlineCount }} offline</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #8b5cf6', textAlign:'center' }">
          <NStatistic label="Spaces">
            <template #default>
              <span style="color:#8b5cf6;"><NNumberAnimation :from="0" :to="workspaces.length" :duration="900" /></span>
            </template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">workspaces mapped</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" :style="{ borderTop: '3px solid #ec4899', textAlign:'center' }">
          <NStatistic label="Locations">
            <template #default>
              <span style="color:#ec4899;"><NNumberAnimation :from="0" :to="locationCount" :duration="900" /></span>
            </template>
          </NStatistic>
          <div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">offices connected</div>
        </NCard>
      </NGi>
    </NGrid>

    <NTabs type="line" animated v-model:value="activeTab">

      <!-- OVERVIEW -->
      <NTabPane name="overview" tab="Overview">
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
              <NProgress type="line" :percentage="locHealthPct(loc)" :color="locHealthColor(loc)" :rail-color="colors.railColor" :height="6" :show-indicator="false" style="margin-bottom:10px;" />
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

      <!-- SPACES -->
      <NTabPane name="spaces" tab="Spaces">
        <NSpace justify="space-between" align="center" style="margin-bottom:12px;">
          <span style="font-size:0.85rem;color:#94a3b8;">
            {{ workspaces.length }} workspaces across {{ locationCount }} locations - expand a row to see devices
          </span>
          <NButton size="small" type="primary" @click="showCheckModal = true">
            <i class="ph ph-clipboard-text" style="margin-right:4px;" />Log Check
          </NButton>
        </NSpace>
        <NDataTable
          :columns="spaceColumns"
          :data="spacesData"
          :row-key="(r: any) => r.workspace_id || r.id"
          :bordered="false"
          size="small"
          striped
          :pagination="{ pageSize: 20 }"
        />
        <NEmpty v-if="!loading && workspaces.length === 0" description="No spaces found." style="margin-top:40px;" />
      </NTabPane>

      <!-- DEVICES -->
      <NTabPane name="devices" tab="Devices">
        <NSpace justify="space-between" align="center" style="margin-bottom:12px;">
          <span style="font-size:0.85rem;color:#94a3b8;">{{ totalDevices }} devices synced from Cisco Webex</span>
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
        <NEmpty v-if="!loading && devices.length === 0" description="No devices found. Click Refresh to sync from Control Hub." style="margin-top:40px;" />
      </NTabPane>

      <!-- CHECKS -->
      <NTabPane name="checks" tab="Checks">
        <NSpace justify="space-between" align="center" style="margin-bottom:12px;">
          <span style="font-size:0.85rem;color:#94a3b8;">Room check history - full audit trail</span>
          <NButton size="small" type="primary" @click="showCheckModal = true">
            <i class="ph ph-plus" style="margin-right:4px;" />New Check
          </NButton>
        </NSpace>
        <NDataTable
          v-if="recentChecks.length > 0"
          :columns="checkColumns"
          :data="recentChecks"
          :row-key="(r: any) => r.id"
          :bordered="false"
          size="small"
          striped
          :pagination="{ pageSize: 15 }"
        />
        <NEmpty
          v-else
          description="No check history yet. Log checks from the Spaces tab or the button above."
          style="margin-top:40px;"
        >
          <template #extra>
            <NButton @click="showCheckModal = true" type="primary" size="small">
              <i class="ph ph-plus" style="margin-right:4px;" />Log First Check
            </NButton>
          </template>
        </NEmpty>
      </NTabPane>

      <!-- CALENDAR -->
      <NTabPane name="calendar" tab="Calendar">
        <NSpace justify="space-between" align="center" style="margin-bottom:16px;">
          <div>
            <div style="font-weight:600;font-size:1.05rem;">{{ calMonthName }}</div>
            <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">
              {{ schedules.length }} rooms on schedule - green means checked, red means overdue
            </div>
          </div>
          <NSpace>
            <NButton size="small" @click="prevMonth"><i class="ph ph-caret-left" /></NButton>
            <NButton size="small" @click="goToToday">Today</NButton>
            <NButton size="small" @click="nextMonth"><i class="ph ph-caret-right" /></NButton>
            <NButton size="small" type="primary" @click="showCheckModal = true">
              <i class="ph ph-plus" style="margin-right:4px;" />Log Check
            </NButton>
          </NSpace>
        </NSpace>

        <!-- Legend -->
        <NSpace style="margin-bottom:12px;" :wrap="false">
          <span class="cal-legend-item">
            <span class="cal-dot" style="background:#22c55e;"></span>Passed
          </span>
          <span class="cal-legend-item">
            <span class="cal-dot" style="background:#ef4444;"></span>Failed / Overdue
          </span>
          <span class="cal-legend-item">
            <span class="cal-dot" style="background:#f59e0b;"></span>Due Today
          </span>
          <span class="cal-legend-item">
            <span class="cal-dot" style="background:#64748b;"></span>Upcoming
          </span>
        </NSpace>

        <!-- Calendar wrapper -->
        <div class="cal-wrapper">
          <!-- Day headers -->
          <div class="cal-header-row">
            <div v-for="day in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="day" class="cal-day-header">
              {{ day }}
            </div>
          </div>

          <!-- Calendar grid -->
          <div class="cal-grid">
            <div
              v-for="day in calDays"
              :key="day.dateStr"
              class="cal-cell"
              :class="{ 'cal-today': day.isToday, 'cal-other-month': !day.currentMonth }"
            >
              <div class="cal-day-num-wrap">
                <span class="cal-day-num" :class="{ 'cal-today-num': day.isToday }">{{ day.dayNum }}</span>
              </div>
              <div class="cal-events">
                <div
                  v-for="(evt, ei) in day.events.slice(0, 3)"
                  :key="ei"
                  class="cal-event-pill"
                  :style="{ borderLeftColor: evt.color }"
                  :title="evt.name + ' (' + evt.checkType + ') - ' + evt.status.replace(/-/g, ' ')"
                >
                  <span class="cal-event-dot" :style="{ background: evt.color }"></span>
                  <span class="cal-event-name">{{ evt.name }}</span>
                </div>
                <div v-if="day.events.length > 3" class="cal-more">+{{ day.events.length - 3 }} more</div>
              </div>
            </div>
          </div>
        </div>

        <NEmpty
          v-if="schedules.length === 0"
          description="No check schedules set. Go to Spaces and click 'Set Schedule' on each room."
          style="margin-top:40px;"
        >
          <template #extra>
            <NButton size="small" @click="goToSpaces">Go to Spaces</NButton>
          </template>
        </NEmpty>
      </NTabPane>

      <!-- SECURITY -->
      <NTabPane name="security" tab="Why It's Safe">
        <NGrid :x-gap="16" :y-gap="12" :cols="2" style="margin-top:4px;">
          <NGi>
            <NCard size="small" title="How Credentials Work">
              <div style="font-size:0.9rem;line-height:1.7;">
                <div style="margin-bottom:12px;color:#94a3b8;">Your Cisco credentials never touch the browser. Here is the full request path:</div>
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
                  <div style="margin-left:15px;color:#64748b;font-size:0.8rem;"><i class="ph ph-arrow-down" /> HTTPS + JWT auth</div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:#8b5cf620;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                      <i class="ph ph-server" style="color:#8b5cf6;" />
                    </div>
                    <div>
                      <div style="font-weight:600;font-size:0.85rem;">APEX Backend</div>
                      <div style="font-size:0.78rem;color:#94a3b8;">Holds credentials, enforces rate limits, logs every call</div>
                    </div>
                  </div>
                  <div style="margin-left:15px;color:#64748b;font-size:0.8rem;"><i class="ph ph-arrow-down" /> TLS 1.2+ minimum</div>
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
                <div v-for="item in securityItems" :key="item.title" style="display:flex;gap:10px;align-items:flex-start;">
                  <div :style="{ width:'30px', height:'30px', borderRadius:'6px', background: item.color+'20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0' }">
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
                <NGi v-for="item in replacesItems" :key="item.title">
                  <div style="display:flex;gap:10px;align-items:flex-start;">
                    <div :style="{ width:'32px', height:'32px', borderRadius:'6px', background: item.color+'20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0' }">
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

  <!-- Log Check Modal -->
  <NModal v-model:show="showCheckModal" title="Log Room Check" preset="card" style="width:500px;" :mask-closable="false">
    <NForm label-placement="top" size="small">
      <NFormItem label="Space / Room" required>
        <NSelect
          v-model:value="checkForm.workspaceId"
          :options="checkOptions"
          placeholder="Select a workspace..."
          filterable
          @update:value="onWorkspaceSelect"
        />
      </NFormItem>
      <NFormItem label="Checked By">
        <NInput v-model:value="checkForm.checkedBy" placeholder="Your name (e.g. J. Smith)..." />
      </NFormItem>
      <NFormItem label="Result">
        <NRadioGroup v-model:value="checkForm.checkStatus">
          <NSpace>
            <NRadio value="pass">Pass - All equipment working</NRadio>
            <NRadio value="fail">Fail - Issues found</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
      <NFormItem label="Notes">
        <NInput v-model:value="checkForm.notes" type="textarea" :rows="3" placeholder="Observations, issues found, follow-up needed..." />
      </NFormItem>
      <NFormItem label="SNOW Ticket (optional)">
        <NInput v-model:value="checkForm.snowTicket" placeholder="e.g. INC0012345" />
      </NFormItem>
      <NDivider style="margin:12px 0 10px;" />
      <NSpace justify="space-between" align="center" style="margin-bottom:10px;">
        <span style="font-size:0.85rem;font-weight:600;">Set / Update Check Schedule</span>
        <NSwitch v-model:value="checkForm.setSchedule" size="small" />
      </NSpace>
      <template v-if="checkForm.setSchedule">
        <NFormItem label="Frequency">
          <NRadioGroup v-model:value="checkForm.checkFrequency">
            <NSpace>
              <NRadio value="daily">Daily</NRadio>
              <NRadio value="weekly">Weekly</NRadio>
              <NRadio value="monthly">Monthly</NRadio>
            </NSpace>
          </NRadioGroup>
        </NFormItem>
        <NFormItem v-if="checkForm.checkFrequency === 'weekly'" label="Day of Week">
          <NSelect v-model:value="checkForm.checkDay" :options="weekDayOptions" />
        </NFormItem>
        <NFormItem v-if="checkForm.checkFrequency === 'monthly'" label="Day of Month">
          <NSelect v-model:value="checkForm.checkDay" :options="monthDayOptions" />
        </NFormItem>
      </template>
    </NForm>
    <template #action>
      <NSpace justify="end">
        <NButton @click="showCheckModal = false">Cancel</NButton>
        <NButton type="primary" :loading="savingCheck" :disabled="!checkForm.workspaceId" @click="saveCheck">
          <i class="ph ph-check" style="margin-right:4px;" />Save Check
        </NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- Set Schedule Modal -->
  <NModal
    v-model:show="showScheduleModal"
    :title="'Check Schedule - ' + (scheduleTarget?.display_name || scheduleTarget?.displayName || '')"
    preset="card"
    style="width:420px;"
    :mask-closable="false"
  >
    <NForm label-placement="top" size="small">
      <NFormItem label="How often should this room be checked?">
        <NRadioGroup v-model:value="scheduleForm.checkFrequency">
          <NSpace>
            <NRadio value="daily">Daily</NRadio>
            <NRadio value="weekly">Weekly</NRadio>
            <NRadio value="monthly">Monthly</NRadio>
          </NSpace>
        </NRadioGroup>
      </NFormItem>
      <NFormItem v-if="scheduleForm.checkFrequency === 'weekly'" label="Day of Week">
        <NSelect v-model:value="scheduleForm.checkDay" :options="weekDayOptions" />
      </NFormItem>
      <NFormItem v-if="scheduleForm.checkFrequency === 'monthly'" label="Day of Month">
        <NSelect v-model:value="scheduleForm.checkDay" :options="monthDayOptions" />
      </NFormItem>
      <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;">
        This schedule will appear on the Calendar tab so techs know when to check this room.
      </div>
    </NForm>
    <template #action>
      <NSpace justify="end">
        <NButton @click="showScheduleModal = false">Cancel</NButton>
        <NButton type="primary" :loading="savingSchedule" @click="saveSchedule">
          <i class="ph ph-calendar-check" style="margin-right:4px;" />Save Schedule
        </NButton>
      </NSpace>
    </template>
  </NModal>

</div>
</NConfigProvider>
</NMessageProvider>
</template>

<style scoped>
.fade-slide-enter-active { transition: opacity 0.4s ease, transform 0.4s ease; }
.fade-slide-enter-from { opacity: 0; transform: translateY(12px); }

/* Calendar */
.cal-wrapper {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255,255,255,0.02);
}
.cal-header-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.cal-day-header {
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #64748b;
  padding: 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.cal-cell {
  min-height: 90px;
  padding: 6px;
  background: transparent;
  border-right: 1px solid rgba(255,255,255,0.06);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  overflow: hidden;
  transition: background 0.15s;
}
.cal-cell:hover {
  background: rgba(255,255,255,0.03);
}
.cal-cell:nth-child(7n) {
  border-right: none;
}
.cal-today {
  background: rgba(14, 165, 233, 0.08) !important;
  border-right-color: rgba(14, 165, 233, 0.2) !important;
  border-bottom-color: rgba(14, 165, 233, 0.2) !important;
}
.cal-other-month {
  opacity: 0.28;
}
.cal-day-num-wrap {
  margin-bottom: 4px;
  line-height: 1;
}
.cal-day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  color: #94a3b8;
  font-weight: 500;
  width: 22px;
  height: 22px;
  border-radius: 50%;
}
.cal-today-num {
  background: #0ea5e9;
  color: #fff;
  font-weight: 700;
}
.cal-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cal-event-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.66rem;
  line-height: 1.3;
  border-radius: 3px;
  padding: 2px 4px 2px 5px;
  background: rgba(255,255,255,0.06);
  border-left: 2px solid;
  overflow: hidden;
  cursor: default;
}
.cal-event-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cal-event-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cbd5e1;
}
.cal-more {
  font-size: 0.63rem;
  color: #64748b;
  padding-left: 5px;
}
.cal-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.cal-legend-item {
  font-size: 0.78rem;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
