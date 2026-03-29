<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NInput, NButton, NEmpty, NSpace, NTag, NDivider,
  NModal, NForm, NFormItem, useMessage,
} from 'naive-ui';
import { apiFetch } from '../../composables/useApi';

const props = defineProps<{ projectId: string }>();
const msg = useMessage();
const notes = ref<any[]>([]);
const visits = ref<any[]>([]);
const newNote = ref('');
const loading = ref(true);
const showVisitModal = ref(false);
const visitForm = ref({ visitor: '', visitDate: new Date().toISOString().split('T')[0], purpose: '', summary: '', ticketNumber: '' });

async function load() {
  loading.value = true;
  try {
    const [notesData, visitsData] = await Promise.all([
      apiFetch('/projects/' + props.projectId + '/notes'),
      apiFetch('/projects/' + props.projectId + '/visits'),
    ]);
    notes.value = notesData.notes || [];
    visits.value = visitsData.visits || [];
  } finally {
    loading.value = false;
  }
}

async function addNote() {
  if (!newNote.value.trim()) return;
  try {
    await apiFetch('/projects/' + props.projectId + '/notes', {
      method: 'POST',
      body: JSON.stringify({ content: newNote.value.trim() }),
    });
    newNote.value = '';
    msg.success('Note added');
    load();
  } catch (e: any) { msg.error(e.message || 'Failed'); }
}

async function deleteNote(noteId: number) {
  await apiFetch('/projects/' + props.projectId + '/notes/' + noteId, { method: 'DELETE' });
  load();
}

async function submitVisit() {
  if (!visitForm.value.visitor.trim() || !visitForm.value.visitDate) { msg.error('Name and date required'); return; }
  try {
    await apiFetch('/projects/' + props.projectId + '/visits', {
      method: 'POST',
      body: JSON.stringify(visitForm.value),
    });
    showVisitModal.value = false;
    visitForm.value = { visitor: '', visitDate: new Date().toISOString().split('T')[0], purpose: '', summary: '', ticketNumber: '' };
    msg.success('Visit logged');
    load();
  } catch (e: any) { msg.error(e.message || 'Failed'); }
}

function fmtDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

onMounted(load);
</script>

<template>
  <div style="padding-top: 16px;">
    <!-- Add note -->
    <NSpace style="margin-bottom: 16px;">
      <NInput v-model:value="newNote" placeholder="Add a note..." style="width: 400px;" @keyup.enter="addNote" />
      <NButton type="primary" @click="addNote" :disabled="!newNote.trim()">
        <i class="ph ph-plus" style="margin-right: 4px;" /> Add Note
      </NButton>
      <NButton @click="showVisitModal = true">
        <i class="ph ph-map-trifold" style="margin-right: 4px;" /> Log Site Visit
      </NButton>
    </NSpace>

    <!-- Notes -->
    <div v-for="note in notes" :key="'n-' + note.id"
      style="border-left: 3px solid #38bdf8; padding: 8px 12px; margin-bottom: 8px;"
    >
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="font-size: 0.8rem; color: #94a3b8;">
            {{ fmtDate(note.createdAt) }} - <strong>{{ note.author }}</strong>
          </div>
          <div style="margin-top: 4px; white-space: pre-wrap;">{{ note.content }}</div>
        </div>
        <NButton text size="tiny" @click="deleteNote(note.id)" style="color: #94a3b8;">
          <i class="ph ph-x" />
        </NButton>
      </div>
    </div>

    <!-- Site Visits -->
    <template v-if="visits.length > 0">
      <NDivider style="margin: 24px 0 16px;">Site Visits</NDivider>
      <div v-for="v in visits" :key="'v-' + v.id"
        style="border: 1px solid #2a2d3e; border-radius: 8px; padding: 12px; margin-bottom: 8px;"
      >
        <div style="font-weight: 500;"><i class="ph ph-map-trifold" /> {{ v.visitor }}</div>
        <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">
          {{ new Date(v.visitDate).toLocaleDateString() }}
          {{ v.purpose ? ' - ' + v.purpose : '' }}
          <NTag v-if="v.ticketNumber" size="tiny" type="info" style="margin-left: 4px;">{{ v.ticketNumber }}</NTag>
        </div>
        <div v-if="v.summary" style="margin-top: 6px; white-space: pre-wrap;">{{ v.summary }}</div>
      </div>
    </template>

    <NEmpty v-if="notes.length === 0 && visits.length === 0 && !loading" description="No notes or visits yet" />

    <!-- Visit Modal -->
    <NModal v-model:show="showVisitModal" preset="card" title="Log Site Visit" style="width: 480px;">
      <NForm label-placement="top" size="small">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Who Visited" required>
            <NInput v-model:value="visitForm.visitor" placeholder="Your name" />
          </NFormItem>
          <NFormItem label="Visit Date" required>
            <input v-model="visitForm.visitDate" type="date" style="width:100%; padding:6px 10px; border:1px solid var(--n-border-color, #e0e0e6); border-radius:3px; background:var(--n-color, #fff); color:inherit;" />
          </NFormItem>
        </div>
        <NFormItem label="Purpose">
          <NInput v-model:value="visitForm.purpose" placeholder="e.g., Site survey, Installation, Service call" />
        </NFormItem>
        <NFormItem label="Summary">
          <NInput v-model:value="visitForm.summary" type="textarea" :rows="3" placeholder="What was done..." />
        </NFormItem>
        <NFormItem label="SNOW Ticket #">
          <NInput v-model:value="visitForm.ticketNumber" placeholder="INC0012345" />
        </NFormItem>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showVisitModal = false">Cancel</NButton>
          <NButton type="primary" @click="submitVisit">Log Visit</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
