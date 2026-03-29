<script setup lang="ts">
import {
  NConfigProvider, NLayout, NLayoutSider, NMenu, NLayoutContent,
  NCard, NInput, NButton, NSpace, NMessageProvider,
} from 'naive-ui';
import { h, computed, ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth';
import type { MenuOption } from 'naive-ui';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const loginEmail = ref('');
const loginPassword = ref('');
const loginLoading = ref(false);
const loginError = ref('');

onMounted(() => {
  auth.restoreSession();
});

async function handleLogin() {
  loginError.value = '';
  loginLoading.value = true;
  try {
    await auth.login(loginEmail.value, loginPassword.value);
  } catch (e: any) {
    loginError.value = e.message || 'Login failed';
  } finally {
    loginLoading.value = false;
  }
}

const activeKey = computed(() => {
  if (route.path.startsWith('/rooms/locations')) return 'locations';
  if (route.path.startsWith('/rooms')) return 'rooms';
  return 'rooms';
});

const menuOptions: MenuOption[] = [
  {
    label: 'All Rooms',
    key: 'rooms',
    icon: () => h('i', { class: 'ph ph-monitor' }),
  },
  {
    label: 'Locations',
    key: 'locations',
    icon: () => h('i', { class: 'ph ph-buildings' }),
  },
];

function handleMenuSelect(key: string) {
  if (key === 'rooms') router.push('/rooms');
  else if (key === 'locations') router.push('/rooms/locations');
}
</script>

<template>
  <NMessageProvider>
    <NConfigProvider>
      <!-- Login Screen -->
      <div v-if="!auth.isLoggedIn" style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #f1f5f9;">
        <NCard style="width: 380px;" title="APEX Platform">
          <form @submit.prevent="handleLogin">
            <NSpace vertical :size="16">
              <div v-if="loginError" style="color: #ef4444; font-size: 0.9rem; padding: 8px 12px; background: #fef2f2; border-radius: 6px;">
                {{ loginError }}
              </div>
              <NInput v-model:value="loginEmail" placeholder="Email" size="large" autofocus />
              <NInput v-model:value="loginPassword" placeholder="Password" type="password" size="large" @keyup.enter="handleLogin" />
              <NButton type="primary" block size="large" :loading="loginLoading" @click="handleLogin">
                Sign In
              </NButton>
            </NSpace>
          </form>
        </NCard>
      </div>

      <!-- App Shell -->
      <NLayout v-else has-sider style="height: 100vh">
        <NLayoutSider
          bordered
          :width="220"
          content-style="padding: 16px 0; display: flex; flex-direction: column; height: 100%;"
        >
          <div style="padding: 16px 20px 24px;">
            <div style="font-size: 1.1rem; font-weight: 700; color: #0ea5e9;">APEX Rooms</div>
            <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 2px;">{{ auth.user?.name }}</div>
          </div>
          <NMenu
            :options="menuOptions"
            :value="activeKey"
            @update:value="handleMenuSelect"
          />
          <div style="margin-top: auto; padding: 16px 20px;">
            <NButton size="small" quaternary block @click="auth.logout()">
              <i class="ph ph-sign-out" style="margin-right: 4px;" /> Sign Out
            </NButton>
          </div>
        </NLayoutSider>
        <NLayoutContent content-style="padding: 24px; overflow-y: auto;">
          <router-view />
        </NLayoutContent>
      </NLayout>
    </NConfigProvider>
  </NMessageProvider>
</template>

<style>
@import url('https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css');
@import url('https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css');

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
</style>
