<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue';
import {
  NMessageProvider, NConfigProvider,
  NCard, NGrid, NGi, NStatistic, NButton, NSpace, NSpin, NInput, NSelect,
  NDataTable, NTag, NModal, NForm, NFormItem, NEmpty, NTabs, NTabPane,
  createDiscreteApi,
} from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';
import { useTheme } from './composables/useTheme';
import { apiFetch } from './composables/useApi';

defineProps<{ userName?: string }>();
const { message: msg } = createDiscreteApi(['message']);
const { naiveTheme, themeOverrides, colors } = useTheme();

const loading = ref(true);
const vendors = ref<any[]>([]);
const search = ref('');
const typeFilter = ref<string | null>(null);

// Create/Edit modal
const showModal = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const form = ref({
  name: '', type: 'external' as string, category: null as string | null,
  website: '', address: '', notes: '',
  contacts: [] as { name: string; role: string; email: string; phone: string }[],
});

// Detail
const showDetail = ref(false);
const detailVendor = ref<any>(null);
const detailLoading = ref(false);

const typeOptions = [
  { label: 'External', value: 'external' },
  { label: 'Internal', value: 'internal' },
];
const categoryOptions = [
  { label: 'AV Integrator', value: 'av-integrator' },
  { label: 'Manufacturer', value: 'manufacturer' },
  { label: 'Software/Platform', value: 'software' },
  { label: 'Network', value: 'network' },
  { label: 'EUS (End User Services)', value: 'eus' },
  { label: 'CRE (Corporate Real Estate)', value: 'cre' },
  { label: 'Facilities', value: 'facilities' },
  { label: 'Telecom', value: 'telecom' },
  { label: 'Security', value: 'security' },
  { label: 'Consultant', value: 'consultant' },
  { label: 'Other', value: 'other' },
];

async function fetchVendors() {
  loading.value = true;
  try {
    const data = await apiFetch<{ vendors: any[] }>('/vendors');
    vendors.value = data.vendors;
  } finally { loading.value = false; }
}

const filtered = computed(() => {
  let result = vendors.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter(v => v.name.toLowerCase().includes(q) || (v.category || '').toLowerCase().includes(q));
  }
  if (typeFilter.value) result = result.filter(v => v.type === typeFilter.value);
  return result;
});

const stats = computed(() => ({
  total: vendors.value.length,
  external: vendors.value.filter(v => v.type === 'external').length,
  internal: vendors.value.filter(v => v.type === 'internal').length,
}));

function openCreate() {
  editingId.value = null;
  form.value = { name: '', type: 'external', category: null, website: '', address: '', notes: '', contacts: [] };
  showModal.value = true;
}

function openEdit(vendor: any) {
  editingId.value = vendor.id;
  form.value = {
    name: vendor.name, type: vendor.type, category: vendor.category,
    website: vendor.website || '', address: vendor.address || '', notes: vendor.notes || '',
    contacts: [...(vendor.contacts || [])],
  };
  showModal.value = true;
}

function addContact() {
  form.value.contacts.push({ name: '', role: '', email: '', phone: '' });
}

function removeContact(i: number) {
  form.value.contacts.splice(i, 1);
}

