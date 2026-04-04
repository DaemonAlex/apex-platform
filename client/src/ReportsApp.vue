<script setup lang="ts">
import { ref, onMounted, computed, h } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NTabs, NTabPane, NCard, NGrid, NGi, NStatistic, NProgress,
  NDataTable, NTag, NEmpty, NSpin, NButton, NSpace, NSelect,
} from 'naive-ui';
import { useTheme } from './composables/useTheme';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer]);

const loading = ref(true);
const activeTab = ref('health');
const healthMatrix = ref<any>(null);
const portfolio = ref<any>(null);
const budget = ref<any>(null);
const timeline = ref<any>(null);
const myWork = ref<any>(null);
const compliance = ref<any>(null);
const expandedProject = ref<any>(null);
const expandLoading = ref(false);

const tk = () => localStorage.getItem('apex_token');
async function api(path: string) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + tk() } });
  return res.json();
}

function navigateTo(view: string) {
  const showView = (window as any).showView;
  if (typeof showView === 'function') showView(view);
}

function openProject(projectId: string) {
  window.dispatchEvent(new CustomEvent('apex-open-project', { detail: { id: projectId } }));
  navigateTo('projects');
}

function fmt(v: number) {
  if (Math.abs(v) >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

// Signal dot renderer
function signalDot(signal: string, label?: string) {
  const colorMap: Record<string, string> = { red: '#ef4444', amber: '#f59e0b', green: '#22c55e', gray: '#94a3b8' };
  const c = colorMap[signal] || '#94a3b8';
  return h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
    h('span', { style: `width:10px;height:10px;border-radius:50%;background:${c};display:inline-block;flex-shrink:0;` }),
    label ? h('span', { style: `font-size:0.82rem;color:${c === '#94a3b8' ? c : ''};` }, label) : null,
  ]);
}

async function handleTab(tab: string) {
  activeTab.value = tab;
  loading.value = true;
  try {
    if (tab === 'health' && !healthMatrix.value) healthMatrix.value = await api('/reports/health-matrix');
    if (tab === 'budget' && !budget.value) budget.value = await api('/reports/budget');
    if (tab === 'schedule' && !timeline.value) timeline.value = await api('/reports/timeline');
    if (tab === 'mywork' && !myWork.value) myWork.value = await api('/reports/my-work');
    if (tab === 'portfolio' && !portfolio.value) {
      const [p, c] = await Promise.all([api('/reports/portfolio'), api('/room-status/compliance/scorecard')]);
      portfolio.value = p;
      compliance.value = c;
    }
  } finally { loading.value = false; }
}

onMounted(async () => {
  healthMatrix.value = await api('/reports/health-matrix');
  loading.value = false;
});

// Drill-down removed - projects open via openProject() now

