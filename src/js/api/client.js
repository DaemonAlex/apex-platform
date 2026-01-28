/**
 * APEX API Client
 * Centralized API handler with authentication, error handling, and request management
 *
 * Security Features:
 * - Automatic token injection from secure storage
 * - Request/response interceptors
 * - Consistent error handling
 * - Request timeout management
 */

const API_BASE = '/api';
const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Custom API Error class for consistent error handling
 */
export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Token management - centralized auth token handling
 * TODO: Migrate to httpOnly cookies for production security
 */
const TokenManager = {
  getToken() {
    return localStorage.getItem('token');
  },

  setToken(token) {
    localStorage.setItem('token', token);
  },

  clearToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  },

  isAuthenticated() {
    const token = this.getToken();
    if (!token) return false;

    // Basic JWT expiration check
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }
};

/**
 * Core fetch wrapper with timeout and error handling
 */
async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Build request headers with auth token
 */
function buildHeaders(customHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...customHeaders
  };

  const token = TokenManager.getToken();
  if (token) {
    headers['x-auth-token'] = token;
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Handle API response - parse JSON and handle errors
 */
async function handleResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    // Handle 401 - unauthorized (token expired)
    if (response.status === 401) {
      TokenManager.clearToken();
      // Dispatch event for UI to handle
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    throw new ApiError(
      data?.error || data?.message || response.statusText || 'Request failed',
      response.status,
      data
    );
  }

  return data;
}

/**
 * Main API client object
 */
export const api = {
  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    const response = await fetchWithTimeout(
      `${API_BASE}${endpoint}`,
      {
        method: 'GET',
        headers: buildHeaders(options.headers),
        ...options
      },
      options.timeout || DEFAULT_TIMEOUT
    );
    return handleResponse(response);
  },

  /**
   * POST request
   */
  async post(endpoint, body = {}, options = {}) {
    const response = await fetchWithTimeout(
      `${API_BASE}${endpoint}`,
      {
        method: 'POST',
        headers: buildHeaders(options.headers),
        body: JSON.stringify(body),
        ...options
      },
      options.timeout || DEFAULT_TIMEOUT
    );
    return handleResponse(response);
  },

  /**
   * PUT request
   */
  async put(endpoint, body = {}, options = {}) {
    const response = await fetchWithTimeout(
      `${API_BASE}${endpoint}`,
      {
        method: 'PUT',
        headers: buildHeaders(options.headers),
        body: JSON.stringify(body),
        ...options
      },
      options.timeout || DEFAULT_TIMEOUT
    );
    return handleResponse(response);
  },

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    const response = await fetchWithTimeout(
      `${API_BASE}${endpoint}`,
      {
        method: 'DELETE',
        headers: buildHeaders(options.headers),
        ...options
      },
      options.timeout || DEFAULT_TIMEOUT
    );
    return handleResponse(response);
  },

  /**
   * Upload file (multipart/form-data)
   */
  async upload(endpoint, formData, options = {}) {
    const headers = {};
    const token = TokenManager.getToken();
    if (token) {
      headers['x-auth-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't set Content-Type - let browser set it with boundary

    const response = await fetchWithTimeout(
      `${API_BASE}${endpoint}`,
      {
        method: 'POST',
        headers,
        body: formData,
        ...options
      },
      options.timeout || 120000 // 2 min for uploads
    );
    return handleResponse(response);
  }
};

/**
 * Domain-specific API endpoints
 */
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, email, newPassword) =>
    api.post('/auth/reset-password', { token, email, newPassword }),
  logout: () => {
    TokenManager.clearToken();
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }
};

export const projectsApi = {
  getAll: () => api.get('/projects'),
  getOne: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),

  // Tasks
  getTasks: (projectId) => api.get(`/projects/${projectId}/tasks`),
  addTask: (projectId, task) => api.post(`/projects/${projectId}/tasks`, task),
  updateTask: (projectId, taskId, data) =>
    api.put(`/projects/${projectId}/tasks/${taskId}`, data),
  deleteTask: (projectId, taskId) =>
    api.delete(`/projects/${projectId}/tasks/${taskId}`)
};

export const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id) => api.get(`/users/${id}`),
  getCurrent: () => api.get('/users/me'),
  update: (id, data) => api.put(`/users/${id}`, data),
  updatePreferences: (id, preferences) =>
    api.put(`/users/${id}/preferences`, { preferences })
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`)
};

export const attachmentsApi = {
  upload: (projectId, taskId, formData) =>
    api.upload(`/attachments/${projectId}/${taskId}`, formData),
  getForTask: (projectId, taskId) =>
    api.get(`/attachments/${projectId}/${taskId}`),
  delete: (attachmentId) => api.delete(`/attachments/${attachmentId}`)
};

// Export token manager for auth module
export { TokenManager };

// Default export for convenience
export default api;
