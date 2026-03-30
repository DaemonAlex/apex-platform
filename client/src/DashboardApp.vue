<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NTag, NButton, NSpace, NSpin, NNumberAnimation,
} from 'naive-ui';
import { useTheme } from './composables/useTheme';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { PieChart, GaugeChart, BarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
// h not needed in template-only rendering

use([PieChart, GaugeChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer]);

const props = defineProps<{ userName?: string }>();

function navigateTo(view: string) {
  const showView = (window as any).showView;
  if (typeof showView === 'function') showView(view);
}

function openProject(projectId: string) {
  window.dispatchEvent(new CustomEvent('apex-open-project', { detail: { id: projectId } }));
  navigateTo('projects');
}

const loading = ref(true);
const drillStatus = ref<string | null>(null);
const drillStatuses = ref<string[]>([]);
const drillProjects = ref<any[]>([]);
const drillLoading = ref(false);
const portfolio = ref<any>(null);
const compliance = ref<any>(null);
const timeline = ref<any>(null);
const fieldOps = ref<any[]>([]);
const show = ref(false); // for stagger animation

const tk = () => localStorage.getItem('apex_token');
async function api(path: string) {
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + tk() } });
  return res.json();
}

const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
});

const todayStr = computed(() => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));

// Upcoming field ops (next 7 days)
const upcomingOps = computed(() => {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86400000);
  return fieldOps.value.filter(f => {
    const d = f.date ? new Date(f.date) : null;
    return d && d >= now && d <= week && f.status !== 'completed';
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6);
});

// Charts
const statusChartOption = computed(() => {
  if (!portfolio.value) return {};
  const p = portfolio.value.projects;
  return {
    tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 6, borderColor: colors.value.cardBg, borderWidth: 2 },
      label: { show: false },
      data: [
        { value: Math.max(0, p.active - (portfolio.value?.atRisk || 0)), name: 'Active', itemStyle: { color: '#22c55e' } },
        { value: portfolio.value?.atRisk || 0, name: 'At Risk', itemStyle: { color: '#ef4444' } },
        { value: p.onHold, name: 'On Hold', itemStyle: { color: '#f59e0b' } },
        { value: p.planning, name: 'Planning', itemStyle: { color: '#0ea5e9' } },
        { value: p.cancelled, name: 'Cancelled', itemStyle: { color: '#64748b' } },
      ].filter(d => d.value > 0),
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
      animationType: 'scale', animationEasing: 'elasticOut', animationDelay: () => Math.random() * 200,
    }]
  };
});

