<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NTabs, NTabPane, NCard, NGrid, NGi, NStatistic,
  NDataTable, NTag, NEmpty, NSpin, NSpace, NSelect, NInput,
  NButtonGroup, NButton, NCalendar,
  NModal, NForm, NFormItem, NProgress, NRadioGroup, NRadioButton, createDiscreteApi,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from './composables/useTheme';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { h } from 'vue';

use([LineChart, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, CanvasRenderer]);

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
  {
    title: 'Assigned To', key: 'assignee', width: 160, sorter: 'default',
    render: (row) => {
      const name = row.assignee || row.assignedTo || '-';
      const isVendor = row.assignedType === 'vendor' || row.isVendor;
      return h('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
        h('i', { class: isVendor ? 'ph ph-buildings' : 'ph ph-user', style: `font-size:0.9rem;color:${isVendor ? '#8b5cf6' : '#64748b'};` }),
        h('div', {}, [
          h('div', { style: 'font-size:0.85rem;' }, isVendor ? (row.vendorName || name) : name),
          isVendor && row.vendorContact ? h('div', { style: 'font-size:0.72rem;color:#94a3b8;' }, row.vendorContact) : null,
        ].filter(Boolean)),
      ]);
    },
  },
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
  {
    title: '', key: 'actions', width: 160,
    render: (row) => h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'tiny', secondary: true, onClick: () => openDetail2(row) }, () => 'View'),
      h(NButton, { size: 'tiny', secondary: true, onClick: () => openEdit(row) }, () => 'Edit'),
      h(NButton, { size: 'tiny', type: 'error', ghost: true, onClick: () => deleteFieldOp(row.id) }, () => [h('i', { class: 'ph ph-trash' })]),
    ]),
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

const userOptions = ref<{ label: string; value: string }[]>([]);
const projectOptions = ref<{ label: string; value: string; raw: any }[]>([]);
const vendorOptions = ref<{ label: string; value: number; raw: any }[]>([]);
const roomOptions = ref<{ label: string; value: number; raw: any }[]>([]);

(async () => {
  try {
    const tk = token();
    if (!tk) return;
    const headers = { Authorization: 'Bearer ' + tk };
    const [usersRes, projRes, vendRes, roomRes] = await Promise.all([
      fetch('/api/users', { headers }),
      fetch('/api/projects?summary=true&limit=200', { headers }),
      fetch('/api/vendors', { headers }),
      fetch('/api/room-status', { headers }),
    ]);
    const [usersData, projData, vendData, roomData] = await Promise.all([
      usersRes.json(), projRes.json(), vendRes.json(), roomRes.json(),
    ]);
    userOptions.value = (usersData.users || []).filter((u: any) => u.email !== 'service@apex.local').map((u: any) => ({ label: u.name, value: u.name }));
    projectOptions.value = (projData.projects || []).filter((p: any) => p.status !== 'cancelled').map((p: any) => ({ label: `${p.name}${p.status ? ' (' + p.status + ')' : ''}`, value: String(p.id), raw: p }));
    vendorOptions.value = (vendData.vendors || vendData || []).map((v: any) => ({ label: v.name, value: v.id, raw: v }));
    roomOptions.value = (roomData.rooms || []).map((r: any) => ({ label: `${r.name}${r.location ? ' - ' + r.location : ''}`, value: r.id, raw: r }));
  } catch {}
})();

const { naiveTheme, themeOverrides } = useTheme();

const { message: msg } = createDiscreteApi(['message']);

// Create/Edit modal
const showModal = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const form = ref({
  taskName: '', projectName: '', projectId: '' as string, type: 'Installation', location: '',
  scheduledDate: '', startTime: '9:00 AM', endTime: '5:00 PM',
  assignee: '', notes: '', status: 'scheduled',
  serviceCategory: 'project', assignedType: 'internal' as string,
  vendorId: null as number | null, vendorContact: '', vendorName: '',
  roomId: null as number | null, priority: 'normal',
});

