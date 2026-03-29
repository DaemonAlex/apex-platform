<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NDataTable, NTag, NEmpty, NSelect, NButton, NSpace,
  NModal, NForm, NFormItem, NInput, NTabs, NTabPane, NUpload,
  useMessage,
} from 'naive-ui';
import type { DataTableColumns, UploadFileInfo } from 'naive-ui';
import { h } from 'vue';

const props = defineProps<{ projectId: string }>();
const msg = useMessage();

// Submittals
const submittals = ref<any[]>([]);
const showSubModal = ref(false);
const subForm = ref({ title: '', type: 'submittal', number: '', submittedDate: new Date().toISOString().split('T')[0], notes: '' });

// Documents
const documents = ref<any[]>([]);
const showDocModal = ref(false);
const docTitle = ref('');
const fileList = ref<UploadFileInfo[]>([]);

const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    const token = localStorage.getItem('apex_token');
    const [subData, docData] = await Promise.all([
      fetch('/api/meetings/submittals/project/' + props.projectId, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()),
      fetch('/api/documents/project/' + props.projectId, { headers: { Authorization: 'Bearer ' + token } }).then(r => r.json()),
    ]);
    submittals.value = subData.submittals || [];
    documents.value = docData.documents || [];
  } finally { loading.value = false; }
}

// Submittal functions
async function updateSubStatus(id: number, status: string) {
  const token = localStorage.getItem('apex_token');
  await fetch('/api/meetings/submittals/' + id, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  msg.success('Updated');
}

async function submitSub() {
  if (!subForm.value.title.trim()) { msg.error('Title required'); return; }
  const token = localStorage.getItem('apex_token');
  await fetch('/api/meetings/submittals', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: props.projectId, ...subForm.value, status: 'pending' }),
  });
  showSubModal.value = false;
  subForm.value = { title: '', type: 'submittal', number: '', submittedDate: new Date().toISOString().split('T')[0], notes: '' };
  msg.success('Added');
  load();
}

async function deleteSub(id: number) {
  const token = localStorage.getItem('apex_token');
  await fetch('/api/meetings/submittals/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
  load();
}

// Document functions
async function uploadDoc() {
  if (!fileList.value.length) { msg.error('Select a file'); return; }
  const file = fileList.value[0].file;
  if (!file) return;

  const title = docTitle.value.trim() || file.name;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);

  const token = localStorage.getItem('apex_token');
  const res = await fetch('/api/documents/project/' + props.projectId, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: formData,
  });

  if (!res.ok) { msg.error('Upload failed'); return; }
  showDocModal.value = false;
  docTitle.value = '';
  fileList.value = [];
  msg.success('Document uploaded');
  load();
}

async function downloadDoc(id: number) {
  const token = localStorage.getItem('apex_token');
  window.open('/api/documents/' + id + '/download?token=' + token, '_blank');
}

