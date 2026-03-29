import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiFetch, setToken, clearToken } from '../composables/useApi';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<{ id: number; name: string; email: string; role: string } | null>(null);
  const isLoggedIn = computed(() => !!user.value);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    user.value = data.user;
    // Persist user info for page refresh
    localStorage.setItem('apex_user', JSON.stringify(data.user));
  }

  function logout() {
    clearToken();
    user.value = null;
    localStorage.removeItem('apex_user');
  }

  function restoreSession(): boolean {
    const token = localStorage.getItem('apex_token');
    const savedUser = localStorage.getItem('apex_user');
    if (token && savedUser) {
      try {
        user.value = JSON.parse(savedUser);
        return true;
      } catch { /* invalid JSON */ }
    }
    return false;
  }

  return { user, isLoggedIn, login, logout, restoreSession };
});
