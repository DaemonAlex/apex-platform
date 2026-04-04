<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NTag, NButton, NSpace, NSpin, NNumberAnimation, NBadge,
} from 'naive-ui';
import { useTheme } from './composables/useTheme';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { PieChart, GaugeChart, BarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

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
const portfolio = ref<any>(null);
const compliance = ref<any>(null);
const attention = ref<any[]>([]);
const todaySchedule = ref<any[]>([]);
const attentionCounts = ref<any>({ critical: 0, warning: 0, info: 0, todaySchedule: 0 });
const fieldOps = ref<any[]>([]);
const show = ref(false);

// Chart view cycling - each chart has multiple data views
const projectView = ref(0);
const projectViews = ['Status', 'By Type', 'Tasks'];
const budgetView = ref(0);
const budgetViews = ['Budget Used', 'By Department', 'Health'];
const roomView = ref(0);
const roomViews = ['Status', 'By Type', 'Compliance'];

function cycleView(chart: 'project' | 'budget' | 'room') {
  if (chart === 'project') projectView.value = (projectView.value + 1) % projectViews.length;
  else if (chart === 'budget') budgetView.value = (budgetView.value + 1) % budgetViews.length;
  else roomView.value = (roomView.value + 1) % roomViews.length;
}

const chartPalette = ['#0ea5e9', '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#64748b', '#14b8a6', '#f97316'];

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

const totalAttention = computed(() => attention.value.length);

// Type icons for field ops
const typeIcons: Record<string, { icon: string; color: string }> = {
  'Site Survey': { icon: 'ph-binoculars', color: '#0ea5e9' },
  'site_survey': { icon: 'ph-binoculars', color: '#0ea5e9' },
  'Installation': { icon: 'ph-hammer', color: '#8b5cf6' },
  'installation': { icon: 'ph-hammer', color: '#8b5cf6' },
  'Commissioning': { icon: 'ph-check-square', color: '#22c55e' },
  'commissioning': { icon: 'ph-check-square', color: '#22c55e' },
  'Service Call': { icon: 'ph-wrench', color: '#ef4444' },
  'service': { icon: 'ph-wrench', color: '#ef4444' },
  'Maintenance': { icon: 'ph-gear', color: '#f59e0b' },
  'maintenance': { icon: 'ph-gear', color: '#f59e0b' },
  'Training': { icon: 'ph-chalkboard-teacher', color: '#06b6d4' },
  'training': { icon: 'ph-chalkboard-teacher', color: '#06b6d4' },
};

// Attention item icon
function itemIcon(item: any): string {
  if (item.type === 'overdue_task') return 'ph-warning-circle';
  if (item.type === 'overdue_room_check') return 'ph-monitor';
  if (item.type === 'overdue_fieldop') return 'ph-wrench';
  if (item.type === 'stale_submittal') return 'ph-file-text';
  return 'ph-info';
}

function itemLabel(item: any): string {
  if (item.type === 'overdue_task') return item.daysOverdue + 'd overdue';
  if (item.type === 'overdue_room_check') return item.neverChecked ? 'Never checked' : (item.daysOverdue + 'd since check');
  if (item.type === 'overdue_fieldop') return item.daysOverdue + 'd overdue';
  if (item.type === 'stale_submittal') return item.daysPending + 'd pending';
  return '';
}

function itemTypeLabel(item: any): string {
  if (item.type === 'overdue_task') return 'Task';
  if (item.type === 'overdue_room_check') return 'Room Check';
  if (item.type === 'overdue_fieldop') return 'Field Op';
  if (item.type === 'stale_submittal') return item.submittalType === 'rfi' ? 'RFI' : 'Submittal';
  return '';
}

function handleItemClick(item: any) {
  if (item.type === 'overdue_task' && item.projectId) openProject(item.projectId);
  else if (item.type === 'overdue_room_check') navigateTo('roomstatus');
  else if (item.type === 'overdue_fieldop') navigateTo('fieldops');
  else if (item.type === 'stale_submittal' && item.projectId) openProject(item.projectId);
}

function handleTodayClick(item: any) {
  if (item.type === 'fieldop') navigateTo('fieldops');
  else if (item.type === 'room_check_due') navigateTo('roomstatus');
}

function severityColor(severity: string): string {
  if (severity === 'critical') return '#ef4444';
  if (severity === 'warning') return '#f59e0b';
  return '#0ea5e9';
}

function severityBg(severity: string): string {
  if (severity === 'critical') return 'rgba(239,68,68,0.06)';
  if (severity === 'warning') return 'rgba(245,158,11,0.06)';
  return 'rgba(14,165,233,0.06)';
}

// Shared pie chart base config
function pieBase(data: { value: number; name: string; itemStyle: { color: string } }[]) {
  return {
    tooltip: { trigger: 'item' as const, backgroundColor: colors.value.tooltipBg, borderColor: colors.value.tooltipBorder, textStyle: { color: colors.value.tooltipText }, formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie', radius: ['50%', '78%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 8, borderColor: colors.value.cardBg, borderWidth: 3 },
      label: { show: false },
      data: data.filter(d => d.value > 0),
      emphasis: { scale: true, scaleSize: 12, itemStyle: { shadowBlur: 20, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' } },
      animationType: 'scale', animationEasing: 'elasticOut', animationDuration: 600,
      animationDelay: (_idx: number) => _idx * 80,
    }],
  };
}

// PROJECT STATUS - 3 views
const statusChartOption = computed(() => {
  if (!portfolio.value) return {};
  const p = portfolio.value.projects;
  const v = projectView.value;
  if (v === 1) {
    const types = (portfolio.value.projectTypes || []) as any[];
    return pieBase(types.map((t: any, i: number) => ({
      value: t.count, name: t.type.charAt(0).toUpperCase() + t.type.slice(1),
      itemStyle: { color: chartPalette[i % chartPalette.length] },
    })));
  }
  if (v === 2) {
    const t = portfolio.value.tasks;
    return pieBase([
      { value: t?.completed || 0, name: 'Completed', itemStyle: { color: '#22c55e' } },
      { value: t?.inProgress || 0, name: 'In Progress', itemStyle: { color: '#0ea5e9' } },
      { value: t?.notStarted || 0, name: 'Not Started', itemStyle: { color: '#64748b' } },
    ]);
  }
  return pieBase([
    { value: Math.max(0, p.active - (portfolio.value?.atRisk || 0)), name: 'Active', itemStyle: { color: '#22c55e' } },
    { value: portfolio.value?.atRisk || 0, name: 'At Risk', itemStyle: { color: '#ef4444' } },
    { value: p.onHold, name: 'On Hold', itemStyle: { color: '#f59e0b' } },
    { value: p.planning, name: 'Planning', itemStyle: { color: '#0ea5e9' } },
    { value: p.cancelled, name: 'Cancelled', itemStyle: { color: '#64748b' } },
  ]);
});

// Reactive legend items for project chart
const statusLegend = computed(() => {
  if (!portfolio.value) return [];
  const p = portfolio.value.projects;
  const v = projectView.value;
  if (v === 1) {
    return (portfolio.value.projectTypes || []).map((t: any, i: number) => ({
      label: t.type.charAt(0).toUpperCase() + t.type.slice(1),
      value: t.count, color: chartPalette[i % chartPalette.length],
    }));
  }
  if (v === 2) {
    const t = portfolio.value.tasks;
    return [
      { label: 'Done', value: t?.completed || 0, color: '#22c55e' },
      { label: 'Active', value: t?.inProgress || 0, color: '#0ea5e9' },
      { label: 'Pending', value: t?.notStarted || 0, color: '#64748b' },
    ];
  }
  return [
    { label: 'Active', value: Math.max(0, p.active - (portfolio.value?.atRisk || 0)), color: '#22c55e' },
    { label: 'At Risk', value: portfolio.value?.atRisk || 0, color: '#ef4444' },
    { label: 'Hold', value: p.onHold, color: '#f59e0b' },
    { label: 'Planning', value: p.planning, color: '#0ea5e9' },
  ];
});

// BUDGET - 3 views (gauge, pie by dept, pie health)
const budgetChartOption = computed(() => {
  if (!portfolio.value?.budget) return {};
  const b = portfolio.value.budget;
  const v = budgetView.value;

  if (v === 1) {
    const lines = (portfolio.value.businessLines || []) as any[];
    return pieBase(lines.map((bl: any, i: number) => ({
      value: bl.budget || 0, name: bl.name,
      itemStyle: { color: chartPalette[i % chartPalette.length] },
    })));
  }
  if (v === 2) {
    const overCount = b.overBudgetCount || 0;
    const total = portfolio.value.projects?.total || 0;
    const onBudget = Math.max(0, total - overCount);
    return pieBase([
      { value: onBudget, name: 'On Budget', itemStyle: { color: '#22c55e' } },
      { value: overCount, name: 'Over Budget', itemStyle: { color: '#ef4444' } },
    ]);
  }
  // Default: gauge
  const planned = b.totalPlanned || 1;
  const actual = b.totalActual || 0;
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
      animationDuration: 600,
    }]
  };
});