// Health matrix table columns
const healthColumns = [
  {
    title: 'Project', key: 'name', sorter: 'default' as any, width: 240,
    render: (r: any) => h('div', { style: 'cursor:pointer;', onClick: () => openProject(r.id) }, [
      h('div', { style: 'font-weight:600;color:#38bdf8;' }, r.name),
      h('div', { style: 'font-size:0.75rem;color:#94a3b8;margin-top:1px;' },
        [r.type || '', r.businessLine ? ' - ' + r.businessLine : ''].filter(Boolean).join('') || r.id),
    ]),
  },
  {
    title: 'PM', key: 'pm', width: 120,
    render: (r: any) => h('span', { style: 'font-size:0.85rem;' }, r.pm || '-'),
  },
  {
    title: 'Status', key: 'status', width: 100, sorter: 'default' as any,
    render: (r: any) => h(NTag, {
      type: ({ active: 'success', 'in-progress': 'success', 'on-hold': 'warning', planning: 'info', scheduled: 'info', completed: 'default' } as any)[r.status] || 'default',
      size: 'small', bordered: false,
    }, () => r.status),
  },
  {
    title: 'Budget', key: 'budget.signal', width: 130, sorter: (a: any, b: any) => {
      const o: Record<string, number> = { red: 0, amber: 1, green: 2, gray: 3 };
      return (o[a.budget.signal] ?? 3) - (o[b.budget.signal] ?? 3);
    },
    render: (r: any) => {
      if (r.budget.signal === 'gray') return signalDot('gray', 'No budget');
      const v = r.budget.variance;
      const label = v > 0 ? `Over ${v}%` : v < 0 ? `Under ${Math.abs(v)}%` : 'On track';
      return signalDot(r.budget.signal, label);
    },
  },
  {
    title: 'Schedule', key: 'schedule.signal', width: 130, sorter: (a: any, b: any) => {
      const o: Record<string, number> = { red: 0, amber: 1, green: 2, gray: 3 };
      return (o[a.schedule.signal] ?? 3) - (o[b.schedule.signal] ?? 3);
    },
    render: (r: any) => {
      if (r.schedule.signal === 'gray') return signalDot('gray', 'No date');
      const d = r.schedule.daysUntilDue;
      if (d === null) return signalDot('green', 'On track');
      if (d < 0) return signalDot('red', `${Math.abs(d)}d overdue`);
      if (d === 0) return signalDot('amber', 'Due today');
      return signalDot(r.schedule.signal, `${d}d left`);
    },
  },
  {
    title: 'Tasks', key: 'tasks.signal', width: 140, sorter: (a: any, b: any) => {
      const o: Record<string, number> = { red: 0, amber: 1, green: 2, gray: 3 };
      return (o[a.tasks.signal] ?? 3) - (o[b.tasks.signal] ?? 3);
    },
    render: (r: any) => {
      if (r.tasks.signal === 'gray') return signalDot('gray', 'No tasks');
      const label = `${r.tasks.completed}/${r.tasks.total}` + (r.tasks.overdue > 0 ? ` (${r.tasks.overdue} late)` : '');
      return signalDot(r.tasks.signal, label);
    },
  },
  {
    title: 'Progress', key: 'progress', width: 90, sorter: 'default' as any,
    render: (r: any) => h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
      h(NProgress, { type: 'line', percentage: r.progress || 0, height: 6, borderRadius: 3, showIndicator: false, style: 'width:50px;' }),
      h('span', { style: 'font-size:0.8rem;color:#94a3b8;' }, (r.progress || 0) + '%'),
    ]),
  },
  {
    title: 'Risk', key: 'risk', width: 70, sorter: (a: any, b: any) => {
      const o: Record<string, number> = { red: 0, amber: 1, green: 2, gray: 3 };
      return (o[a.risk] ?? 3) - (o[b.risk] ?? 3);
    },
    render: (r: any) => {
      const colorMap: Record<string, string> = { red: '#ef4444', amber: '#f59e0b', green: '#22c55e', gray: '#94a3b8' };
      return h('div', { style: `width:24px;height:24px;border-radius:4px;background:${colorMap[r.risk] || '#94a3b8'};margin:0 auto;` });
    },
  },
];

// My Work - sort overdue first, then due soon, then rest
const myWorkSorted = computed(() => {
  if (!myWork.value?.tasks) return [];
  const now = Date.now();
  return [...myWork.value.tasks].sort((a, b) => {
    const aOver = a.status !== 'completed' && a.endDate && new Date(a.endDate).getTime() < now;
    const bOver = b.status !== 'completed' && b.endDate && new Date(b.endDate).getTime() < now;
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    const aDate = a.endDate ? new Date(a.endDate).getTime() : Infinity;
    const bDate = b.endDate ? new Date(b.endDate).getTime() : Infinity;
    return aDate - bDate;
  });
});

const { naiveTheme, themeOverrides, colors } = useTheme();

// Custom report builder state (kept for Advanced tab)
const customReport = ref<any>(null);
const customLoading = ref(false);
const customSource = ref('projects');
const customGroupBy = ref('status');
const customMetric = ref('count');
const customStatus = ref<string | null>(null);
const customChartType = ref('bar');
const customDateFrom = ref<string>('');
const customDateTo = ref<string>('');

const sourceOptions = [
  { label: 'Projects', value: 'projects' },
  { label: 'Field Operations', value: 'fieldops' },
  { label: 'Rooms', value: 'rooms' },
  { label: 'Equipment', value: 'equipment' },
  { label: 'Vendors', value: 'vendors' },
];

