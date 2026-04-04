<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  NCard, NSpace, NButton, NInput, NSwitch, NTag, NGrid, NGi,
  NSpin, NAlert, createDiscreteApi,
} from 'naive-ui';
import { useTheme } from '../../../composables/useTheme';
import { apiFetch } from '../../../composables/useApi';

const { message: msg } = createDiscreteApi(['message']);
const { colors } = useTheme();

const loading = ref(true);
const saving = ref(false);
const testing = ref(false);

const config = ref({
  mockMode: true,
  hasToken: false,
  tokenPreview: null as string | null,
  orgId: null as string | null,
});

const newToken = ref('');
const showToken = ref(false);
const pendingMockMode = ref(true);

async function loadConfig() {
  loading.value = true;
  try {
    const data = await apiFetch<any>('/cisco/config');
    config.value = data;
    pendingMockMode.value = data.mockMode;
  } finally { loading.value = false; }
}

async function saveToken() {
  if (!newToken.value.trim()) { msg.error('Paste a token first'); return; }
  saving.value = true;
  try {
    const data = await apiFetch<any>('/cisco/config', {
      method: 'POST',
      body: JSON.stringify({ personalToken: newToken.value.trim() }),
    });
    config.value = { ...config.value, hasToken: data.hasToken, tokenPreview: data.tokenPreview };
    newToken.value = '';
    showToken.value = false;
    msg.success('Token saved - takes effect immediately for live API calls');
  } catch (e: any) { msg.error(e.message || 'Failed to save token'); }
  finally { saving.value = false; }
}

