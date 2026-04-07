<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  NCard, NGrid, NGi, NStatistic, NDescriptions, NDescriptionsItem, NProgress, NTag,
  NButton, NSpace, NModal, NForm, NFormItem, NInput, NSelect, createDiscreteApi,
} from 'naive-ui';
import { apiFetch } from '../../composables/useApi';
import { useTheme } from '../../composables/useTheme';

const props = defineProps<{ project: any }>();
const emit = defineEmits<{ (e: 'refresh'): void }>();
const { message: msg } = createDiscreteApi(['message']);
const { colors } = useTheme();

const tasks = computed(() => props.project.tasks || []);
const tasksDone = computed(() => tasks.value.filter((t: any) => t.status === 'completed').length);
const tasksActive = computed(() => tasks.value.filter((t: any) => t.status === 'in-progress').length);
const daysUntilDue = computed(() => {
  const d = props.project.dueDate || props.project.duedate || props.project.endDate || props.project.enddate;
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
});

function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString() : '-'; }

// Edit project
const showEdit = ref(false);
const saving = ref(false);
const editForm = ref<any>({});

const pmOptions = ref<{ label: string; value: string }[]>([]);
(async () => {
  try {
    const data = await apiFetch<{ users: any[] }>('/users');
    pmOptions.value = (data.users || []).map((u: any) => ({ label: u.name, value: u.name }));
  } catch {}
})();

