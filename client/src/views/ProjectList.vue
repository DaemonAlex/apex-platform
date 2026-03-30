<script setup lang="ts">
import { h, onMounted, ref } from 'vue';
import {
  NDataTable, NInput, NSelect, NSpace, NTag, NProgress,
  NPagination, NSpin, NTabs, NTabPane, NCard, NGrid, NGi, NStatistic,
  NButtonGroup, NButton, NModal, NForm, NFormItem,
  useMessage,
} from 'naive-ui';
import { useProjectStore } from '../stores/projects';
import type { ProjectSummary } from '../stores/projects';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{ userName?: string }>();
const store = useProjectStore();
const emit = defineEmits<{ (e: 'openProject', id: string): void }>();
const message = useMessage();
const { colors } = useTheme();

const activeTab = ref('mine');

// My Projects
const myProjects = ref<any[]>([]);
const myProjectsLoading = ref(false);

async function loadMyProjects() {
  myProjectsLoading.value = true;
  try {
    const res = await fetch('/api/reports/my-projects', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('apex_token') },
    });
    const data = await res.json();
    myProjects.value = data.projects || [];
  } catch { myProjects.value = []; }
  finally { myProjectsLoading.value = false; }
}

// Create project modal
const showCreateModal = ref(false);
const createLoading = ref(false);
const createForm = ref({
  id: '',
  name: '',
  type: 'new-build',
  status: 'planning',
  client: '',
  siteLocation: '',
  businessLine: '',
  description: '',
  estimatedBudget: null as number | null,
  startDate: '',
  endDate: '',
  projectManager: null as string | null,
  stakeholders: [] as { name: string; role: string; email: string }[],
});

function generateProjectId() {
  const prefix = createForm.value.type === 'breakfix' ? 'BF' : createForm.value.type === 'telephony' ? 'TEL' : 'PROJ';
  const num = String(Date.now()).slice(-6);
  createForm.value.id = `${prefix}-${num}`;
}

async function submitCreate() {
  if (!createForm.value.id || !createForm.value.name) return;
  createLoading.value = true;
  try {
    const payload: Record<string, any> = { ...createForm.value };
    if (!payload.startDate) delete payload.startDate;
    if (!payload.endDate) delete payload.endDate;
    if (payload.estimatedBudget === null) delete payload.estimatedBudget;
    await store.createProject(payload);
    message.success('Project created');
    showCreateModal.value = false;
    resetCreateForm();
    loadStats();
  } catch (e: any) {
    message.error(e.message || 'Failed to create project');
  } finally {
    createLoading.value = false;
  }
}

function resetCreateForm() {
  createForm.value = { id: '', name: '', type: 'new-build', status: 'planning', client: '', siteLocation: '', businessLine: '', description: '', estimatedBudget: null, startDate: '', endDate: '', projectManager: null as string | null, stakeholders: [] as { name: string; role: string; email: string }[] };
}

function openCreateModal() {
  resetCreateForm();
  generateProjectId();
  showCreateModal.value = true;
}

const statusOptions = [
  { label: 'Planning', value: 'planning' },
  { label: 'Active', value: 'active' },
  { label: 'On Hold', value: 'on-hold' },
  { label: 'Scheduled', value: 'scheduled' },
];

// Load users for PM dropdown
const pmOptions = ref<{ label: string; value: string }[]>([]);
const vendorOptions = ref<{ label: string; value: number }[]>([]);
(async () => {
  try {
    const [uRes, vRes] = await Promise.all([
      fetch('/api/users', { headers: { Authorization: 'Bearer ' + localStorage.getItem('apex_token') } }),
      fetch('/api/vendors', { headers: { Authorization: 'Bearer ' + localStorage.getItem('apex_token') } }),
    ]);
    const uData = await uRes.json();
    const vData = await vRes.json();
    pmOptions.value = (uData.users || []).filter((u: any) => u.email !== 'service@apex.local').map((u: any) => ({ label: u.name, value: u.name }));
    vendorOptions.value = (vData.vendors || []).map((v: any) => ({ label: v.name + ' (' + v.type + ')', value: v.id }));
  } catch {}
})();

const stakeholderRoles = [
  { label: 'Approver', value: 'approver' },
  { label: 'Sponsor', value: 'sponsor' },
  { label: 'End User', value: 'end-user' },
  { label: 'Site Contact', value: 'site-contact' },
  { label: 'Other', value: 'other' },
];