async function save() {
  if (!form.value.name.trim()) { msg.error('Name is required'); return; }
  saving.value = true;
  try {
    if (editingId.value) {
      await apiFetch(`/vendors/${editingId.value}`, { method: 'PUT', body: JSON.stringify(form.value) });
      msg.success('Vendor updated');
    } else {
      await apiFetch('/vendors', { method: 'POST', body: JSON.stringify(form.value) });
      msg.success('Vendor created');
    }
    showModal.value = false;
    await fetchVendors();
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { saving.value = false; }
}

async function deleteVendor(id: number) {
  await apiFetch(`/vendors/${id}`, { method: 'DELETE' });
  msg.success('Vendor removed');
  await fetchVendors();
}

async function openDetail2(vendor: any) {
  detailVendor.value = vendor;
  showDetail.value = true;
  detailLoading.value = true;
  try {
    const data = await apiFetch<any>(`/vendors/${vendor.id}`);
    detailVendor.value = data;
  } finally { detailLoading.value = false; }
}

const columns: DataTableColumns<any> = [
  {
    title: 'Vendor', key: 'name', sorter: 'default',
    render: (row) => h('div', { style: 'display:flex;align-items:center;gap:10px;' }, [
      h('div', {
        style: `width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;flex-shrink:0;background:${row.type === 'internal' ? '#8b5cf6' : '#0ea5e9'};`,
      }, row.name.charAt(0).toUpperCase()),
      h('div', {}, [
        h('div', { style: 'font-weight:500;' }, row.name),
        row.category ? h('div', { style: 'font-size:0.78rem;color:#94a3b8;' }, categoryOptions.find(c => c.value === row.category)?.label || row.category) : null,
      ]),
    ]),
  },
  {
    title: 'Type', key: 'type', width: 100,
    render: (row) => h(NTag, { type: row.type === 'internal' ? 'info' : 'default', size: 'small', bordered: true }, () => row.type),
  },
  {
    title: 'Contacts', key: 'contacts', width: 100, align: 'center',
    render: (row) => h('span', {}, (row.contacts || []).length),
  },
  {
    title: 'Projects', key: 'projectCount', width: 80, align: 'center',
    render: (row) => row.projectCount || 0,
  },
  {
    title: 'Actions', key: 'actions', width: 200,
    render: (row) => h(NSpace, { size: 'small' }, () => [
      h(NButton, { size: 'small', secondary: true, onClick: () => openDetail2(row) }, () => 'View'),
      h(NButton, { size: 'small', secondary: true, onClick: () => openEdit(row) }, () => 'Edit'),
      h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => deleteVendor(row.id) }, () => 'Delete'),
    ]),
  },
];

onMounted(fetchVendors);
</script>

