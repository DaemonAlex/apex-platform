<script setup lang="ts">
import { ref } from 'vue';
import { NTabs, NTabPane, NSpin } from 'naive-ui';
import { useAdminStore } from '../../stores/admin';
import GeneralSettings from './settings/GeneralSettings.vue';
import NotificationSettings from './settings/NotificationSettings.vue';
import DatabaseSettings from './settings/DatabaseSettings.vue';
import FinancialSettings from './settings/FinancialSettings.vue';
import IntegrationsSettings from './settings/IntegrationsSettings.vue';

const store = useAdminStore();
const activeSubTab = ref('general');
</script>

<template>
  <NSpin :show="store.settingsLoading">
    <NTabs type="line" :value="activeSubTab" @update:value="(v: string) => activeSubTab = v">
      <NTabPane name="general" tab="General">
        <GeneralSettings />
      </NTabPane>
      <NTabPane name="notifications" tab="Notifications">
        <NotificationSettings />
      </NTabPane>
      <NTabPane name="database" tab="Database">
        <DatabaseSettings />
      </NTabPane>
      <NTabPane name="financial" tab="Financial">
        <FinancialSettings />
      </NTabPane>
      <NTabPane name="integrations" tab="Integrations">
        <IntegrationsSettings />
      </NTabPane>
    </NTabs>
  </NSpin>
</template>