function addStakeholder() {
  createForm.value.stakeholders.push({ name: '', role: 'approver', email: '' });
}
function removeStakeholder(i: number) {
  createForm.value.stakeholders.splice(i, 1);
}

const businessLineOptions = [
  { label: 'Corporate AV', value: 'corporate-av' },
  { label: 'Education', value: 'education' },
  { label: 'Healthcare', value: 'healthcare' },
  { label: 'Government', value: 'government' },
  { label: 'Hospitality', value: 'hospitality' },
  { label: 'Retail', value: 'retail' },
  { label: 'Other', value: 'other' },
];

// Stats computed from full counts (we'll add a stats endpoint)
const stats = ref({ total: 0, active: 0, overdue: 0, completed: 0, onHold: 0 });

async function loadStats() {
  try {
    const data = await (await fetch('/api/reports/portfolio', {
      headers: { Authorization: `Bearer ${localStorage.getItem('apex_token')}` }
    })).json();
    stats.value = {
      total: data.projects?.total || 0,
      active: data.projects?.active || 0,
      completed: data.projects?.completed || 0,
      onHold: data.projects?.onHold || 0,
      overdue: data.atRisk || 0,
    };
  } catch (e) {}
}

const typeOptions = [
  { label: 'New Build', value: 'new-build' },
  { label: 'Upgrade', value: 'upgrade' },
  { label: 'BreakFix', value: 'breakfix' },
  { label: 'Refresh', value: 'refresh' },
  { label: 'Telephony', value: 'telephony' },
  { label: 'UC Deployment', value: 'uc-deployment' },
  { label: 'Custom', value: 'custom' },
];

function handleTabChange(tab: string) {
  activeTab.value = tab;
  if (tab === 'mine') return;
  if (tab === 'all') store.filters.status = null;
  else if (tab === 'active') store.filters.status = 'active';
  else if (tab === 'completed') store.filters.status = 'completed';
  else if (tab === 'on-hold') store.filters.status = 'on-hold';
  else store.filters.status = null;
  store.fetchProjects(1);
}

// Type icons
const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
  'new-build': { icon: 'ph-hammer', label: 'New Build', color: '#0ea5e9' },
  upgrade: { icon: 'ph-arrow-circle-up', label: 'Upgrade', color: '#8b5cf6' },
  breakfix: { icon: 'ph-wrench', label: 'BreakFix', color: '#ef4444' },
  refresh: { icon: 'ph-arrows-clockwise', label: 'Refresh', color: '#22c55e' },
  telephony: { icon: 'ph-phone', label: 'Telephony', color: '#f59e0b' },
  'uc-deployment': { icon: 'ph-cloud', label: 'UC Deploy', color: '#06b6d4' },
  custom: { icon: 'ph-cube', label: 'Custom', color: '#64748b' },
};

