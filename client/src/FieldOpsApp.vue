<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NTabs, NTabPane, NCard, NGrid, NGi, NStatistic,
  NDataTable, NTag, NEmpty, NSpin, NSpace, NSelect, NInput,
  NButtonGroup, NButton, NCalendar,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from './composables/useTheme';
import { h } from 'vue';

const loading = ref(true);
const activeTab = ref('all');
const fieldOps = ref<any[]>([]);
const viewMode = ref(localStorage.getItem('apex_fieldops_view') || 'table');
const filterStatus = ref<string | null>(null);
const searchQuery = ref('');

const token = () => localStorage.getItem('apex_token');

async function load() {
  loading.value = true;
  try {
    const res = await fetch('/api/fieldops', { headers: { Authorization: 'Bearer ' + token() } });
    const data = await res.json();
    // API returns { scheduled: [], completed: [], pending: [] }
    fieldOps.value = [
      ...(data.scheduled || []),
      ...(data.completed || []),
      ...(data.pending || []),
      ...(data.fieldOps || data.fieldops || []),
    ];
  } finally { loading.value = false; }
}

const stats = computed(() => ({
  total: fieldOps.value.length,
  scheduled: fieldOps.value.filter(f => f.status === 'scheduled').length,
  inProgress: fieldOps.value.filter(f => f.status === 'in-progress').length,
  completed: fieldOps.value.filter(f => f.status === 'completed').length,
  pending: fieldOps.value.filter(f => f.status === 'pending').length,
}));

const filtered = computed(() => {
  let list = fieldOps.value;
  if (activeTab.value === 'today') {
    const today = new Date().toISOString().split('T')[0];
    list = list.filter(f => f.date?.startsWith(today) || f.scheduledDate?.startsWith(today) || f.scheduled_date?.startsWith(today));
  } else if (activeTab.value === 'pending') {
    list = list.filter(f => f.status === 'pending');
  } else if (activeTab.value === 'completed') {
    list = list.filter(f => f.status === 'completed');
  }
  if (filterStatus.value) list = list.filter(f => f.status === filterStatus.value);
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(f => (f.taskName || f.title || '').toLowerCase().includes(q) || (f.location || '').toLowerCase().includes(q) || (f.assignee || f.assignedTo || '').toLowerCase().includes(q));
  }
  return list;
});

function setViewMode(m: string) { viewMode.value = m; localStorage.setItem('apex_fieldops_view', m); }

const typeIcons: Record<string, { icon: string; color: string }> = {
  'Site Survey': { icon: 'ph-binoculars', color: '#0ea5e9' },
  'Installation': { icon: 'ph-hammer', color: '#8b5cf6' },
  'Commissioning': { icon: 'ph-check-square', color: '#22c55e' },
  'Service Call': { icon: 'ph-wrench', color: '#ef4444' },
  'Maintenance': { icon: 'ph-gear', color: '#f59e0b' },
};

const columns: DataTableColumns<any> = [
  {
    title: 'Work', key: 'taskName', sorter: 'default',
    render: (row) => {
      const ti = typeIcons[row.type || row.workType] || { icon: 'ph-briefcase', color: '#64748b' };
      return h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
        h('i', { class: 'ph ' + ti.icon, style: `font-size:1.2rem;color:${ti.color};` }),
        h('div', {}, [
          h('div', { style: 'font-weight:500;' }, row.taskName || row.title || '-'),
          h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, row.projectName || ''),
        ]),
      ]);
    },
  },
  { title: 'Type', key: 'type', width: 120, sorter: 'default', render: (row) => row.type || row.workType || '-' },
  { title: 'Location', key: 'location', width: 150, render: (row) => row.location || '-' },
  { title: 'Assignee', key: 'assignee', width: 130, render: (row) => row.assignee || row.assignedTo || '-' },
  {
    title: 'Date', key: 'date', width: 100, sorter: 'default',
    render: (row) => {
      const d = row.date || row.scheduled_date;
      return d ? new Date(d).toLocaleDateString() : '-';
    },
  },
  { title: 'Time', key: 'startTime', width: 100, render: (row) => [row.startTime || row.start_time, row.endTime || row.end_time].filter(Boolean).join(' - ') || '-' },
  {
    title: 'Status', key: 'status', width: 110, align: 'center', sorter: 'default',
    render: (row) => {
      const t: Record<string, string> = { scheduled: 'info', 'in-progress': 'warning', completed: 'success', pending: 'default', cancelled: 'error' };
      return h(NTag, { type: (t[row.status] || 'default') as any, size: 'small', bordered: false }, () => row.status || '-');
    },
  },
];

// Calendar helpers
const calendarValue = ref(Date.now());

function getOpsForDate(timestamp: number) {
  const d = new Date(timestamp);
  const dateStr = d.toISOString().split('T')[0];
  return fieldOps.value.filter(f => {
    const sd = f.date || f.date || f.scheduledDate;
    return sd && sd.startsWith(dateStr);
  });
}

onMounted(load);

