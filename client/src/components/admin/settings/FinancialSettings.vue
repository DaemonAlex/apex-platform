<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  NForm, NFormItem, NInputNumber, NSelect, NButton, NSpace, NGrid, NGi, NCard, useMessage
} from 'naive-ui';
import { useAdminStore } from '../../../stores/admin';

const store = useAdminStore();
const message = useMessage();
const saving = ref(false);

const form = ref({
  breakfixBudget: 1000000,
  breakfixWarningThreshold: 80,
  refreshBudget: 2000000,
  refreshWarningThreshold: 80,
  budgetReportingPeriod: 'annual',
  currencyFormat: 'USD',
});

const periodOptions = [
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Annual', value: 'annual' },
];

const currencyOptions = [
  { label: 'USD ($)', value: 'USD' },
  { label: 'EUR (\u20AC)', value: 'EUR' },
  { label: 'GBP (\u00A3)', value: 'GBP' },
];

watch(() => store.settings, (s) => {
  const keys = ['breakfixBudget', 'breakfixWarningThreshold', 'refreshBudget', 'refreshWarningThreshold', 'budgetReportingPeriod', 'currencyFormat'];
  keys.forEach(k => {
    if (s[k] !== undefined) (form.value as any)[k] = s[k];
  });
}, { immediate: true });

async function save() {
  saving.value = true;
  try {
    for (const [key, value] of Object.entries(form.value)) {
      await store.saveSetting(key, value);
    }
    message.success('Financial settings saved');
  } catch (e: any) {
    message.error(e.message || 'Failed to save financial settings');
  } finally {
    saving.value = false;
  }
}

function reset() {
  form.value = {
    breakfixBudget: 1000000,
    breakfixWarningThreshold: 80,
    refreshBudget: 2000000,
    refreshWarningThreshold: 80,
    budgetReportingPeriod: 'annual',
    currencyFormat: 'USD',
  };
}
</script>

<template>
  <div style="padding-top: 12px;">
    <NGrid :x-gap="16" :y-gap="16" :cols="2" responsive="screen" :item-responsive="true">
      <NGi span="2 m:1">
        <NCard title="Breakfix Budget" size="small">
          <NForm label-placement="left" label-width="160">
            <NFormItem label="Annual Budget">
              <NInputNumber
                v-model:value="form.breakfixBudget"
                :min="0"
                :step="10000"
                :show-button="true"
                style="width: 100%;"
              >
                <template #prefix>$</template>
              </NInputNumber>
            </NFormItem>
            <NFormItem label="Warning Threshold">
              <NInputNumber v-model:value="form.breakfixWarningThreshold" :min="0" :max="100" style="width: 100%;">
                <template #suffix>%</template>
              </NInputNumber>
            </NFormItem>
          </NForm>
        </NCard>
      </NGi>

      <NGi span="2 m:1">
        <NCard title="Refresh Budget" size="small">
          <NForm label-placement="left" label-width="160">
            <NFormItem label="Annual Budget">
              <NInputNumber
                v-model:value="form.refreshBudget"
                :min="0"
                :step="10000"
                :show-button="true"
                style="width: 100%;"
              >
                <template #prefix>$</template>
              </NInputNumber>
            </NFormItem>
            <NFormItem label="Warning Threshold">
              <NInputNumber v-model:value="form.refreshWarningThreshold" :min="0" :max="100" style="width: 100%;">
                <template #suffix>%</template>
              </NInputNumber>
            </NFormItem>
          </NForm>
        </NCard>
      </NGi>

      <NGi span="2">
        <NCard title="Reporting" size="small">
          <NForm label-placement="left" label-width="160">
            <NFormItem label="Reporting Period">
              <NSelect v-model:value="form.budgetReportingPeriod" :options="periodOptions" style="width: 200px;" />
            </NFormItem>
            <NFormItem label="Currency">
              <NSelect v-model:value="form.currencyFormat" :options="currencyOptions" style="width: 200px;" />
            </NFormItem>
          </NForm>
        </NCard>
      </NGi>
    </NGrid>

    <NSpace justify="end" style="margin-top: 16px;">
      <NButton secondary @click="reset">Reset to Defaults</NButton>
      <NButton type="primary" :loading="saving" @click="save">Save Financial Settings</NButton>
    </NSpace>
  </div>
</template>