const columns: DataTableColumns<ProjectSummary> = [
  {
    title: 'Project',
    key: 'name',
    sorter: true,
    render: (row) => {
      const tc = typeConfig[row.type] || typeConfig.custom;
      return h('div', { style: 'display: flex; align-items: center; gap: 10px;' }, [
        h('i', { class: 'ph ' + tc.icon, style: `font-size: 1.3rem; color: ${tc.color}; flex-shrink: 0;` }),
        h('div', {}, [
          h('div', { style: 'font-weight: 500;' }, row.name),
          row.siteLocation ? h('div', { style: 'font-size: 0.78rem; color: #94a3b8; margin-top: 1px;' }, row.siteLocation) : null,
        ]),
      ]);
    },
  },
  {
    title: 'Type',
    key: 'type',
    width: 110,
    sorter: true,
    render: (row) => {
      const tc = typeConfig[row.type] || typeConfig.custom;
      return h('span', { style: 'font-size: 0.85rem;' }, tc.label);
    },
  },
  {
    title: 'Status',
    key: 'status',
    width: 110,
    sorter: true,
    render: (row) => {
      const types: Record<string, string> = {
        active: 'success', planning: 'info', scheduled: 'info', 'in-progress': 'info',
        'on-hold': 'warning', completed: 'success', cancelled: 'default',
      };
      const labels: Record<string, string> = {
        active: 'Active', planning: 'Planning', 'in-progress': 'In Progress',
        'on-hold': 'On Hold', completed: 'Completed', cancelled: 'Cancelled',
      };
      return h(NTag, { type: (types[row.status] || 'default') as any, size: 'small', bordered: false },
        () => labels[row.status] || row.status);
    },
  },
  {
    title: 'Progress',
    key: 'progress',
    width: 140,
    sorter: true,
    render: (row) => h('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
      h(NProgress, {
        type: 'line',
        percentage: row.progress || 0,
        height: 8,
        borderRadius: 4,
        showIndicator: false,
        status: (row.progress || 0) >= 100 ? 'success' : undefined,
        style: 'flex: 1;',
      }),
      h('span', { style: 'font-size: 0.8rem; color: #94a3b8; min-width: 30px; text-align: right;' }, (row.progress || 0) + '%'),
    ]),
  },
  {
    title: 'Due',
    key: 'dueDate',
    width: 100,
    sorter: true,
    render: (row) => {
      if (!row.dueDate) return h('span', { style: 'color: #64748b;' }, '-');
      const d = new Date(row.dueDate);
      const now = new Date();
      const overdue = d < now && row.status !== 'completed';
      const daysLeft = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return h('div', {}, [
        h('div', { style: overdue ? 'color: #ef4444; font-weight: 500; font-size: 0.85rem;' : 'font-size: 0.85rem;' }, d.toLocaleDateString()),
        overdue
          ? h('div', { style: 'font-size: 0.73rem; color: #ef4444;' }, Math.abs(daysLeft) + 'd overdue')
          : (daysLeft <= 7 && daysLeft >= 0)
            ? h('div', { style: 'font-size: 0.73rem; color: #f59e0b;' }, daysLeft + 'd left')
            : null,
      ]);
    },
  },
  {
    title: 'Priority',
    key: 'priority',
    width: 80,
    align: 'center',
    sorter: true,
    render: (row) => {
      const colors: Record<string, string> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };
      if (!row.priority) return '-';
      return h(NTag, { type: (colors[row.priority] || 'default') as any, size: 'small', bordered: false },
        () => row.priority.charAt(0).toUpperCase() + row.priority.slice(1));
    },
  },
];

// Track sort state for NDataTable visual indicators
const currentSortKey = ref<string | null>(null);
const currentSortOrder = ref<'ascend' | 'descend' | false>(false);

function handleSort(options: { columnKey: string; order: 'ascend' | 'descend' | false }) {
  currentSortKey.value = options.order ? options.columnKey : null;
  currentSortOrder.value = options.order;

  if (!options.order) {
    store.sort = { field: 'created', order: 'desc' };
  } else {
    const keyMap: Record<string, string> = { name: 'name', type: 'type', status: 'status', budget: 'budget', progress: 'progress', dueDate: 'dueDate', priority: 'priority' };
    store.sort = { field: keyMap[options.columnKey] || 'created', order: options.order === 'ascend' ? 'asc' : 'desc' };
  }
  store.fetchProjects(1);
}

let searchTimeout: ReturnType<typeof setTimeout>;
function handleSearch(val: string) {
  store.filters.search = val;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => store.fetchProjects(1), 300);
}

function handleFilterChange() {
  store.fetchProjects(1);
}

// View mode: table, cards, compact
const viewMode = ref(localStorage.getItem('apex_project_view') || 'table');
function setViewMode(mode: string) {
  viewMode.value = mode;
  localStorage.setItem('apex_project_view', mode);
}

// Action Queue
const actionQueue = ref<any[]>([]);
const actionSummary = ref<any>({});
const actionLoading = ref(false);
const showActionQueue = ref(true);

async function loadActionQueue() {
  actionLoading.value = true;
  try {
    const res = await fetch('/api/reports/action-queue', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('apex_token') },
    });
    const data = await res.json();
    actionQueue.value = data.items || [];
    actionSummary.value = data.summary || {};
  } catch { actionQueue.value = []; }
  finally { actionLoading.value = false; }
}

function getDueInfo(row: ProjectSummary) {
  if (!row.dueDate) return { text: '', urgency: '' };
  const d = new Date(row.dueDate);
  const now = new Date();
  const days = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (row.status === 'completed') return { text: d.toLocaleDateString(), urgency: '' };
  if (days < 0) return { text: Math.abs(days) + 'd overdue', urgency: 'overdue' };
  if (days <= 7) return { text: days + 'd left', urgency: 'soon' };
  return { text: d.toLocaleDateString(), urgency: '' };
}

