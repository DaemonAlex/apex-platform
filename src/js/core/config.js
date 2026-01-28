/**
 * APEX Application Configuration
 * Centralized configuration constants
 */

export const CONFIG = {
  // API Configuration
  API_BASE_URL: '/api',
  API_TIMEOUT: 30000, // 30 seconds
  UPLOAD_TIMEOUT: 120000, // 2 minutes for file uploads

  // Authentication
  TOKEN_KEY: 'token',
  REFRESH_TOKEN_KEY: 'refreshToken',
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000, // 5 minutes before expiry

  // Project IDs
  PROJECT_ID_PREFIX: 'WTB_',

  // Pagination
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,

  // File Uploads
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.pdf'],

  // UI
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 5000,
  ANIMATION_DURATION: 200,

  // Charts
  CHART_COLORS: {
    primary: '#3b82f6',
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    gray: '#6b7280'
  },

  // RAG Status Colors
  RAG_COLORS: {
    green: '#22c55e',
    yellow: '#f59e0b',
    red: '#ef4444',
    gray: '#9ca3af'
  },

  // Project Phases
  PROJECT_PHASES: [
    { id: 1, name: 'Pre-installation - Logistics' },
    { id: 2, name: 'Pre-Installation - AV Setup' },
    { id: 3, name: 'Post-Installation Commissioning' },
    { id: 4, name: 'Post-Installation - Logistics' }
  ],

  // Project Statuses
  PROJECT_STATUSES: [
    { value: 'active', label: 'Active', color: 'green' },
    { value: 'on-hold', label: 'On Hold', color: 'yellow' },
    { value: 'completed', label: 'Completed', color: 'blue' },
    { value: 'cancelled', label: 'Cancelled', color: 'red' }
  ],

  // Task Priorities
  TASK_PRIORITIES: [
    { value: 'low', label: 'Low', color: 'gray' },
    { value: 'medium', label: 'Medium', color: 'yellow' },
    { value: 'high', label: 'High', color: 'orange' },
    { value: 'critical', label: 'Critical', color: 'red' }
  ],

  // User Roles
  USER_ROLES: [
    { value: 'superadmin', label: 'Super Admin', level: 100 },
    { value: 'admin', label: 'Admin', level: 80 },
    { value: 'project_manager', label: 'Project Manager', level: 60 },
    { value: 'field_ops', label: 'Field Operations', level: 40 },
    { value: 'auditor', label: 'Auditor', level: 20 },
    { value: 'user', label: 'User', level: 10 }
  ],

  // Date Formats
  DATE_FORMAT: {
    display: { year: 'numeric', month: 'short', day: 'numeric' },
    input: 'YYYY-MM-DD',
    api: 'ISO'
  }
};

/**
 * Environment detection
 */
export const ENV = {
  isDevelopment: import.meta.env?.DEV ?? window.location.hostname === 'localhost',
  isProduction: import.meta.env?.PROD ?? window.location.hostname !== 'localhost',
  mode: import.meta.env?.MODE ?? 'development'
};

/**
 * Feature flags
 * Enable/disable features for gradual rollout
 */
export const FEATURES = {
  // New modular API client
  USE_NEW_API_CLIENT: true,

  // New state management
  USE_NEW_STATE: true, // Phase 3 enabled

  // Debug mode
  DEBUG_MODE: ENV.isDevelopment,

  // Show console logs
  VERBOSE_LOGGING: ENV.isDevelopment
};

export default CONFIG;
