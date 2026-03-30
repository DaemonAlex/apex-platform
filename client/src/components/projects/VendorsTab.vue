<script setup lang="ts">
import { ref, onMounted, h } from 'vue';
import {
  NButton, NSpace, NTag, NEmpty, NModal, NSelect, NFormItem,
  NDataTable, createDiscreteApi,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { apiFetch } from '../../composables/useApi';

const props = defineProps<{ entityType: string; entityId: string }>();
const { message: msg } = createDiscreteApi(['message']);

const vendors = ref<any[]>([]);
const allVendors = ref<any[]>([]);
const loading = ref(true);

// Assign modal
const showAssign = ref(false);
const assignForm = ref({ vendorId: null as number | null, role: '' });
const assigning = ref(false);

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch<{ vendors: any[] }>(`/vendors/for/${props.entityType}/${props.entityId}`);
    vendors.value = data.vendors;
  } finally { loading.value = false; }
}

async function loadAllVendors() {
  const data = await apiFetch<{ vendors: any[] }>('/vendors');
  allVendors.value = data.vendors;
}

const vendorOptions = () => {
  const assigned = new Set(vendors.value.map(v => v.id));
  return allVendors.value.filter(v => !assigned.has(v.id)).map(v => ({
    label: `${v.name} (${v.type})`,
    value: v.id,
  }));
};

async function openAssign() {
  assignForm.value = { vendorId: null, role: '' };
  await loadAllVendors();
  showAssign.value = true;
}

async function submitAssign() {
  if (!assignForm.value.vendorId) { msg.error('Select a vendor'); return; }
  assigning.value = true;
  try {
    await apiFetch(`/vendors/${assignForm.value.vendorId}/assign`, {
      method: 'POST',
      body: JSON.stringify({
        entityType: props.entityType,
        entityId: props.entityId,
        role: assignForm.value.role || null,
      }),
    });
    msg.success('Vendor assigned');
    showAssign.value = false;
    await load();
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { assigning.value = false; }
}

async function removeAssignment(assignmentId: number) {
  await apiFetch(`/vendors/assignments/${assignmentId}`, { method: 'DELETE' });
  msg.success('Vendor removed');
  await load();
}

const roleOptions = [
  { label: 'Installer', value: 'installer' },
  { label: 'Supplier', value: 'supplier' },
  { label: 'Support/Maintenance', value: 'support' },
  { label: 'Consultant', value: 'consultant' },
  { label: 'Internal Team', value: 'internal' },
  { label: 'General Contractor', value: 'gc' },
  { label: 'Sub-Contractor', value: 'sub' },
  { label: 'Other', value: 'other' },
];

const columns: DataTableColumns<any> = [
  {
    title: 'Vendor', key: 'name', render: (row) => h('div', {}, [
      h('div', { style: 'font-weight:500;' }, row.name),
      row.category ? h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, row.category) : null,
    ]),
  },
  {
    title: 'Type', key: 'type', width: 90,
    render: (row) => h(NTag, { type: row.type === 'internal' ? 'info' : 'default', size: 'small', bordered: true }, () => row.type),
  },
  {
    title: 'Role', key: 'role', width: 130,
    render: (row) => row.role ? h(NTag, { size: 'small', bordered: false }, () => row.role) : h('span', { style: 'color:#94a3b8;' }, '-'),
  },
  {
    title: 'Contacts', key: 'contacts', width: 200,
    render: (row) => {
      const contacts = row.contacts || [];
      if (!contacts.length) return h('span', { style: 'color:#94a3b8;' }, 'None');
      return h('div', {}, contacts.slice(0, 2).map((c: any) =>
        h('div', { style: 'font-size:0.82rem;' }, [
          h('span', { style: 'font-weight:500;' }, c.name),
          c.role ? h('span', { style: 'color:#94a3b8;margin-left:4px;' }, `(${c.role})`) : null,
          c.email ? h('div', { style: 'color:#94a3b8;font-size:0.75rem;' }, c.email) : null,
        ])
      ));
    },
  },
  {
    title: '', key: 'actions', width: 80, align: 'center',
    render: (row) => h(NButton, {
      size: 'small', type: 'error', ghost: true,
      onClick: () => removeAssignment(row.assignmentId),
    }, () => 'Remove'),
  },
];

onMounted(load);
</script>

<template>
  <div>
    <NSpace style="margin-bottom: 12px;">
      <NButton type="primary" size="small" @click="openAssign">
        <i class="ph ph-plus" style="margin-right: 4px;" /> Assign Vendor
      </NButton>
    </NSpace>

    <NDataTable v-if="vendors.length" :columns="columns" :data="vendors" :row-key="(r: any) => r.assignmentId" :bordered="false" size="small" />
    <NEmpty v-else-if="!loading" description="No vendors assigned" />

    <!-- Assign Modal -->
    <NModal v-model:show="showAssign" preset="card" title="Assign Vendor" style="width: 440px;">
      <NFormItem label="Vendor" required>
        <NSelect v-model:value="assignForm.vendorId" :options="vendorOptions()" placeholder="Select vendor..." filterable />
      </NFormItem>
      <NFormItem label="Role on this project">
        <NSelect v-model:value="assignForm.role" :options="roleOptions" placeholder="Select role..." clearable />
      </NFormItem>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showAssign = false">Cancel</NButton>
          <NButton type="primary" :loading="assigning" :disabled="!assignForm.vendorId" @click="submitAssign">Assign</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
