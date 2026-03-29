<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NEmpty, NTag, NCollapse, NCollapseItem, NButton, NSpace,
  NModal, NForm, NFormItem, NInput, NSelect, useMessage,
} from 'naive-ui';
import { apiFetch } from '../../composables/useApi';

const props = defineProps<{ projectId: string }>();
const msg = useMessage();
const meetings = ref<any[]>([]);
const loading = ref(true);
const showModal = ref(false);
const form = ref({
  title: '', meetingType: 'oac', meetingDate: new Date().toISOString().split('T')[0],
  meetingTime: '14:00', attendees: '', agenda: '', notes: '', actionItems: '',
});

const typeOptions = [
  { label: 'OAC', value: 'oac' }, { label: 'Status', value: 'status' },
  { label: 'Kickoff', value: 'kickoff' }, { label: 'Closeout', value: 'closeout' },
  { label: 'Other', value: 'other' },
];

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch('/meetings/project/' + props.projectId);
    meetings.value = data.meetings || [];
  } finally { loading.value = false; }
}

async function submit() {
  if (!form.value.title.trim()) { msg.error('Title required'); return; }
  const dateTime = form.value.meetingDate + 'T' + (form.value.meetingTime || '14:00') + ':00';
  const attendees = form.value.attendees ? form.value.attendees.split(',').map(s => s.trim()).filter(Boolean) : [];
  const agenda = form.value.agenda ? form.value.agenda.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const actionItems = form.value.actionItems ? form.value.actionItems.split('\n').map(line => {
    const parts = line.split('|').map(s => s.trim());
    return { task: parts[0] || '', owner: parts[1] || '', dueDate: parts[2] || null, status: 'open' };
  }).filter(a => a.task) : [];

  try {
    await apiFetch('/meetings', {
      method: 'POST',
      body: JSON.stringify({
        projectId: props.projectId, title: form.value.title, meetingType: form.value.meetingType,
        meetingDate: dateTime, attendees, agenda, notes: form.value.notes || null, actionItems,
      }),
    });
    showModal.value = false;
    form.value = { title: '', meetingType: 'oac', meetingDate: new Date().toISOString().split('T')[0], meetingTime: '14:00', attendees: '', agenda: '', notes: '', actionItems: '' };
    msg.success('Meeting added');
    load();
  } catch (e: any) { msg.error(e.message || 'Failed'); }
}

async function deleteMeeting(id: number) {
  await apiFetch('/meetings/' + id, { method: 'DELETE' });
  msg.success('Deleted');
  load();
}

const typeLabels: Record<string, string> = { oac: 'OAC', status: 'Status', kickoff: 'Kickoff', closeout: 'Closeout', other: 'Meeting' };
function openActionCount(m: any) { return (m.actionItems || []).filter((a: any) => a.status === 'open').length; }

onMounted(load);
</script>