const statusOptions = [
  { label: 'Planning', value: 'planning' }, { label: 'Active', value: 'active' },
  { label: 'Scheduled', value: 'scheduled' }, { label: 'In Progress', value: 'in-progress' },
  { label: 'On Hold', value: 'on-hold' }, { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];
const priorityOptions = [
  { label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' }, { label: 'Critical', value: 'critical' },
];
const stakeholderRoles = [
  { label: 'Approver', value: 'approver' }, { label: 'Sponsor', value: 'sponsor' },
  { label: 'End User', value: 'end-user' }, { label: 'Site Contact', value: 'site-contact' },
  { label: 'Other', value: 'other' },
];

function openEdit() {
  const p = props.project;
  editForm.value = {
    name: p.name || '', status: p.status || '', type: p.type || '', priority: p.priority || '',
    client: p.client || '', siteLocation: p.siteLocation || p.sitelocation || '',
    businessLine: p.businessLine || p.businessline || '', projectManager: p.projectManager || p.project_manager || null,
    requestorInfo: p.requestorInfo || p.requestorinfo || '',
    startDate: (p.startDate || p.startdate || '').split('T')[0] || '',
    dueDate: (p.dueDate || p.duedate || p.endDate || p.enddate || '').split('T')[0] || '',
    description: p.description || '',
    stakeholders: [...(p.stakeholders || [])],
  };
  showEdit.value = true;
}

function addStakeholder() {
  editForm.value.stakeholders.push({ name: '', role: 'approver', email: '' });
}
function removeStakeholder(i: number | string) {
  editForm.value.stakeholders.splice(Number(i), 1);
}

async function saveEdit() {
  saving.value = true;
  try {
    const payload: Record<string, any> = { ...editForm.value };
    if (payload.startDate) payload.startDate = new Date(payload.startDate).toISOString();
    else delete payload.startDate;
    if (payload.dueDate) { payload.endDate = new Date(payload.dueDate).toISOString(); payload.dueDate = payload.endDate; }
    else { delete payload.dueDate; }
    await apiFetch(`/projects/${props.project.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    msg.success('Project updated');
    showEdit.value = false;
    emit('refresh');
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { saving.value = false; }
}
</script>

<template>
  <div style="padding-top: 16px;">
    <!-- Edit button -->
    <NSpace justify="end" style="margin-bottom: 16px;">
      <NButton secondary @click="openEdit"><i class="ph ph-pencil" style="margin-right: 4px;" /> Edit Project</NButton>
    </NSpace>

    <!-- Stats -->
    <NGrid :x-gap="12" :y-gap="12" :cols="4" style="margin-bottom: 24px;">
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Progress" :value="project.progress || 0">
            <template #suffix>%</template>
          </NStatistic>
          <NProgress type="line" :percentage="project.progress || 0" :height="6" :border-radius="3" :show-indicator="false" style="margin-top:8px;" />
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic label="Tasks" :value="tasks.length">
            <template #suffix>total</template>
          </NStatistic>
          <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;">{{ tasksDone }} done, {{ tasksActive }} active</div>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <NStatistic :label="daysUntilDue !== null && daysUntilDue < 0 ? 'Overdue' : 'Days Until Due'" :value="daysUntilDue !== null ? Math.abs(daysUntilDue) : '-'">
            <template v-if="daysUntilDue !== null" #suffix>days</template>
          </NStatistic>
        </NCard>
      </NGi>
      <NGi>
        <NCard size="small" style="text-align: center;">
          <div style="margin-top:8px;">
            <NTag :type="({active:'success',planning:'info',scheduled:'info','in-progress':'info','on-hold':'warning',completed:'success',cancelled:'default'} as any)[project.status] || 'default'" size="large">
              {{ project.status }}
            </NTag>
          </div>
          <div v-if="project.priority" style="font-size:0.8rem;color:#94a3b8;margin-top:8px;">{{ project.priority }} priority</div>
        </NCard>
      </NGi>
    </NGrid>

    <!-- Details -->
    <NCard size="small" title="Project Details" style="margin-bottom: 16px;">
      <template #header-extra>
        <NButton size="small" secondary @click="openEdit"><i class="ph ph-pencil" style="margin-right: 4px;" /> Edit Project</NButton>
      </template>
      <NDescriptions :column="2" label-placement="left" bordered size="small">
        <NDescriptionsItem label="Project Manager">{{ project.projectManager || project.project_manager || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Type">{{ project.type || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Priority">{{ project.priority || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Client">{{ project.client || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Site Location">{{ project.siteLocation || project.sitelocation || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Business Line">{{ project.businessLine || project.businessline || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Requestor">{{ project.requestorInfo || project.requestorinfo || '-' }}</NDescriptionsItem>
        <NDescriptionsItem label="Start Date">{{ fmtDate(project.startDate || project.startdate) }}</NDescriptionsItem>
        <NDescriptionsItem label="Due Date">{{ fmtDate(project.dueDate || project.duedate || project.endDate || project.enddate) }}</NDescriptionsItem>
      </NDescriptions>
    </NCard>

    <!-- Stakeholders -->
    <NCard v-if="(project.stakeholders || []).length > 0" size="small" title="Stakeholders" style="margin-bottom: 16px;">
      <div v-for="(s, i) in project.stakeholders" :key="i"
        style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: #8b5cf6; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: #fff; flex-shrink: 0;">
          {{ s.name?.charAt(0)?.toUpperCase() || '?' }}
        </div>
        <div style="flex: 1;">
          <span style="font-weight: 500;">{{ s.name }}</span>
          <NTag v-if="s.role" size="tiny" :bordered="false" style="margin-left: 8px;">{{ s.role }}</NTag>
        </div>
        <span v-if="s.email" style="font-size: 0.85rem; color: #94a3b8;">{{ s.email }}</span>
      </div>
    </NCard>

    <!-- Description -->
    <NCard v-if="project.description" size="small" title="Description">
      <div style="white-space: pre-wrap;">{{ project.description }}</div>
    </NCard>

    <!-- Edit Project Modal -->
    <NModal v-model:show="showEdit" preset="card" title="Edit Project" style="width: 660px;" :mask-closable="false">
      <NForm label-placement="top" size="small">
        <NFormItem label="Project Name"><NInput v-model:value="editForm.name" /></NFormItem>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          <NFormItem label="Status"><NSelect v-model:value="editForm.status" :options="statusOptions" /></NFormItem>
          <NFormItem label="Priority"><NSelect v-model:value="editForm.priority" :options="priorityOptions" clearable /></NFormItem>
          <NFormItem label="Project Manager"><NSelect v-model:value="editForm.projectManager" :options="pmOptions" filterable clearable /></NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Client"><NInput v-model:value="editForm.client" /></NFormItem>
          <NFormItem label="Site Location"><NInput v-model:value="editForm.siteLocation" /></NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Start Date">
            <input v-model="editForm.startDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" />
          </NFormItem>
          <NFormItem label="Due Date">
            <input v-model="editForm.dueDate" type="date" :style="`width:100%;padding:6px 10px;border:1px solid ${colors.inputBorder};border-radius:3px;background:${colors.inputBg};color:${colors.inputText};`" />
          </NFormItem>
        </div>
        <NFormItem label="Description"><NInput v-model:value="editForm.description" type="textarea" :rows="2" /></NFormItem>

        <!-- Stakeholders -->
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; font-size: 0.9rem;"><i class="ph ph-users" style="margin-right: 4px;" /> Stakeholders</span>
            <NButton size="tiny" @click="addStakeholder"><i class="ph ph-plus" style="margin-right: 4px;" /> Add</NButton>
          </div>
          <div v-for="(s, i) in editForm.stakeholders" :key="i"
            style="display: grid; grid-template-columns: 1fr 120px 1fr 24px; gap: 8px; align-items: center; margin-bottom: 6px;">
            <NInput v-model:value="s.name" placeholder="Name" size="small" />
            <NSelect v-model:value="s.role" :options="stakeholderRoles" size="small" />
            <NInput v-model:value="s.email" placeholder="Email" size="small" />
            <NButton text size="tiny" @click="removeStakeholder(i)" style="color: #94a3b8;"><i class="ph ph-x" /></NButton>
          </div>
        </div>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showEdit = false">Cancel</NButton>
          <NButton type="primary" :loading="saving" @click="saveEdit">Save Changes</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