const budgetLegend = computed(() => {
  if (!portfolio.value?.budget) return [];
  const b = portfolio.value.budget;
  const v = budgetView.value;
  if (v === 1) {
    return (portfolio.value.businessLines || []).map((bl: any, i: number) => ({
      label: bl.name, value: '$' + (bl.budget / 1000).toFixed(0) + 'K', color: chartPalette[i % chartPalette.length],
    }));
  }
  if (v === 2) {
    const overCount = b.overBudgetCount || 0;
    const total = portfolio.value.projects?.total || 0;
    return [
      { label: 'On Budget', value: Math.max(0, total - overCount), color: '#22c55e' },
      { label: 'Over Budget', value: overCount, color: '#ef4444' },
    ];
  }
  const planned = b.totalPlanned || 1;
  const actual = b.totalActual || 0;
  const pct = Math.round((actual / planned) * 100);
  return [{ label: '$' + (actual / 1000).toFixed(0) + 'K of $' + (planned / 1000).toFixed(0) + 'K', value: pct + '%', color: pct > 100 ? '#ef4444' : '#22c55e' }];
});

// ROOM HEALTH - 3 views
const roomChartOption = computed(() => {
  if (!compliance.value?.rooms) return {};
  const rooms = compliance.value.rooms as any[];
  const v = roomView.value;

  if (v === 1) {
    const typeCounts: Record<string, number> = {};
    rooms.forEach(r => { const t = r.roomType || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    return pieBase(Object.entries(typeCounts).map(([name, count], i) => ({
      value: count, name: name.charAt(0).toUpperCase() + name.slice(1),
      itemStyle: { color: chartPalette[i % chartPalette.length] },
    })));
  }
  if (v === 2) {
    let atStd = 0, belowStd = 0, noStd = 0;
    rooms.forEach(r => {
      if (r.compliance === 'at-standard') atStd++;
      else if (r.compliance === 'below-standard') belowStd++;
      else noStd++;
    });
    return pieBase([
      { value: atStd, name: 'At Standard', itemStyle: { color: '#22c55e' } },
      { value: belowStd, name: 'Below Standard', itemStyle: { color: '#f59e0b' } },
      { value: noStd, name: 'No Standard', itemStyle: { color: '#64748b' } },
    ]);
  }
  // Default: RAG status
  let operational = 0, limited = 0, down = 0, unchecked = 0;
  rooms.forEach(r => {
    if (r.ragStatus === 'red') down++;
    else if (r.ragStatus === 'amber') limited++;
    else if (r.ragStatus === 'green') operational++;
    else if (r.compliance === 'at-standard') operational++;
    else if (r.compliance === 'below-standard') limited++;
    else unchecked++;
  });
  return pieBase([
    { value: operational, name: 'Operational', itemStyle: { color: '#22c55e' } },
    { value: limited, name: 'Limited', itemStyle: { color: '#f59e0b' } },
    { value: down, name: 'Down', itemStyle: { color: '#ef4444' } },
    { value: unchecked, name: 'Unchecked', itemStyle: { color: '#64748b' } },
  ]);
});

const roomLegend = computed(() => {
  if (!compliance.value?.rooms) return [];
  const rooms = compliance.value.rooms as any[];
  const v = roomView.value;
  if (v === 1) {
    const typeCounts: Record<string, number> = {};
    rooms.forEach(r => { const t = r.roomType || 'Other'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    return Object.entries(typeCounts).map(([name, count], i) => ({
      label: name.charAt(0).toUpperCase() + name.slice(1), value: count,
      color: chartPalette[i % chartPalette.length],
    }));
  }
  if (v === 2) {
    let atStd = 0, belowStd = 0, noStd = 0;
    rooms.forEach(r => {
      if (r.compliance === 'at-standard') atStd++;
      else if (r.compliance === 'below-standard') belowStd++;
      else noStd++;
    });
    return [
      { label: 'At Standard', value: atStd, color: '#22c55e' },
      { label: 'Below', value: belowStd, color: '#f59e0b' },
      { label: 'No Standard', value: noStd, color: '#64748b' },
    ];
  }
  let operational = 0, limited = 0, down = 0, unchecked = 0;
  rooms.forEach(r => {
    if (r.ragStatus === 'red') down++;
    else if (r.ragStatus === 'amber') limited++;
    else if (r.ragStatus === 'green') operational++;
    else if (r.compliance === 'at-standard') operational++;
    else if (r.compliance === 'below-standard') limited++;
    else unchecked++;
  });
  return [
    { label: 'Operational', value: operational, color: '#22c55e' },
    { label: 'Limited', value: limited, color: '#f59e0b' },
    { label: 'Down', value: down, color: '#ef4444' },
    ...(unchecked > 0 ? [{ label: 'Unchecked', value: unchecked, color: '#64748b' }] : []),
  ];
});

onMounted(async () => {
  try {
    const [p, c, attn, fo] = await Promise.all([
      api('/reports/portfolio'),
      api('/room-status/compliance/scorecard'),
      api('/reports/attention'),
      api('/fieldops'),
    ]);
    portfolio.value = p;
    compliance.value = c;
    attention.value = attn.attention || [];
    todaySchedule.value = attn.today || [];
    attentionCounts.value = attn.counts || { critical: 0, warning: 0, info: 0, todaySchedule: 0 };
    fieldOps.value = [...(fo.scheduled || []), ...(fo.completed || []), ...(fo.pending || [])];
  } finally {
    loading.value = false;
    setTimeout(() => { show.value = true; }, 50);
  }
});

const { naiveTheme, themeOverrides, colors } = useTheme();
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">

  <NSpin :show="loading">
  <div :style="{ opacity: show ? 1 : 0, transition: 'opacity 0.4s ease' }">

    <!-- Welcome + Quick Actions -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px;">
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

    <!-- ATTENTION FEED + TODAY'S SCHEDULE (the command center) -->
    <NGrid :x-gap="16" :y-gap="16" :cols="totalAttention > 0 ? 3 : 2" style="margin-bottom:24px;" v-if="!loading">

      <!-- Needs Attention -->
      <NGi :span="totalAttention > 0 ? 2 : 1">
        <NCard size="small" style="min-height:300px;">
          <template #header>
            <div style="display:flex;align-items:center;gap:10px;">
              <span>Needs Attention</span>
              <NBadge :value="totalAttention" :type="attentionCounts.critical > 0 ? 'error' : attentionCounts.warning > 0 ? 'warning' : 'info'" v-if="totalAttention > 0" />
            </div>
          </template>
          <template #header-extra>
            <NSpace :size="8" v-if="totalAttention > 0">
              <NTag size="small" type="error" :bordered="false" v-if="attentionCounts.critical > 0">{{ attentionCounts.critical }} critical</NTag>
              <NTag size="small" type="warning" :bordered="false" v-if="attentionCounts.warning > 0">{{ attentionCounts.warning }} warning</NTag>
            </NSpace>
          </template>

          <div v-if="attention.length" style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
            <div v-for="(item, idx) in attention.slice(0, 15)" :key="idx"
              :style="{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                borderLeft: '3px solid ' + severityColor(item.severity),
                background: severityBg(item.severity),
                transition: 'transform 0.1s',
              }"
              @click="handleItemClick(item)"
              @mouseenter="($event.currentTarget as HTMLElement).style.transform = 'translateX(4px)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.transform = ''">
              <i :class="'ph ' + itemIcon(item)" :style="{ fontSize: '1.3rem', color: item.color || severityColor(item.severity), flexShrink: 0 }" />
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ item.title }}</span>
                  <NTag size="tiny" :bordered="false" :style="{ flexShrink: 0, opacity: 0.8 }">{{ itemTypeLabel(item) }}</NTag>
                </div>
                <div :style="{ fontSize: '0.78rem', color: colors.textMuted, marginTop: '2px', display: 'flex', gap: '8px' }">
                  <span>{{ item.subtitle }}</span>
                  <span v-if="item.assignee">- {{ item.assignee }}</span>
                </div>
              </div>
              <NTag size="small" :bordered="false"
                :type="item.severity === 'critical' ? 'error' : item.severity === 'warning' ? 'warning' : 'info'"
                style="flex-shrink:0;">
                {{ itemLabel(item) }}
              </NTag>
            </div>
          </div>

          <div v-else :style="{ textAlign: 'center', padding: '40px 20px', color: colors.textMuted }">
            <i class="ph ph-check-circle" style="font-size:2.5rem;color:#22c55e;display:block;margin-bottom:12px;" />
            <div style="font-weight:600;font-size:1rem;">All clear</div>
            <div style="margin-top:4px;">No overdue tasks, room checks, or pending items</div>
          </div>
        </NCard>
      </NGi>

      <!-- Today's Schedule -->
      <NGi>
        <NCard size="small" style="min-height:300px;">
          <template #header>
            <div style="display:flex;align-items:center;gap:10px;">
              <span>Today's Schedule</span>
              <NBadge :value="todaySchedule.length" type="info" v-if="todaySchedule.length > 0" />
            </div>
          </template>

          <div v-if="todaySchedule.length" style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
            <div v-for="(item, idx) in todaySchedule" :key="idx"
              :style="{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                border: '1px solid ' + colors.borderSubtle,
                transition: 'transform 0.1s',
              }"
              @click="handleTodayClick(item)"
              @mouseenter="($event.currentTarget as HTMLElement).style.transform = 'translateX(4px)'"
              @mouseleave="($event.currentTarget as HTMLElement).style.transform = ''">
              <i :class="'ph ' + (item.type === 'room_check_due' ? 'ph-monitor' : (typeIcons[item.fieldOpType]?.icon || 'ph-briefcase'))"
                :style="{ fontSize: '1.2rem', color: item.type === 'room_check_due' ? '#f59e0b' : (typeIcons[item.fieldOpType]?.color || '#64748b'), flexShrink: 0 }" />
              <div style="flex:1;min-width:0;">
                <div style="font-weight:500;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ item.title }}</div>
                <div :style="{ fontSize: '0.78rem', color: colors.textMuted, marginTop: '1px' }">
                  <span v-if="item.type === 'room_check_due'">Room check due - {{ item.subtitle }}</span>
                  <span v-else>
                    {{ item.assignee || '' }}
                    <span v-if="item.location"> - {{ item.location }}</span>
                  </span>
                </div>
              </div>
              <div v-if="item.startTime" :style="{ fontSize: '0.78rem', color: colors.textMuted, flexShrink: 0, textAlign: 'right' }">
                {{ item.startTime }}
              </div>
              <NTag v-if="item.type === 'room_check_due'" size="tiny" type="warning" :bordered="false">Due</NTag>
              <NTag v-else-if="item.status === 'in-progress'" size="tiny" type="success" :bordered="false">Active</NTag>
            </div>
          </div>

          <div v-else :style="{ textAlign: 'center', padding: '40px 20px', color: colors.textMuted }">
            <i class="ph ph-calendar-blank" style="font-size:2.5rem;display:block;margin-bottom:12px;" />
            <div style="font-weight:600;font-size:1rem;">Clear schedule</div>
            <div style="margin-top:4px;">No field work or room checks today</div>
          </div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Stats Row -->
    <NGrid :x-gap="14" :y-gap="14" :cols="5" style="margin-bottom:24px;" v-if="portfolio">
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;cursor:pointer;" @click="navigateTo('projects')">
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
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;cursor:pointer;" @click="navigateTo('projects')">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-warning" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#ef4444;"><NNumberAnimation :from="0" :to="portfolio.atRisk || 0" :duration="600" /></div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">At Risk</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;cursor:pointer;" @click="navigateTo('roomstatus')">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-monitor" /></div>
          <div style="font-size:2.2rem;font-weight:800;" :style="{ color: (compliance?.summary?.total||0) > 0 ? '#22c55e' : '#94a3b8' }"><NNumberAnimation :from="0" :to="compliance?.summary?.total || 0" :duration="600" /></div>
          <div :style="{ fontSize: '0.85rem', color: colors.textMuted, marginTop: '2px' }">Rooms Tracked</div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Charts Row -->
    <NGrid :x-gap="16" :y-gap="16" :cols="3" style="margin-bottom:24px;" v-if="portfolio">
      <!-- Project Status -->
      <NGi>
        <NCard size="small" style="min-height:280px;">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px;">
              <span>Project Status</span>
              <span :style="{ fontSize: '0.7rem', color: colors.textMuted, fontWeight: 400, opacity: 0.7 }">{{ projectViews[projectView] }}</span>
            </div>
          </template>
          <template #header-extra>
            <span :style="{ fontSize: '0.75rem', color: colors.textMuted, cursor: 'pointer' }" @click="navigateTo('projects')">View all</span>
          </template>
          <div style="cursor:pointer;" @click="cycleView('project')">
            <div style="height:190px;display:flex;align-items:center;justify-content:center;">
              <VChart :option="statusChartOption" style="height:190px;" autoresize />
            </div>
            <div style="display:flex;justify-content:center;gap:12px;margin-top:6px;font-size:0.76rem;flex-wrap:wrap;">
              <span v-for="item in statusLegend" :key="item.label">
                <span :style="{ color: item.color }">&#9679;</span> {{ item.label }} {{ item.value }}
              </span>
            </div>
            <div style="display:flex;justify-content:center;gap:5px;margin-top:8px;">
              <span v-for="(_, i) in projectViews" :key="i"
                :style="{ width: '6px', height: '6px', borderRadius: '50%', background: i === projectView ? '#0ea5e9' : colors.railColor, transition: 'background 0.3s' }" />
            </div>
          </div>
        </NCard>
      </NGi>

      <!-- Budget -->
      <NGi>
        <NCard size="small" style="min-height:280px;">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px;">
              <span>Budget</span>
              <span :style="{ fontSize: '0.7rem', color: colors.textMuted, fontWeight: 400, opacity: 0.7 }">{{ budgetViews[budgetView] }}</span>
            </div>
          </template>
          <template #header-extra>
            <span :style="{ fontSize: '0.75rem', color: colors.textMuted, cursor: 'pointer' }" @click="navigateTo('reports')">View all</span>
          </template>
          <div style="cursor:pointer;" @click="cycleView('budget')">
            <div style="height:190px;display:flex;align-items:center;justify-content:center;">
              <VChart :option="budgetChartOption" style="height:190px;" autoresize />
            </div>
            <div style="display:flex;justify-content:center;gap:12px;margin-top:6px;font-size:0.76rem;flex-wrap:wrap;">
              <span v-for="item in budgetLegend" :key="item.label">
                <span :style="{ color: item.color }">&#9679;</span> {{ item.label }} {{ item.value }}
              </span>
            </div>
            <div style="display:flex;justify-content:center;gap:5px;margin-top:8px;">
              <span v-for="(_, i) in budgetViews" :key="i"
                :style="{ width: '6px', height: '6px', borderRadius: '50%', background: i === budgetView ? '#0ea5e9' : colors.railColor, transition: 'background 0.3s' }" />
            </div>
          </div>
        </NCard>
      </NGi>

      <!-- Room Health -->
      <NGi>
        <NCard size="small" style="min-height:280px;" v-if="compliance">
          <template #header>
            <div style="display:flex;align-items:center;gap:8px;">
              <span>Room Health</span>
              <span :style="{ fontSize: '0.7rem', color: colors.textMuted, fontWeight: 400, opacity: 0.7 }">{{ roomViews[roomView] }}</span>
            </div>
          </template>
          <template #header-extra>
            <span :style="{ fontSize: '0.75rem', color: colors.textMuted, cursor: 'pointer' }" @click="navigateTo('roomstatus')">View all</span>
          </template>
          <div style="cursor:pointer;" @click="cycleView('room')">
            <div style="height:190px;display:flex;align-items:center;justify-content:center;">
              <VChart :option="roomChartOption" style="height:190px;" autoresize />
            </div>
            <div style="display:flex;justify-content:center;gap:12px;margin-top:6px;font-size:0.76rem;flex-wrap:wrap;">
              <span v-for="item in roomLegend" :key="item.label">
                <span :style="{ color: item.color }">&#9679;</span> {{ item.label }} {{ item.value }}
              </span>
            </div>
            <div style="display:flex;justify-content:center;gap:5px;margin-top:8px;">
              <span v-for="(_, i) in roomViews" :key="i"
                :style="{ width: '6px', height: '6px', borderRadius: '50%', background: i === roomView ? '#0ea5e9' : colors.railColor, transition: 'background 0.3s' }" />
            </div>
          </div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Upcoming Field Work -->
    <NCard size="small" title="Upcoming Field Work (7 days)" v-if="upcomingOps.length" style="margin-bottom:24px;">
      <template #header-extra>
        <span :style="{ fontSize: '0.75rem', color: colors.textMuted, cursor: 'pointer' }" @click="navigateTo('fieldops')">View all</span>
      </template>
      <NGrid :x-gap="12" :y-gap="12" :cols="3">
        <NGi v-for="op in upcomingOps" :key="op.id">
          <div
            :style="{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '6px', border: '1px solid ' + colors.borderSubtle, cursor: 'pointer', transition: 'transform 0.1s' }"
            @click="navigateTo('fieldops')"
            @mouseenter="($event.currentTarget as HTMLElement).style.transform = 'translateX(4px)'"
            @mouseleave="($event.currentTarget as HTMLElement).style.transform = ''">
            <i :class="'ph ' + (typeIcons[op.type]?.icon || 'ph-briefcase')"
              :style="{ fontSize:'1.2rem', color: typeIcons[op.type]?.color || '#64748b' }" />
            <div style="flex:1;min-width:0;">
              <div style="font-weight:500;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{{ op.taskName || op.title }}</div>
              <div :style="{ fontSize: '0.78rem', color: colors.textMuted }">{{ op.assignee || op.assignedTo }} - {{ op.location }}</div>
            </div>
            <div :style="{ textAlign: 'right', fontSize: '0.78rem', color: colors.textMuted, flexShrink: 0 }">
              {{ new Date(op.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}
            </div>
          </div>
        </NGi>
      </NGrid>
    </NCard>

  </div>
  </NSpin>

</div>
</NConfigProvider>
</NMessageProvider>
</template>
