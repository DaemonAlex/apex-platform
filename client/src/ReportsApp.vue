<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NTabs, NTabPane, NCard, NGrid, NGi, NStatistic, NProgress,
  NDataTable, NTag, NEmpty, NSpin, NButton, NSpace, NSelect,
} from 'naive-ui';
import { useTheme } from './composables/useTheme';
import { h, computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer]);

const loading = ref(true);
const activeTab = ref('portfolio');
const portfolio = ref<any>(null);
const budget = ref<any>(null);
const timeline = ref<any>(null);
const myTasks = ref<any>(null);
const compliance = ref<any>(null);
const expandedProject = ref<any>(null);
const expandLoading = ref(false);

const tk = () => localStorage.getItem('apex_token');
async function api(path: string) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + tk() } });
  return res.json();
}

async function handleTab(tab: string) {
  activeTab.value = tab;
  loading.value = true;
  try {
    if (tab === 'portfolio' && !portfolio.value) {
      const [p, c] = await Promise.all([api('/reports/portfolio'), api('/room-status/compliance/scorecard')]);
      portfolio.value = p;
      compliance.value = c;
    }
    if (tab === 'budget' && !budget.value) budget.value = await api('/reports/budget');
    if (tab === 'timeline' && !timeline.value) timeline.value = await api('/reports/timeline');
    if (tab === 'mytasks' && !myTasks.value) myTasks.value = await api('/reports/user/1');
  } finally { loading.value = false; }
}

onMounted(async () => {
  const [p, c] = await Promise.all([api('/reports/portfolio'), api('/room-status/compliance/scorecard')]);
  portfolio.value = p;
  compliance.value = c;
  loading.value = false;
});

function fmt(v: number) {
  if (Math.abs(v) >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
  return '$' + (v / 1000).toFixed(0) + 'K';
}

async function drillDown(projectId: string) {
  if (expandedProject.value?.id === projectId) {
    expandedProject.value = null;
    return;
  }
  expandLoading.value = true;
  try {
    expandedProject.value = await api(`/projects/${projectId}`);
  } finally {
    expandLoading.value = false;
  }
}

function closeDrillDown() {
  expandedProject.value = null;
}

// Custom report builder
const customReport = ref<any>(null);
const customLoading = ref(false);
const customSource = ref('projects');
const customGroupBy = ref('status');
const customMetric = ref('count');
const customStatus = ref<string | null>(null);
const customType = ref<string | null>(null);
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
      { label: 'Month Created', value: 'month' }, { label: 'Quarter', value: 'quarter' },
      { label: 'Year', value: 'year' },
    ],
    fieldops: [
      { label: 'Status', value: 'status' }, { label: 'Type', value: 'type' },
      { label: 'Technician', value: 'assignee' }, { label: 'Completed By', value: 'completedBy' },
      { label: 'Location', value: 'location' }, { label: 'Project', value: 'project' },
      { label: 'Month', value: 'month' },
    ],
    rooms: [
      { label: 'Building', value: 'location' }, { label: 'Room Type', value: 'type' },
      { label: 'Check Status', value: 'status' }, { label: 'Standard', value: 'standard' },
      { label: 'Floor', value: 'floor' }, { label: 'Check Frequency', value: 'frequency' },
    ],
    equipment: [
      { label: 'Category', value: 'category' }, { label: 'Manufacturer', value: 'make' },
      { label: 'Building', value: 'location' }, { label: 'Room', value: 'room' },
    ],
    vendors: [
      { label: 'Type', value: 'type' }, { label: 'Category', value: 'category' },
    ],
  };
  return m[customSource.value] || [];
});

const metricOptions = computed(() => {
  if (customSource.value === 'projects') return [
    { label: 'Count', value: 'count' }, { label: 'Estimated Budget', value: 'budget' },
    { label: 'Actual Spend', value: 'actual' }, { label: 'Budget Variance', value: 'variance' },
    { label: 'Avg Progress %', value: 'avgProgress' }, { label: 'Task Count', value: 'taskCount' },
  ];
  if (customSource.value === 'fieldops') return [
    { label: 'Count', value: 'count' }, { label: 'Est. Duration (hrs)', value: 'duration' },
  ];
  return [{ label: 'Count', value: 'count' }];
});

