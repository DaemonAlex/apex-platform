<script setup lang="ts">
import { h, computed, ref } from 'vue';
import {
  NDataTable, NTag, NEmpty, NSelect, NSpace, NButton,
  NModal, NForm, NFormItem, NInput, NInputNumber,
  useMessage,
} from 'naive-ui';
import { apiFetch } from '../../composables/useApi';
import { useTheme } from '../../composables/useTheme';
import type { DataTableColumns } from 'naive-ui';

const props = defineProps<{ projectId: string; tasks: any[] }>();
const emit = defineEmits<{ (e: 'refresh'): void }>();
const msg = useMessage();
const { colors } = useTheme();

const showTaskModal = ref(false);
const editingTaskId = ref<string | null>(null);
const taskForm = ref(emptyForm());

const userOptions = ref<{ label: string; value: string }[]>([]);
(async () => {
  try {
    const data = await apiFetch<{ users: any[] }>('/users');
    userOptions.value = (data.users || []).map((u: any) => ({ label: u.name, value: u.name }));
  } catch {}
})();

function emptyForm() {
  return { name: '', phase: 'phase_1', priority: 'medium', status: 'not-started', assignee: '', estimatedHours: null as number | null, startDate: '', endDate: '', description: '', prerequisites: [] as any[] };
}

const statusOptions = [
  { label: 'Not Started', value: 'not-started' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'On Hold', value: 'on-hold' },
];

const phaseOptions = [
  { label: 'Phase 1', value: 'phase_1' },
  { label: 'Phase 2', value: 'phase_2' },
  { label: 'Phase 3', value: 'phase_3' },
  { label: 'Phase 4', value: 'phase_4' },
];

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
];

