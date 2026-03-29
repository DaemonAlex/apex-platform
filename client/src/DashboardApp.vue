<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider, darkTheme,
  NCard, NGrid, NGi, NProgress, NTag, NButton, NSpace, NSpin, NNumberAnimation,
} from 'naive-ui';
import type { GlobalThemeOverrides } from 'naive-ui';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { PieChart, GaugeChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
// h not needed in template-only rendering

use([PieChart, GaugeChart, TitleComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{ userName?: string }>();

const loading = ref(true);
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
    tooltip: { trigger: 'item', backgroundColor: '#1e2130', borderColor: '#2a2d3e', textStyle: { color: '#eef0f4' } },
    series: [{
      type: 'pie', radius: ['55%', '80%'], center: ['50%', '50%'],
      itemStyle: { borderRadius: 6, borderColor: '#1e2130', borderWidth: 2 },
      label: { show: false },
      data: [
        { value: p.active, name: 'Active', itemStyle: { color: '#22c55e' } },
        { value: p.onHold, name: 'On Hold', itemStyle: { color: '#f59e0b' } },
        { value: p.completed, name: 'Completed', itemStyle: { color: '#64748b' } },
        { value: p.planning, name: 'Planning', itemStyle: { color: '#0ea5e9' } },
        { value: p.cancelled, name: 'Cancelled', itemStyle: { color: '#ef4444' } },
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
      axisLine: { lineStyle: { width: 14, color: [[1, '#2a2d3e']] } },
      axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { distance: 20, color: '#8890a4', fontSize: 11, formatter: (v: number) => v + '%' },
      detail: { valueAnimation: true, fontSize: 22, fontWeight: 700, offsetCenter: [0, '70%'], color: pct > 100 ? '#ef4444' : '#eef0f4', formatter: '{value}%' },
      title: { offsetCenter: [0, '90%'], fontSize: 12, color: '#8890a4' },
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

const isDark = computed(() => document.documentElement.getAttribute('data-theme') === 'dark');
const themeOverrides: GlobalThemeOverrides = {
  common: { bodyColor: 'transparent', cardColor: '#1e2130', modalColor: '#1e2130', tableColor: '#1e2130', borderColor: '#2a2d3e', textColorBase: '#eef0f4', textColor1: '#eef0f4', textColor2: '#c0c6d4', textColor3: '#8890a4', primaryColor: '#38bdf8', successColor: '#4ade80', warningColor: '#fbbf24', errorColor: '#f87171' },
  Card: { colorEmbedded: '#161822' }, Tag: { colorBordered: 'transparent' }, Progress: { railColor: '#2a2d3e' },
};
const lightOverrides: GlobalThemeOverrides = { common: { bodyColor: 'transparent' } };
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="isDark ? darkTheme : undefined" :theme-overrides="isDark ? themeOverrides : lightOverrides">
<div style="background:transparent;">

  <NSpin :show="loading">
  <div :style="{ opacity: show ? 1 : 0, transition: 'opacity 0.4s ease' }">

    <!-- Welcome -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px;">
      <div>
        <h1 style="margin:0;font-size:1.6rem;font-weight:700;">{{ greeting }}, {{ userName || 'there' }}</h1>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:0.95rem;">{{ todayStr }}</p>
      </div>
      <NSpace>
        <NButton type="primary" size="small" @click="$emit('navigate', 'projects')"><i class="ph ph-plus" style="margin-right:4px;" /> New Project</NButton>
        <NButton size="small" @click="$emit('navigate', 'roomstatus')"><i class="ph ph-clipboard-text" style="margin-right:4px;" /> Record Check</NButton>
        <NButton size="small" @click="$emit('navigate', 'fieldops')"><i class="ph ph-calendar" style="margin-right:4px;" /> Field Ops</NButton>
      </NSpace>
    </div>

    <!-- Stats Row -->
    <NGrid :x-gap="14" :y-gap="14" :cols="5" style="margin-bottom:28px;" v-if="portfolio">
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-folder" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#0ea5e9;"><NNumberAnimation :from="0" :to="portfolio.projects?.total || 0" :duration="800" /></div>
          <div style="font-size:0.85rem;color:#94a3b8;margin-top:2px;">Total Projects</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-check-circle" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#22c55e;"><NNumberAnimation :from="0" :to="portfolio.tasks?.completionRate || 0" :duration="1000" />%</div>
          <div style="font-size:0.85rem;color:#94a3b8;margin-top:2px;">Tasks Complete</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-target" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#38bdf8;"><NNumberAnimation :from="0" :to="portfolio.onTimeRate || 0" :duration="800" />%</div>
          <div style="font-size:0.85rem;color:#94a3b8;margin-top:2px;">On-Time Rate</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-warning" /></div>
          <div style="font-size:2.2rem;font-weight:800;color:#ef4444;"><NNumberAnimation :from="0" :to="portfolio.atRisk || 0" :duration="600" /></div>
          <div style="font-size:0.85rem;color:#94a3b8;margin-top:2px;">At Risk</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align:center;position:relative;overflow:hidden;">
          <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.06;"><i class="ph ph-monitor" /></div>
          <div style="font-size:2.2rem;font-weight:800;" :style="{ color: (compliance?.summary?.total||0) > 0 ? '#22c55e' : '#94a3b8' }"><NNumberAnimation :from="0" :to="compliance?.summary?.total || 0" :duration="600" /></div>
          <div style="font-size:0.85rem;color:#94a3b8;margin-top:2px;">Rooms Tracked</div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Charts Row -->
    <NGrid :x-gap="16" :y-gap="16" :cols="3" style="margin-bottom:28px;" v-if="portfolio">
      <!-- Project Status Donut -->
      <NGi>
        <NCard size="small" title="Project Status">
          <VChart :option="statusChartOption" style="height:220px;" autoresize />
          <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:0.8rem;">
            <span><span style="color:#22c55e;">&#9679;</span> Active {{ portfolio.projects?.active }}</span>
            <span><span style="color:#f59e0b;">&#9679;</span> Hold {{ portfolio.projects?.onHold }}</span>
            <span><span style="color:#64748b;">&#9679;</span> Done {{ portfolio.projects?.completed }}</span>
          </div>
        </NCard>
      </NGi>

      <!-- Budget Gauge -->
      <NGi>
        <NCard size="small" title="Budget Utilization">
          <VChart :option="budgetGaugeOption" style="height:220px;" autoresize />
          <div style="text-align:center;font-size:0.8rem;color:#94a3b8;margin-top:4px;">
            ${{ ((portfolio.budget?.totalActual || 0) / 1000).toFixed(0) }}K of ${{ ((portfolio.budget?.totalPlanned || 0) / 1000).toFixed(0) }}K
          </div>
        </NCard>
      </NGi>

      <!-- Room Health -->
      <NGi>
        <NCard size="small" title="Room Health" v-if="compliance">
          <div style="display:flex;justify-content:center;margin:16px 0;">
            <NProgress type="circle" :percentage="compliance.summary?.total > 0 ? Math.round(((compliance.summary?.total - (compliance.summary?.belowStandard || 0)) / compliance.summary?.total) * 100) : 0"
              :stroke-width="10" :width="140" :color="'#22c55e'" :rail-color="'#2a2d3e'">
              <div style="text-align:center;">
                <div style="font-size:1.8rem;font-weight:700;color:#22c55e;">{{ compliance.summary?.total - (compliance.summary?.belowStandard || 0) }}</div>
                <div style="font-size:0.75rem;color:#94a3b8;">of {{ compliance.summary?.total }} healthy</div>
              </div>
            </NProgress>
          </div>
          <div style="display:flex;justify-content:center;gap:16px;font-size:0.8rem;">
            <span><span style="color:#22c55e;">&#9679;</span> Standard {{ compliance.summary?.atStandard }}</span>
            <span><span style="color:#f59e0b;">&#9679;</span> Below {{ compliance.summary?.belowStandard }}</span>
            <span><span style="color:#94a3b8;">&#9679;</span> No Std {{ compliance.summary?.noStandard }}</span>
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
              style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-radius:6px;border-left:3px solid #ef4444;background:rgba(239,68,68,0.04);">
              <div>
                <div style="font-weight:500;">{{ p.name }}</div>
                <div style="font-size:0.78rem;color:#94a3b8;">{{ p.type }} - {{ p.progress }}% complete</div>
              </div>
              <NTag type="error" size="small" :bordered="false">{{ p.daysOverdue }}d overdue</NTag>
            </div>
          </div>
          <div v-else style="text-align:center;padding:20px;color:#94a3b8;">
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
              style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);">
              <i :class="'ph ' + (typeIcons[op.type]?.icon || 'ph-briefcase')"
                :style="{ fontSize:'1.2rem', color: typeIcons[op.type]?.color || '#64748b' }" />
              <div style="flex:1;">
                <div style="font-weight:500;font-size:0.9rem;">{{ op.taskName || op.title }}</div>
                <div style="font-size:0.78rem;color:#94a3b8;">{{ op.assignee || op.assignedTo }} - {{ op.location }}</div>
              </div>
              <div style="text-align:right;font-size:0.8rem;color:#94a3b8;">
                {{ new Date(op.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }}
              </div>
            </div>
          </div>
          <div v-else style="text-align:center;padding:20px;color:#94a3b8;">
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