async function deleteDoc(id: number) {
  const token = localStorage.getItem('apex_token');
  await fetch('/api/documents/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
  msg.success('Deleted');
  load();
}

function formatFileSize(bytes: number) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const fileTypeIcons: Record<string, string> = {
  'application/pdf': 'ph-file-pdf', 'image/': 'ph-image', 'application/vnd': 'ph-file-xls',
  'application/msword': 'ph-file-doc', 'text/': 'ph-file-text',
};

function getFileIcon(mimeType: string) {
  for (const [prefix, icon] of Object.entries(fileTypeIcons)) {
    if (mimeType?.startsWith(prefix)) return icon;
  }
  return 'ph-file';
}

const statusOptions = [
  { label: 'Pending', value: 'pending' }, { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' }, { label: 'Revised', value: 'revised' },
];
const typeOptions = [{ label: 'Submittal', value: 'submittal' }, { label: 'RFI', value: 'rfi' }];

const subColumns: DataTableColumns<any> = [
  { title: '#', key: 'number', width: 80, render: (row) => row.number || '-' },
  { title: 'Type', key: 'type', width: 80, align: 'center', render: (row) => h(NTag, { size: 'small', bordered: false, type: row.type === 'rfi' ? 'info' as any : 'default' as any }, () => row.type === 'rfi' ? 'RFI' : 'Submittal') },
  { title: 'Title', key: 'title', render: (row) => h('span', { style: 'font-weight:500;' }, row.title) },
  { title: 'From', key: 'submittedByName', width: 130, render: (row) => row.submittedByName || '-' },
  { title: 'Status', key: 'status', width: 120, align: 'center', render: (row) => h(NSelect, { value: row.status, options: statusOptions, size: 'tiny', style: 'width:100px;', 'onUpdate:value': (v: string) => { row.status = v; updateSubStatus(row.id, v); } }) },
  { title: '', key: 'del', width: 36, render: (row) => h(NButton, { text: true, size: 'tiny', onClick: () => deleteSub(row.id), style: 'color:#94a3b8;' }, () => h('i', { class: 'ph ph-trash' })) },
];

onMounted(load);
</script>

<template>
  <div style="padding-top: 16px;">
    <NTabs type="line" size="small">
      <!-- Documents tab -->
      <NTabPane name="files" :tab="'Documents (' + documents.length + ')'">
        <NButton type="primary" size="small" style="margin-bottom: 12px;" @click="showDocModal = true">
          <i class="ph ph-upload-simple" style="margin-right: 4px;" /> Upload Document
        </NButton>

        <div v-if="documents.length > 0" style="display: flex; flex-direction: column; gap: 6px;">
          <div v-for="doc in documents" :key="doc.id"
            style="display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <i :class="'ph ' + getFileIcon(doc.mimeType)" style="font-size: 1.4rem; color: #0ea5e9; flex-shrink: 0;" />
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500;">{{ doc.title }}</div>
              <div style="font-size: 0.78rem; color: #94a3b8;">
                {{ doc.originalName }} - {{ formatFileSize(doc.fileSize) }} - {{ doc.uploadedBy }} - {{ new Date(doc.createdAt).toLocaleDateString() }}
              </div>
            </div>
            <NButton size="small" quaternary @click="downloadDoc(doc.id)" title="Download"><i class="ph ph-download-simple" /></NButton>
            <NButton size="small" quaternary @click="deleteDoc(doc.id)" title="Delete" style="color: #94a3b8;"><i class="ph ph-trash" /></NButton>
          </div>
        </div>
        <NEmpty v-else-if="!loading" description="No documents uploaded yet" />
      </NTabPane>

      <!-- Submittals/RFIs tab -->
      <NTabPane name="submittals" :tab="'Submittals & RFIs (' + submittals.length + ')'">
        <NButton type="primary" size="small" style="margin-bottom: 12px;" @click="showSubModal = true">
          <i class="ph ph-plus" style="margin-right: 4px;" /> Add Submittal / RFI
        </NButton>
        <NDataTable v-if="submittals.length > 0" :columns="subColumns" :data="submittals" :row-key="(r: any) => r.id" :bordered="false" size="small" striped />
        <NEmpty v-else-if="!loading" description="No submittals or RFIs" />
      </NTabPane>
    </NTabs>

    <!-- Upload Document Modal -->
    <NModal v-model:show="showDocModal" preset="card" title="Upload Document" style="width: 460px;">
      <NForm label-placement="top" size="small">
        <NFormItem label="Title">
          <NInput v-model:value="docTitle" placeholder="Document title (optional - defaults to filename)" />
        </NFormItem>
        <NFormItem label="File" required>
          <NUpload
            v-model:file-list="fileList"
            :max="1"
            :default-upload="false"
            accept="*/*"
          >
            <NButton><i class="ph ph-upload-simple" style="margin-right: 4px;" /> Choose File</NButton>
          </NUpload>
        </NFormItem>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showDocModal = false">Cancel</NButton>
          <NButton type="primary" @click="uploadDoc" :disabled="fileList.length === 0">Upload</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- Add Submittal Modal -->
    <NModal v-model:show="showSubModal" preset="card" title="Add Submittal / RFI" style="width: 480px;">
      <NForm label-placement="top" size="small">
        <div style="display: grid; grid-template-columns: 1fr 120px; gap: 12px;">
          <NFormItem label="Title" required><NInput v-model:value="subForm.title" placeholder="e.g., AV Equipment Spec" /></NFormItem>
          <NFormItem label="Type"><NSelect v-model:value="subForm.type" :options="typeOptions" /></NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 120px 1fr; gap: 12px;">
          <NFormItem label="Number"><NInput v-model:value="subForm.number" placeholder="SUB-001" /></NFormItem>
          <NFormItem label="Date"><input v-model="subForm.submittedDate" type="date" style="width:100%;padding:6px 10px;border:1px solid #2a2d3e;border-radius:3px;background:#161822;color:#eef0f4;" /></NFormItem>
        </div>
        <NFormItem label="Notes"><NInput v-model:value="subForm.notes" type="textarea" :rows="2" /></NFormItem>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showSubModal = false">Cancel</NButton>
          <NButton type="primary" @click="submitSub">Add</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
