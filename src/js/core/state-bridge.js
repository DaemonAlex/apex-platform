/**
 * APEX State Bridge
 * Syncs the legacy window.AppState with the new modular AppState
 *
 * This enables gradual migration:
 * - Legacy code continues to use window.AppState
 * - New modules use the modular AppState
 * - Both stay in sync automatically
 */

import AppState, { Actions } from './state.js';
import { FEATURES } from './config.js';

/**
 * Create a reactive proxy around an object that notifies on changes
 */
function createReactiveProxy(target, onChange, path = '') {
  return new Proxy(target, {
    get(obj, prop) {
      const value = obj[prop];
      // Recursively wrap nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return createReactiveProxy(value, onChange, path ? `${path}.${prop}` : prop);
      }
      return value;
    },
    set(obj, prop, value) {
      const oldValue = obj[prop];
      obj[prop] = value;
      const fullPath = path ? `${path}.${prop}` : prop;
      onChange(fullPath, value, oldValue);
      return true;
    }
  });
}

/**
 * StateBridge - Syncs legacy and modern state
 */
class StateBridge {
  constructor() {
    this._legacyState = null;
    this._syncEnabled = true;
    this._debug = FEATURES.VERBOSE_LOGGING;
  }

  /**
   * Initialize the bridge with the legacy AppState
   * Call this after the legacy AppState is created
   */
  init(legacyAppState) {
    if (!legacyAppState) {
      console.warn('[StateBridge] No legacy AppState provided');
      return;
    }

    this._legacyState = legacyAppState;

    // Initial sync: copy legacy state to modern state
    this._syncLegacyToModern();

    // Subscribe to modern state changes
    this._subscribeToModernState();

    if (this._debug) {
      console.log('[StateBridge] Initialized - syncing legacy and modern state');
    }

    return this;
  }

  /**
   * Sync legacy state to modern state (initial load)
   */
  _syncLegacyToModern() {
    if (!this._legacyState) return;

    const legacy = this._legacyState;

    // Map legacy structure to modern structure
    AppState.set({
      // Auth
      currentUser: legacy.user,
      isAuthenticated: legacy.isLoggedIn,

      // Data
      projects: legacy.projects || legacy.data?.projects || [],
      users: legacy.users || [],

      // UI
      currentView: legacy.currentView || 'dashboard',
      isLoading: false,

      // Budget data
      budgets: {
        breakfix: legacy.breakfixBudget || {},
        refresh: legacy.refreshBudget || {}
      },

      // Settings
      settings: {
        useBackend: legacy.config?.USE_BACKEND ?? true,
        apiUrl: legacy.config?.apiUrl || '/api'
      }
    });

    if (this._debug) {
      console.log('[StateBridge] Synced legacy → modern:', {
        projects: AppState.get('projects').length,
        user: AppState.get('currentUser')?.email
      });
    }
  }

  /**
   * Subscribe to modern state changes and sync back to legacy
   */
  _subscribeToModernState() {
    // Sync projects
    AppState.subscribe('projects', (projects) => {
      if (!this._syncEnabled || !this._legacyState) return;
      this._legacyState.projects = projects;
      if (this._legacyState.data) {
        this._legacyState.data.projects = projects;
      }
    });

    // Sync user
    AppState.subscribe('currentUser', (user) => {
      if (!this._syncEnabled || !this._legacyState) return;
      this._legacyState.user = user;
      this._legacyState.isLoggedIn = !!user;
    });

    // Sync view
    AppState.subscribe('currentView', (view) => {
      if (!this._syncEnabled || !this._legacyState) return;
      this._legacyState.currentView = view;
    });

    // Sync users
    AppState.subscribe('users', (users) => {
      if (!this._syncEnabled || !this._legacyState) return;
      this._legacyState.users = users;
    });
  }

  /**
   * Update modern state from legacy (call when legacy state changes)
   */
  syncFromLegacy(key, value) {
    if (!this._syncEnabled) return;

    const mapping = {
      'user': () => Actions.setUser(value),
      'isLoggedIn': () => AppState.set({ isAuthenticated: value }),
      'currentView': () => Actions.setView(value),
      'projects': () => Actions.setProjects(value),
      'users': () => AppState.set({ users: value }),
      'data.projects': () => Actions.setProjects(value)
    };

    if (mapping[key]) {
      this._syncEnabled = false; // Prevent sync loop
      mapping[key]();
      this._syncEnabled = true;
    }

    if (this._debug) {
      console.log(`[StateBridge] Synced legacy.${key} → modern`);
    }
  }

  /**
   * Temporarily disable sync (useful during batch updates)
   */
  pauseSync() {
    this._syncEnabled = false;
  }

  /**
   * Resume sync after pause
   */
  resumeSync() {
    this._syncEnabled = true;
  }

  /**
   * Force full resync from legacy to modern
   */
  resync() {
    this._syncLegacyToModern();
  }

  /**
   * Get the current sync status
   */
  getStatus() {
    return {
      enabled: this._syncEnabled,
      legacyConnected: !!this._legacyState,
      modernState: AppState.get()
    };
  }
}

// Singleton instance
export const stateBridge = new StateBridge();

/**
 * Helper function to notify bridge of legacy state changes
 * Call this from legacy code when AppState changes:
 *
 * Example in legacy code:
 *   AppState.projects = newProjects;
 *   window.notifyStateChange?.('projects', newProjects);
 */
export function notifyStateChange(key, value) {
  stateBridge.syncFromLegacy(key, value);
}

// Expose to window for legacy code
if (typeof window !== 'undefined') {
  window.notifyStateChange = notifyStateChange;
  window.stateBridge = stateBridge;
}

export default stateBridge;