onMounted(() => {
  store.fetchProjects(1);
  loadStats();
  loadActionQueue();
  loadMyProjects();
});
</script>

<template>
  <div>
    <NSpace justify="space-between" align="center" style="margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 1.5rem;">Projects</h1>
      <NButton type="primary" @click="openCreateModal"><i class="ph ph-plus" style="margin-right: 4px;" /> New Project</NButton>
    </NSpace>

    <!-- Action Queue -->
    <NCard v-if="actionQueue.length > 0" size="small" style="margin-bottom: 28px; border-left: 3px solid #ef4444;">
      <template #header>
        <NSpace align="center" :size="12">
          <i class="ph ph-warning-circle" style="color: #ef4444; font-size: 1.1rem;" />
          <span style="font-weight: 600;">Needs Attention</span>
          <NTag v-if="actionSummary.overdue" type="error" size="small" :bordered="false">{{ actionSummary.overdue }} overdue</NTag>
          <NTag v-if="actionSummary.critical" type="warning" size="small" :bordered="false">{{ actionSummary.critical }} due now</NTag>
          <NTag v-if="actionSummary.soon" size="small" :bordered="false">{{ actionSummary.soon }} this week</NTag>
        </NSpace>
      </template>
      <template #header-extra>
        <NButton text size="tiny" @click="showActionQueue = !showActionQueue" style="color: #94a3b8;">
          {{ showActionQueue ? 'Hide' : 'Show' }}
        </NButton>
      </template>
      <div v-if="showActionQueue" style="max-height: 280px; overflow-y: auto;">
        <div v-for="item in actionQueue.slice(0, 15)" :key="item.taskId"
          style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 6px; cursor: pointer; transition: background 0.15s; margin-bottom: 4px;"
          :style="{
            borderLeft: '3px solid ' + (item.urgency === 'overdue' ? '#ef4444' : item.urgency === 'critical' ? '#f59e0b' : '#0ea5e9'),
            background: item.urgency === 'overdue' ? 'rgba(239,68,68,0.04)' : 'transparent',
          }"
          @click="emit('openProject', item.projectId)"
          @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.background = item.urgency === 'overdue' ? 'rgba(239,68,68,0.04)' : 'transparent'">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 600; font-size: 0.85rem; color: #0ea5e9;">{{ item.projectName }}</span>
              <span style="color: #64748b;">-</span>
              <span style="font-weight: 500; font-size: 0.9rem;">{{ item.taskName }}</span>
            </div>
            <div style="font-size: 0.78rem; color: #94a3b8; margin-top: 2px;">
              {{ item.assignee || 'Unassigned' }}{{ item.siteLocation ? ' - ' + item.siteLocation : '' }}
            </div>
          </div>
          <NTag v-if="item.isBlocked" size="small" type="error" :bordered="false" style="flex-shrink: 0;">
            <i class="ph ph-lock" style="margin-right: 2px;" /> Blocked
          </NTag>
          <div style="text-align: right; flex-shrink: 0; min-width: 80px;">
            <div :style="{
              fontSize: '0.85rem', fontWeight: 600,
              color: item.urgency === 'overdue' ? '#ef4444' : item.urgency === 'critical' ? '#f59e0b' : '#0ea5e9',
            }">
              {{ item.daysUntil < 0 ? Math.abs(item.daysUntil) + 'd overdue' : item.daysUntil === 0 ? 'Due today' : item.daysUntil + 'd left' }}
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8;">{{ new Date(item.dueDate).toLocaleDateString() }}</div>
          </div>
        </div>
      </div>
    </NCard>

    <!-- Stats Cards -->
    <NGrid :x-gap="14" :y-gap="14" :cols="5" style="margin-bottom: 28px;">
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="handleTabChange('all')">
          <NStatistic label="Total" :value="stats.total" />
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="handleTabChange('active')">
          <NStatistic label="Active" :value="stats.active">
            <template #prefix><span style="color: #22c55e;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;">
          <NStatistic label="At Risk" :value="stats.overdue">
            <template #prefix><span style="color: #ef4444;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="handleTabChange('on-hold')">
          <NStatistic label="On Hold" :value="stats.onHold">
            <template #prefix><span style="color: #f59e0b;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center; cursor: pointer;" @click="handleTabChange('completed')">
          <NStatistic label="Completed" :value="stats.completed">
            <template #prefix><span style="color: #64748b;">&#9679;</span></template>
          </NStatistic>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Tabs -->
    <NTabs :value="activeTab" type="line" @update:value="handleTabChange" style="margin-bottom: 20px;">
      <NTabPane name="mine" :tab="'My Projects (' + myProjects.length + ')'" />
      <NTabPane name="all" tab="All Projects" />
      <NTabPane name="active" tab="Active" />
      <NTabPane name="on-hold" tab="On Hold" />
      <NTabPane name="completed" tab="Completed" />
    </NTabs>

    <!-- My Projects Tab -->
    <template v-if="activeTab === 'mine'">
      <NSpin :show="myProjectsLoading">
        <div v-if="myProjects.length" style="display: flex; flex-direction: column; gap: 12px;">
          <NCard v-for="p in myProjects" :key="p.id" size="small" hoverable
            style="cursor: pointer; transition: transform 0.1s;"
            :style="{ borderLeft: p.myOverdueCount > 0 ? '3px solid #ef4444' : '3px solid #0ea5e9' }"
            @click="emit('openProject', p.id)">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                  <span style="font-weight: 600; font-size: 1.05rem;">{{ p.name }}</span>
                  <NTag :type="({active:'success',planning:'info',scheduled:'info','on-hold':'warning'} as any)[p.status] || 'default'" size="small" :bordered="false">{{ p.status }}</NTag>
                  <NTag v-if="p.isPM" size="small" type="info" :bordered="false">PM</NTag>
                </div>
                <div style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 8px;">
                  {{ p.siteLocation || p.type || '' }}
                </div>
                <div style="display: flex; align-items: center; gap: 16px; font-size: 0.85rem;">
                  <span v-if="p.myTaskCount > 0"><strong>{{ p.myTaskCount }}</strong> tasks assigned to you</span>
                  <span v-else-if="p.isPM" style="color: #94a3b8;">Project Manager</span>
                  <span v-if="p.myOverdueCount > 0" style="color: #ef4444; font-weight: 500;">{{ p.myOverdueCount }} overdue</span>
                  <span v-if="p.nextTaskName" style="color: #94a3b8;">
                    Next: {{ p.nextTaskName }}{{ p.nextTaskDue ? ' (due ' + new Date(p.nextTaskDue).toLocaleDateString() + ')' : '' }}
                  </span>
                </div>
              </div>
              <div style="text-align: center; flex-shrink: 0; width: 60px;">
                <NProgress type="circle" :percentage="p.progress || 0" :width="48" :stroke-width="4" :show-indicator="false" />
                <div style="font-size: 0.75rem; color: #94a3b8; margin-top: 4px;">{{ p.progress || 0 }}%</div>
              </div>
            </div>
          </NCard>
        </div>
        <NEmpty v-else-if="!myProjectsLoading" description="No projects assigned to you" />
      </NSpin>
    </template>

    <!-- Filters Row (hidden on My Projects tab) -->
    <template v-if="activeTab !== 'mine'">
    <NSpace style="margin-bottom: 20px;" align="center" :wrap="true">
      <NInput
        :value="store.filters.search"
        @update:value="handleSearch"
        placeholder="Search projects..."
        clearable
        style="width: 280px;"
        size="small"
      >
        <template #prefix><i class="ph ph-magnifying-glass" /></template>
      </NInput>
      <NSelect
        v-model:value="store.filters.type"
        :options="typeOptions"
        placeholder="Type"
        clearable
        style="width: 150px;"
        size="small"
        @update:value="handleFilterChange"
      />
      <span style="color: #94a3b8; font-size: 0.85rem; margin-left: auto;">
        {{ store.pagination.total }} project{{ store.pagination.total !== 1 ? 's' : '' }}
      </span>
      <!-- View toggle -->
      <NButtonGroup size="small">
        <NButton :type="viewMode === 'table' ? 'primary' : 'default'" @click="setViewMode('table')" title="Table view">
          <i class="ph ph-list" />
        </NButton>
        <NButton :type="viewMode === 'cards' ? 'primary' : 'default'" @click="setViewMode('cards')" title="Card view">
          <i class="ph ph-squares-four" />
        </NButton>
        <NButton :type="viewMode === 'compact' ? 'primary' : 'default'" @click="setViewMode('compact')" title="Compact view">
          <i class="ph ph-rows" />
        </NButton>
      </NButtonGroup>
    </NSpace>

    <NSpin :show="store.loading">

      <!-- TABLE VIEW -->
      <NDataTable
        v-if="viewMode === 'table'"
        :columns="columns"
        :data="store.projects"
        :row-key="(row: ProjectSummary) => row.id"
        :row-props="(row: ProjectSummary) => ({
          style: 'cursor: pointer;',
          onClick: () => emit('openProject', row.id)
        })"
        :bordered="false"
        size="small"
        striped
        @update:sorter="handleSort"
      />

      <!-- CARD VIEW -->
      <div v-else-if="viewMode === 'cards'" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
        <NCard
          v-for="row in store.projects" :key="row.id"
          size="small"
          hoverable
          style="cursor: pointer;"
          @click="emit('openProject', row.id)"
        >
          <div style="display: flex; align-items: flex-start; gap: 14px;">
            <i :class="'ph ' + (typeConfig[row.type]?.icon || 'ph-cube')"
              :style="{ fontSize: '2rem', color: typeConfig[row.type]?.color || '#64748b', flexShrink: 0, marginTop: '2px' }" />
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 4px; line-height: 1.3;">{{ row.name }}</div>
              <div v-if="row.siteLocation" style="font-size: 0.82rem; color: #94a3b8; margin-bottom: 8px;">{{ row.siteLocation }}</div>

              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
                <NTag :type="({active:'success',planning:'info',scheduled:'info','on-hold':'warning',completed:'success',cancelled:'default'} as any)[row.status] || 'default'" size="small" :bordered="false">
                  {{ ({active:'Active',planning:'Planning','on-hold':'On Hold',completed:'Completed',cancelled:'Cancelled'} as any)[row.status] || row.status }}
                </NTag>
                <NTag v-if="row.priority" :type="({critical:'error',high:'warning',medium:'info',low:'default'} as any)[row.priority] || 'default'" size="small" :bordered="false">
                  {{ row.priority.charAt(0).toUpperCase() + row.priority.slice(1) }}
                </NTag>
                <span style="font-size: 0.8rem; color: #94a3b8;">{{ typeConfig[row.type]?.label || row.type }}</span>
              </div>

              <NProgress type="line" :percentage="row.progress || 0" :height="10" :border-radius="5" :show-indicator="false"
                :status="(row.progress || 0) >= 100 ? 'success' : undefined"
                style="margin-bottom: 8px;" />

              <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: #94a3b8;">
                <span>{{ (row.progress || 0) }}% complete</span>
                <span v-if="getDueInfo(row).text"
                  :style="{ color: getDueInfo(row).urgency === 'overdue' ? '#ef4444' : getDueInfo(row).urgency === 'soon' ? '#f59e0b' : '#94a3b8', fontWeight: getDueInfo(row).urgency ? '500' : 'normal' }">
                  {{ getDueInfo(row).text }}
                </span>
              </div>
            </div>
          </div>
        </NCard>
      </div>

      <!-- COMPACT VIEW -->
      <div v-else-if="viewMode === 'compact'" style="display: flex; flex-direction: column; gap: 10px;">
        <div
          v-for="row in store.projects" :key="row.id"
          @click="emit('openProject', row.id)"
          style="display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 8px; cursor: pointer; transition: background 0.15s;"
          :style="{ border: '1px solid ' + (typeConfig[row.type]?.color || '#e2e8f0') + '30' }"
          @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'"
          @mouseleave="($event.currentTarget as HTMLElement).style.background = 'transparent'"
        >
          <i :class="'ph ' + (typeConfig[row.type]?.icon || 'ph-cube')"
            :style="{ fontSize: '1.4rem', color: typeConfig[row.type]?.color || '#64748b', flexShrink: 0 }" />

          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; font-size: 1rem;">{{ row.name }}</div>
            <div style="font-size: 0.8rem; color: #94a3b8;">
              {{ row.siteLocation || '' }}
              {{ row.siteLocation && (typeConfig[row.type]?.label) ? ' - ' : '' }}
              {{ typeConfig[row.type]?.label || '' }}
            </div>
          </div>

          <NTag :type="({active:'success',planning:'info',scheduled:'info','on-hold':'warning',completed:'success',cancelled:'default'} as any)[row.status] || 'default'" size="small" :bordered="false" style="flex-shrink: 0;">
            {{ ({active:'Active',planning:'Planning','on-hold':'On Hold',completed:'Completed',cancelled:'Cancelled'} as any)[row.status] || row.status }}
          </NTag>

          <div style="width: 80px; flex-shrink: 0;">
            <NProgress type="line" :percentage="row.progress || 0" :height="6" :border-radius="3" :show-indicator="false"
              :status="(row.progress || 0) >= 100 ? 'success' : undefined" />
            <div style="font-size: 0.7rem; color: #94a3b8; text-align: center; margin-top: 2px;">{{ row.progress || 0 }}%</div>
          </div>

          <div v-if="getDueInfo(row).text" style="width: 80px; text-align: right; flex-shrink: 0; font-size: 0.8rem;"
            :style="{ color: getDueInfo(row).urgency === 'overdue' ? '#ef4444' : getDueInfo(row).urgency === 'soon' ? '#f59e0b' : '#94a3b8', fontWeight: getDueInfo(row).urgency ? '500' : 'normal' }">
            {{ getDueInfo(row).text }}
          </div>
        </div>
      </div>

    </NSpin>

    <!-- Pagination -->
    <div v-if="store.pagination.totalPages > 1" style="display: flex; justify-content: center; margin-top: 16px;">
      <NPagination
        :page="store.pagination.page"
        :page-count="store.pagination.totalPages"
        :page-size="store.pagination.limit"
        @update:page="(p: number) => store.fetchProjects(p)"
      />
    </div>

    </template>

    <!-- Create Project Modal -->
    <NModal v-model:show="showCreateModal" preset="card" title="New Project" style="width: 660px;" :mask-closable="false">
      <NForm label-placement="top" size="small">
        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px;">
          <NFormItem label="Project ID" required>
            <NInput v-model:value="createForm.id" placeholder="PROJ-123456" />
          </NFormItem>
          <NFormItem label="Project Name" required>
            <NInput v-model:value="createForm.name" placeholder="Enter project name" />
          </NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          <NFormItem label="Type">
            <NSelect v-model:value="createForm.type" :options="typeOptions" @update:value="generateProjectId" />
          </NFormItem>
          <NFormItem label="Status">
            <NSelect v-model:value="createForm.status" :options="statusOptions" />
          </NFormItem>
          <NFormItem label="Business Line">
            <NSelect v-model:value="createForm.businessLine" :options="businessLineOptions" clearable placeholder="Select..." />
          </NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Client">
            <NInput v-model:value="createForm.client" placeholder="Client name" />
          </NFormItem>
          <NFormItem label="Site Location">
            <NInput v-model:value="createForm.siteLocation" placeholder="e.g., 123 Main St, Floor 3" />
          </NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Start Date">
            <input v-model="createForm.startDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" />
          </NFormItem>
          <NFormItem label="End Date">
            <input v-model="createForm.endDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" />
          </NFormItem>
        </div>
        <!-- Project Manager -->
        <NFormItem label="Project Manager" required>
          <NSelect v-model:value="createForm.projectManager" :options="pmOptions" placeholder="Select project manager..." filterable clearable />
        </NFormItem>

        <NFormItem label="Description">
          <NInput v-model:value="createForm.description" type="textarea" :rows="2" placeholder="Brief project description..." />
        </NFormItem>

        <!-- Stakeholders -->
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; font-size: 0.9rem;"><i class="ph ph-users" style="margin-right: 4px;" /> Stakeholders</span>
            <NButton size="tiny" @click="addStakeholder"><i class="ph ph-plus" style="margin-right: 4px;" /> Add</NButton>
          </div>
          <div v-for="(s, i) in createForm.stakeholders" :key="i"
            style="display: grid; grid-template-columns: 1fr 120px 1fr 24px; gap: 8px; align-items: center; margin-bottom: 6px;">
            <NInput v-model:value="s.name" placeholder="Name" size="small" />
            <NSelect v-model:value="s.role" :options="stakeholderRoles" size="small" />
            <NInput v-model:value="s.email" placeholder="Email" size="small" />
            <NButton text size="tiny" @click="removeStakeholder(i)" style="color: #94a3b8;"><i class="ph ph-x" /></NButton>
          </div>
          <div v-if="createForm.stakeholders.length === 0" style="color: #94a3b8; font-size: 0.85rem; padding: 4px 0;">
            Add approvers, sponsors, and site contacts
          </div>
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showCreateModal = false">Cancel</NButton>
          <NButton type="primary" :loading="createLoading" :disabled="!createForm.id || !createForm.name" @click="submitCreate">Create Project</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
