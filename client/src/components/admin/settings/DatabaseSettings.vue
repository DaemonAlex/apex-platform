<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NForm, NFormItem, NInput, NInputNumber, NSelect, NButton, NSpace,
  NAlert, NCollapse, NCollapseItem, useMessage
} from 'naive-ui';
import { apiFetch } from '../../../composables/useApi';

const message = useMessage();

const form = ref({
  dialect: 'mariadb',
  host: 'localhost',
  port: 3306,
  database: '',
  user: '',
  password: '',
});

const dbTypeOptions = [
  { label: 'MariaDB / MySQL', value: 'mariadb' },
  { label: 'SQL Server', value: 'mssql' },
];

const testResult = ref<{ success: boolean; message: string } | null>(null);
const saving = ref(false);
const testing = ref(false);
const loadError = ref('');

// MariaDB user creation
const mariaForm = ref({ rootUser: '', rootPassword: '', newUser: '', newPassword: '' });
const mariaCreating = ref(false);

onMounted(async () => {
  try {
    const data = await apiFetch<any>('/admin/db/config');
    if (data) {
      form.value.dialect = data.dialect || 'mariadb';
      form.value.host = data.host || 'localhost';
      form.value.port = data.port || 3306;
      form.value.database = data.database || '';
      form.value.user = data.user || '';
      // Don't overwrite password with mask - leave blank so user can enter new one
      if (data.password && data.password !== '********') {
        form.value.password = data.password;
      }
    }
    loadError.value = '';
  } catch {
    loadError.value = 'Database configuration endpoint is not available. Settings shown are local defaults.';
  }
});

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const data = await apiFetch<{ success: boolean; message: string }>('/admin/db/test', {
      method: 'POST',
      body: JSON.stringify(form.value),
    });
    testResult.value = data;
  } catch (e: any) {
    testResult.value = { success: false, message: e.message || 'Connection test failed' };
  } finally {
    testing.value = false;
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    await apiFetch('/admin/db/config', { method: 'PUT', body: JSON.stringify(form.value) });
    message.success('Database config saved');
  } catch (e: any) {
    message.error(e.message || 'Failed to save database config');
  } finally {
    saving.value = false;
  }
}

async function createMariaUser() {
  mariaCreating.value = true;
  try {
    await apiFetch('/admin/db/create-mariadb-user', {
      method: 'POST',
      body: JSON.stringify(mariaForm.value),
    });
    message.success('MariaDB user created');
    mariaForm.value = { rootUser: '', rootPassword: '', newUser: '', newPassword: '' };
  } catch (e: any) {
    message.error(e.message || 'Failed to create MariaDB user');
  } finally {
    mariaCreating.value = false;
  }
}
</script>

<template>
  <div style="max-width: 560px; padding-top: 12px;">
    <NAlert v-if="loadError" type="warning" style="margin-bottom: 16px;">{{ loadError }}</NAlert>

    <NForm label-placement="left" label-width="120">
      <NFormItem label="Database Type">
        <NSelect v-model:value="form.dialect" :options="dbTypeOptions" />
      </NFormItem>
      <NFormItem label="Host">
        <NInput v-model:value="form.host" placeholder="localhost" />
      </NFormItem>
      <NFormItem label="Port">
        <NInputNumber v-model:value="form.port" :min="1" :max="65535" />
      </NFormItem>
      <NFormItem label="Database">
        <NInput v-model:value="form.database" placeholder="Database name" />
      </NFormItem>
      <NFormItem label="Username">
        <NInput v-model:value="form.user" placeholder="Database username" />
      </NFormItem>
      <NFormItem label="Password">
        <NInput v-model:value="form.password" type="password" show-password-on="click" placeholder="Database password" />
      </NFormItem>
    </NForm>

    <NSpace style="margin-top: 12px;">
      <NButton :loading="testing" secondary @click="testConnection">Test Connection</NButton>
      <NButton type="primary" :loading="saving" @click="saveConfig">Save DB Config</NButton>
    </NSpace>

    <NAlert
      v-if="testResult"
      :type="testResult.success ? 'success' : 'error'"
      style="margin-top: 12px;"
    >{{ testResult.message }}</NAlert>

    <NCollapse style="margin-top: 24px;">
      <NCollapseItem title="Create MariaDB App User (Advanced)" name="mariadb">
        <NForm label-placement="left" label-width="140">
          <NFormItem label="Root Username">
            <NInput v-model:value="mariaForm.rootUser" placeholder="root" />
          </NFormItem>
          <NFormItem label="Root Password">
            <NInput v-model:value="mariaForm.rootPassword" type="password" show-password-on="click" placeholder="Root password" />
          </NFormItem>
          <NFormItem label="New Username">
            <NInput v-model:value="mariaForm.newUser" placeholder="app_user" />
          </NFormItem>
          <NFormItem label="New Password">
            <NInput v-model:value="mariaForm.newPassword" type="password" show-password-on="click" placeholder="New user password" />
          </NFormItem>
        </NForm>
        <NSpace style="margin-top: 8px;">
          <NButton :loading="mariaCreating" type="warning" secondary @click="createMariaUser">Create User</NButton>
        </NSpace>
      </NCollapseItem>
    </NCollapse>

    <NAlert type="info" style="margin-top: 16px;">
      Changes to database settings require restarting the backend service.
    </NAlert>
  </div>
</template>