const groupByOptions = computed(() => {
  const m: Record<string, any[]> = {
    projects: [
      { label: 'Status', value: 'status' }, { label: 'Type', value: 'type' },
      { label: 'Business Line', value: 'businessLine' }, { label: 'Client', value: 'client' },
      { label: 'Priority', value: 'priority' }, { label: 'Cost Center', value: 'costCenter' },
      { label: 'Site Location', value: 'siteLocation' },
      { label: 'Month', value: 'month' }, { label: 'Quarter', value: 'quarter' },
    ],
    fieldops: [
      { label: 'Status', value: 'status' }, { label: 'Type', value: 'type' },
      { label: 'Technician', value: 'assignee' }, { label: 'Location', value: 'location' },
      { label: 'Month', value: 'month' },
    ],
    rooms: [
      { label: 'Building', value: 'location' }, { label: 'Room Type', value: 'type' },
      { label: 'Check Status', value: 'status' }, { label: 'Floor', value: 'floor' },
    ],
    equipment: [
      { label: 'Category', value: 'category' }, { label: 'Manufacturer', value: 'make' },
      { label: 'Building', value: 'location' },
    ],
    vendors: [
      { label: 'Type', value: 'type' }, { label: 'Category', value: 'category' },
    ],
  };
  return m[customSource.value] || [];
});

const metricOptions = computed(() => {
  if (customSource.value === 'projects') return [
    { label: 'Count', value: 'count' }, { label: 'Budget', value: 'budget' },
    { label: 'Actual Spend', value: 'actual' }, { label: 'Variance', value: 'variance' },
  ];
  if (customSource.value === 'fieldops') return [
    { label: 'Count', value: 'count' }, { label: 'Duration (hrs)', value: 'duration' },
  ];
  return [{ label: 'Count', value: 'count' }];
});

const statusFilterOptions = computed(() => {
  if (customSource.value === 'projects') return [
    { label: 'Active', value: 'active' }, { label: 'Planning', value: 'planning' },
    { label: 'On Hold', value: 'on-hold' }, { label: 'Completed', value: 'completed' },
  ];
  if (customSource.value === 'fieldops') return [
    { label: 'Scheduled', value: 'scheduled' }, { label: 'In Progress', value: 'in-progress' },
    { label: 'Completed', value: 'completed' }, { label: 'Pending', value: 'pending' },
  ];
  return [];
});

async function runCustomReport() {
  customLoading.value = true;
  try {
    const params = new URLSearchParams({ source: customSource.value, groupBy: customGroupBy.value, metric: customMetric.value });
    if (customStatus.value) params.set('status', customStatus.value);
    if (customDateFrom.value) params.set('from', customDateFrom.value);
    if (customDateTo.value) params.set('to', customDateTo.value);
    customReport.value = await api('/reports/custom?' + params.toString());
  } finally { customLoading.value = false; }
}

function handleSourceChange() {
  customGroupBy.value = groupByOptions.value[0]?.value || 'status';
  customMetric.value = 'count';
  customStatus.value = null;
  customDateFrom.value = '';
  customDateTo.value = '';
  customReport.value = null;
}