async function clearToken() {
  saving.value = true;
  try {
    await apiFetch<any>('/cisco/config', {
      method: 'POST',
      body: JSON.stringify({ personalToken: '' }),
    });
    config.value = { ...config.value, hasToken: false, tokenPreview: null };
    msg.success('Token cleared');
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { saving.value = false; }
}

async function saveMockMode(val: boolean) {
  pendingMockMode.value = val;
  saving.value = true;
  try {
    const data = await apiFetch<any>('/cisco/config', {
      method: 'POST',
      body: JSON.stringify({ mockMode: val }),
    });
    config.value = { ...config.value, mockMode: data.mockMode };
    msg.success(val
      ? 'Mock mode enabled - restart backend to apply'
      : 'Live mode enabled - restart backend to apply'
    );
  } catch (e: any) { msg.error(e.message || 'Failed'); }
  finally { saving.value = false; }
}

async function testConnection() {
  testing.value = true;
  try {
    const data = await apiFetch<any>('/cisco/status');
    if (data.connected || data.mock) {
      msg.success(data.mock ? 'Mock mode active - 41 devices available' : 'Connected to Cisco Webex API');
    } else {
      msg.error('Connection failed - check token and org ID');
    }
  } catch (e: any) { msg.error('Test failed: ' + e.message); }
  finally { testing.value = false; }
}

onMounted(loadConfig);
</script>

<template>
<NSpin :show="loading">
<div style="max-width: 720px;">

  <!-- Status banner -->
  <NAlert
    :type="config.mockMode ? 'info' : (config.hasToken ? 'success' : 'warning')"
    style="margin-bottom: 20px;"
    :show-icon="true"
  >
    <template #header>
      {{ config.mockMode ? 'Mock Mode Active' : config.hasToken ? 'Live API Connected' : 'Live Mode - No Token Configured' }}
    </template>
    <span v-if="config.mockMode">
      The simulation runs on built-in demo data (41 devices, 29 spaces, 4 locations). No Cisco credentials are needed and nothing expires. Safe to demo at any time.
    </span>
    <span v-else-if="config.hasToken">
      Using a personal access token to call the real Cisco Webex API. Personal tokens expire every <strong>12 hours</strong> - paste a fresh one below when it expires.
    </span>
    <span v-else>
      Live mode is on but no token is configured. Paste a personal access token below, or switch back to mock mode.
    </span>
  </NAlert>

  <!-- Mock mode toggle -->
  <NCard size="small" style="margin-bottom: 16px;">
    <NSpace justify="space-between" align="center">
      <div>
        <div style="font-weight: 600; margin-bottom: 2px;">Demo / Mock Mode</div>
        <div :style="{ fontSize: '0.82rem', color: colors.textMuted }">
          Uses built-in simulation data. Safe for demos - no token needed, never expires.
        </div>
      </div>
      <NSwitch
        :value="pendingMockMode"
        :loading="saving"
        :disabled="saving"
        @update:value="saveMockMode"
      />
    </NSpace>
  </NCard>

  <!-- Token management -->
  <NCard size="small" style="margin-bottom: 16px;">
    <div style="font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
      Personal Access Token
      <NTag v-if="config.hasToken" type="success" size="small" round>Configured</NTag>
      <NTag v-else type="default" size="small" round>Not set</NTag>
    </div>

    <!-- Current token preview -->
    <div v-if="config.hasToken" style="margin-bottom: 12px;">
      <div :style="{ fontSize: '0.82rem', color: colors.textMuted, marginBottom: '4px' }">Current token:</div>
      <NSpace align="center">
        <code :style="{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '4px' }">
          {{ config.tokenPreview }}
        </code>
        <NButton size="tiny" ghost type="error" :loading="saving" @click="clearToken">Clear</NButton>
      </NSpace>
    </div>

    <!-- Paste new token -->
    <div :style="{ fontSize: '0.82rem', color: colors.textMuted, marginBottom: '8px' }">
      Get a fresh token at
      <strong>developer.webex.com</strong> - sign in, scroll to "Personal Access Token", copy it.
      Tokens last 12 hours.
    </div>
    <NSpace vertical style="width: 100%;">
      <NInput
        v-model:value="newToken"
        :type="showToken ? 'text' : 'password'"
        placeholder="Paste token here..."
        clearable
        :show-password-on="showToken ? 'mousedown' : undefined"
        style="font-family: monospace; font-size: 0.82rem;"
      />
      <NSpace>
        <NButton type="primary" :loading="saving" :disabled="!newToken.trim()" @click="saveToken">
          <i class="ph ph-floppy-disk" style="margin-right: 4px;" />Save Token
        </NButton>
        <NButton :secondary="true" size="small" @click="showToken = !showToken">
          <i :class="showToken ? 'ph ph-eye-slash' : 'ph ph-eye'" style="margin-right: 4px;" />
          {{ showToken ? 'Hide' : 'Show' }}
        </NButton>
        <NButton :secondary="true" size="small" :loading="testing" @click="testConnection">
          <i class="ph ph-plugs-connected" style="margin-right: 4px;" />Test Connection
        </NButton>
      </NSpace>
    </NSpace>
  </NCard>

  <!-- Quick reference -->
  <NCard size="small">
    <div style="font-weight: 600; margin-bottom: 12px;">Token Expiry Reference</div>
    <NGrid :cols="2" :x-gap="12" :y-gap="8">
      <NGi v-for="item in [
        { label: 'Personal Access Token', value: '12 hours', color: '#f59e0b', note: 'Paste new one from developer.webex.com' },
        { label: 'APEX Login Session', value: '7 days', color: '#22c55e', note: 'Auto-extended on each login' },
        { label: 'Mock Mode (demo)', value: 'Never expires', color: '#0ea5e9', note: 'Safe for leadership demos' },
        { label: 'OAuth Service App', value: 'Auto-refreshes', color: '#8b5cf6', note: 'Requires Control Hub org admin' },
      ]" :key="item.label">
        <div style="display: flex; gap: 10px; align-items: flex-start;">
          <div :style="{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: '0', marginTop: '5px' }" />
          <div>
            <div style="font-size: 0.85rem; font-weight: 500;">{{ item.label }}</div>
            <div :style="{ fontSize: '0.78rem', color: item.color, fontWeight: '600' }">{{ item.value }}</div>
            <div :style="{ fontSize: '0.75rem', color: colors.textMuted }">{{ item.note }}</div>
          </div>
        </div>
      </NGi>
    </NGrid>
  </NCard>

</div>
</NSpin>
</template>
