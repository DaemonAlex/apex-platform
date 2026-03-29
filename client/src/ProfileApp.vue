<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NMessageProvider, NConfigProvider, NCard, NForm, NFormItem, NInput,
  NSelect, NSwitch, NButton, NSpace, NSpin, NGrid, NGi,
  useMessage
} from 'naive-ui';
import { useTheme } from './composables/useTheme';
import { apiFetch } from './composables/useApi';

defineProps<{ userName?: string }>();

const { naiveTheme, themeOverrides } = useTheme();

// Profile state
const loading = ref(true);
const profileForm = ref({ name: '', email: '', role: '', department: '' });
const profileSaving = ref(false);
const userId = ref<number>(0);

// Password state
const passwordForm = ref({ currentPassword: '', newPassword: '', confirmPassword: '' });
const passwordSaving = ref(false);
const passwordErrors = computed(() => {
  const pw = passwordForm.value.newPassword;
  if (!pw) return [];
  const errors: string[] = [];
  if (pw.length < 12) errors.push('At least 12 characters');
  if (!/[A-Z]/.test(pw)) errors.push('One uppercase letter');
  if (!/[a-z]/.test(pw)) errors.push('One lowercase letter');
  if (!/[0-9]/.test(pw)) errors.push('One number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) errors.push('One special character');
  return errors;
});

// Preferences state
const prefs = ref({ emailNotifications: true, darkMode: false, timezone: 'America/Chicago' });
const prefsSaving = ref(false);
const timezoneOptions = [
  { label: 'Central Time (Chicago)', value: 'America/Chicago' },
  { label: 'Eastern Time (New York)', value: 'America/New_York' },
  { label: 'Mountain Time (Denver)', value: 'America/Denver' },
  { label: 'Pacific Time (Los Angeles)', value: 'America/Los_Angeles' },
];

// Late-init message (must be called inside NMessageProvider)
let msg: ReturnType<typeof useMessage> | null = null;
function initMessage() { if (!msg) msg = useMessage(); return msg; }

onMounted(async () => {
  try {
    const user = await apiFetch<any>('/users/me');
    userId.value = user.id;
    profileForm.value = {
      name: user.name || '',
      email: user.email || '',
      role: user.Role?.displayName || user.role || '',
      department: user.department || '',
    };
    const p = user.preferences || {};
    prefs.value = {
      emailNotifications: p.emailNotifications !== false,
      darkMode: document.documentElement.getAttribute('data-theme') === 'dark',
      timezone: p.timezone || 'America/Chicago',
    };
  } catch (e) {
    console.error('Failed to load profile:', e);
  } finally {
    loading.value = false;
  }
});

async function saveProfile() {
  const m = initMessage();
  profileSaving.value = true;
  try {
    await apiFetch(`/users/${userId.value}`, {
      method: 'PUT',
      body: JSON.stringify({ name: profileForm.value.name, email: profileForm.value.email, role: profileForm.value.role.toLowerCase().replace(/ /g, '_') }),
    });
    // Update monolith displays
    if ((window as any).AppState?.user) {
      (window as any).AppState.user.name = profileForm.value.name;
      (window as any).AppState.user.email = profileForm.value.email;
    }
    const dropdownName = document.getElementById('dropdownUserName');
    if (dropdownName) dropdownName.textContent = profileForm.value.name;
    m.success('Profile updated');
  } catch (e: any) {
    m.error(e.message || 'Failed to update profile');
  } finally {
    profileSaving.value = false;
  }
}

async function savePassword() {
  const m = initMessage();
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    m.error('Passwords do not match');
    return;
  }
  if (passwordErrors.value.length > 0) {
    m.error('Password does not meet requirements');
    return;
  }
  passwordSaving.value = true;
  try {
    await apiFetch(`/users/${userId.value}/password`, {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: passwordForm.value.currentPassword,
        newPassword: passwordForm.value.newPassword,
      }),
    });
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' };
    m.success('Password changed');
  } catch (e: any) {
    m.error(e.message || 'Failed to change password');
  } finally {
    passwordSaving.value = false;
  }
}