const { naiveTheme, themeOverrides } = useTheme();
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">
  <h1 style="margin:0 0 16px 0;font-size:1.5rem;">Field Operations</h1>

  <!-- Stats -->
  <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:20px;">
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='all';filterStatus=null"><NStatistic label="Total" :value="stats.total" /></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='all';filterStatus='scheduled'"><NStatistic label="Scheduled" :value="stats.scheduled"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='all';filterStatus='in-progress'"><NStatistic label="In Progress" :value="stats.inProgress"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='pending'"><NStatistic label="Pending" :value="stats.pending"><template #prefix><span style="color:#94a3b8;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='completed'"><NStatistic label="Completed" :value="stats.completed"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
  </NGrid>

  <!-- Tabs -->
  <NTabs :value="activeTab" type="line" @update:value="(v: string) => { activeTab = v; filterStatus = null; }" style="margin-bottom:16px;">
    <NTabPane name="all" tab="All Work" />
    <NTabPane name="today" tab="Today" />
    <NTabPane name="calendar" tab="Calendar" />
    <NTabPane name="pending" :tab="'Pending (' + stats.pending + ')'" />
    <NTabPane name="completed" tab="Completed" />
  </NTabs>

  <!-- Filters (hidden on calendar tab) -->
  <NSpace v-if="activeTab !== 'calendar'" style="margin-bottom:16px;" align="center" :wrap="true">
    <NInput v-model:value="searchQuery" placeholder="Search..." clearable style="width:240px;" size="small">
      <template #prefix><i class="ph ph-magnifying-glass" /></template>
    </NInput>
    <NSelect v-model:value="filterStatus" :options="[{label:'Scheduled',value:'scheduled'},{label:'In Progress',value:'in-progress'},{label:'Pending',value:'pending'},{label:'Completed',value:'completed'}]" placeholder="Status" clearable style="width:140px;" size="small" />
    <span style="color:#94a3b8;font-size:0.85rem;margin-left:auto;">{{ filtered.length }} items</span>
    <NButtonGroup size="small">
      <NButton :type="viewMode==='table'?'primary':'default'" @click="setViewMode('table')"><i class="ph ph-list" /></NButton>
      <NButton :type="viewMode==='cards'?'primary':'default'" @click="setViewMode('cards')"><i class="ph ph-squares-four" /></NButton>
      <NButton :type="viewMode==='compact'?'primary':'default'" @click="setViewMode('compact')"><i class="ph ph-rows" /></NButton>
    </NButtonGroup>
  </NSpace>

  <NSpin :show="loading">
    <!-- TABLE -->
    <NDataTable v-if="viewMode==='table' && activeTab !== 'calendar'" :columns="columns" :data="filtered" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />

    <!-- CARDS -->
    <div v-else-if="viewMode==='cards' && activeTab !== 'calendar'" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
      <NCard v-for="f in filtered" :key="f.id" size="small" hoverable>
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <i :class="'ph ' + (typeIcons[f.type]?.icon || 'ph-briefcase')" :style="{ fontSize:'1.6rem', color: typeIcons[f.type]?.color || '#64748b' }" />
          <div style="flex:1;">
            <div style="font-weight:600;margin-bottom:2px;">{{ f.taskName || f.title }}</div>
            <div style="font-size:0.82rem;color:#94a3b8;margin-bottom:6px;">{{ f.projectName }}</div>
            <NSpace size="small" style="margin-bottom:6px;">
              <NTag :type="({scheduled:'info','in-progress':'warning',completed:'success',pending:'default'} as any)[f.status] || 'default'" size="small" :bordered="false">{{ f.status }}</NTag>
              <span style="font-size:0.8rem;color:#94a3b8;">{{ f.type }}</span>
            </NSpace>
            <div style="font-size:0.8rem;color:#94a3b8;">
              {{ f.assignee || '-' }} - {{ f.location || '-' }} - {{ (f.date || f.scheduledDate) ? new Date(f.date || f.scheduledDate).toLocaleDateString() : '-' }}
            </div>
          </div>
        </div>
      </NCard>
    </div>

    <!-- COMPACT -->
    <div v-else-if="activeTab !== 'calendar'" style="display:flex;flex-direction:column;gap:6px;">
      <div v-for="f in filtered" :key="f.id" style="display:flex;align-items:center;gap:14px;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
        <i :class="'ph ' + (typeIcons[f.type]?.icon || 'ph-briefcase')" :style="{ fontSize:'1.2rem', color: typeIcons[f.type]?.color || '#64748b' }" />
        <div style="flex:1;"><div style="font-weight:500;">{{ f.taskName || f.title }}</div><div style="font-size:0.8rem;color:#94a3b8;">{{ f.assignee }} - {{ f.location }}</div></div>
        <NTag :type="({scheduled:'info','in-progress':'warning',completed:'success',pending:'default'} as any)[f.status] || 'default'" size="small" :bordered="false" style="flex-shrink:0;">{{ f.status }}</NTag>
        <span style="width:80px;text-align:right;font-size:0.8rem;color:#94a3b8;">{{ (f.date || f.scheduledDate) ? new Date(f.date || f.scheduledDate).toLocaleDateString() : '' }}</span>
      </div>
    </div>

    <NEmpty v-if="!loading && filtered.length === 0 && activeTab !== 'calendar'" description="No field work found" />

    <!-- CALENDAR -->
    <template v-if="activeTab === 'calendar'">
      <NCalendar v-model:value="calendarValue" style="margin-top: -8px;">
        <template #default="{ year, month, date }">
          <div v-for="op in getOpsForDate(new Date(year, month - 1, date).getTime())" :key="op.id"
            :style="{
              fontSize: '0.72rem', padding: '2px 4px', marginBottom: '2px', borderRadius: '3px',
              background: op.status === 'completed' ? 'rgba(34,197,94,0.15)' : op.status === 'in-progress' ? 'rgba(245,158,11,0.15)' : 'rgba(14,165,233,0.15)',
              color: op.status === 'completed' ? '#22c55e' : op.status === 'in-progress' ? '#f59e0b' : '#0ea5e9',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'default',
            }"
            :title="(op.task_name || op.taskName) + ' - ' + (op.assignee || '') + ' - ' + (op.type || '')">
            <i :class="'ph ' + (typeIcons[op.type]?.icon || 'ph-briefcase')" style="margin-right: 2px;" />
            {{ op.task_name || op.taskName }}
          </div>
        </template>
      </NCalendar>
    </template>
  </NSpin>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