const budgetGaugeOption = computed(() => {
  if (!portfolio.value?.budget) return {};
  const planned = portfolio.value.budget.totalPlanned || 1;
  const actual = portfolio.value.budget.totalActual || 0;
  const pct = Math.min(150, Math.round((actual / planned) * 100));
  return {
    series: [{
      type: 'gauge', startAngle: 200, endAngle: -20, min: 0, max: 150,
      splitNumber: 3,
      pointer: { show: true, length: '60%', width: 4, itemStyle: { color: '#38bdf8' } },
      progress: { show: true, width: 14, roundCap: true, itemStyle: { color: pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#22c55e' } },
      axisLine: { lineStyle: { width: 14, color: [[1, colors.value.railColor]] } },
      axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { distance: 20, color: colors.value.textMuted, fontSize: 11, formatter: (v: number) => v + '%' },
      detail: { valueAnimation: true, fontSize: 22, fontWeight: 700, offsetCenter: [0, '70%'], color: pct > 100 ? '#ef4444' : colors.value.textPrimary, formatter: '{value}%' },
      title: { offsetCenter: [0, '90%'], fontSize: 12, color: colors.value.textMuted },
      data: [{ value: pct, name: 'Budget Used' }],
    }]
  };
});

onMounted(async () => {
  try {
    const [p, c, t, fo] = await Promise.all([
      api('/reports/portfolio'),
      api('/room-status/compliance/scorecard'),
      api('/reports/timeline'),
      api('/fieldops'),
    ]);
    portfolio.value = p;
    compliance.value = c;
    timeline.value = t;
    fieldOps.value = [...(fo.scheduled || []), ...(fo.completed || []), ...(fo.pending || [])];
  } finally {
    loading.value = false;
    setTimeout(() => { show.value = true; }, 50);
  }
});

const typeIcons: Record<string, { icon: string; color: string }> = {
  'Site Survey': { icon: 'ph-binoculars', color: '#0ea5e9' },
  'Installation': { icon: 'ph-hammer', color: '#8b5cf6' },
  'Commissioning': { icon: 'ph-check-square', color: '#22c55e' },
  'Service Call': { icon: 'ph-wrench', color: '#ef4444' },
};

// Budget drill-down
const budgetDrill = ref(false);
const budgetProjects = ref<any[]>([]);
const budgetLoading = ref(false);

async function toggleBudgetDrill() {
  if (budgetDrill.value) { budgetDrill.value = false; return; }
  budgetDrill.value = true;
  budgetLoading.value = true;
  try {
    const data = await api('/reports/budget');
    budgetProjects.value = data.projects || [];
  } catch { budgetProjects.value = []; }
  finally { budgetLoading.value = false; }
}

function fmt(v: number) {
  if (Math.abs(v) >= 1000000) return '$' + (v / 1000000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(0) + 'K';
  return '$' + v.toFixed(0);
}

const budgetBarOption = computed(() => {
  const sorted = [...budgetProjects.value].sort((a, b) => b.variance - a.variance).slice(0, 8);
  if (!sorted.length) return {};
  return {
    tooltip: { trigger: 'axis', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText, fontSize: 11 } },
    grid: { left: 10, right: 16, top: 8, bottom: 4, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: sorted.map(p => p.name.length > 18 ? p.name.slice(0, 18) + '...' : p.name), inverse: true,
      axisLabel: { color: colors.value.textSecondary, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{
      type: 'bar', barWidth: 14, data: sorted.map(p => ({
        value: p.variance,
        itemStyle: { color: p.variance > 0 ? '#ef4444' : '#22c55e', borderRadius: p.variance > 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] },
      })),
      label: { show: true, position: 'right', color: colors.value.textMuted, fontSize: 10, formatter: (p: any) => fmt(p.value) },
    }],
  };
});

// Room Health chart - based on actual RAG check status
const roomHealthChartOption = computed(() => {
  if (!compliance.value?.rooms) return {};
  const rooms = compliance.value.rooms as any[];
  // Count by last check RAG status
  let operational = 0, limited = 0, down = 0, unchecked = 0;
  rooms.forEach(r => {
    // Use ragStatus from room data if available, fall back to compliance
    if (r.ragStatus === 'red') down++;
    else if (r.ragStatus === 'amber') limited++;
    else if (r.ragStatus === 'green') operational++;
    else if (r.compliance === 'at-standard') operational++;
    else if (r.compliance === 'below-standard') limited++;
    else unchecked++;
  });
  return {
    tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 6, borderColor: colors.value.cardBg, borderWidth: 2 },
      label: { show: false },
      data: [
        { value: operational, name: 'Operational', itemStyle: { color: '#22c55e' } },
        { value: limited, name: 'Limited', itemStyle: { color: '#f59e0b' } },
        { value: down, name: 'Down', itemStyle: { color: '#ef4444' } },
        { value: unchecked, name: 'Unchecked', itemStyle: { color: '#64748b' } },
      ].filter(d => d.value > 0),
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } },
      animationType: 'scale', animationEasing: 'elasticOut', animationDelay: () => Math.random() * 200,
    }]
  };
});

const roomChartMap: Record<string, string> = {
  'Operational': 'green', 'Limited': 'amber', 'Down': 'red', 'Unchecked': 'unchecked',
};

function handleRoomChartClick(params: any) {
  const filter = roomChartMap[params.name];
  if (filter) toggleRoomDrill(filter);
}

// Room Health drill-down
const roomDrill = ref(false);
const roomDrillFilter = ref<string | null>(null);

function toggleRoomDrill(filter?: string) {
  if (roomDrill.value && roomDrillFilter.value === (filter || null)) {
    roomDrill.value = false;
    roomDrillFilter.value = null;
    return;
  }
  roomDrill.value = true;
  roomDrillFilter.value = filter || null;
}

const filteredRooms = computed(() => {
  const rooms = compliance.value?.rooms || [];
  if (!roomDrillFilter.value) return rooms;
  if (roomDrillFilter.value === 'unchecked') return rooms.filter((r: any) => !r.ragStatus && r.compliance !== 'at-standard' && r.compliance !== 'below-standard');
  if (roomDrillFilter.value === 'green') return rooms.filter((r: any) => r.ragStatus === 'green' || (!r.ragStatus && r.compliance === 'at-standard'));
  if (roomDrillFilter.value === 'amber') return rooms.filter((r: any) => r.ragStatus === 'amber' || (!r.ragStatus && r.compliance === 'below-standard'));
  if (roomDrillFilter.value === 'red') return rooms.filter((r: any) => r.ragStatus === 'red');
  return rooms;
});

