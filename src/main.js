/**
 * APEX Platform - Modern Entry Point
 *
 * This file bridges the new ES modules with the legacy monolith.
 * During migration, we expose new functions to window.* for compatibility.
 *
 * Migration Progress:
 * [x] Phase 1: Setup & Infrastructure
 * [x] Phase 2: API Client & Utilities
 * [x] Phase 2b: CSS Extraction (4,471 lines)
 * [x] Phase 2c: Project Helpers Extraction
 * [x] Phase 3: State Management (Bridge pattern)
 * [x] Phase 4: UI Modules (Auth, Notifications, Modal)
 * [x] Phase 5: Full Migration (legacy→module bridges)
 */

// ============================================================
// IMPORTS
// ============================================================

// Styles (extracted from index.html)
import './css/main.css';

// Core modules
import { CONFIG, ENV, FEATURES } from './js/core/config.js';
import AppState, { Actions } from './js/core/state.js';
import stateBridge, { notifyStateChange } from './js/core/state-bridge.js';

// API Layer
import api, {
  ApiError,
  TokenManager,
  authApi,
  projectsApi,
  usersApi,
  adminApi,
  attachmentsApi
} from './js/api/client.js';

// UI Modules (Phase 4)
import Auth, {
  login as authLogin,
  logout as authLogout,
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  isAuthenticated,
  getAuthState,
  requestPasswordReset,
  resetPassword,
  createPasswordStrengthIndicator
} from './js/ui/auth.js';

import Notifications, {
  showNotification,
  dismissNotification,
  dismissAllNotifications
} from './js/ui/notifications.js';

import Modal, {
  createModal,
  closeTopModal,
  closeAllModals
} from './js/ui/modal.js';

// Utilities - Formatters
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatPercentage,
  formatFileSize,
  formatPhoneNumber,
  truncateText,
  capitalize,
  toTitleCase,
  generateId,
  generateProjectId,
  debounce,
  throttle,
  deepClone,
  isEmpty,
  calculateVariance
} from './js/utils/formatters.js';

// Utilities - Project Helpers
import {
  toArrayMaybe,
  getTasks,
  normalizeProject,
  calculateProjectProgress,
  calculateProjectStatus,
  getProgressColor,
  getRagColor,
  getStatusColor,
  formatStatus,
  formatProjectType,
  formatBusinessLine,
  calculateTaskAggregates,
  calculateProjectHealth,
  getDefaultTasksForType,
  sortProjects,
  filterProjectsBySearch,
  filterProjectsByStatus,
  getProjectStats
} from './js/utils/project-helpers.js';

// ============================================================
// LEGACY BRIDGE
// Expose modules to window for backward compatibility with index.html
// These will be removed as we migrate each feature to modules
// ============================================================

// API - expose to window
window.api = api;
window.ApiError = ApiError;
window.TokenManager = TokenManager;
window.authApi = authApi;
window.projectsApi = projectsApi;
window.usersApi = usersApi;
window.adminApi = adminApi;
window.attachmentsApi = attachmentsApi;

// Utility functions - expose to window
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.formatRelativeTime = formatRelativeTime;
window.formatPercentage = formatPercentage;
window.formatFileSize = formatFileSize;
window.formatPhoneNumber = formatPhoneNumber;
window.truncateText = truncateText;
window.capitalize = capitalize;
window.toTitleCase = toTitleCase;
window.generateId = generateId;
window.generateProjectId = generateProjectId;
window.debounce = debounce;
window.throttle = throttle;
window.deepClone = deepClone;
window.isEmpty = isEmpty;
window.calculateVariance = calculateVariance;

// Project helper functions - expose to window
window.toArrayMaybe = toArrayMaybe;
window.getTasks = getTasks;
window.normalizeProject = normalizeProject;
window.calculateProjectProgress = calculateProjectProgress;
window.calculateProjectStatus = calculateProjectStatus;
window.getProgressColor = getProgressColor;
window.getRagColor = getRagColor;
window.getStatusColor = getStatusColor;
window.formatStatus = formatStatus;
window.formatProjectType = formatProjectType;
window.formatBusinessLine = formatBusinessLine;
window.calculateTaskAggregates = calculateTaskAggregates;
window.calculateProjectHealth = calculateProjectHealth;
window.getDefaultTasksForType = getDefaultTasksForType;
window.sortProjects = sortProjects;
window.filterProjectsBySearch = filterProjectsBySearch;
window.filterProjectsByStatus = filterProjectsByStatus;
window.getProjectStats = getProjectStats;

// Config
window.APEX_CONFIG = CONFIG;
window.APEX_ENV = ENV;
window.APEX_FEATURES = FEATURES;

// State management (Phase 3)
if (FEATURES.USE_NEW_STATE) {
  window.AppStateNew = AppState;
  window.AppActions = Actions;
  window.stateBridge = stateBridge;
  window.notifyStateChange = notifyStateChange;
}

// UI Modules (Phase 4)
window.APEX_Auth = Auth;
window.APEX_Notifications = Notifications;
window.APEX_Modal = Modal;

