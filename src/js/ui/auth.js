/**
 * APEX Auth UI Module
 * Handles authentication-related UI operations
 *
 * Phase 4: UI Modules - Auth
 * This module provides auth UI helpers that work alongside the legacy code.
 */

import { authApi, TokenManager } from '../api/client.js';
import { Actions } from '../core/state.js';
import { FEATURES } from '../core/config.js';

/**
 * Auth UI State
 */
const authUIState = {
  isSubmitting: false,
  lastError: null,
  loginAttempts: 0,
  maxAttempts: 5,
  lockoutUntil: null
};

/**
 * Validate email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password requirements
 */
export function validatePassword(password) {
  const errors = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (password && password.length < 12) {
    errors.push('For better security, use at least 12 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Include at least one uppercase letter');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Include at least one lowercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Include at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Include at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password)
  };
}

/**
 * Calculate password strength (0-100)
 */
export function calculatePasswordStrength(password) {
  if (!password) return 0;

  let strength = 0;

  // Length scoring
  if (password.length >= 8) strength += 20;
  if (password.length >= 12) strength += 15;
  if (password.length >= 16) strength += 10;

  // Character variety
  if (/[a-z]/.test(password)) strength += 10;
  if (/[A-Z]/.test(password)) strength += 15;
  if (/[0-9]/.test(password)) strength += 15;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 15;

  // Penalize common patterns
  if (/(.)\1{2,}/.test(password)) strength -= 10; // Repeated chars
  if (/123|abc|qwe|password/i.test(password)) strength -= 20;

  return Math.max(0, Math.min(100, strength));
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(strength) {
  if (strength < 30) return { label: 'Weak', color: '#ef4444' };
  if (strength < 50) return { label: 'Fair', color: '#f59e0b' };
  if (strength < 70) return { label: 'Good', color: '#eab308' };
  if (strength < 90) return { label: 'Strong', color: '#22c55e' };
  return { label: 'Excellent', color: '#10b981' };
}

/**
 * Check if user is locked out from login attempts
 */
export function isLockedOut() {
  if (!authUIState.lockoutUntil) return false;
  if (Date.now() > authUIState.lockoutUntil) {
    authUIState.lockoutUntil = null;
    authUIState.loginAttempts = 0;
    return false;
  }
  return true;
}

/**
 * Get lockout remaining time in seconds
 */
export function getLockoutRemaining() {
  if (!authUIState.lockoutUntil) return 0;
  return Math.max(0, Math.ceil((authUIState.lockoutUntil - Date.now()) / 1000));
}

/**
 * Record a failed login attempt
 */
export function recordFailedAttempt() {
  authUIState.loginAttempts++;
  if (authUIState.loginAttempts >= authUIState.maxAttempts) {
    // Lock out for 5 minutes
    authUIState.lockoutUntil = Date.now() + 5 * 60 * 1000;
    return true; // Locked out
  }
  return false;
}

/**
 * Reset login attempts (after successful login)
 */
export function resetLoginAttempts() {
  authUIState.loginAttempts = 0;
  authUIState.lockoutUntil = null;
}

/**
 * Login with email and password
 * Returns: { success, user, error, passwordExpired }
 */
export async function login(email, password) {
  // Check lockout
  if (isLockedOut()) {
    return {
      success: false,
      error: `Too many failed attempts. Try again in ${getLockoutRemaining()} seconds.`
    };
  }

  // Validate inputs
  if (!email || !validateEmail(email)) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  if (!password) {
    return { success: false, error: 'Please enter your password' };
  }

  authUIState.isSubmitting = true;
  authUIState.lastError = null;

  try {
    const data = await authApi.login(email, password);

    if (data.passwordExpired) {
      return {
        success: false,
        passwordExpired: true,
        email,
        error: 'Your password has expired. Please reset your password.'
      };
    }

    // Normalize user object
    const user = data.user || {};
    if (user.Role?.name && !user.role) {
      user.role = user.Role.name;
    }

    // Update state
    if (FEATURES.USE_NEW_STATE) {
      Actions.setUser(user);
    }

    resetLoginAttempts();

    return {
      success: true,
      user,
      token: data.token,
      mustChangePassword: data.mustChangePassword || user.mustChangePassword
    };

  } catch (error) {
    authUIState.lastError = error.message;

    // Record failed attempt
    const lockedOut = recordFailedAttempt();

    if (lockedOut) {
      return {
        success: false,
        error: `Too many failed attempts. Account locked for 5 minutes.`
      };
    }

    return {
      success: false,
      error: error.message || 'Login failed. Please check your credentials.'
    };

  } finally {
    authUIState.isSubmitting = false;
  }
}

/**
 * Logout the current user
 */
export async function logout() {
  try {
    // Clear token
    TokenManager.clearToken();

    // Update state
    if (FEATURES.USE_NEW_STATE) {
      Actions.clearUser();
    }

    // Dispatch event for legacy code
    window.dispatchEvent(new CustomEvent('auth:logout'));

    return { success: true };

  } catch (error) {
    console.error('Logout error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email) {
  if (!email || !validateEmail(email)) {
    return { success: false, error: 'Please enter a valid email address' };
  }

  try {
    await authApi.forgotPassword(email);
    return {
      success: true,
      message: 'If this email exists, a reset link has been sent.'
    };
  } catch (error) {
    // Don't reveal if email exists
    return {
      success: true,
      message: 'If this email exists, a reset link has been sent.'
    };
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(token, email, newPassword) {
  const validation = validatePassword(newPassword);
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.errors[0],
      errors: validation.errors
    };
  }

  try {
    await authApi.resetPassword(token, email, newPassword);
    return { success: true, message: 'Password reset successfully' };
  } catch (error) {
    return { success: false, error: error.message || 'Password reset failed' };
  }
}

/**
 * Check if current session is valid
 */
export function isAuthenticated() {
  return TokenManager.isAuthenticated();
}

/**
 * Get current auth state
 */
export function getAuthState() {
  return {
    isAuthenticated: TokenManager.isAuthenticated(),
    isSubmitting: authUIState.isSubmitting,
    lastError: authUIState.lastError,
    loginAttempts: authUIState.loginAttempts,
    isLockedOut: isLockedOut(),
    lockoutRemaining: getLockoutRemaining()
  };
}

/**
 * Create password strength indicator element
 */
export function createPasswordStrengthIndicator(password) {
  const strength = calculatePasswordStrength(password);
  const { label, color } = getPasswordStrengthLabel(strength);

  return {
    strength,
    label,
    color,
    html: `
      <div class="password-strength">
        <div class="strength-bar" style="width: ${strength}%; background: ${color}"></div>
        <span class="strength-label" style="color: ${color}">${label}</span>
      </div>
    `
  };
}

// Export state for debugging
export { authUIState };

export default {
  login,
  logout,
  validateEmail,
  validatePassword,
  calculatePasswordStrength,
  getPasswordStrengthLabel,
  requestPasswordReset,
  resetPassword,
  isAuthenticated,
  getAuthState,
  isLockedOut,
  getLockoutRemaining,
  createPasswordStrengthIndicator
};