const vendorContactOptions = computed(() => {
  if (!form.value.vendorId) return [];
  const vendor = vendorOptions.value.find(v => v.value === form.value.vendorId);
  if (!vendor?.raw?.contacts) return [];
  const contacts = typeof vendor.raw.contacts === 'string' ? JSON.parse(vendor.raw.contacts) : vendor.raw.contacts;
  return (contacts || []).map((c: any) => ({ label: c.name || c.contactName || c.email || 'Contact', value: c.name || c.contactName || c.email || '' }));
});

const serviceCategoryOptions = [
  { label: 'Project Work', value: 'project' },
  { label: 'Room Check', value: 'room_check' },
  { label: 'Service Call', value: 'service_call' },
  { label: 'Maintenance', value: 'maintenance' },
];

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Urgent', value: 'urgent' },
];

function onProjectSelect(projectId: string) {
  form.value.projectId = projectId;
  const proj = projectOptions.value.find(p => p.value === projectId);
  if (proj?.raw) {
    form.value.projectName = proj.raw.name;
    if (proj.raw.siteLocation && !form.value.location) form.value.location = proj.raw.siteLocation;
  }
}

function onVendorSelect(vendorId: number) {
  form.value.vendorId = vendorId;
  form.value.vendorContact = '';
  const vendor = vendorOptions.value.find(v => v.value === vendorId);
  if (vendor) form.value.vendorName = vendor.raw.name;
}

function onRoomSelect(roomId: number) {
  form.value.roomId = roomId;
  const room = roomOptions.value.find(r => r.value === roomId);
  if (room?.raw) {
    if (!form.value.location) form.value.location = [room.raw.location, room.raw.floor, room.raw.name].filter(Boolean).join(' - ');
  }
}

// Report data
const report = ref<any>(null);
const reportLoading = ref(false);

// Detail modal with notes
const showDetail = ref(false);
const detailOp = ref<any>(null);
const detailNotes = ref<any[]>([]);
const detailLoading = ref(false);
const newNote = ref('');
const addingNote = ref(false);

async function openDetail2(op: any) {
  detailOp.value = op;
  showDetail.value = true;
  detailLoading.value = true;
  try {
    const dbId = op.dbId || String(op.id).replace('field_', '');
    const res = await fetch(`/api/fieldops/${dbId}/notes`, { headers: { Authorization: 'Bearer ' + token() } });
    const data = await res.json();
    detailNotes.value = data.notes || [];
  } catch { detailNotes.value = []; }
  finally { detailLoading.value = false; }
}

function getDbId(op: any) {
  return op.dbId || String(op.id).replace('field_', '');
}

