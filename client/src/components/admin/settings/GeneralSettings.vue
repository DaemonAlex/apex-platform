<script setup lang="ts">
import { ref, watch } from 'vue';
import { NForm, NFormItem, NInput, NSelect, NInputNumber, NButton, NSpace, useMessage } from 'naive-ui';
import { useAdminStore } from '../../../stores/admin';

const store = useAdminStore();
const message = useMessage();
const saving = ref(false);

const form = ref({
  companyName: '',
  defaultProjectStatus: 'Active',
  sessionTimeout: 30,
});

const statusOptions = [
  { label: 'Not Started', value: 'Not Started' },
  { label: 'Planning', value: 'Planning' },
  { label: 'Active', value: 'Active' },
];

watch(() => store.settings, (s) => {
  if (s.companyName) form.value.companyName = typeof s.companyName === 'string' ? s.companyName : s.companyName;
  if (s.defaultProjectStatus) form.value.defaultProjectStatus = s.defaultProjectStatus;
  if (s.sessionTimeout) form.value.sessionTimeout = Number(s.sessionTimeout) || 30;
}, { immediate: true });

async function save() {
  saving.value = true;
  try {
    await store.saveSetting('companyName', form.value.companyName);
    await store.saveSetting('defaultProjectStatus', form.value.defaultProjectStatus);
    await store.saveSetting('sessionTimeout', form.value.sessionTimeout);
    message.success('General settings saved');
  } catch (e: any) {
    message.error(e.message || 'Failed to save settings');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div style="max-width: 560px; padding-top: 12px;">
    <NForm label-placement="left" label-width="160">
      <NFormItem label="Company Name">
        <NInput v-model:value="form.companyName" placeholder="Enter company name" />
      </NFormItem>
      <NFormItem label="Default Project Status">
        <NSelect v-model:value="form.defaultProjectStatus" :options="statusOptions" />
      </NFormItem>
      <NFormItem label="Session Timeout (min)">
        <NInputNumber v-model:value="form.sessionTimeout" :min="5" :max="480" />
      </NFormItem>
    </NForm>
    <NSpace justify="end" style="margin-top: 16px;">
      <NButton type="primary" :loading="saving" @click="save">Save Settings</NButton>
    </NSpace>
  </div>
</template>
