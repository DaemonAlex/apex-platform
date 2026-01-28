/**
 * APEX Application State Manager
 * Centralized state management with event-driven updates
 *
 * This will eventually replace the global AppState object in the monolith
 */

/**
 * Simple reactive state store
 */
class Store {
  constructor(initialState = {}) {
    this._state = initialState;
    this._listeners = new Map();
    this._history = [];
    this._maxHistory = 50;
  }

  /**
   * Get current state or a specific key
   */
  get(key = null) {
    if (key === null) return { ...this._state };
    return this._state[key];
  }

  /**
   * Set state (partial update)
   */
  set(updates) {
    const oldState = { ...this._state };
    this._state = { ...this._state, ...updates };

    // Track history for debugging
    this._history.push({
      timestamp: Date.now(),
      changes: updates,
      oldState
    });

    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // Notify listeners
    Object.keys(updates).forEach(key => {
      this._notify(key, this._state[key], oldState[key]);
    });

    // Notify global listeners
    this._notify('*', this._state, oldState);
  }

  /**
   * Subscribe to state changes
   */
  subscribe(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      this._listeners.get(key).delete(callback);
    };
  }

  /**
   * Notify listeners of state change
   */
  _notify(key, newValue, oldValue) {
    if (this._listeners.has(key)) {
      this._listeners.get(key).forEach(callback => {
        try {
          callback(newValue, oldValue, key);
        } catch (error) {
          console.error(`State listener error for key "${key}":`, error);
        }
      });
    }
  }

  /**
   * Get state history for debugging
   */
  getHistory() {
    return [...this._history];
  }

  /**
   * Reset state to initial values
   */
  reset(initialState = {}) {
    const oldState = this._state;
    this._state = initialState;
    this._notify('*', this._state, oldState);
  }
}

/**
 * Application State
 * Mirrors the structure of the existing AppState in index.html
 */
export const AppState = new Store({
  // User & Auth
  currentUser: null,
  isAuthenticated: false,

  // Data
  projects: [],
  users: [],

  // UI State
  currentView: 'dashboard',
  selectedProject: null,
  isLoading: false,

  // Filters & Search
  filters: {
    status: 'all',
    search: '',
    dateRange: null
  },

  // Settings
  settings: {
    theme: 'light',
    notifications: true
  }
});

/**
 * Actions - standardized state mutations
 */
export const Actions = {
  // Auth actions
  setUser(user) {
    AppState.set({
      currentUser: user,
      isAuthenticated: !!user
    });
  },

  clearUser() {
    AppState.set({
      currentUser: null,
      isAuthenticated: false
    });
  },

  // Data actions
  setProjects(projects) {
    AppState.set({ projects });
  },

  addProject(project) {
    const projects = [...AppState.get('projects'), project];
    AppState.set({ projects });
  },

  updateProject(id, updates) {
    const projects = AppState.get('projects').map(p =>
      p.id === id ? { ...p, ...updates } : p
    );
    AppState.set({ projects });
  },

  removeProject(id) {
    const projects = AppState.get('projects').filter(p => p.id !== id);
    AppState.set({ projects });
  },

  // UI actions
  setView(view) {
    AppState.set({ currentView: view });
  },

  selectProject(project) {
    AppState.set({ selectedProject: project });
  },

  setLoading(isLoading) {
    AppState.set({ isLoading });
  },

  // Filter actions
  setFilters(filters) {
    AppState.set({
      filters: { ...AppState.get('filters'), ...filters }
    });
  },

  resetFilters() {
    AppState.set({
      filters: { status: 'all', search: '', dateRange: null }
    });
  }
};

// Export store instance for direct access if needed
export default AppState;