// Auth helpers
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.calculatePasswordStrength = calculatePasswordStrength;
window.getPasswordStrengthLabel = getPasswordStrengthLabel;
window.createPasswordStrengthIndicator = createPasswordStrengthIndicator;
window.authLogin = authLogin;
window.authLogout = authLogout;
window.isAuthenticatedNew = isAuthenticated;
window.getAuthState = getAuthState;
window.requestPasswordReset = requestPasswordReset;
window.resetPasswordNew = resetPassword;

// Notifications helpers (don't override legacy showNotification yet)
window.APEX_showNotification = showNotification;
window.dismissNotification = dismissNotification;
window.dismissAllNotifications = dismissAllNotifications;

// Modal helpers
window.createModal = createModal;
window.closeTopModal = closeTopModal;
window.closeAllModals = closeAllModals;
window.modalAlert = Modal.alert;
window.modalPrompt = Modal.prompt;

// ============================================================
// GLOBAL EVENT HANDLERS
// ============================================================

// Handle auth events from API client
window.addEventListener('auth:unauthorized', () => {
  console.log('[APEX] Session expired - redirecting to login');
  // The monolith's logout function will handle UI
  if (typeof window.logout === 'function') {
    window.logout();
  }
});

window.addEventListener('auth:logout', () => {
  console.log('[APEX] User logged out');
});

// ============================================================
// INITIALIZATION
// ============================================================

function initializeApp() {
  if (FEATURES.VERBOSE_LOGGING) {
    console.log('[APEX] Modern modules loaded');
    console.log('[APEX] Environment:', ENV.mode);
    console.log('[APEX] Features:', FEATURES);
  }

  // Initialize state bridge with legacy AppState (if available)
  if (FEATURES.USE_NEW_STATE && window.AppState) {
    stateBridge.init(window.AppState);
    if (FEATURES.VERBOSE_LOGGING) {
      console.log('[APEX] State bridge connected to legacy AppState');
    }
  }

  // Check if we have a valid session
  if (TokenManager.isAuthenticated()) {
    if (FEATURES.VERBOSE_LOGGING) {
      console.log('[APEX] Valid session detected');
    }
    // Sync auth state
    if (FEATURES.USE_NEW_STATE) {
      const user = TokenManager.getUser?.() || null;
      if (user) {
        Actions.setUser(user);
      }
    }
  }

  // Dispatch ready event for legacy code
  window.dispatchEvent(new CustomEvent('apex:modules:ready', {
    detail: { version: '1.0.0', features: FEATURES }
  }));

  // Migration status helper (call window.APEX_migrationStatus() in console)
  window.APEX_migrationStatus = () => {
    const status = {
      version: '1.0.0',
      phase: 5,
      modules: {
        api: '✅ Active (client.js)',
        state: FEATURES.USE_NEW_STATE ? '✅ Active (state-bridge.js)' : '⏸️ Disabled',
        auth: '✅ Active (auth.js)',
        notifications: window.APEX_Notifications ? '✅ Active (notifications.js)' : '❌ Not loaded',
        modal: window.APEX_Modal ? '✅ Active (modal.js)' : '❌ Not loaded',
        formatters: '✅ Active (formatters.js)',
        projectHelpers: '✅ Active (project-helpers.js)',
        css: '✅ Extracted (main.css)'
      },
      linesExtracted: 6989,
      legacyOverrides: [
        'showNotification → APEX_Notifications',
        'validatePasswordRequirements → validatePassword',
        'formatDate → formatters.js',
        'calculateProjectProgress → project-helpers.js'
      ]
    };
    console.table(status.modules);
    console.log('📊 Migration Progress: Phase 5 (Full Migration)');
    console.log(`📁 Lines extracted: ${status.linesExtracted}`);
    return status;
  };
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// ============================================================
// EXPORTS (for other modules)
// ============================================================

export {
  // Config
  CONFIG,
  ENV,
  FEATURES,

  // State
  AppState,
  Actions,
  stateBridge,
  notifyStateChange,

  // API
  api,
  ApiError,
  TokenManager,
  authApi,
  projectsApi,
  usersApi,
  adminApi,
  attachmentsApi,

  // Formatters
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatPercentage,
  formatFileSize,
  formatPhoneNumber,
  truncateText,
  capitalize,
  toTitleCase,
  generateId,
  generateProjectId,
  debounce,
  throttle,
  deepClone,
  isEmpty,
  calculateVariance,

  // Project Helpers
  toArrayMaybe,
  getTasks,
  normalizeProject,
  calculateProjectProgress,
  calculateProjectStatus,
  getProgressColor,
  getRagColor,
  getStatusColor,
  formatStatus,
  formatProjectType,
  formatBusinessLine,
  calculateTaskAggregates,
  calculateProjectHealth,
  getDefaultTasksForType,
  sortProjects,
  filterProjectsBySearch,
  filterProjectsByStatus,
  getProjectStats,

  // UI Modules (Phase 4)
  Auth,
  Notifications,
  Modal,
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  createPasswordStrengthIndicator,
  showNotification,
  dismissNotification,
  dismissAllNotifications,
  createModal,
  closeTopModal,
  closeAllModals
};