async function updateTaskStatus(taskId: string, status: string) {
  const task = props.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    if (status === 'completed') task.completedDate = new Date().toISOString();
  }
  try {
    await apiFetch(`/projects/${props.projectId}/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, completedDate: status === 'completed' ? new Date().toISOString() : null }),
    });
    msg.success('Task updated');
    emit('refresh');
  } catch (e: any) {
    msg.error(e.message || 'Failed to update task');
    emit('refresh');
  }
}

function openAddTask() {
  editingTaskId.value = null;
  taskForm.value = emptyForm();
  showTaskModal.value = true;
}

function openEditTask(task: any) {
  editingTaskId.value = task.id;
  taskForm.value = {
    name: task.name || '',
    phase: task.phase || 'phase_1',
    priority: task.priority || 'medium',
    status: task.status || 'not-started',
    assignee: task.assignee || '',
    estimatedHours: task.estimatedHours || null,
    startDate: task.startDate ? new Date(task.startDate).toISOString().split('T')[0] : '',
    endDate: task.endDate ? new Date(task.endDate).toISOString().split('T')[0] : '',
    description: task.description || '',
    prerequisites: task.prerequisites || [],
  };
  showTaskModal.value = true;
}

const prereqTypeOptions = [
  { label: 'Executive Summary Approval', value: 'exec-summary' },
  { label: 'PO Approval', value: 'po-approval' },
  { label: 'Vendor Ships Device', value: 'vendor-ship' },
  { label: 'MAC Address Received', value: 'mac-received' },
  { label: 'Static IP Request', value: 'ip-request' },
  { label: 'Firewall Exception', value: 'firewall' },
  { label: 'CRE Approval', value: 'cre-approval' },
  { label: 'Manager Approval', value: 'manager-approval' },
  { label: 'Network Port Activation', value: 'network-port' },
  { label: 'Custom', value: 'custom' },
];

const prereqStatusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Waiting on External', value: 'waiting' },
  { label: 'Approved / Completed', value: 'completed' },
];

function addPrerequisite() {
  taskForm.value.prerequisites.push({
    type: 'custom', name: '', slaDays: null, cutoffDay: null,
    ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null,
  });
}

function removePrerequisite(i: number) {
  taskForm.value.prerequisites.splice(i, 1);
}

function addStandardChain() {
  const chain = [
    { type: 'exec-summary', name: 'Executive Summary Approval', slaDays: null, cutoffDay: null, ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null },
    { type: 'po-approval', name: 'PO Issued to Vendor', slaDays: null, cutoffDay: null, ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null },
    { type: 'vendor-ship', name: 'Vendor Ships Device', slaDays: null, cutoffDay: null, ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null },
    { type: 'mac-received', name: 'MAC Address Received', slaDays: null, cutoffDay: null, ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null },
    { type: 'ip-request', name: 'Static IP Reservation', slaDays: 2, cutoffDay: null, ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null },
    { type: 'firewall', name: 'Firewall Exception', slaDays: 7, cutoffDay: 'wednesday', ticketNumber: '', status: 'pending', submittedDate: null, completedDate: null },
  ];
  taskForm.value.prerequisites = [...taskForm.value.prerequisites, ...chain];
}

function prereqTypeName(type: string) {
  return prereqTypeOptions.find(o => o.value === type)?.label || type;
}

async function saveTask() {
  if (!taskForm.value.name.trim()) { msg.error('Task name is required'); return; }

  const data: any = {
    name: taskForm.value.name.trim(),
    phase: taskForm.value.phase,
    priority: taskForm.value.priority,
    status: taskForm.value.status,
    assignee: taskForm.value.assignee.trim() || '',
    estimatedHours: taskForm.value.estimatedHours,
    startDate: taskForm.value.startDate || null,
    endDate: taskForm.value.endDate || null,
    description: taskForm.value.description.trim() || '',
    prerequisites: taskForm.value.prerequisites,
  };

  try {
    if (editingTaskId.value) {
      // Edit existing
      await apiFetch(`/projects/${props.projectId}/tasks/${editingTaskId.value}`, {
        method: 'PUT', body: JSON.stringify(data),
      });
      msg.success('Task updated');
    } else {
      // Create new
      data.id = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      data.ragStatus = 'green';
      data.notesThread = [];
      data.subtasks = [];
      data.createdAt = new Date().toISOString();
      data.updatedAt = new Date().toISOString();
      data.completedDate = data.status === 'completed' ? new Date().toISOString() : null;

      await apiFetch(`/projects/${props.projectId}/tasks`, {
        method: 'POST', body: JSON.stringify(data),
      });
      msg.success('Task added');
    }
    showTaskModal.value = false;
    emit('refresh');
  } catch (e: any) {
    msg.error(e.message || 'Failed to save task');
  }
}

const columns: DataTableColumns<any> = [
  {
    title: 'Task', key: 'name', sorter: 'default',
    render: (row) => {
      const prereqs = row.prerequisites || [];
      const pending = prereqs.filter((p: any) => p.status !== 'completed');
      const children: any[] = [h('span', { style: 'font-weight: 500;' }, row.name)];
      if (pending.length > 0) {
        children.push(h(NTag, { type: 'warning', size: 'small', bordered: false, style: 'margin-left: 8px; font-size: 0.75rem;' }, () => `${pending.length} prereq${pending.length > 1 ? 's' : ''} pending`));
      }
      return h('span', { style: 'display: inline-flex; align-items: center;' }, children);
    },
  },
  {
    title: 'Phase', key: 'phase', width: 100, sorter: 'default',
    render: (row) => {
      const n: Record<string, string> = { phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3', phase_4: 'Phase 4' };
      return n[row.phase] || row.phase || '-';
    },
  },
  {
    title: 'Status', key: 'status', width: 140, align: 'center',
    render: (row) => h(NSelect, {
      value: row.status || 'not-started', options: statusOptions, size: 'tiny', style: 'width: 120px;',
      'onUpdate:value': (val: string) => updateTaskStatus(row.id, val),
    }),
  },
  { title: 'Assignee', key: 'assignee', width: 130, render: (row) => row.assignee || '-' },
  {
    title: 'Priority', key: 'priority', width: 80, align: 'center', sorter: 'default',
    render: (row) => {
      const c: Record<string, string> = { critical: 'error', high: 'warning', medium: 'info', low: 'default' };
      return h(NTag, { type: (c[row.priority] || 'default') as any, size: 'small', bordered: false }, () => row.priority || '-');
    },
  },
  {
    title: 'Due', key: 'endDate', width: 90,
    render: (row) => row.endDate ? new Date(row.endDate).toLocaleDateString() : '-',
  },
  {
    title: '', key: 'edit', width: 40, align: 'center',
    render: (row) => h(NButton, {
      text: true, size: 'tiny',
      onClick: (e: Event) => { e.stopPropagation(); openEditTask(row); },
    }, { default: () => h('i', { class: 'ph ph-pencil-simple' }) }),
  },
];

const sortedTasks = computed(() => {
  return [...props.tasks].sort((a, b) => {
    const phaseOrder = (a.phase || '').localeCompare(b.phase || '');
    if (phaseOrder !== 0) return phaseOrder;
    const statusOrder: Record<string, number> = { 'in-progress': 0, 'not-started': 1, 'on-hold': 2, completed: 3 };
    return (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
  });
});

const stats = computed(() => ({
  total: props.tasks.length,
  completed: props.tasks.filter(t => t.status === 'completed').length,
  inProgress: props.tasks.filter(t => t.status === 'in-progress').length,
  notStarted: props.tasks.filter(t => t.status === 'not-started' || !t.status).length,
}));
</script>

<template>
  <div style="padding-top: 16px;">
    <NSpace justify="space-between" align="center" style="margin-bottom: 12px;">
      <NSpace style="font-size: 0.85rem; color: #94a3b8;">
        <span>{{ stats.total }} tasks</span>
        <span style="color: #22c55e;">{{ stats.completed }} done</span>
        <span style="color: #0ea5e9;">{{ stats.inProgress }} in progress</span>
        <span>{{ stats.notStarted }} not started</span>
      </NSpace>
      <NButton type="primary" size="small" @click="openAddTask">
        <i class="ph ph-plus" style="margin-right: 4px;" /> Add Task
      </NButton>
    </NSpace>

    <NDataTable
      v-if="sortedTasks.length > 0"
      :columns="columns"
      :data="sortedTasks"
      :row-key="(row: any) => row.id"
      :bordered="false"
      size="small"
      striped
      :max-height="500"
      virtual-scroll
    />
    <NEmpty v-else description="No tasks yet. Click 'Add Task' to get started." />

    <!-- Add/Edit Task Modal -->
    <NModal v-model:show="showTaskModal" preset="card" :title="editingTaskId ? 'Edit Task' : 'Add Task'" style="width: 540px;">
      <NForm label-placement="top" size="small">
        <NFormItem label="Task Name" required>
          <NInput v-model:value="taskForm.name" placeholder="What needs to be done?" />
        </NFormItem>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Phase">
            <NSelect v-model:value="taskForm.phase" :options="phaseOptions" />
          </NFormItem>
          <NFormItem label="Priority">
            <NSelect v-model:value="taskForm.priority" :options="priorityOptions" />
          </NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Status">
            <NSelect v-model:value="taskForm.status" :options="statusOptions" />
          </NFormItem>
          <NFormItem label="Assignee">
            <NSelect v-model:value="taskForm.assignee" :options="userOptions" placeholder="Select assignee..." filterable clearable />
          </NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          <NFormItem label="Start Date">
            <input v-model="taskForm.startDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" />
          </NFormItem>
          <NFormItem label="End Date">
            <input v-model="taskForm.endDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" />
          </NFormItem>
          <NFormItem label="Est. Hours">
            <NInputNumber v-model:value="taskForm.estimatedHours" :min="0" :step="0.5" placeholder="0" style="width: 100%;" />
          </NFormItem>
        </div>
        <NFormItem label="Description">
          <NInput v-model:value="taskForm.description" type="textarea" :rows="2" placeholder="Additional details..." />
        </NFormItem>
        <!-- Prerequisites -->
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; font-size: 0.9rem;"><i class="ph ph-list-checks" style="margin-right: 4px;" /> Prerequisites</span>
            <NSpace :size="4">
              <NButton size="tiny" @click="addStandardChain">+ Standard Chain</NButton>
              <NButton size="tiny" @click="addPrerequisite">+ Custom</NButton>
            </NSpace>
          </div>
          <div v-for="(p, i) in taskForm.prerequisites" :key="i"
            style="display: grid; grid-template-columns: 1fr 100px 110px 24px; gap: 8px; align-items: center; margin-bottom: 6px; padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">
            <div>
              <div style="font-size: 0.85rem; font-weight: 500;">{{ prereqTypeName(p.type) }}</div>
              <NInput v-if="p.type === 'custom'" v-model:value="p.name" placeholder="Prerequisite name" size="small" style="margin-top: 4px;" />
            </div>
            <NSelect v-model:value="p.status" :options="prereqStatusOptions" size="small" />
            <NInput v-model:value="p.ticketNumber" placeholder="Ticket #" size="small" />
            <NButton text size="tiny" @click="removePrerequisite(i)" style="color: #94a3b8;"><i class="ph ph-x" /></NButton>
          </div>
          <div v-if="taskForm.prerequisites.length === 0" style="color: #94a3b8; font-size: 0.85rem; padding: 8px 0;">
            No prerequisites. Add the standard chain (Exec Summary > PO > Vendor > MAC > IP > Firewall) or add custom ones.
          </div>
        </div>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showTaskModal = false">Cancel</NButton>
          <NButton type="primary" @click="saveTask">
            <i class="ph" :class="editingTaskId ? 'ph-check' : 'ph-plus'" style="margin-right: 4px;" />
            {{ editingTaskId ? 'Save Changes' : 'Add Task' }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