<template>
  <div style="padding-top: 16px;">
    <NSpace style="margin-bottom: 16px;">
      <NButton type="primary" @click="showModal = true">
        <i class="ph ph-plus" style="margin-right: 4px;" /> Add Meeting
      </NButton>
    </NSpace>

    <NCollapse v-if="meetings.length > 0">
      <NCollapseItem v-for="m in meetings" :key="m.id" :name="String(m.id)">
        <template #header>
          <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
            <span style="font-weight: 500;">{{ m.title }}</span>
            <NTag size="tiny" :bordered="false">{{ typeLabels[m.meetingType] || m.meetingType }}</NTag>
            <span style="color: #94a3b8; font-size: 0.8rem;">{{ new Date(m.meetingDate).toLocaleDateString() }}</span>
            <NTag v-if="openActionCount(m) > 0" size="tiny" type="warning" :bordered="false">{{ openActionCount(m) }} open</NTag>
          </div>
        </template>
        <template #header-extra>
          <NButton text size="tiny" @click.stop="deleteMeeting(m.id)" style="color: #94a3b8;"><i class="ph ph-trash" /></NButton>
        </template>

        <div style="padding: 0 8px;">
          <div v-if="(m.attendees || []).length > 0" style="margin-bottom: 12px;">
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 4px;">Attendees</div>
            <div style="font-size: 0.9rem;">{{ (m.attendees || []).join(', ') }}</div>
          </div>
          <div v-if="(m.agenda || []).length > 0" style="margin-bottom: 12px;">
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 4px;">Agenda</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.9rem;">
              <li v-for="(item, i) in m.agenda" :key="i">{{ typeof item === 'string' ? item : item.text }}</li>
            </ul>
          </div>
          <div v-if="m.notes" style="margin-bottom: 12px;">
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 4px;">Notes</div>
            <div style="font-size: 0.9rem; white-space: pre-wrap; padding: 8px; border-radius: 6px;">{{ m.notes }}</div>
          </div>
          <div v-if="(m.actionItems || []).length > 0">
            <div style="font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 4px;">Action Items</div>
            <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
              <thead><tr style="border-bottom: 1px solid #2a2d3e;">
                <th style="text-align: left; padding: 4px 0;">Action</th>
                <th style="text-align: left; padding: 4px;">Owner</th>
                <th style="text-align: left; padding: 4px;">Due</th>
                <th style="text-align: center; padding: 4px;">Status</th>
              </tr></thead>
              <tbody>
                <tr v-for="(a, i) in m.actionItems" :key="i">
                  <td style="padding: 4px 0;">{{ a.task || a.text }}</td>
                  <td style="padding: 4px;">{{ a.owner || '-' }}</td>
                  <td style="padding: 4px;">{{ a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '-' }}</td>
                  <td style="text-align: center; padding: 4px;">
                    <NTag :type="a.status === 'open' ? 'warning' : 'success'" size="tiny" :bordered="false">{{ a.status }}</NTag>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </NCollapseItem>
    </NCollapse>
    <NEmpty v-else-if="!loading" description="No meetings recorded" />

    <!-- Add Meeting Modal -->
    <NModal v-model:show="showModal" preset="card" title="Add Meeting" style="width: 560px;">
      <NForm label-placement="top" size="small">
        <div style="display: grid; grid-template-columns: 1fr 140px; gap: 12px;">
          <NFormItem label="Title" required><NInput v-model:value="form.title" placeholder="e.g., OAC Meeting #3" /></NFormItem>
          <NFormItem label="Type"><NSelect v-model:value="form.meetingType" :options="typeOptions" /></NFormItem>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NFormItem label="Date"><input v-model="form.meetingDate" type="date" style="width:100%; padding:6px 10px; border:1px solid var(--n-border-color, #e0e0e6); border-radius:3px; background:var(--n-color, #fff); color:inherit;" /></NFormItem>
          <NFormItem label="Time"><input v-model="form.meetingTime" type="time" style="width:100%; padding:6px 10px; border:1px solid var(--n-border-color, #e0e0e6); border-radius:3px; background:var(--n-color, #fff); color:inherit;" /></NFormItem>
        </div>
        <NFormItem label="Attendees (comma-separated)"><NInput v-model:value="form.attendees" placeholder="Damon, John Martinez" /></NFormItem>
        <NFormItem label="Agenda (one per line)"><NInput v-model:value="form.agenda" type="textarea" :rows="3" placeholder="Review timeline&#10;Budget update" /></NFormItem>
        <NFormItem label="Notes"><NInput v-model:value="form.notes" type="textarea" :rows="3" /></NFormItem>
        <NFormItem label="Action Items (task | owner | due date, one per line)"><NInput v-model:value="form.actionItems" type="textarea" :rows="3" placeholder="Submit schedule | John | 2026-04-01" /></NFormItem>
      </NForm>
      <template #action>
        <NSpace justify="end">
          <NButton @click="showModal = false">Cancel</NButton>
          <NButton type="primary" @click="submit">Add Meeting</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