function exportReportCsv() {
  if (!customReport.value?.rows?.length) return;
  const rows = customReport.value.rows;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map((r: any) => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${customSource.value}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const chartColors = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];

const customChartOption = computed(() => {
  if (!customReport.value?.groups?.length) return {};
  const groups = customReport.value.groups;
  if (customChartType.value === 'pie') {
    return {
      tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
      series: [{ type: 'pie', radius: ['40%', '75%'], center: ['50%', '50%'],
        itemStyle: { borderRadius: 6, borderColor: colors.value.cardBg, borderWidth: 2 },
        label: { show: true, color: colors.value.textSecondary, fontSize: 12, formatter: '{b}: {c}' },
        data: groups.map((g: any, i: number) => ({ value: g.value, name: g.key, itemStyle: { color: chartColors[i % chartColors.length] } })),
      }],
    };
  }
  return {
    tooltip: { trigger: 'axis', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
    grid: { left: 16, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: groups.map((g: any) => g.key), axisLabel: { color: colors.value.textMuted, fontSize: 11, rotate: groups.length > 6 ? 30 : 0 }, axisLine: { lineStyle: { color: colors.value.railColor } } },
    yAxis: { type: 'value', axisLabel: { color: colors.value.textMuted, fontSize: 11 }, splitLine: { lineStyle: { color: colors.value.railColor, opacity: 0.3 } } },
    series: [{ type: 'bar', barMaxWidth: 40,
      data: groups.map((g: any, i: number) => ({ value: g.value, itemStyle: { color: chartColors[i % chartColors.length], borderRadius: [4, 4, 0, 0] } })),
    }],
  };
});
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">
  <h1 style="margin:0 0 16px 0;font-size:1.5rem;">Reports</h1>

  <NTabs :value="activeTab" type="line" @update:value="handleTab" style="margin-bottom:16px;">
    <NTabPane name="health" tab="Project Health" />
    <NTabPane name="budget" tab="Budget" />
    <NTabPane name="schedule" tab="Schedule" />
    <NTabPane name="mywork" tab="My Work" />
    <NTabPane name="portfolio" tab="Portfolio" />
    <NTabPane name="custom" tab="Advanced" />
  </NTabs>

  <NSpin :show="loading">

    <!-- ============ HEALTH MATRIX ============ -->
    <template v-if="activeTab === 'health' && healthMatrix">
      <!-- Summary bar -->
      <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom:20px;">
        <NGi>
          <NCard size="small" style="text-align:center;">
            <NStatistic label="Total Projects" :value="healthMatrix.summary?.total || 0" />
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" style="text-align:center;border-bottom:3px solid #ef4444;">
            <NStatistic label="At Risk" :value="healthMatrix.summary?.red || 0">
              <template #prefix><span style="color:#ef4444;">&#9679;</span></template>
            </NStatistic>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" style="text-align:center;border-bottom:3px solid #f59e0b;">
            <NStatistic label="Needs Attention" :value="healthMatrix.summary?.amber || 0">
              <template #prefix><span style="color:#f59e0b;">&#9679;</span></template>
            </NStatistic>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" style="text-align:center;border-bottom:3px solid #22c55e;">
            <NStatistic label="On Track" :value="healthMatrix.summary?.green || 0">
              <template #prefix><span style="color:#22c55e;">&#9679;</span></template>
            </NStatistic>
          </NCard>
        </NGi>
      </NGrid>

      <!-- The matrix -->
      <NCard size="small">
        <template #header>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span>All Projects</span>
            <span :style="{ fontSize: '0.8rem', color: colors.textMuted }">Click a project to open it. Click column headers to sort.</span>
          </div>
        </template>
        <NDataTable
          :columns="healthColumns"
          :data="healthMatrix.projects || []"
          :row-key="(r: any) => r.id"
          :bordered="false"
          size="small"
          striped
          :pagination="{ pageSize: 25 }"
          :row-props="(r: any) => ({
            style: r.risk === 'red' ? 'border-left:3px solid #ef4444;' : r.risk === 'amber' ? 'border-left:3px solid #f59e0b;' : ''
          })"
        />
      </NCard>
    </template>

    <!-- ============ BUDGET ============ -->
    <template v-if="activeTab === 'budget' && budget">
      <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom:20px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total Planned" :value="fmt(budget.totals?.planned || 0)" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total Actual" :value="fmt(budget.totals?.actual || 0)" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;">
          <NStatistic label="Variance" :value="(budget.totals?.variance > 0 ? '+' : '') + fmt(Math.abs(budget.totals?.variance || 0))">
            <template #prefix><span :style="{ color: budget.totals?.variance > 0 ? '#ef4444' : '#22c55e' }">&#9679;</span></template>
          </NStatistic>
        </NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Variance %" :value="(budget.totals?.variancePercent > 0 ? '+' : '') + budget.totals?.variancePercent + '%'" /></NCard></NGi>
      </NGrid>
      <NCard size="small" title="Project Budget Detail">
        <NDataTable :columns="[
          { title: 'Project', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => openProject(r.id) }, r.name) },
          { title: 'Status', key: 'status', width: 100, render: (r: any) => h(NTag, { type: ({active:'success','on-hold':'warning',completed:'success',planning:'info'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
          { title: 'Planned', key: 'planned', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.planned) },
          { title: 'Actual', key: 'actual', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.actual) },
          { title: 'Variance', key: 'variance', width: 140, align: 'right' as any, sorter: 'default' as any, render: (r: any) => h('span', { style: 'color:' + (r.variance > 0 ? '#ef4444' : '#22c55e') + ';font-weight:500;' }, (r.variance > 0 ? '+' : '') + fmt(Math.abs(r.variance)) + ' (' + (r.variancePercent > 0 ? '+' : '') + r.variancePercent + '%)') },
        ]" :data="budget.projects || []" :row-key="(r: any) => r.id" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />
      </NCard>
    </template>

    <!-- ============ SCHEDULE ============ -->
    <template v-if="activeTab === 'schedule' && timeline">
      <NGrid :x-gap="12" :y-gap="12" :cols="3" style="margin-bottom:20px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Overdue" :value="timeline.overdue?.length || 0"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Upcoming" :value="timeline.upcoming?.length || 0"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Recently Completed" :value="timeline.recentlyCompleted?.length || 0"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
      </NGrid>

      <NCard v-if="timeline.overdue?.length" size="small" title="Overdue Projects" style="margin-bottom:16px;border-left:3px solid #ef4444;">
        <NDataTable :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => openProject(r.id) }, r.name) },
          { title: 'Type', key: 'type', width: 120 },
          { title: 'Progress', key: 'progress', width: 100, render: (r: any) => h(NProgress, { type: 'line', percentage: r.progress || 0, height: 8, borderRadius: 4, showIndicator: false, style: 'width:60px;display:inline-block;' }) },
          { title: 'Days Overdue', key: 'daysOverdue', width: 110, align: 'right' as any, sorter: 'default' as any, render: (r: any) => h('span', { style: 'color:#ef4444;font-weight:600;' }, r.daysOverdue + 'd') },
        ]" :data="timeline.overdue" :row-key="(r: any) => r.id" :bordered="false" size="small" />
      </NCard>

      <NCard size="small" title="Upcoming Deadlines" style="margin-bottom:16px;">
        <NDataTable v-if="timeline.upcoming?.length" :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => openProject(r.id) }, r.name) },
          { title: 'Type', key: 'type', width: 120 },
          { title: 'Progress', key: 'progress', width: 100, render: (r: any) => h(NProgress, { type: 'line', percentage: r.progress || 0, height: 8, borderRadius: 4, showIndicator: false, style: 'width:60px;display:inline-block;' }) },
          { title: 'Due In', key: 'daysUntilDue', width: 90, align: 'right' as any, sorter: 'default' as any, render: (r: any) => h('span', { style: 'color:' + (r.daysUntilDue <= 7 ? '#f59e0b' : '#94a3b8') + ';font-weight:500;' }, r.daysUntilDue + 'd') },
        ]" :data="timeline.upcoming" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
        <NEmpty v-else description="No upcoming deadlines" />
      </NCard>

      <NCard v-if="timeline.recentlyCompleted?.length" size="small" title="Recently Completed">
        <NDataTable :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
          { title: 'Type', key: 'type', width: 120 },
          { title: 'Completed', key: 'completedAt', width: 120, render: (r: any) => new Date(r.completedAt).toLocaleDateString() },
        ]" :data="timeline.recentlyCompleted" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
      </NCard>
    </template>

    <!-- ============ MY WORK ============ -->
    <template v-if="activeTab === 'mywork' && myWork">
      <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:20px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total" :value="myWork.summary?.totalTasks || 0" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Completed" :value="myWork.summary?.completed || 0"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Active" :value="myWork.summary?.active || 0"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Due Soon" :value="myWork.summary?.dueSoon || 0"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;border-bottom: (myWork.summary?.overdue || 0) > 0 ? '3px solid #ef4444' : 'none';"><NStatistic label="Overdue" :value="myWork.summary?.overdue || 0"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
      </NGrid>

      <NGrid :x-gap="16" :y-gap="16" :cols="2" style="margin-bottom:16px;">
        <NGi>
          <NCard size="small" title="Hours">
            <div style="display:flex;gap:24px;">
              <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:#0ea5e9;">{{ myWork.summary?.estimatedHours || 0 }}h</div><div style="font-size:0.8rem;color:#94a3b8;">Estimated</div></div>
              <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:#22c55e;">{{ myWork.summary?.completedHours || 0 }}h</div><div style="font-size:0.8rem;color:#94a3b8;">Completed</div></div>
            </div>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" title="Assigned To">
            <div style="font-size:1.1rem;font-weight:600;">{{ myWork.user?.name || 'You' }}</div>
          </NCard>
        </NGi>
      </NGrid>

      <NCard size="small" title="My Tasks">
        <NDataTable v-if="myWorkSorted.length" :columns="[
          { title: 'Task', key: 'name', sorter: 'default' as any, render: (r: any) => {
            const isOverdue = r.status !== 'completed' && r.endDate && new Date(r.endDate) < new Date();
            return h('div', { style: 'cursor:pointer;', onClick: () => openProject(r.projectId) }, [
              h('span', { style: 'font-weight:500;' + (isOverdue ? 'color:#ef4444;' : '') }, r.name),
              isOverdue ? h(NTag, { type: 'error', size: 'tiny', bordered: false, style: 'margin-left:6px;' }, () => 'Overdue') : null,
            ]);
          }},
          { title: 'Project', key: 'projectName', width: 180, render: (r: any) => h('span', { style: 'color:#94a3b8;cursor:pointer;', onClick: () => openProject(r.projectId) }, r.projectName) },
          { title: 'Status', key: 'status', width: 110, sorter: 'default' as any, render: (r: any) => h(NTag, { type: ({'not-started':'default','in-progress':'info',completed:'success','on-hold':'warning'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
          { title: 'Priority', key: 'priority', width: 80, sorter: 'default' as any, render: (r: any) => h(NTag, { type: ({critical:'error',high:'warning',medium:'info',low:'default'} as any)[r.priority] || 'default', size: 'small', bordered: false }, () => r.priority || '-') },
          { title: 'Due', key: 'endDate', width: 100, sorter: 'default' as any, render: (r: any) => r.endDate ? new Date(r.endDate).toLocaleDateString() : '-' },
          { title: 'Hours', key: 'estimatedHours', width: 60, align: 'right' as any, render: (r: any) => r.estimatedHours ? r.estimatedHours + 'h' : '-' },
        ]" :data="myWorkSorted" :row-key="(r: any) => r.id || r.name" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />
        <NEmpty v-else description="No tasks assigned to you" />
      </NCard>
    </template>

    <!-- ============ PORTFOLIO ============ -->
    <template v-if="activeTab === 'portfolio' && portfolio">
      <NGrid :x-gap="12" :y-gap="12" :cols="6" style="margin-bottom:20px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total" :value="portfolio.projects?.total" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Active" :value="portfolio.projects?.active"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="At Risk" :value="portfolio.atRisk"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="On-Time" :value="portfolio.onTimeRate + '%'" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="On Hold" :value="portfolio.projects?.onHold"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Completed" :value="portfolio.projects?.completed" /></NCard></NGi>
      </NGrid>
      <NGrid :x-gap="16" :y-gap="16" :cols="3" style="margin-bottom:20px;">
        <NGi>
          <NCard size="small" title="Task Completion">
            <div style="text-align:center;margin-bottom:12px;">
              <span style="font-size:2.5rem;font-weight:700;color:#0ea5e9;">{{ portfolio.tasks?.completionRate || 0 }}%</span>
            </div>
            <NProgress type="line" :percentage="portfolio.tasks?.completionRate || 0" :height="14" :border-radius="7" indicator-placement="inside" />
            <NGrid :cols="3" style="margin-top:16px;text-align:center;">
              <NGi><div style="font-size:1.5rem;font-weight:700;color:#22c55e;">{{ portfolio.tasks?.completed }}</div><div style="font-size:0.8rem;color:#94a3b8;">Done</div></NGi>
              <NGi><div style="font-size:1.5rem;font-weight:700;color:#0ea5e9;">{{ portfolio.tasks?.inProgress }}</div><div style="font-size:0.8rem;color:#94a3b8;">In Progress</div></NGi>
              <NGi><div style="font-size:1.5rem;font-weight:700;color:#94a3b8;">{{ portfolio.tasks?.notStarted }}</div><div style="font-size:0.8rem;color:#94a3b8;">Not Started</div></NGi>
            </NGrid>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" title="Budget Health">
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Planned</span><span style="font-size:1.2rem;font-weight:700;">{{ fmt(portfolio.budget?.totalPlanned || 0) }}</span></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Actual</span><span style="font-size:1.2rem;font-weight:700;">{{ fmt(portfolio.budget?.totalActual || 0) }}</span></div>
              <div :style="{ borderTop: '1px solid ' + colors.borderSubtle, paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }">
                <span style="font-weight:600;" :style="{ color: (portfolio.budget?.variance || 0) > 0 ? '#ef4444' : '#22c55e' }">Variance</span>
                <span style="font-size:1.2rem;font-weight:700;" :style="{ color: (portfolio.budget?.variance || 0) > 0 ? '#ef4444' : '#22c55e' }">{{ (portfolio.budget?.variance || 0) > 0 ? '+' : '' }}{{ fmt(Math.abs(portfolio.budget?.variance || 0)) }}</span>
              </div>
            </div>
          </NCard>
        </NGi>
        <NGi>
          <NCard size="small" title="Room Health" v-if="compliance">
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;justify-content:space-between;"><span style="color:#94a3b8;">Total Rooms</span><span style="font-size:1.2rem;font-weight:700;">{{ compliance.summary?.total || 0 }}</span></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#22c55e;">At Standard</span><span style="font-size:1.2rem;font-weight:700;color:#22c55e;">{{ compliance.summary?.atStandard || 0 }}</span></div>
              <div style="display:flex;justify-content:space-between;"><span style="color:#f59e0b;">Below Standard</span><span style="font-size:1.2rem;font-weight:700;color:#f59e0b;">{{ compliance.summary?.belowStandard || 0 }}</span></div>
            </div>
          </NCard>
        </NGi>
      </NGrid>
      <NGrid :x-gap="16" :y-gap="16" :cols="2">
        <NGi>
          <NCard v-if="portfolio.businessLines?.length" size="small" title="By Business Line">
            <NDataTable :columns="[
              { title: 'Business Line', key: 'name', sorter: 'default' as any },
              { title: 'Projects', key: 'count', width: 80, align: 'center' as any, sorter: 'default' as any },
              { title: 'Budget', key: 'budget', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.budget) },
            ]" :data="portfolio.businessLines" :row-key="(r: any) => r.name" :bordered="false" size="small" striped />
          </NCard>
        </NGi>
        <NGi>
          <NCard v-if="portfolio.projectTypes?.length" size="small" title="By Project Type">
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              <div v-for="pt in portfolio.projectTypes" :key="pt.type"
                :style="{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', border: '1px solid ' + colors.borderSubtle }">
                <span style="font-size:1.3rem;font-weight:700;color:#0ea5e9;">{{ pt.count }}</span>
                <span :style="{ color: colors.textSecondary }">{{ pt.type || 'Custom' }}</span>
              </div>
            </div>
          </NCard>
        </NGi>
      </NGrid>
    </template>

    <!-- ============ ADVANCED (CUSTOM) ============ -->
    <template v-if="activeTab === 'custom'">
      <NCard size="small" style="margin-bottom:16px;">
        <NSpace align="center" :wrap="true" :size="12">
          <NSelect v-model:value="customSource" :options="sourceOptions" style="width:160px;" size="small" @update:value="handleSourceChange" />
          <NSelect v-model:value="customGroupBy" :options="groupByOptions" placeholder="Group by..." style="width:160px;" size="small" />
          <NSelect v-model:value="customMetric" :options="metricOptions" placeholder="Metric" style="width:140px;" size="small" />
          <NSelect v-model:value="customStatus" :options="statusFilterOptions" placeholder="Status" clearable style="width:130px;" size="small" />
          <input v-model="customDateFrom" type="date" placeholder="From" :style="`padding:4px 8px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};font-size:12px;width:130px;`" />
          <input v-model="customDateTo" type="date" placeholder="To" :style="`padding:4px 8px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};font-size:12px;width:130px;`" />
          <NButton type="primary" size="small" @click="runCustomReport" :loading="customLoading"><i class="ph ph-play" style="margin-right:4px;" /> Run</NButton>
          <div style="margin-left:auto;">
            <NSpace :size="4">
              <NButton :type="customChartType === 'bar' ? 'primary' : 'default'" size="small" secondary @click="customChartType = 'bar'"><i class="ph ph-chart-bar" /></NButton>
              <NButton :type="customChartType === 'pie' ? 'primary' : 'default'" size="small" secondary @click="customChartType = 'pie'"><i class="ph ph-chart-pie" /></NButton>
            </NSpace>
          </div>
        </NSpace>
      </NCard>

      <NSpin :show="customLoading">
        <template v-if="customReport">
          <NGrid :x-gap="12" :y-gap="12" :cols="3" style="margin-bottom:16px;">
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Groups" :value="customReport.groups?.length || 0" /></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Records" :value="customReport.total || 0" /></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic :label="customMetric !== 'count' ? 'Total Value' : 'Total'" :value="String(customReport.groups?.reduce((s: number, g: any) => s + g.value, 0) || 0)" /></NCard></NGi>
          </NGrid>
          <NCard v-if="customReport.groups?.length" size="small" style="margin-bottom:16px;">
            <VChart :option="customChartOption" :style="{ height: customChartType === 'pie' ? '300px' : '260px' }" autoresize />
          </NCard>
          <NCard size="small" :title="'Results (' + customReport.total + ')'">
            <template #header-extra>
              <NButton size="small" secondary @click="exportReportCsv"><i class="ph ph-download" style="margin-right:4px;" /> CSV</NButton>
            </template>
            <NDataTable v-if="customReport.rows?.length"
              :columns="[
                { title: 'Name', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name || r.taskName || '-') },
                { title: 'Status', key: 'status', width: 100, render: (r: any) => h(NTag, { size: 'small', bordered: false }, () => r.status || '-') },
                { title: 'Type', key: 'type', width: 120, render: (r: any) => r.type || r.category || '-' },
              ]"
              :data="customReport.rows" :row-key="(r: any) => r.id || r.name || Math.random()" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />
          </NCard>
        </template>
        <NEmpty v-else-if="!customLoading" description="Choose a data source and click Run to generate a report" />
      </NSpin>
    </template>

  </NSpin>

  <!-- Drill-down panel -->
  <NCard v-if="expandedProject" size="small" style="margin-top:16px;border-left:3px solid #38bdf8;" :title="expandedProject.name || 'Project Detail'">
    <template #header-extra>
      <NButton text size="small" @click="expandedProject = null"><i class="ph ph-x" style="font-size:18px;" /></NButton>
    </template>
    <NSpin :show="expandLoading">
      <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom:16px;">
        <NGi><NStatistic label="Status" :value="expandedProject.status || '-'" /></NGi>
        <NGi><NStatistic label="Type" :value="expandedProject.type || '-'" /></NGi>
        <NGi><NStatistic label="Budget" :value="fmt(expandedProject.estimatedBudget || expandedProject.budget || 0)" /></NGi>
        <NGi><NStatistic label="Tasks" :value="(expandedProject.tasks?.length || 0) + ' total'" /></NGi>
      </NGrid>
      <div v-if="expandedProject.tasks?.length">
        <NDataTable :columns="[
          { title: 'Task', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
          { title: 'Status', key: 'status', width: 110, render: (r: any) => h(NTag, { type: ({'not-started':'default','in-progress':'info',completed:'success','on-hold':'warning'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status || '-') },
          { title: 'Assignee', key: 'assignee', width: 140, render: (r: any) => r.assignee || '-' },
          { title: 'Hours', key: 'estimatedHours', width: 80, align: 'right' as any, render: (r: any) => r.estimatedHours ? r.estimatedHours + 'h' : '-' },
        ]" :data="expandedProject.tasks" :row-key="(r: any) => r.id || r.name" :bordered="false" size="small" striped />
      </div>
      <NEmpty v-else description="No tasks" />
    </NSpin>
  </NCard>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