const roomTypeChart = computed(() => {
  const rooms = filteredRooms.value as any[];
  if (!rooms.length) return {};
  const byType: Record<string, number> = {};
  rooms.forEach(r => { byType[r.roomType || 'unknown'] = (byType[r.roomType || 'unknown'] || 0) + 1; });
  const typeColors: Record<string, string> = {
    'conference': '#0ea5e9', 'huddle': '#8b5cf6', 'boardroom': '#22c55e',
    'training': '#f59e0b', 'lobby': '#06b6d4', 'auditorium': '#ef4444',
  };
  return {
    tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 4, borderColor: colors.value.cardBg, borderWidth: 2 },
      label: { show: true, color: colors.value.textSecondary, fontSize: 11, formatter: '{b}: {c}' },
      data: Object.entries(byType).map(([name, value]) => ({
        value, name: name.replace(/\b\w/g, c => c.toUpperCase()),
        itemStyle: { color: typeColors[name] || '#64748b' },
      })),
      animationType: 'scale', animationEasing: 'elasticOut',
    }],
  };
});

const statusMap: Record<string, string[]> = {
  'Active': ['active', 'in-progress'], 'At Risk': ['__at_risk__'], 'On Hold': ['on-hold'],
  'Planning': ['planning', 'scheduled'], 'Cancelled': ['cancelled'],
};

async function handleChartClick(params: any) {
  const name = params.name as string;
  const statuses = statusMap[name];
  if (!statuses) return;

  if (drillStatus.value === name) {
    drillStatus.value = null;
    drillStatuses.value = [];
    drillProjects.value = [];
    return;
  }

  drillStatus.value = name;
  drillStatuses.value = statuses;
  drillLoading.value = true;
  try {
    if (statuses[0] === '__at_risk__') {
      // Use already-loaded timeline overdue data
      drillProjects.value = (timeline.value?.overdue || []).map((p: any) => ({
        id: p.id, name: p.name, type: p.type, status: 'active', daysOverdue: p.daysOverdue,
      }));
    } else {
      const results = await Promise.all(statuses.map(s => api(`/projects?status=${s}&limit=20&summary=true`)));
      drillProjects.value = results.flatMap(r => r.projects || []);
    }
  } catch {
    drillProjects.value = [];
  } finally {
    drillLoading.value = false;
  }
}

const drillChartOption = computed(() => {
  if (!drillProjects.value.length) return {};
  const byType: Record<string, number> = {};
  drillProjects.value.forEach(p => {
    const t = p.type || 'other';
    byType[t] = (byType[t] || 0) + 1;
  });
  const typeColors: Record<string, string> = {
    'new-build': '#0ea5e9', upgrade: '#8b5cf6', breakfix: '#ef4444',
    refresh: '#22c55e', telephony: '#f59e0b', 'uc-deployment': '#06b6d4', other: '#64748b',
  };
  return {
    tooltip: { trigger: 'item', backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText } },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 4, borderColor: colors.value.cardBg, borderWidth: 2 },
      label: { show: true, color: colors.value.textSecondary, fontSize: 11, formatter: '{b}: {c}' },
      data: Object.entries(byType).map(([name, value]) => ({
        value, name: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        itemStyle: { color: typeColors[name] || '#64748b' },
      })),
      animationType: 'scale', animationEasing: 'elasticOut',
    }],
  };
});

