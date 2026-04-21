import { ref } from 'vue';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Legacy localStorage token helpers — kept during the P1-1 rollout so any
// code still reading `apex_token` keeps working. After the cookie migration
// stabilizes (every app flow verified), these become no-ops and get deleted.
function getToken(): string | null {
  return localStorage.getItem('apex_token');
}

export function setToken(token: string) {
  localStorage.setItem('apex_token', token);
}

export function clearToken() {
  localStorage.removeItem('apex_token');
}

// Read the CSRF double-submit cookie set by the backend on login/refresh.
// Returns null if the cookie isn't present (e.g. unauthenticated).
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )apex_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Call the refresh endpoint. Returns true if a new access cookie was issued.
async function refreshSession(): Promise<boolean> {
  const csrf = getCsrfToken();
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

// apiFetch — P1-1 2026-04-18. Cookies are primary (credentials: 'include').
// The Authorization header is still attached from localStorage so legacy
// Bearer-token flows keep working during the rollout. On a 401, we try to
// refresh the session once, then retry. Fail-fast for any other non-OK.
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await doFetch(path, options);
  if (res.status === 401) {
    const ok = await refreshSession();
    if (ok) {
      const retry = await doFetch(path, options);
      if (!retry.ok) {
        const body = await retry.json().catch(() => ({}));
        throw new Error(body.error || `API error: ${retry.status}`);
      }
      return retry.json();
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error: ${res.status}`);
  }
  return res.json();
}

async function doFetch(path: string, options: RequestInit): Promise<Response> {
  const token = getToken();
  const csrf = getCsrfToken();
  const isMutating = options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase());
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isMutating && csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...(options.headers as Record<string, string> || {}),
  };
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
}

// Fetch a binary resource and trigger a file download. Cookies are sent
// automatically via credentials: 'include' so no query-param token leak.
export async function downloadAuthenticated(path: string, filename?: string): Promise<void> {
  const token = getToken();
  const url = path.startsWith('http') ? path : `${API_BASE}${path.replace(/^\/api/, '')}`;
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      ...(token ? { 'x-auth-token': token, Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Download failed: ${res.status}`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || inferFilename(res, path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

function inferFilename(res: Response, path: string): string {
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
  if (match) return decodeURIComponent(match[1]);
  const last = path.split('?')[0].split('/').pop() || 'download';
  return last;
}

// Call on explicit logout — revokes the refresh token server-side and
// clears all cookies. Also clears the legacy localStorage token.
export async function logout(): Promise<void> {
  const csrf = getCsrfToken();
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
  } catch {
    // Best-effort — clear client state even if the network call fails.
  }
  clearToken();
}

// Composable for loading states
export function useApiCall<T>(fn: () => Promise<T>) {
  const data = ref<T | null>(null) as any;
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function execute() {
    loading.value = true;
    error.value = null;
    try {
      data.value = await fn();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  return { data, loading, error, execute };
}