const statusFilterOptions = computed(() => {
  if (customSource.value === 'projects') return [
    { label: 'Active', value: 'active' }, { label: 'Planning', value: 'planning' },
    { label: 'Scheduled', value: 'scheduled' }, { label: 'On Hold', value: 'on-hold' },
    { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' },
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
    if (customType.value) params.set('type', customType.value);
    if (customDateFrom.value) params.set('from', customDateFrom.value);
    if (customDateTo.value) params.set('to', customDateTo.value);
    customReport.value = await api('/reports/custom?' + params.toString());
  } finally { customLoading.value = false; }
}

function handleSourceChange() {
  customGroupBy.value = groupByOptions.value[0]?.value || 'status';
  customMetric.value = 'count';
  customStatus.value = null;
  customType.value = null;
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

const chartColors = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b', '#ec4899', '#14b8a6'];

const customChartOption = computed(() => {
  if (!customReport.value?.groups?.length) return {};
  const groups = customReport.value.groups;
  if (customChartType.value === 'pie') {
    return {
      tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
      series: [{
        type: 'pie', radius: ['40%', '75%'], center: ['50%', '50%'],
        itemStyle: { borderRadius: 6, borderColor: colors.value.cardBg, borderWidth: 2 },
        label: { show: true, color: colors.value.textSecondary, fontSize: 12, formatter: '{b}: {c}' },
        data: groups.map((g: any, i: number) => ({ value: g.value, name: g.key, itemStyle: { color: chartColors[i % chartColors.length] } })),
        animationType: 'scale', animationEasing: 'elasticOut',
      }],
    };
  }
  return {
    tooltip: { trigger: 'axis', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
    grid: { left: 16, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: groups.map((g: any) => g.key), axisLabel: { color: colors.value.textMuted, fontSize: 11, rotate: groups.length > 6 ? 30 : 0 }, axisLine: { lineStyle: { color: colors.value.railColor } } },
    yAxis: { type: 'value', axisLabel: { color: colors.value.textMuted, fontSize: 11 }, splitLine: { lineStyle: { color: colors.value.railColor, opacity: 0.3 } } },
    series: [{
      type: 'bar', barMaxWidth: 40,
      data: groups.map((g: any, i: number) => ({ value: g.value, itemStyle: { color: chartColors[i % chartColors.length], borderRadius: [4, 4, 0, 0] } })),
    }],
  };
});

const { naiveTheme, themeOverrides, colors } = useTheme();
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">
  <h1 style="margin:0 0 16px 0;font-size:1.5rem;">Reports</h1>

  <NTabs :value="activeTab" type="line" @update:value="handleTab" style="margin-bottom:16px;">
    <NTabPane name="portfolio" tab="Portfolio Overview" />
    <NTabPane name="budget" tab="Budget" />
    <NTabPane name="timeline" tab="Timeline" />
    <NTabPane name="mytasks" tab="My Tasks" />
    <NTabPane name="custom" tab="Custom Reports" />
  </NTabs>

  <NSpin :show="loading">

    <!-- ============ PORTFOLIO ============ -->
    <template v-if="activeTab === 'portfolio' && portfolio">
      <!-- Top stats -->
      <NGrid :x-gap="12" :y-gap="12" :cols="6" style="margin-bottom:24px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total Projects" :value="portfolio.projects?.total" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Active" :value="portfolio.projects?.active"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="At Risk" :value="portfolio.atRisk"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="On-Time" :value="portfolio.onTimeRate + '%'" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="On Hold" :value="portfolio.projects?.onHold"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Completed" :value="portfolio.projects?.completed"><template #prefix><span style="color:#64748b;">&#9679;</span></template></NStatistic></NCard></NGi>
      </NGrid>

      <NGrid :x-gap="16" :y-gap="16" :cols="3" style="margin-bottom:24px;">
        <!-- Task Progress -->
        <NGi>
          <NCard size="small" title="Task Completion">
            <div style="text-align:center;margin-bottom:12px;">
              <span style="font-size:2.5rem;font-weight:700;color:#0ea5e9;">{{ portfolio.tasks?.completionRate || 0 }}%</span>
            </div>
            <NProgress type="line" :percentage="portfolio.tasks?.completionRate || 0" :height="14" :border-radius="7" indicator-placement="inside" />
            <NGrid :cols="3" style="margin-top:16px;text-align:center;">
              <NGi>
                <div style="font-size:1.5rem;font-weight:700;color:#22c55e;">{{ portfolio.tasks?.completed }}</div>
                <div style="font-size:0.8rem;color:#94a3b8;">Done</div>
              </NGi>
              <NGi>
                <div style="font-size:1.5rem;font-weight:700;color:#0ea5e9;">{{ portfolio.tasks?.inProgress }}</div>
                <div style="font-size:0.8rem;color:#94a3b8;">In Progress</div>
              </NGi>
              <NGi>
                <div style="font-size:1.5rem;font-weight:700;color:#94a3b8;">{{ portfolio.tasks?.notStarted }}</div>
                <div style="font-size:0.8rem;color:#94a3b8;">Not Started</div>
              </NGi>
            </NGrid>
          </NCard>
        </NGi>

        <!-- Budget Health -->
        <NGi>
          <NCard size="small" title="Budget Health">
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#94a3b8;">Planned</span>
                <span style="font-size:1.2rem;font-weight:700;">{{ fmt(portfolio.budget?.totalPlanned || 0) }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#94a3b8;">Actual Spend</span>
                <span style="font-size:1.2rem;font-weight:700;">{{ fmt(portfolio.budget?.totalActual || 0) }}</span>
              </div>
              <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;" :style="{ color: (portfolio.budget?.variance || 0) > 0 ? '#ef4444' : '#22c55e' }">Variance</span>
                <span style="font-size:1.2rem;font-weight:700;" :style="{ color: (portfolio.budget?.variance || 0) > 0 ? '#ef4444' : '#22c55e' }">
                  {{ (portfolio.budget?.variance || 0) > 0 ? '+' : '' }}{{ fmt(Math.abs(portfolio.budget?.variance || 0)) }}
                </span>
              </div>
              <div style="font-size:0.85rem;color:#94a3b8;margin-top:4px;">
                {{ portfolio.budget?.overBudgetCount || 0 }} project{{ (portfolio.budget?.overBudgetCount || 0) !== 1 ? 's' : '' }} over budget
              </div>
            </div>
          </NCard>
        </NGi>

        <!-- Room Health -->
        <NGi>
          <NCard size="small" title="Room Health" v-if="compliance">
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#94a3b8;">Total Rooms</span>
                <span style="font-size:1.2rem;font-weight:700;">{{ compliance.summary?.total || 0 }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#22c55e;">At Standard</span>
                <span style="font-size:1.2rem;font-weight:700;color:#22c55e;">{{ compliance.summary?.atStandard || 0 }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#f59e0b;">Below Standard</span>
                <span style="font-size:1.2rem;font-weight:700;color:#f59e0b;">{{ compliance.summary?.belowStandard || 0 }}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:#94a3b8;">No Standard Set</span>
                <span style="font-size:1.2rem;font-weight:700;color:#94a3b8;">{{ compliance.summary?.noStandard || 0 }}</span>
              </div>
            </div>
          </NCard>
        </NGi>
      </NGrid>

      <!-- Business Lines -->
      <NGrid :x-gap="16" :y-gap="16" :cols="2" style="margin-bottom:24px;">
        <NGi>
          <NCard v-if="portfolio.businessLines?.length" size="small" title="By Business Line">
            <NDataTable :columns="[
              { title: 'Business Line', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
              { title: 'Projects', key: 'count', width: 80, align: 'center' as any, sorter: 'default' as any },
              { title: 'Budget', key: 'budget', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.budget) },
            ]" :data="portfolio.businessLines" :row-key="(r: any) => r.name" :bordered="false" size="small" striped />
          </NCard>
        </NGi>
        <NGi>
          <NCard v-if="portfolio.projectTypes?.length" size="small" title="By Project Type">
            <div style="display:flex;flex-wrap:wrap;gap:10px;">
              <div v-for="pt in portfolio.projectTypes" :key="pt.type"
                style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:1.3rem;font-weight:700;color:#0ea5e9;">{{ pt.count }}</span>
                <span style="color:#c0c6d4;">{{ pt.type || 'Custom' }}</span>
              </div>
            </div>
          </NCard>
        </NGi>
      </NGrid>
    </template>

    <!-- ============ BUDGET ============ -->
    <template v-if="activeTab === 'budget' && budget">
      <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom:24px;">
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
          { title: 'Project', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => drillDown(r.id) }, [r.name, ' ', h('i', { class: 'ph ph-arrow-square-out', style: 'font-size:12px;opacity:0.5;' })]) },
          { title: 'Status', key: 'status', width: 100, render: (r: any) => h(NTag, { type: ({active:'success','on-hold':'warning',completed:'success',planning:'info',scheduled:'info',cancelled:'default'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
          { title: 'Planned', key: 'planned', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.planned) },
          { title: 'Actual', key: 'actual', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.actual) },
          { title: 'Variance', key: 'variance', width: 130, align: 'right' as any, sorter: 'default' as any, render: (r: any) => h('span', { style: 'color:' + (r.variance > 0 ? '#ef4444' : '#22c55e') + ';font-weight:500;' }, (r.variance > 0 ? '+' : '') + fmt(Math.abs(r.variance)) + ' (' + (r.variancePercent > 0 ? '+' : '') + r.variancePercent + '%)') },
        ]" :data="budget.projects || []" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
      </NCard>
    </template>

    <!-- ============ TIMELINE ============ -->
    <template v-if="activeTab === 'timeline' && timeline">
      <NGrid :x-gap="12" :y-gap="12" :cols="3" style="margin-bottom:24px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Overdue" :value="timeline.overdue?.length || 0"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Upcoming" :value="timeline.upcoming?.length || 0"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Recently Completed" :value="timeline.recentlyCompleted?.length || 0"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
      </NGrid>

      <NCard v-if="timeline.overdue?.length" size="small" title="Overdue Projects" style="margin-bottom:16px;border-left:3px solid #ef4444;">
        <NDataTable :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => drillDown(r.id) }, r.name) },
          { title: 'Type', key: 'type', width: 100 },
          { title: 'Progress', key: 'progress', width: 100, render: (r: any) => h(NProgress, { type: 'line', percentage: r.progress || 0, height: 8, borderRadius: 4, showIndicator: false, style: 'width:60px;display:inline-block;' }) },
          { title: 'Days Overdue', key: 'daysOverdue', width: 110, align: 'right' as any, render: (r: any) => h('span', { style: 'color:#ef4444;font-weight:600;' }, r.daysOverdue + 'd') },
        ]" :data="timeline.overdue" :row-key="(r: any) => r.id" :bordered="false" size="small" />
      </NCard>

      <NCard size="small" title="Upcoming Deadlines" style="margin-bottom:16px;">
        <NDataTable v-if="timeline.upcoming?.length" :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => drillDown(r.id) }, r.name) },
          { title: 'Type', key: 'type', width: 100 },
          { title: 'Progress', key: 'progress', width: 100, render: (r: any) => h(NProgress, { type: 'line', percentage: r.progress || 0, height: 8, borderRadius: 4, showIndicator: false, style: 'width:60px;display:inline-block;' }) },
          { title: 'Due In', key: 'daysUntilDue', width: 90, align: 'right' as any, render: (r: any) => h('span', { style: 'color:' + (r.daysUntilDue <= 7 ? '#f59e0b' : '#94a3b8') + ';font-weight:500;' }, r.daysUntilDue + 'd') },
        ]" :data="timeline.upcoming" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
        <NEmpty v-else description="No upcoming deadlines" />
      </NCard>

      <NCard v-if="timeline.recentlyCompleted?.length" size="small" title="Recently Completed">
        <NDataTable :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
          { title: 'Type', key: 'type', width: 100 },
          { title: 'Completed', key: 'completedAt', width: 120, render: (r: any) => new Date(r.completedAt).toLocaleDateString() },
        ]" :data="timeline.recentlyCompleted" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
      </NCard>
    </template>

    <!-- ============ MY TASKS ============ -->
    <template v-if="activeTab === 'mytasks' && myTasks">
      <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:24px;">
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total" :value="myTasks.summary?.totalTasks" /></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Completed" :value="myTasks.summary?.completed"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Active" :value="myTasks.summary?.active"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Due Soon" :value="myTasks.summary?.dueSoon"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
        <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Overdue" :value="myTasks.summary?.overdue"><template #prefix><span style="color:#ef4444;">&#9679;</span></template></NStatistic></NCard></NGi>
      </NGrid>

      <NGrid :x-gap="16" :y-gap="16" :cols="2" style="margin-bottom:16px;">
        <NGi>
          <NCard size="small" title="Hours">
            <div style="display:flex;gap:24px;">
              <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:#0ea5e9;">{{ myTasks.summary?.estimatedHours || 0 }}h</div><div style="font-size:0.8rem;color:#94a3b8;">Estimated</div></div>
              <div style="text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:#22c55e;">{{ myTasks.summary?.completedHours || 0 }}h</div><div style="font-size:0.8rem;color:#94a3b8;">Completed</div></div>
            </div>
          </NCard>
        </NGi>
      </NGrid>

      <NCard size="small" title="All Assigned Tasks">
        <NDataTable v-if="myTasks.tasks?.length" :columns="[
          { title: 'Task', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
          { title: 'Project', key: 'projectName', width: 200, render: (r: any) => h('span', { style: 'color:#94a3b8;' }, r.projectName) },
          { title: 'Status', key: 'status', width: 110, align: 'center' as any, render: (r: any) => h(NTag, { type: ({'not-started':'default','in-progress':'info',completed:'success','on-hold':'warning'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
          { title: 'Priority', key: 'priority', width: 80, align: 'center' as any, render: (r: any) => h(NTag, { type: ({critical:'error',high:'warning',medium:'info',low:'default'} as any)[r.priority] || 'default', size: 'small', bordered: false }, () => r.priority || '-') },
          { title: 'Due', key: 'endDate', width: 100, render: (r: any) => r.endDate ? new Date(r.endDate).toLocaleDateString() : '-' },
          { title: 'Hours', key: 'estimatedHours', width: 60, align: 'right' as any, render: (r: any) => r.estimatedHours ? r.estimatedHours + 'h' : '-' },
        ]" :data="myTasks.tasks" :row-key="(r: any) => r.id || r.name" :bordered="false" size="small" striped />
        <NEmpty v-else description="No tasks assigned" />
      </NCard>
    </template>

    <!-- ============ CUSTOM REPORTS ============ -->
    <template v-if="activeTab === 'custom'">
      <!-- Report Builder Controls -->
      <NCard size="small" style="margin-bottom:16px;">
        <NSpace align="center" :wrap="true" :size="12">
          <NSelect v-model:value="customSource" :options="sourceOptions" style="width:160px;" size="small" @update:value="handleSourceChange" />
          <NSelect v-model:value="customGroupBy" :options="groupByOptions" placeholder="Group by..." style="width:160px;" size="small" />
          <NSelect v-model:value="customMetric" :options="metricOptions" placeholder="Metric" style="width:160px;" size="small" />
          <NSelect v-model:value="customStatus" :options="statusFilterOptions" placeholder="Status filter" clearable style="width:150px;" size="small" />
          <input v-model="customDateFrom" type="date" placeholder="From" :style="`padding:4px 8px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};font-size:12px;width:130px;`" />
          <input v-model="customDateTo" type="date" placeholder="To" :style="`padding:4px 8px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};font-size:12px;width:130px;`" />
          <NButton type="primary" size="small" @click="runCustomReport" :loading="customLoading">
            <i class="ph ph-play" style="margin-right:4px;" /> Run Report
          </NButton>
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
          <!-- Summary -->
          <NGrid :x-gap="12" :y-gap="12" :cols="3" style="margin-bottom:16px;">
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Groups" :value="customReport.groups?.length || 0" /></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total Records" :value="customReport.total || 0" /></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic :label="customMetric === 'budget' ? 'Total Budget' : customMetric === 'actual' ? 'Total Spend' : 'Total Count'" :value="customMetric !== 'count' ? fmt(customReport.groups?.reduce((s: number, g: any) => s + g.value, 0) || 0) : String(customReport.groups?.reduce((s: number, g: any) => s + g.value, 0) || 0)" /></NCard></NGi>
          </NGrid>

          <!-- Chart -->
          <NCard v-if="customReport.groups?.length" size="small" style="margin-bottom:16px;">
            <VChart :option="customChartOption" :style="{ height: customChartType === 'pie' ? '320px' : '280px' }" autoresize />
          </NCard>

          <!-- Data Table -->
          <NCard size="small" :title="'Results (' + customReport.total + ')'">
            <template #header-extra>
              <NButton size="small" secondary @click="exportReportCsv"><i class="ph ph-download" style="margin-right:4px;" /> CSV</NButton>
            </template>
            <NDataTable v-if="customSource === 'projects'" :columns="[
              { title: 'Project', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;cursor:pointer;color:#38bdf8;', onClick: () => drillDown(r.id) }, r.name) },
              { title: 'Status', key: 'status', width: 100, sorter: 'default' as any, render: (r: any) => h(NTag, { type: ({active:'success','on-hold':'warning',completed:'success',planning:'info',scheduled:'info',cancelled:'default'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
              { title: 'Type', key: 'type', width: 100, sorter: 'default' as any },
              { title: 'Business Line', key: 'businessLine', width: 130, sorter: 'default' as any, render: (r: any) => r.businessLine || '-' },
              { title: 'Budget', key: 'budget', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.budget) },
              { title: 'Actual', key: 'actual', width: 100, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.actual) },
              { title: 'Progress', key: 'progress', width: 80, align: 'center' as any, render: (r: any) => r.progress + '%' },
            ]" :data="customReport.rows" :row-key="(r: any) => r.id" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />

            <NDataTable v-else-if="customSource === 'fieldops'" :columns="[
              { title: 'Task', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name || '-') },
              { title: 'Project', key: 'projectName', width: 150, render: (r: any) => r.projectName || '-' },
              { title: 'Type', key: 'type', width: 110, sorter: 'default' as any },
              { title: 'Status', key: 'status', width: 100, sorter: 'default' as any, render: (r: any) => h(NTag, { type: ({scheduled:'info','in-progress':'warning',completed:'success',pending:'default'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
              { title: 'Assignee', key: 'assignee', width: 120, sorter: 'default' as any },
              { title: 'Location', key: 'location', width: 140, render: (r: any) => r.location || '-' },
              { title: 'Date', key: 'date', width: 100, sorter: 'default' as any, render: (r: any) => r.date ? new Date(r.date).toLocaleDateString() : '-' },
            ]" :data="customReport.rows" :row-key="(r: any) => r.id" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />

            <NDataTable v-else-if="customSource === 'rooms'" :columns="[
              { title: 'Room', key: 'name', sorter: 'default' as any, render: (r: any) => h('div', {}, [h('div', { style: 'font-weight:500;' }, r.name), h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, (r.location || '') + (r.floor ? ' / Floor ' + r.floor : ''))]) },
              { title: 'Type', key: 'type', width: 100, sorter: 'default' as any, render: (r: any) => r.type || '-' },
              { title: 'Capacity', key: 'capacity', width: 70, align: 'center' as any, render: (r: any) => r.capacity || '-' },
              { title: 'Standard', key: 'standard', width: 130, render: (r: any) => r.standard || h('span', { style: 'color:#94a3b8;' }, 'None') },
              { title: 'Equipment', key: 'equipCount', width: 80, align: 'center' as any, sorter: 'default' as any },
              { title: 'Checks', key: 'checkCount', width: 70, align: 'center' as any, sorter: 'default' as any },
              { title: 'Status', key: 'ragStatus', width: 80, align: 'center' as any, render: (r: any) => r.ragStatus ? h(NTag, { type: ({green:'success',amber:'warning',red:'error'} as any)[r.ragStatus] || 'default', size: 'small', bordered: false }, () => ({green:'OK',amber:'Issue',red:'Down'} as any)[r.ragStatus] || r.ragStatus) : h('span', { style: 'color:#94a3b8;' }, 'N/A') },
              { title: 'Last Checked', key: 'lastChecked', width: 100, render: (r: any) => r.lastChecked ? new Date(r.lastChecked).toLocaleDateString() : '-' },
            ]" :data="customReport.rows" :row-key="(r: any) => r.id" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />

            <NDataTable v-else-if="customSource === 'equipment'" :columns="[
              { title: 'Device', key: 'make', sorter: 'default' as any, render: (r: any) => h('div', {}, [h('div', { style: 'font-weight:500;' }, (r.make || '') + ' ' + (r.model || '')), h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, r.category)]) },
              { title: 'Serial', key: 'serialNumber', width: 130, render: (r: any) => r.serialNumber ? h('code', {}, r.serialNumber) : '-' },
              { title: 'Room', key: 'roomName', width: 140, sorter: 'default' as any },
              { title: 'Building', key: 'location', width: 140, sorter: 'default' as any, render: (r: any) => r.location || '-' },
              { title: 'Installed', key: 'installDate', width: 100, render: (r: any) => r.installDate ? new Date(r.installDate).toLocaleDateString() : '-' },
              { title: 'Warranty', key: 'warrantyEnd', width: 110, sorter: 'default' as any, render: (r: any) => r.warrantyEnd ? h('span', { style: 'color:' + (r.warrantyStatus === 'expired' ? '#ef4444' : '#22c55e') + ';' }, new Date(r.warrantyEnd).toLocaleDateString()) : '-' },
            ]" :data="customReport.rows" :row-key="(r: any) => r.id" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />

            <NDataTable v-else-if="customSource === 'vendors'" :columns="[
              { title: 'Vendor', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
              { title: 'Type', key: 'type', width: 90, render: (r: any) => h(NTag, { type: r.type === 'internal' ? 'info' : 'default', size: 'small', bordered: true }, () => r.type) },
              { title: 'Category', key: 'category', width: 130, sorter: 'default' as any, render: (r: any) => r.category || '-' },
              { title: 'Contacts', key: 'contactCount', width: 80, align: 'center' as any },
              { title: 'Projects', key: 'projectCount', width: 80, align: 'center' as any, sorter: 'default' as any },
              { title: 'Rooms', key: 'roomCount', width: 70, align: 'center' as any, sorter: 'default' as any },
              { title: 'Total Budget', key: 'totalBudget', width: 110, align: 'right' as any, sorter: 'default' as any, render: (r: any) => fmt(r.totalBudget) },
            ]" :data="customReport.rows" :row-key="(r: any) => r.id" :bordered="false" size="small" striped :pagination="{ pageSize: 25 }" />
          </NCard>
        </template>
        <NEmpty v-else-if="!customLoading" description="Select a data source, choose how to group the data, and click Run Report" />
      </NSpin>
    </template>

  </NSpin>

  <!-- Drill-down panel -->
  <NCard v-if="expandedProject" size="small" style="margin-top:16px;border-left:3px solid #38bdf8;" :title="expandedProject.name || 'Project Detail'">
    <template #header-extra>
      <NButton text size="small" @click="closeDrillDown"><i class="ph ph-x" style="font-size:18px;" /></NButton>
    </template>
    <NSpin :show="expandLoading">
      <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom:16px;">
        <NGi><NStatistic label="Status" :value="expandedProject.status || '-'" /></NGi>
        <NGi><NStatistic label="Type" :value="expandedProject.type || '-'" /></NGi>
        <NGi><NStatistic label="Budget" :value="fmt(expandedProject.estimatedBudget || expandedProject.budget || 0)" /></NGi>
        <NGi><NStatistic label="Tasks" :value="(expandedProject.tasks?.length || 0) + ' total'" /></NGi>
      </NGrid>
      <div v-if="expandedProject.tasks?.length">
        <div style="font-weight:600;margin-bottom:8px;">Tasks</div>
        <NDataTable
          :columns="[
            { title: 'Task', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
            { title: 'Status', key: 'status', width: 110, render: (r: any) => h(NTag, { type: ({'not-started':'default','in-progress':'info',completed:'success','on-hold':'warning'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status || '-') },
            { title: 'Assignee', key: 'assignee', width: 140, render: (r: any) => r.assignee || '-' },
            { title: 'Est. Hours', key: 'estimatedHours', width: 90, align: 'right' as any, render: (r: any) => r.estimatedHours ? r.estimatedHours + 'h' : '-' },
          ]"
          :data="expandedProject.tasks"
          :row-key="(r: any) => r.id || r.name"
          :bordered="false"
          size="small"
          striped
        />
      </div>
      <NEmpty v-else description="No tasks" />
    </NSpin>
  </NCard>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
