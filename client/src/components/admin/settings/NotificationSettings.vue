<script setup lang="ts">
import { ref, watch } from 'vue';
import { NForm, NFormItem, NSwitch, NButton, NSpace, useMessage } from 'naive-ui';
import { useAdminStore } from '../../../stores/admin';

const store = useAdminStore();
const message = useMessage();
const saving = ref(false);

const form = ref({
  projectStatusChanges: true,
  taskAssignments: true,
  dailySummaries: false,
  weeklyReports: true,
});

watch(() => store.settings, (s) => {
  if (s.notifications && typeof s.notifications === 'object') {
    Object.assign(form.value, s.notifications);
  }
}, { immediate: true });

async function save() {
  saving.value = true;
  try {
    await store.saveSetting('notifications', form.value);
    message.success('Notification settings saved');
  } catch (e: any) {
    message.error(e.message || 'Failed to save');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div style="max-width: 560px; padding-top: 12px;">
    <NForm label-placement="left" label-width="200">
      <NFormItem label="Project status changes">
        <NSwitch v-model:value="form.projectStatusChanges" />
      </NFormItem>
      <NFormItem label="Task assignments">
        <NSwitch v-model:value="form.taskAssignments" />
      </NFormItem>
      <NFormItem label="Daily summaries">
        <NSwitch v-model:value="form.dailySummaries" />
      </NFormItem>
      <NFormItem label="Weekly reports">
        <NSwitch v-model:value="form.weeklyReports" />
      </NFormItem>
    </NForm>
    <NSpace justify="end" style="margin-top: 16px;">
      <NButton type="primary" :loading="saving" @click="save">Save Notifications</NButton>
    </NSpace>
  </div>
</template>
