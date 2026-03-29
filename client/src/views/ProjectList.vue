<script setup lang="ts">
import { h, onMounted, ref } from 'vue';
import {
  NDataTable, NInput, NSelect, NSpace, NTag, NProgress,
  NPagination, NSpin, NTabs, NTabPane, NCard, NGrid, NGi, NStatistic,
  NButtonGroup, NButton,
} from 'naive-ui';
import { useProjectStore } from '../stores/projects';
import type { ProjectSummary } from '../stores/projects';
import type { DataTableColumns } from 'naive-ui';

const store = useProjectStore();
const emit = defineEmits<{ (e: 'openProject', id: string): void }>();

const activeTab = ref('all');

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
  // Set filter based on tab
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
        active: 'success', planning: 'default', 'in-progress': 'info',
        'on-hold': 'warning', completed: 'success', cancelled: 'error',
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
    title: 'Budget',
    key: 'budget',
    width: 90,
    align: 'right',
    sorter: true,
    render: (row) => {
      const val = parseFloat(row.estimatedBudget || row.budget || '0');
      return val > 0 ? '$' + (val / 1000).toFixed(0) + 'K' : '-';
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
});
</script>

<template>
  <div>
    <h1 style="margin: 0 0 16px 0; font-size: 1.5rem;">Projects</h1>

    <!-- Stats Cards -->
    <NGrid :x-gap="12" :y-gap="12" :cols="5" style="margin-bottom: 20px;">
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
    <NTabs :value="activeTab" type="line" @update:value="handleTabChange" style="margin-bottom: 16px;">
      <NTabPane name="all" tab="All Projects" />
      <NTabPane name="active" tab="Active" />
      <NTabPane name="on-hold" tab="On Hold" />
      <NTabPane name="completed" tab="Completed" />
    </NTabs>

    <!-- Filters Row -->
    <NSpace style="margin-bottom: 16px;" align="center" :wrap="true">
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
      <div v-else-if="viewMode === 'cards'" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;">
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
                <NTag :type="({active:'success',planning:'default','on-hold':'warning',completed:'success',cancelled:'error'} as any)[row.status] || 'default'" size="small" :bordered="false">
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
                <span v-if="parseFloat(row.estimatedBudget || row.budget || '0') > 0">
                  ${{ (parseFloat(row.estimatedBudget || row.budget || '0') / 1000).toFixed(0) }}K
                </span>
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
      <div v-else-if="viewMode === 'compact'" style="display: flex; flex-direction: column; gap: 6px;">
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

          <NTag :type="({active:'success',planning:'default','on-hold':'warning',completed:'success',cancelled:'error'} as any)[row.status] || 'default'" size="small" :bordered="false" style="flex-shrink: 0;">
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
  </div>
</template>
