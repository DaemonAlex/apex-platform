<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider, darkTheme,
  NTabs, NTabPane, NCard, NGrid, NGi, NStatistic, NProgress,
  NDataTable, NTag, NEmpty, NSpin,
} from 'naive-ui';
import type { GlobalThemeOverrides } from 'naive-ui';
import { h } from 'vue';

const loading = ref(true);
const activeTab = ref('portfolio');
const portfolio = ref<any>(null);
const budget = ref<any>(null);
const timeline = ref<any>(null);
const myTasks = ref<any>(null);
const compliance = ref<any>(null);

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

const isDark = computed(() => document.documentElement.getAttribute('data-theme') === 'dark');
const themeOverrides: GlobalThemeOverrides = {
  common: { bodyColor: 'transparent', cardColor: '#1e2130', modalColor: '#1e2130', tableColor: '#1e2130', inputColor: '#161822', borderColor: '#2a2d3e', textColorBase: '#eef0f4', textColor1: '#eef0f4', textColor2: '#c0c6d4', textColor3: '#8890a4', primaryColor: '#38bdf8', successColor: '#4ade80', warningColor: '#fbbf24', errorColor: '#f87171' },
  Card: { colorEmbedded: '#161822' }, DataTable: { thColor: '#161822', tdColor: 'transparent', tdColorStriped: 'rgba(255,255,255,0.02)', tdColorHover: 'rgba(255,255,255,0.04)', borderColor: '#2a2d3e', thTextColor: '#a0a8bc' },
  Tabs: { tabTextColorLine: '#a0a8bc', tabTextColorActiveLine: '#38bdf8', tabTextColorHoverLine: '#38bdf8', barColor: '#38bdf8' },
  Tag: { colorBordered: 'transparent' }, Progress: { railColor: '#2a2d3e' },
  Descriptions: { thColor: '#161822', tdColor: 'transparent', borderColor: '#2a2d3e' },
};
const lightOverrides: GlobalThemeOverrides = { common: { bodyColor: 'transparent' } };
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="isDark ? darkTheme : undefined" :theme-overrides="isDark ? themeOverrides : lightOverrides">
<div style="background:transparent;">
  <h1 style="margin:0 0 16px 0;font-size:1.5rem;">Reports</h1>

  <NTabs :value="activeTab" type="line" @update:value="handleTab" style="margin-bottom:16px;">
    <NTabPane name="portfolio" tab="Portfolio Overview" />
    <NTabPane name="budget" tab="Budget" />
    <NTabPane name="timeline" tab="Timeline" />
    <NTabPane name="mytasks" tab="My Tasks" />
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
          { title: 'Project', key: 'name', sorter: 'default' as any, render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
          { title: 'Status', key: 'status', width: 100, render: (r: any) => h(NTag, { type: ({active:'success','on-hold':'warning',completed:'success'} as any)[r.status] || 'default', size: 'small', bordered: false }, () => r.status) },
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
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
          { title: 'Type', key: 'type', width: 100 },
          { title: 'Progress', key: 'progress', width: 100, render: (r: any) => h(NProgress, { type: 'line', percentage: r.progress || 0, height: 8, borderRadius: 4, showIndicator: false, style: 'width:60px;display:inline-block;' }) },
          { title: 'Days Overdue', key: 'daysOverdue', width: 110, align: 'right' as any, render: (r: any) => h('span', { style: 'color:#ef4444;font-weight:600;' }, r.daysOverdue + 'd') },
        ]" :data="timeline.overdue" :row-key="(r: any) => r.id" :bordered="false" size="small" />
      </NCard>

      <NCard size="small" title="Upcoming Deadlines" style="margin-bottom:16px;">
        <NDataTable v-if="timeline.upcoming?.length" :columns="[
          { title: 'Project', key: 'name', render: (r: any) => h('span', { style: 'font-weight:500;' }, r.name) },
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

  </NSpin>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