async function savePreferences() {
  const m = initMessage();
  prefsSaving.value = true;
  try {
    await apiFetch(`/users/${userId.value}/preferences`, {
      method: 'PUT',
      body: JSON.stringify(prefs.value),
    });
    // Sync dark mode
    if (prefs.value.darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('apex_theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('apex_theme', 'light');
    }
    if (typeof (window as any).updateThemeIcon === 'function') (window as any).updateThemeIcon();
    if ((window as any).AppState?.user) (window as any).AppState.user.preferences = prefs.value;
    m.success('Preferences saved');
  } catch (e: any) {
    m.error(e.message || 'Failed to save preferences');
  } finally {
    prefsSaving.value = false;
  }
}
</script>

<template>
  <NMessageProvider>
    <NConfigProvider
      :theme="naiveTheme"
      :theme-overrides="themeOverrides"
    >
      <NSpin :show="loading">
        <NGrid :x-gap="16" :y-gap="16" :cols="1">
          <!-- Personal Information -->
          <NGi>
            <NCard title="Personal Information" size="small">
              <NForm label-placement="left" label-width="120">
                <NFormItem label="Full Name">
                  <NInput v-model:value="profileForm.name" placeholder="Your name" />
                </NFormItem>
                <NFormItem label="Email">
                  <NInput v-model:value="profileForm.email" placeholder="Your email" />
                </NFormItem>
                <NFormItem label="Role">
                  <NInput :value="profileForm.role" readonly />
                </NFormItem>
              </NForm>
              <template #action>
                <NSpace justify="end">
                  <NButton type="primary" :loading="profileSaving" @click="saveProfile">Save Changes</NButton>
                </NSpace>
              </template>
            </NCard>
          </NGi>

          <!-- Change Password -->
          <NGi>
            <NCard title="Change Password" size="small">
              <NForm label-placement="left" label-width="160">
                <NFormItem label="Current Password">
                  <NInput v-model:value="passwordForm.currentPassword" type="password" show-password-on="click" placeholder="Enter current password" />
                </NFormItem>
                <NFormItem label="New Password" :validation-status="passwordForm.newPassword && passwordErrors.length > 0 ? 'error' : undefined">
                  <NInput v-model:value="passwordForm.newPassword" type="password" show-password-on="click" placeholder="Min 12 chars, upper, lower, number, special" />
                </NFormItem>
                <NFormItem label="Confirm Password" :validation-status="passwordForm.confirmPassword && passwordForm.confirmPassword !== passwordForm.newPassword ? 'error' : undefined">
                  <NInput v-model:value="passwordForm.confirmPassword" type="password" show-password-on="click" placeholder="Confirm new password" />
                </NFormItem>
              </NForm>
              <div v-if="passwordForm.newPassword && passwordErrors.length > 0" style="margin-bottom: 12px;">
                <div v-for="err in passwordErrors" :key="err" style="color: #f87171; font-size: 12px; margin-bottom: 2px;">- {{ err }}</div>
              </div>
              <template #action>
                <NSpace justify="end">
                  <NButton type="primary" :loading="passwordSaving" :disabled="!passwordForm.currentPassword || !passwordForm.newPassword || passwordErrors.length > 0 || passwordForm.newPassword !== passwordForm.confirmPassword" @click="savePassword">Change Password</NButton>
                </NSpace>
              </template>
            </NCard>
          </NGi>

          <!-- Preferences -->
          <NGi>
            <NCard title="Preferences" size="small">
              <NForm label-placement="left" label-width="180">
                <NFormItem label="Email Notifications">
                  <NSwitch v-model:value="prefs.emailNotifications" />
                </NFormItem>
                <NFormItem label="Dark Mode">
                  <NSwitch v-model:value="prefs.darkMode" />
                </NFormItem>
                <NFormItem label="Timezone">
                  <NSelect v-model:value="prefs.timezone" :options="timezoneOptions" style="width: 280px;" />
                </NFormItem>
              </NForm>
              <template #action>
                <NSpace justify="end">
                  <NButton type="primary" :loading="prefsSaving" @click="savePreferences">Save Preferences</NButton>
                </NSpace>
              </template>
            </NCard>
          </NGi>
        </NGrid>
      </NSpin>
    </NConfigProvider>
  </NMessageProvider>
</template>