async function addNote() {
  if (!newNote.value.trim() || !detailOp.value) return;
  addingNote.value = true;
  try {
    const dbId = getDbId(detailOp.value);
    await fetch(`/api/fieldops/${dbId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify({ content: newNote.value.trim() }),
    });
    newNote.value = '';
    const res = await fetch(`/api/fieldops/${dbId}/notes`, { headers: { Authorization: 'Bearer ' + token() } });
    const data = await res.json();
    detailNotes.value = data.notes || [];
    msg.success('Note added');
  } catch { msg.error('Failed to add note'); }
  finally { addingNote.value = false; }
}

async function deleteNote(noteId: number) {
  await fetch(`/api/fieldops/notes/${noteId}`, {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token() },
  });
  detailNotes.value = detailNotes.value.filter(n => n.id !== noteId);
}

function openCreate() {
  editingId.value = null;
  form.value = { taskName: '', projectName: '', projectId: '', type: 'Installation', location: '', scheduledDate: '', startTime: '9:00 AM', endTime: '5:00 PM', assignee: '', notes: '', status: 'scheduled', serviceCategory: 'project', assignedType: 'internal', vendorId: null, vendorContact: '', vendorName: '', roomId: null, priority: 'normal' };
  showModal.value = true;
}

function openEdit(op: any) {
  editingId.value = op.dbId || String(op.id).replace('field_', '');
  form.value = {
    taskName: op.taskName || op.task_name || '',
    projectName: op.projectName || op.project_name || '',
    projectId: op.projectId || op.project_id || '',
    type: op.type || op.workType || 'Installation',
    location: op.location || '',
    scheduledDate: (op.date || op.scheduledDate || op.scheduled_date || '').split('T')[0],
    startTime: op.startTime || op.start_time || '9:00 AM',
    endTime: op.endTime || op.end_time || '5:00 PM',
    assignee: op.assignee || op.assignedTo || '',
    notes: op.notes || '',
    status: op.status || 'scheduled',
    serviceCategory: op.serviceCategory || 'project',
    assignedType: op.assignedType || 'internal',
    vendorId: op.vendorId || null,
    vendorContact: op.vendorContact || '',
    vendorName: op.vendorName || '',
    roomId: op.roomId || null,
    priority: op.priority || 'normal',
  };
  showModal.value = true;
}

async function saveFieldOp() {
  if (!form.value.taskName.trim()) { msg.error('Task name required'); return; }
  saving.value = true;
  try {
    if (editingId.value) {
      await fetch('/api/fieldops/' + editingId.value, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(form.value),
      });
      msg.success('Field work updated');
    } else {
      await fetch('/api/fieldops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify(form.value),
      });
      msg.success('Field work created');
    }
    showModal.value = false;
    await load();
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { saving.value = false; }
}

async function deleteFieldOp(id: any) {
  const dbId = typeof id === 'string' && id.startsWith('field_') ? id.replace('field_', '') : id;
  await fetch('/api/fieldops/' + dbId, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token() },
  });
  msg.success('Deleted');
  await load();
}

async function loadReport() {
  reportLoading.value = true;
  try {
    const res = await fetch('/api/fieldops/report', { headers: { Authorization: 'Bearer ' + token() } });
    report.value = await res.json();
  } finally { reportLoading.value = false; }
}

const typeOptions = [
  { label: 'Site Survey', value: 'Site Survey' },
  { label: 'Installation', value: 'Installation' },
  { label: 'Commissioning', value: 'Commissioning' },
  { label: 'Service Call', value: 'Service Call' },
  { label: 'Maintenance', value: 'Maintenance' },
  { label: 'Training', value: 'Training' },
  { label: 'Decommission', value: 'Decommission' },
];

const statusEditOptions = [
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">
  <NSpace justify="space-between" align="center" style="margin-bottom:16px;">
    <h1 style="margin:0;font-size:1.5rem;">Field Operations</h1>
    <NButton type="primary" @click="openCreate"><i class="ph ph-plus" style="margin-right:4px;" /> Schedule Work</NButton>
  </NSpace>

  <!-- Stats -->
  <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:20px;">
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='all';filterStatus=null"><NStatistic label="Total" :value="stats.total" /></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='all';filterStatus='scheduled'"><NStatistic label="Scheduled" :value="stats.scheduled"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='all';filterStatus='in-progress'"><NStatistic label="In Progress" :value="stats.inProgress"><template #prefix><span style="color:#f59e0b;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='pending'"><NStatistic label="Pending" :value="stats.pending"><template #prefix><span style="color:#94a3b8;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;cursor:pointer;" @click="activeTab='completed'"><NStatistic label="Completed" :value="stats.completed"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
  </NGrid>

  <!-- Tabs -->
  <NTabs :value="activeTab" type="line" @update:value="(v: string) => { activeTab = v; filterStatus = null; if (v === 'reports' && !report) loadReport(); }" style="margin-bottom:16px;">
    <NTabPane name="all" tab="All Work" />
    <NTabPane name="today" tab="Today" />
    <NTabPane name="calendar" tab="Calendar" />
    <NTabPane name="pending" :tab="'Pending (' + stats.pending + ')'" />
    <NTabPane name="completed" tab="Completed" />
    <NTabPane name="reports" tab="Reports" />
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
      <NCard v-for="f in filtered" :key="f.id" size="small" hoverable style="cursor:pointer;" @click="openDetail2(f)">
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
        <template #action>
          <NSpace size="small">
            <NButton size="tiny" secondary @click.stop="openEdit(f)">Edit</NButton>
            <NButton size="tiny" type="error" ghost @click.stop="deleteFieldOp(f.id)"><i class="ph ph-trash" /></NButton>
          </NSpace>
        </template>
      </NCard>
    </div>

    <!-- COMPACT -->
    <div v-else-if="activeTab !== 'calendar'" style="display:flex;flex-direction:column;gap:6px;">
      <div v-for="f in filtered" :key="f.id" style="display:flex;align-items:center;gap:14px;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:background 0.15s;" @click="openDetail2(f)"
        @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.background = ''">
        <i :class="'ph ' + (typeIcons[f.type]?.icon || 'ph-briefcase')" :style="{ fontSize:'1.2rem', color: typeIcons[f.type]?.color || '#64748b' }" />
        <div style="flex:1;"><div style="font-weight:500;">{{ f.taskName || f.title }}</div><div style="font-size:0.8rem;color:#94a3b8;">{{ f.assignee }} - {{ f.location }}</div></div>
        <NTag :type="({scheduled:'info','in-progress':'warning',completed:'success',pending:'default'} as any)[f.status] || 'default'" size="small" :bordered="false" style="flex-shrink:0;">{{ f.status }}</NTag>
        <span style="width:80px;text-align:right;font-size:0.8rem;color:#94a3b8;">{{ (f.date || f.scheduledDate) ? new Date(f.date || f.scheduledDate).toLocaleDateString() : '' }}</span>
        <NSpace size="small" style="flex-shrink:0;" @click.stop>
          <NButton size="tiny" secondary @click="openEdit(f)">Edit</NButton>
          <NButton size="tiny" type="error" ghost @click="deleteFieldOp(f.id)"><i class="ph ph-trash" /></NButton>
        </NSpace>
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
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer',
            }"
            @click="openDetail2(op)"
            :title="(op.task_name || op.taskName) + ' - ' + (op.assignee || '') + ' - ' + (op.type || '')">
            <i :class="'ph ' + (typeIcons[op.type]?.icon || 'ph-briefcase')" style="margin-right: 2px;" />
            {{ op.task_name || op.taskName }}
          </div>
        </template>
      </NCalendar>
    </template>

    <!-- REPORTS -->
    <template v-if="activeTab === 'reports'">
      <NSpin :show="reportLoading">
        <div v-if="report">
          <!-- Flags/Alerts -->
          <div v-if="report.flags?.length" style="margin-bottom:16px;display:flex;flex-direction:column;gap:6px;">
            <div v-for="(flag, idx) in report.flags" :key="idx"
              :style="{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '6px', borderLeft: '3px solid ' + (flag.severity === 'critical' ? '#ef4444' : '#f59e0b'), background: flag.severity === 'critical' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)' }">
              <i :class="'ph ' + (flag.type === 'vendor_slipping' ? 'ph-trend-down' : flag.type === 'overloaded' ? 'ph-warning' : 'ph-clock')"
                :style="{ fontSize: '1.2rem', color: flag.severity === 'critical' ? '#ef4444' : '#f59e0b' }" />
              <span style="font-size:0.9rem;">{{ flag.message }}</span>
            </div>
          </div>

          <!-- Summary stats -->
          <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom:20px;">
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Completion Rate" :value="report.summary?.completionRate + '%'" /></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total Work Orders" :value="report.summary?.total" /></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Completed" :value="report.summary?.completed"><template #prefix><span style="color:#22c55e;">&#9679;</span></template></NStatistic></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Open" :value="(report.summary?.scheduled || 0) + (report.summary?.inProgress || 0) + (report.summary?.pending || 0)"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
            <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Cancelled" :value="report.summary?.cancelled || 0"><template #prefix><span style="color:#64748b;">&#9679;</span></template></NStatistic></NCard></NGi>
          </NGrid>

          <!-- Vendor Performance + Team Workload -->
          <NGrid :x-gap="16" :y-gap="16" :cols="2" style="margin-bottom:20px;">
            <NGi>
              <NCard size="small" title="Vendor Performance">
                <template #header-extra><NTag size="tiny" :bordered="false" type="info">Last 90 days</NTag></template>
                <div v-if="report.vendorPerformance?.length">
                  <div v-for="v in report.vendorPerformance" :key="v.vendorName"
                    style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div>
                      <div style="font-weight:500;display:flex;align-items:center;gap:6px;">
                        <i class="ph ph-buildings" style="color:#8b5cf6;" />
                        {{ v.vendorName }}
                      </div>
                      <div style="font-size:0.78rem;color:#94a3b8;">{{ v.recentCompleted }}/{{ v.recentTotal }} completed{{ v.recentAvgHours ? ' - avg ' + v.recentAvgHours + 'h' : '' }}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                      <NProgress type="circle" :percentage="v.recentRate" :stroke-width="6" :color="v.recentRate >= 80 ? '#22c55e' : v.recentRate >= 50 ? '#f59e0b' : '#ef4444'" style="width:36px;height:36px;" :show-indicator="false" />
                      <div style="text-align:right;min-width:40px;">
                        <div style="font-weight:700;font-size:0.9rem;">{{ v.recentRate }}%</div>
                        <div style="font-size:0.7rem;" :style="{ color: v.trend === 'up' ? '#22c55e' : '#ef4444' }">
                          <i :class="'ph ph-trend-' + v.trend" /> vs {{ v.priorRate }}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <NEmpty v-else description="No vendor data yet" size="small" />
              </NCard>
            </NGi>
            <NGi>
              <NCard size="small" title="Team Workload">
                <div v-if="report.teamWorkload?.length">
                  <div v-for="t in report.teamWorkload" :key="t.assignee"
                    style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div>
                      <div style="font-weight:500;display:flex;align-items:center;gap:6px;">
                        <i class="ph ph-user" style="color:#0ea5e9;" />
                        {{ t.assignee }}
                        <NTag v-if="t.openCount > 8" size="tiny" type="error" :bordered="false">Overloaded</NTag>
                      </div>
                      <div style="font-size:0.78rem;color:#94a3b8;">{{ t.completedThisMonth }} completed this month{{ t.avgResponseHours ? ' - avg ' + t.avgResponseHours + 'h' : '' }}</div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-weight:700;font-size:1rem;">{{ t.openCount }}</div>
                      <div style="font-size:0.72rem;color:#94a3b8;">open</div>
                      <div v-if="t.overdueCount > 0" style="font-size:0.72rem;color:#ef4444;">{{ t.overdueCount }} overdue</div>
                    </div>
                  </div>
                </div>
                <NEmpty v-else description="No team data yet" size="small" />
              </NCard>
            </NGi>
          </NGrid>

          <!-- By Type + By Category -->
          <NGrid :x-gap="16" :y-gap="16" :cols="2" style="margin-bottom:20px;">
            <NGi>
              <NCard size="small" title="By Type">
                <div v-for="t in report.byType" :key="t.type" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                  <span style="font-weight:500;">{{ t.type || 'Other' }}</span>
                  <NSpace align="center" :size="12">
                    <NProgress type="line" :percentage="t.count > 0 ? Math.round((t.completed / t.count) * 100) : 0" :height="8" :border-radius="4" :show-indicator="false" style="width:80px;" />
                    <span style="font-size:0.85rem;color:#94a3b8;">{{ t.completed }}/{{ t.count }}</span>
                  </NSpace>
                </div>
              </NCard>
            </NGi>
            <NGi>
              <NCard size="small" title="By Service Category">
                <div v-for="c in report.byCategory" :key="c.category" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                  <span style="font-weight:500;">{{ serviceCategoryOptions.find(o => o.value === c.category)?.label || c.category }}</span>
                  <NSpace align="center" :size="12">
                    <NProgress type="line" :percentage="c.count > 0 ? Math.round((c.completed / c.count) * 100) : 0" :height="8" :border-radius="4" :show-indicator="false" style="width:80px;" />
                    <span style="font-size:0.85rem;color:#94a3b8;">{{ c.completed }}/{{ c.count }}</span>
                  </NSpace>
                </div>
                <NEmpty v-if="!report.byCategory?.length" description="No data" size="small" />
              </NCard>
            </NGi>
          </NGrid>

          <!-- Monthly Trend Chart -->
          <NCard v-if="report.byMonth?.length" size="small" title="Monthly Trends" style="margin-bottom:20px;">
            <div style="height:260px;">
              <VChart :option="{
                tooltip: { trigger: 'axis' },
                grid: { left: 40, right: 20, top: 30, bottom: 30 },
                xAxis: { type: 'category', data: report.byMonth.slice().reverse().map((m: any) => m.month), axisLabel: { color: '#94a3b8', fontSize: 11 }, axisLine: { lineStyle: { color: '#2a2d3e' } } },
                yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 11 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
                series: [
                  { name: 'Total', type: 'bar', data: report.byMonth.slice().reverse().map((m: any) => m.count), itemStyle: { color: '#0ea5e9', borderRadius: [4,4,0,0] }, barWidth: '40%' },
                  { name: 'Completed', type: 'bar', data: report.byMonth.slice().reverse().map((m: any) => m.completed), itemStyle: { color: '#22c55e', borderRadius: [4,4,0,0] }, barWidth: '40%' },
                ],
                legend: { top: 0, textStyle: { color: '#94a3b8' } },
              }" style="height:260px;" autoresize />
            </div>
          </NCard>

          <!-- By Assignee (original, kept) -->
          <NCard size="small" title="By Technician">
            <div v-for="a in report.byAssignee" :key="a.assignee" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
              <span style="font-weight:500;">{{ a.assignee }}</span>
              <NSpace align="center" :size="12">
                <NProgress type="line" :percentage="a.count > 0 ? Math.round((a.completed / a.count) * 100) : 0" :height="8" :border-radius="4" :show-indicator="false" style="width:80px;" />
                <span style="font-size:0.85rem;color:#94a3b8;">{{ a.completed }}/{{ a.count }}</span>
              </NSpace>
            </div>
          </NCard>
        </div>
        <NEmpty v-else-if="!reportLoading" description="No report data" />
      </NSpin>
    </template>
  </NSpin>

  <!-- Create/Edit Modal -->
  <NModal v-model:show="showModal" preset="card" :title="editingId ? 'Edit Field Work' : 'Schedule Field Work'" style="width:620px;" :mask-closable="false">
    <NForm label-placement="top" size="small">
      <NFormItem label="Task Name" required><NInput v-model:value="form.taskName" placeholder="e.g., Install Room Bar Pro" /></NFormItem>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Service Category">
          <NSelect v-model:value="form.serviceCategory" :options="serviceCategoryOptions" />
        </NFormItem>
        <NFormItem label="Priority">
          <NSelect v-model:value="form.priority" :options="priorityOptions" />
        </NFormItem>
      </div>

      <!-- Project linking (for project work) -->
      <div v-if="form.serviceCategory === 'project'" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Link to Project">
          <NSelect v-model:value="form.projectId" :options="projectOptions" placeholder="Search projects..." filterable clearable @update:value="onProjectSelect" />
        </NFormItem>
        <NFormItem label="Type"><NSelect v-model:value="form.type" :options="typeOptions" /></NFormItem>
      </div>

      <!-- Room linking (for room checks / service calls) -->
      <div v-if="form.serviceCategory === 'room_check' || form.serviceCategory === 'service_call'" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Room">
          <NSelect v-model:value="form.roomId" :options="roomOptions" placeholder="Search rooms..." filterable clearable @update:value="onRoomSelect" />
        </NFormItem>
        <NFormItem label="Type"><NSelect v-model:value="form.type" :options="typeOptions" /></NFormItem>
      </div>

      <!-- Maintenance just gets type -->
      <div v-if="form.serviceCategory === 'maintenance'">
        <NFormItem label="Type"><NSelect v-model:value="form.type" :options="typeOptions" /></NFormItem>
      </div>

      <NFormItem label="Location"><NInput v-model:value="form.location" placeholder="Building / Room / Address" /></NFormItem>

      <!-- Assignment: Internal vs Vendor -->
      <NFormItem label="Performed By">
        <NRadioGroup v-model:value="form.assignedType" size="small">
          <NRadioButton value="internal"><i class="ph ph-user" style="margin-right:4px;" />Internal Team</NRadioButton>
          <NRadioButton value="vendor"><i class="ph ph-buildings" style="margin-right:4px;" />Vendor</NRadioButton>
        </NRadioGroup>
      </NFormItem>

      <div v-if="form.assignedType === 'internal'" style="display:grid;grid-template-columns:1fr;gap:12px;">
        <NFormItem label="Assignee">
          <NSelect v-model:value="form.assignee" :options="userOptions" placeholder="Select team member..." filterable clearable />
        </NFormItem>
      </div>

      <div v-if="form.assignedType === 'vendor'" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Vendor">
          <NSelect :value="form.vendorId" :options="vendorOptions" placeholder="Select vendor..." filterable clearable @update:value="onVendorSelect" />
        </NFormItem>
        <NFormItem label="Vendor Contact">
          <NSelect v-model:value="form.vendorContact" :options="vendorContactOptions" placeholder="Select contact..." filterable clearable :disabled="!form.vendorId" />
        </NFormItem>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        <NFormItem label="Date"><NInput v-model:value="form.scheduledDate" placeholder="YYYY-MM-DD" /></NFormItem>
        <NFormItem label="Start"><NInput v-model:value="form.startTime" placeholder="9:00 AM" /></NFormItem>
        <NFormItem label="End"><NInput v-model:value="form.endTime" placeholder="5:00 PM" /></NFormItem>
      </div>
      <div v-if="editingId" style="margin-bottom:12px;">
        <NFormItem label="Status"><NSelect v-model:value="form.status" :options="statusEditOptions" /></NFormItem>
      </div>
      <NFormItem label="Notes"><NInput v-model:value="form.notes" type="textarea" :rows="2" /></NFormItem>
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showModal = false">Cancel</NButton>
        <NButton type="primary" :loading="saving" :disabled="!form.taskName.trim()" @click="saveFieldOp">{{ editingId ? 'Save Changes' : 'Schedule' }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- Detail/Notes Modal -->
  <NModal v-model:show="showDetail" preset="card" :title="detailOp?.taskName || detailOp?.task_name || 'Field Work'" style="width:640px;">
    <template v-if="detailOp">
      <!-- Header info -->
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <NTag :type="({scheduled:'info','in-progress':'warning',completed:'success',pending:'default',cancelled:'error'} as any)[detailOp.status] || 'default'" size="medium">{{ detailOp.status }}</NTag>
        <NTag v-if="detailOp.type" size="medium" :bordered="false">{{ detailOp.type }}</NTag>
        <NTag v-if="detailOp.serviceCategory && detailOp.serviceCategory !== 'project'" size="medium" :bordered="false" type="info">{{ serviceCategoryOptions.find(c => c.value === detailOp.serviceCategory)?.label || detailOp.serviceCategory }}</NTag>
        <NTag v-if="detailOp.priority && detailOp.priority !== 'normal'" size="medium" :bordered="false" :type="detailOp.priority === 'urgent' ? 'error' : detailOp.priority === 'high' ? 'warning' : 'default'">{{ detailOp.priority }}</NTag>
        <NTag v-if="detailOp.isVendor || detailOp.assignedType === 'vendor'" size="medium" :bordered="false" style="background:rgba(139,92,246,0.1);color:#8b5cf6;">Vendor</NTag>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;font-size:0.9rem;margin-bottom:20px;">
        <div v-if="detailOp.projectName"><span style="color:#94a3b8;">Project:</span> {{ detailOp.projectName || detailOp.project_name }}</div>
        <div v-if="detailOp.location"><span style="color:#94a3b8;">Location:</span> {{ detailOp.location }}</div>
        <div v-if="detailOp.assignedType === 'vendor'">
          <span style="color:#94a3b8;">Vendor:</span> {{ detailOp.vendorName || '-' }}
          <span v-if="detailOp.vendorContact" style="color:#94a3b8;"> ({{ detailOp.vendorContact }})</span>
        </div>
        <div v-else-if="detailOp.assignee || detailOp.assignedTo"><span style="color:#94a3b8;">Assignee:</span> {{ detailOp.assignee || detailOp.assignedTo }}</div>
        <div><span style="color:#94a3b8;">Date:</span> {{ (detailOp.date || detailOp.scheduledDate || detailOp.scheduled_date) ? new Date(detailOp.date || detailOp.scheduledDate || detailOp.scheduled_date).toLocaleDateString() : '-' }}</div>
        <div v-if="detailOp.startTime || detailOp.start_time"><span style="color:#94a3b8;">Time:</span> {{ detailOp.startTime || detailOp.start_time }} - {{ detailOp.endTime || detailOp.end_time }}</div>
        <div v-if="detailOp.completedBy || detailOp.completed_by"><span style="color:#94a3b8;">Completed by:</span> {{ detailOp.completedBy || detailOp.completed_by }}</div>
        <div v-if="detailOp.responseTimeHours"><span style="color:#94a3b8;">Response time:</span> {{ detailOp.responseTimeHours }}h</div>
      </div>
      <div v-if="detailOp.notes" style="padding:10px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);margin-bottom:20px;white-space:pre-wrap;font-size:0.9rem;">{{ detailOp.notes }}</div>

      <!-- Notes log -->
      <div style="font-weight:600;font-size:0.95rem;margin-bottom:12px;"><i class="ph ph-note-pencil" style="margin-right:4px;" /> Activity Notes</div>

      <!-- Add note -->
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <NInput v-model:value="newNote" placeholder="Add a note about this visit..." size="small" style="flex:1;" @keyup.enter="addNote" />
        <NButton type="primary" size="small" :loading="addingNote" :disabled="!newNote.trim()" @click="addNote">Add</NButton>
      </div>

      <!-- Notes list -->
      <NSpin :show="detailLoading">
        <div v-for="note in detailNotes" :key="note.id"
          style="padding:10px 12px;border-radius:6px;border-left:3px solid #0ea5e9;margin-bottom:8px;background:rgba(14,165,233,0.04);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="flex:1;">
              <div style="white-space:pre-wrap;font-size:0.9rem;">{{ note.content }}</div>
              <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px;">
                {{ note.author }} - {{ new Date(note.createdAt).toLocaleString() }}
              </div>
            </div>
            <NButton text size="tiny" @click="deleteNote(note.id)" style="color:#94a3b8;flex-shrink:0;"><i class="ph ph-x" /></NButton>
          </div>
        </div>
        <NEmpty v-if="!detailLoading && detailNotes.length === 0" description="No notes yet. Add context about this visit." />
      </NSpin>
    </template>
    <template #action>
      <NSpace justify="end">
        <NButton @click="showDetail = false">Close</NButton>
        <NButton secondary @click="showDetail = false; openEdit(detailOp)">Edit</NButton>
      </NSpace>
    </template>
  </NModal>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
