<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NButton, NSpace, NTag, NEmpty, NModal, NForm, NFormItem, NInput, NSelect,
  createDiscreteApi,
} from 'naive-ui';
import { apiFetch } from '../../composables/useApi';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ (e: 'refresh'): void }>();
const { message: msg } = createDiscreteApi(['message']);

const project = ref<any>(null);
const loading = ref(true);
const showModal = ref(false);
const editingIndex = ref<number | null>(null);
const saving = ref(false);
const form = ref({ name: '', role: 'approver', email: '', phone: '', department: '', notes: '' });

const roleOptions = [
  { label: 'Approver', value: 'approver' },
  { label: 'Sponsor', value: 'sponsor' },
  { label: 'Project Manager', value: 'project-manager' },
  { label: 'End User', value: 'end-user' },
  { label: 'Site Contact', value: 'site-contact' },
  { label: 'CRE Contact', value: 'cre' },
  { label: 'Network Contact', value: 'network' },
  { label: 'Facilities', value: 'facilities' },
  { label: 'Vendor Rep', value: 'vendor-rep' },
  { label: 'Other', value: 'other' },
];

const roleIcons: Record<string, string> = {
  approver: 'ph-stamp', sponsor: 'ph-crown', 'project-manager': 'ph-user-circle-gear',
  'end-user': 'ph-user', 'site-contact': 'ph-map-pin', cre: 'ph-buildings',
  network: 'ph-wifi-high', facilities: 'ph-wrench', 'vendor-rep': 'ph-handshake', other: 'ph-user',
};

const roleColors: Record<string, string> = {
  approver: '#ef4444', sponsor: '#f59e0b', 'project-manager': '#0ea5e9',
  'end-user': '#22c55e', 'site-contact': '#8b5cf6', cre: '#06b6d4',
  network: '#64748b', facilities: '#f97316', 'vendor-rep': '#ec4899', other: '#94a3b8',
};

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch('/projects/' + props.projectId);
    project.value = data.project || data;
  } finally { loading.value = false; }
}

function stakeholders() {
  return project.value?.stakeholders || [];
}

function openAdd() {
  editingIndex.value = null;
  form.value = { name: '', role: 'approver', email: '', phone: '', department: '', notes: '' };
  showModal.value = true;
}

function openEdit(index: number) {
  const s = stakeholders()[index];
  editingIndex.value = index;
  form.value = { name: s.name || '', role: s.role || 'other', email: s.email || '', phone: s.phone || '', department: s.department || '', notes: s.notes || '' };
  showModal.value = true;
}

async function save() {
  if (!form.value.name.trim()) { msg.error('Name required'); return; }
  saving.value = true;
  try {
    const list = [...stakeholders()];
    const entry = { ...form.value, name: form.value.name.trim(), email: form.value.email.trim(), phone: form.value.phone.trim(), department: form.value.department.trim(), notes: form.value.notes.trim() };
    if (editingIndex.value !== null) {
      list[editingIndex.value] = entry;
    } else {
      list.push(entry);
    }
    await apiFetch(`/projects/${props.projectId}`, { method: 'PUT', body: JSON.stringify({ stakeholders: list }) });
    showModal.value = false;
    msg.success(editingIndex.value !== null ? 'Updated' : 'Added');
    await load();
    emit('refresh');
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { saving.value = false; }
}

async function remove(index: number) {
  const list = [...stakeholders()];
  list.splice(index, 1);
  await apiFetch(`/projects/${props.projectId}`, { method: 'PUT', body: JSON.stringify({ stakeholders: list }) });
  msg.success('Removed');
  await load();
  emit('refresh');
}

onMounted(load);
</script>

<template>
  <div style="padding-top: 16px;">
    <NSpace style="margin-bottom: 16px;">
      <NButton type="primary" size="small" @click="openAdd"><i class="ph ph-plus" style="margin-right: 4px;" /> Add Stakeholder</NButton>
    </NSpace>

    <div v-if="stakeholders().length > 0" style="display: flex; flex-direction: column; gap: 10px;">
      <div v-for="(s, i) in stakeholders()" :key="i"
        style="display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); cursor: pointer; transition: background 0.15s;"
        @click="openEdit(i as number)"
        @mouseenter="($event.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'"
        @mouseleave="($event.currentTarget as HTMLElement).style.background = ''">
        <div :style="{ width: '40px', height: '40px', borderRadius: '50%', background: roleColors[s.role] || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: '#fff', flexShrink: 0 }">
          <i :class="'ph ' + (roleIcons[s.role] || 'ph-user')" />
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600;">{{ s.name }}</span>
            <NTag size="tiny" :bordered="false">{{ roleOptions.find(r => r.value === s.role)?.label || s.role }}</NTag>
          </div>
          <div style="font-size: 0.85rem; color: #94a3b8; margin-top: 2px;">
            <span v-if="s.department">{{ s.department }}</span>
            <span v-if="s.department && s.email"> - </span>
            <span v-if="s.email">{{ s.email }}</span>
            <span v-if="s.phone" style="margin-left: 12px;"><i class="ph ph-phone" style="margin-right: 2px;" />{{ s.phone }}</span>
          </div>
          <div v-if="s.notes" style="font-size: 0.82rem; color: #94a3b8; margin-top: 4px; font-style: italic;">{{ s.notes }}</div>
        </div>
        <NButton text size="tiny" @click.stop="remove(i as number)" style="color: #94a3b8; flex-shrink: 0;"><i class="ph ph-trash" /></NButton>
      </div>
    </div>
    <NEmpty v-else-if="!loading" description="No stakeholders added. Add approvers, sponsors, and site contacts." />

    <!-- Add/Edit Modal -->
    <NModal v-model:show="showModal" preset="card" :title="editingIndex !== null ? 'Edit Stakeholder' : 'Add Stakeholder'" style="width: 500px;" :mask-closable="false">
      <NForm label-placement="top" size="small">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Name" required><NInput v-model:value="form.name" placeholder="Full name" /></NFormItem>
          <NFormItem label="Role"><NSelect v-model:value="form.role" :options="roleOptions" /></NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Email"><NInput v-model:value="form.email" placeholder="email@company.com" /></NFormItem>
          <NFormItem label="Phone"><NInput v-model:value="form.phone" placeholder="(555) 123-4567" /></NFormItem>
        </div>
        <NFormItem label="Department"><NInput v-model:value="form.department" placeholder="e.g., CRE, Network Ops, Facilities" /></NFormItem>
        <NFormItem label="Notes"><NInput v-model:value="form.notes" type="textarea" :rows="2" placeholder="Approval authority, availability, special notes..." /></NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">Cancel</NButton>
          <NButton type="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">{{ editingIndex !== null ? 'Save Changes' : 'Add Stakeholder' }}</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