const { naiveTheme, themeOverrides, colors } = useTheme();
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">

  <NSpin :show="loading">
  <div :style="{ opacity: show ? 1 : 0, transition: 'opacity 0.4s ease' }">

    <!-- Welcome -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;">
      <div>
        <h1 style="margin:0;font-size:1.6rem;font-weight:700;">{{ greeting }}, {{ userName || 'there' }}</h1>
        <p :style="{ margin: '4px 0 0', color: colors.textMuted, fontSize: '0.95rem' }">{{ todayStr }}</p>
      </div>
      <NSpace>
        <NButton type="primary" size="small" @click="navigateTo('projects')"><i class="ph ph-plus" style="margin-right:4px;" /> New Project</NButton>
        <NButton size="small" @click="navigateTo('roomstatus')"><i class="ph ph-clipboard-text" style="margin-right:4px;" /> Record Check</NButton>
        <NButton size="small" @click="navigateTo('fieldops')"><i class="ph ph-calendar" style="margin-right:4px;" /> Field Ops</NButton>
      </NSpace>
    </div>

    <!-- Stats Row -->
    <NGrid :x-gap="14" :y-gap="14" :cols="5" style="margin-bottom:28px;" v-if="portfolio">
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-folder" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#0ea5e9;"><NNumberAnimation :from="0" :to="portfolio.projects?.total || 0" :duration="800" /></div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">Total Projects</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-check-circle" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#22c55e;"><NNumberAnimation :from="0" :to="portfolio.tasks?.completionRate || 0" :duration="1000" />%</div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">Tasks Complete</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-target" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#38bdf8;"><NNumberAnimation :from="0" :to="portfolio.onTimeRate || 0" :duration="800" />%</div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">On-Time Rate</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-warning" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#ef4444;"><NNumberAnimation :from="0" :to="portfolio.atRisk || 0" :duration="600" /></div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">At Risk</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-monitor" /></div>
          <div style="font-size:2.2rem;font-weight:800;" :style="{ color: (compliance?.summary?.total||0) > 0 ? '#22c55e' : '#94a3b8' }"><NNumberAnimation :from="0" :to="compliance?.summary?.total || 0" :duration="600" /></div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">Rooms Tracked</div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Charts Row -->
    <NGrid :x-gap="16" :y-gap="16" :cols="3" style="margin-bottom:28px;" v-if="portfolio">
      <!-- Project Status Donut - Interactive -->
      <NGi>
        <NCard size="small" style="min-height:340px;" :title="drillStatus ? `Projects: ${drillStatus.replace(/-/g, ' ').replace(/\\b\\w/g, (c: string) => c.toUpperCase())}` : 'Project Status'">
          <template #header-extra>
            <NButton v-if="drillStatus" text size="tiny" @click="drillStatus = null; drillStatuses = []; drillProjects = []" :style="{ color: colors.textMuted }">
              <i class="ph ph-arrow-left" style="margin-right:4px;" /> Back
            </NButton>
            <span v-else :style="{ fontSize: '0.75rem', color: colors.textMuted }">Click a segment to explore</span>
          </template>

          <!-- Main donut (hidden during drill-down) -->
          <div v-if="!drillStatus" style="height:260px;display:flex;flex-direction:column;justify-content:center;">
            <VChart :option="statusChartOption" style="height:210px;cursor:pointer;" autoresize @click="handleChartClick" />
            <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:0.8rem;">
              <span style="cursor:pointer;" @click="handleChartClick({name:'Active'})"><span style="color:#22c55e;">&#9679;</span> Active {{ (portfolio.projects?.active || 0) - (portfolio.atRisk || 0) }}</span>
              <span style="cursor:pointer;" @click="handleChartClick({name:'At Risk'})"><span style="color:#ef4444;">&#9679;</span> At Risk {{ portfolio.atRisk }}</span>
              <span style="cursor:pointer;" @click="handleChartClick({name:'On Hold'})"><span style="color:#f59e0b;">&#9679;</span> Hold {{ portfolio.projects?.onHold }}</span>
              <span style="cursor:pointer;" @click="handleChartClick({name:'Planning'})"><span style="color:#0ea5e9;">&#9679;</span> Planning {{ portfolio.projects?.planning }}</span>
            </div>
          </div>

          <!-- Drill-down view -->
          <div v-else style="height:260px;display:flex;flex-direction:column;">
            <NSpin :show="drillLoading">
              <VChart v-if="drillProjects.length" :option="drillChartOption" style="height:140px;" autoresize />
              <div style="flex:1;max-height:120px;overflow-y:auto;margin-top:8px;">
                <div v-for="p in drillProjects" :key="p.id"
                  style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:0.85rem;transition:background 0.15s;"
                  @click="openProject(p.id)"
                  @mouseenter="($event.currentTarget as HTMLElement).style.background = colors.borderSubtle"
                  @mouseleave="($event.currentTarget as HTMLElement).style.background = ''">
                  <span style="font-weight:500;">{{ p.name }}</span>
                  <span :style="{ color: colors.textMuted, fontSize: '0.78rem' }">{{ p.type || '' }}</span>
                </div>
              </div>
              <div v-if="!drillLoading && !drillProjects.length" :style="{ textAlign: 'center', padding: '16px', color: colors.textMuted }">No projects</div>
            </NSpin>
          </div>
        </NCard>
      </NGi>

      <!-- Budget Gauge - Interactive -->
      <NGi>
        <NCard size="small" style="min-height:340px;" :title="budgetDrill ? 'Budget by Project' : 'Budget Utilization'">
          <template #header-extra>
            <NButton v-if="budgetDrill" text size="tiny" @click="budgetDrill = false" :style="{ color: colors.textMuted }">
              <i class="ph ph-arrow-left" style="margin-right:4px;" /> Back
            </NButton>
            <span v-else :style="{ fontSize: '0.75rem', color: colors.textMuted, cursor: 'pointer' }" @click="toggleBudgetDrill">Click to explore</span>
          </template>

          <div v-if="!budgetDrill" @click="toggleBudgetDrill" style="cursor:pointer;height:260px;display:flex;flex-direction:column;justify-content:center;">
            <VChart :option="budgetGaugeOption" style="height:210px;" autoresize />
            <div :style="{ textAlign: 'center', fontSize: '0.8rem', color: colors.textMuted, marginTop: '4px' }">
              ${{ ((portfolio.budget?.totalActual || 0) / 1000).toFixed(0) }}K of ${{ ((portfolio.budget?.totalPlanned || 0) / 1000).toFixed(0) }}K
            </div>
          </div>

          <div v-else style="height:260px;display:flex;flex-direction:column;">
            <NSpin :show="budgetLoading">
              <VChart v-if="budgetProjects.length" :option="budgetBarOption" style="height:160px;" autoresize />
              <div style="flex:1;max-height:100px;overflow-y:auto;margin-top:8px;">
                <div v-for="p in budgetProjects.slice(0, 6)" :key="p.id"
                  style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.82rem;transition:background 0.15s;"
                  @click="openProject(p.id)"
                  @mouseenter="($event.currentTarget as HTMLElement).style.background = colors.borderSubtle"
                  @mouseleave="($event.currentTarget as HTMLElement).style.background = ''">
                  <span style="font-weight:500;">{{ p.name }}</span>
                  <span :style="{ color: p.variance > 0 ? '#ef4444' : '#22c55e', fontWeight: 600, fontSize: '0.78rem' }">
                    {{ p.variance > 0 ? '+' : '' }}{{ fmt(p.variance) }}
                  </span>
                </div>
              </div>
              <div v-if="!budgetLoading && !budgetProjects.length" :style="{ textAlign: 'center', padding: '16px', color: colors.textMuted }">No budget data</div>
            </NSpin>
          </div>
        </NCard>
      </NGi>

      <!-- Room Health - Interactive -->
      <NGi>
        <NCard size="small" style="min-height:340px;" :title="roomDrill ? (roomDrillFilter === 'red' ? 'Down Rooms' : roomDrillFilter === 'amber' ? 'Limited Rooms' : roomDrillFilter === 'green' ? 'Operational Rooms' : 'All Rooms') : 'Room Health'" v-if="compliance">
          <template #header-extra>
            <NButton v-if="roomDrill" text size="tiny" @click="roomDrill = false; roomDrillFilter = null" :style="{ color: colors.textMuted }">
              <i class="ph ph-arrow-left" style="margin-right:4px;" /> Back
            </NButton>
            <span v-else :style="{ fontSize: '0.75rem', color: colors.textMuted }">Click to explore</span>
          </template>

          <div v-if="!roomDrill" style="height:260px;display:flex;flex-direction:column;justify-content:center;">
            <VChart :option="roomHealthChartOption" style="height:210px;cursor:pointer;" autoresize @click="handleRoomChartClick" />
            <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:0.8rem;">
              <span style="cursor:pointer;" @click="toggleRoomDrill('green')"><span style="color:#22c55e;">&#9679;</span> Operational</span>
              <span style="cursor:pointer;" @click="toggleRoomDrill('amber')"><span style="color:#f59e0b;">&#9679;</span> Limited</span>
              <span style="cursor:pointer;" @click="toggleRoomDrill('red')"><span style="color:#ef4444;">&#9679;</span> Down</span>
            </div>
          </div>

          <div v-else style="height:260px;display:flex;flex-direction:column;">
            <VChart v-if="filteredRooms.length" :option="roomTypeChart" style="height:140px;" autoresize />
            <div style="flex:1;max-height:120px;overflow-y:auto;margin-top:8px;">
              <div v-for="r in filteredRooms" :key="r.id"
                style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:0.82rem;transition:background 0.15s;"
                @click="navigateTo('roomstatus')"
                @mouseenter="($event.currentTarget as HTMLElement).style.background = colors.borderSubtle"
                @mouseleave="($event.currentTarget as HTMLElement).style.background = ''">
                <div>
                  <span style="font-weight:500;">{{ r.name }}</span>
                  <span :style="{ color: colors.textMuted, fontSize: '0.75rem', marginLeft: '6px' }">{{ r.location }}</span>
                </div>
                <span :style="{ color: r.compliance === 'at-standard' ? '#22c55e' : r.compliance === 'below-standard' ? '#f59e0b' : '#94a3b8', fontSize: '0.75rem' }">
                  {{ r.compliance === 'at-standard' ? 'OK' : r.compliance === 'below-standard' ? r.missing?.length + ' missing' : 'No std' }}
                </span>
              </div>
            </div>
            <div v-if="!filteredRooms.length" :style="{ textAlign: 'center', padding: '16px', color: colors.textMuted }">No rooms</div>
          </div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Bottom Row -->
    <NGrid :x-gap="16" :y-gap="16" :cols="2" v-if="portfolio">
      <!-- Alerts -->
      <NGi>
        <NCard size="small" title="Needs Attention">
          <div v-if="timeline?.overdue?.length" style="display:flex;flex-direction:column;gap:8px;">
            <div v-for="p in timeline.overdue.slice(0, 5)" :key="p.id"
              style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:6px;border-left:3px solid #ef4444;background:rgba(239,68,68,0.04);cursor:pointer;transition:transform 0.1s;"
              @click="openProject(p.id)"
              @mouseenter="($event.currentTarget as HTMLElement).style.transform = 'translateX(4px)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.transform = ''">
              <div>
                <div style="font-weight:500;">{{ p.name }}</div>
                <div :style="{ fontSize: '0.78rem', color: colors.textMuted }">{{ p.type }} - {{ p.progress }}% complete</div>
              </div>
              <NTag type="error" size="small" :bordered="false">{{ p.daysOverdue }}d overdue</NTag>
            </div>
          </div>
          <div v-else :style="{ textAlign: 'center', padding: '20px', color: colors.textMuted }">
            <i class="ph ph-check-circle" style="font-size:2rem;color:#22c55e;display:block;margin-bottom:8px;" />
            All clear - no overdue projects
          </div>
        </NCard>
      </NGi>

      <!-- Upcoming Field Work -->
      <NGi>
        <NCard size="small" title="Upcoming Field Work (7 days)">
          <div v-if="upcomingOps.length" style="display:flex;flex-direction:column;gap:8px;">
            <div v-for="op in upcomingOps" :key="op.id"
              :style="{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '6px', border: '1px solid ' + colors.borderSubtle, cursor: 'pointer', transition: 'transform 0.1s' }"
              @click="navigateTo('fieldops')"
              @mouseenter="($event.currentTarget as HTMLElement).style.transform = 'translateX(4px)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.transform = ''">
              <i :class="'ph ' + (typeIcons[op.type]?.icon || 'ph-briefcase')"
                :style="{ fontSize:'1.2rem', color: typeIcons[op.type]?.color || '#64748b' }" />
              <div style="flex:1;">
                <div style="font-weight:500;font-size:0.9rem;">{{ op.taskName || op.title }}</div>
                <div :style="{ fontSize: '0.78rem', color: colors.textMuted }">{{ op.assignee || op.assignedTo }} - {{ op.location }}</div>
              </div>
              <div :style="{ textAlign: 'right', fontSize: '0.8rem', color: colors.textMuted }">
                {{ new Date(op.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}
              </div>
            </div>
          </div>
          <div v-else :style="{ textAlign: 'center', padding: '20px', color: colors.textMuted }">
            <i class="ph ph-calendar-blank" style="font-size:2rem;display:block;margin-bottom:8px;" />
            No field work scheduled this week
          </div>
        </NCard>
      </NGi>
    </NGrid>

  </div>
  </NSpin>

</div>
</NConfigProvider>
</NMessageProvider>
</template>