<template>
<NMessageProvider>
<NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
<div style="background:transparent;">
  <NSpace justify="space-between" align="center" style="margin-bottom:16px;">
    <h1 style="margin:0;font-size:1.5rem;">Vendors</h1>
    <NButton type="primary" @click="openCreate"><i class="ph ph-plus" style="margin-right:4px;" /> Add Vendor</NButton>
  </NSpace>

  <!-- Stats -->
  <NGrid :x-gap="12" :y-gap="12" :cols="3" style="margin-bottom:20px;">
    <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Total Vendors" :value="stats.total" /></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;"><NStatistic label="External" :value="stats.external"><template #prefix><span style="color:#0ea5e9;">&#9679;</span></template></NStatistic></NCard></NGi>
    <NGi><NCard size="small" style="text-align:center;"><NStatistic label="Internal" :value="stats.internal"><template #prefix><span style="color:#8b5cf6;">&#9679;</span></template></NStatistic></NCard></NGi>
  </NGrid>

  <!-- Filters -->
  <NSpace style="margin-bottom:16px;" align="center">
    <NInput v-model:value="search" placeholder="Search vendors..." clearable style="width:250px;" size="small">
      <template #prefix><i class="ph ph-magnifying-glass" /></template>
    </NInput>
    <NSelect v-model:value="typeFilter" :options="typeOptions" placeholder="Type" clearable style="width:140px;" size="small" />
    <span :style="{ color: colors.textMuted, fontSize: '0.85rem' }">{{ filtered.length }} vendor{{ filtered.length !== 1 ? 's' : '' }}</span>
  </NSpace>

  <!-- Table -->
  <NSpin :show="loading">
    <NDataTable :columns="columns" :data="filtered" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
  </NSpin>

  <!-- Create/Edit Modal -->
  <NModal v-model:show="showModal" preset="card" :title="editingId ? 'Edit Vendor' : 'Add Vendor'" style="width:600px;" :mask-closable="false">
    <NForm label-placement="top" size="small">
      <NFormItem label="Vendor Name" required><NInput v-model:value="form.name" placeholder="e.g., Cisco Systems" /></NFormItem>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Type"><NSelect v-model:value="form.type" :options="typeOptions" /></NFormItem>
        <NFormItem label="Category"><NSelect v-model:value="form.category" :options="categoryOptions" clearable /></NFormItem>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <NFormItem label="Website"><NInput v-model:value="form.website" placeholder="https://..." /></NFormItem>
        <NFormItem label="Address"><NInput v-model:value="form.address" placeholder="123 Main St..." /></NFormItem>
      </div>
      <NFormItem label="Notes"><NInput v-model:value="form.notes" type="textarea" :rows="2" /></NFormItem>

      <!-- Contacts -->
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;font-size:0.9rem;">Contacts</span>
          <NButton size="tiny" @click="addContact"><i class="ph ph-plus" style="margin-right:4px;" /> Contact</NButton>
        </div>
        <div v-for="(c, i) in form.contacts" :key="i" style="display:grid;grid-template-columns:1fr 100px 1fr 120px 24px;gap:8px;align-items:center;margin-bottom:6px;">
          <NInput v-model:value="c.name" placeholder="Name" size="small" />
          <NInput v-model:value="c.role" placeholder="Role" size="small" />
          <NInput v-model:value="c.email" placeholder="Email" size="small" />
          <NInput v-model:value="c.phone" placeholder="Phone" size="small" />
          <NButton text size="tiny" @click="removeContact(i)" style="color:#94a3b8;"><i class="ph ph-x" /></NButton>
        </div>
        <div v-if="form.contacts.length === 0" :style="{ color: colors.textMuted, fontSize: '0.85rem' }">No contacts added</div>
      </div>
    </NForm>
    <template #footer>
      <NSpace justify="end">
        <NButton @click="showModal = false">Cancel</NButton>
        <NButton type="primary" :loading="saving" :disabled="!form.name.trim()" @click="save">{{ editingId ? 'Save Changes' : 'Create Vendor' }}</NButton>
      </NSpace>
    </template>
  </NModal>

  <!-- Detail Modal -->
  <NModal v-model:show="showDetail" preset="card" :title="detailVendor?.name || 'Vendor'" style="width:700px;">
    <NSpin :show="detailLoading">
      <template v-if="detailVendor">
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <NTag :type="detailVendor.type === 'internal' ? 'info' : 'default'" size="medium">{{ detailVendor.type }}</NTag>
          <NTag v-if="detailVendor.category" size="medium" :bordered="false">{{ categoryOptions.find(c => c.value === detailVendor.category)?.label || detailVendor.category }}</NTag>
          <span v-if="detailVendor.website" :style="{ color: colors.textMuted, fontSize: '0.85rem' }">{{ detailVendor.website }}</span>
        </div>

        <NTabs type="line" size="small">
          <NTabPane name="contacts" :tab="'Contacts (' + (detailVendor.contacts?.length || 0) + ')'">
            <div v-for="(c, i) in (detailVendor.contacts || [])" :key="i"
              style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
              <div style="width:36px;height:36px;border-radius:50%;background:#0ea5e9;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#fff;flex-shrink:0;">
                {{ c.name?.charAt(0)?.toUpperCase() || '?' }}
              </div>
              <div style="flex:1;">
                <div style="font-weight:500;">{{ c.name }} <span v-if="c.role" :style="{ color: colors.textMuted, fontSize: '0.8rem', marginLeft: '6px' }">{{ c.role }}</span></div>
                <div :style="{ fontSize: '0.85rem', color: colors.textMuted }">
                  <span v-if="c.email"><i class="ph ph-envelope" style="margin-right:2px;" />{{ c.email }}</span>
                  <span v-if="c.phone" style="margin-left:12px;"><i class="ph ph-phone" style="margin-right:2px;" />{{ c.phone }}</span>
                </div>
              </div>
            </div>
            <NEmpty v-if="!detailVendor.contacts?.length" description="No contacts" />
          </NTabPane>

          <NTabPane name="assignments" :tab="'Assignments (' + (detailVendor.assignments?.length || 0) + ')'">
            <div v-for="a in (detailVendor.assignments || [])" :key="a.id"
              style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:0.9rem;">
              <div>
                <NTag size="small" :bordered="false">{{ a.entityType }}</NTag>
                <span style="margin-left:8px;font-weight:500;">{{ a.entityId }}</span>
                <span v-if="a.role" :style="{ color: colors.textMuted, marginLeft: '8px' }">as {{ a.role }}</span>
              </div>
            </div>
            <NEmpty v-if="!detailVendor.assignments?.length" description="Not assigned to any projects or rooms" />
          </NTabPane>
        </NTabs>
      </template>
    </NSpin>
  </NModal>
</div>
</NConfigProvider>
</NMessageProvider>
</template>
