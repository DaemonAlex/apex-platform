/**
 * APEX Notifications Module
 * Toast notifications and alerts
 *
 * Phase 4: UI Modules
 */

import { CONFIG } from '../core/config.js';
import { escapeHtml } from '../utils/sanitize.js';

/**
 * Notification types and their styles
 */
const NOTIFICATION_TYPES = {
  success: {
    icon: '✓',
    bgColor: '#10b981',
    borderColor: '#059669'
  },
  error: {
    icon: '✕',
    bgColor: '#ef4444',
    borderColor: '#dc2626'
  },
  warning: {
    icon: '⚠',
    bgColor: '#f59e0b',
    borderColor: '#d97706'
  },
  info: {
    icon: 'ℹ',
    bgColor: '#3b82f6',
    borderColor: '#2563eb'
  }
};

/**
 * Active notifications
 */
let activeNotifications = [];
let notificationContainer = null;

/**
 * Get or create the notification container
 */
function getContainer() {
  if (notificationContainer && document.body.contains(notificationContainer)) {
    return notificationContainer;
  }

  notificationContainer = document.createElement('div');
  notificationContainer.id = 'apex-notifications';
  notificationContainer.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
  `;
  document.body.appendChild(notificationContainer);
  return notificationContainer;
}

/**
 * Show a notification
 */
export function showNotification(message, type = 'info', duration = null) {
  const container = getContainer();
  const config = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.info;
  const displayDuration = duration ?? CONFIG.TOAST_DURATION ?? 5000;

  const notification = document.createElement('div');
  notification.className = 'apex-notification';
  notification.style.cssText = `
    background: ${config.bgColor};
    border-left: 4px solid ${config.borderColor};
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 280px;
    max-width: 420px;
    pointer-events: auto;
    transform: translateX(120%);
    transition: transform 0.3s ease-out, opacity 0.3s ease-out;
    cursor: pointer;
  `;

  notification.innerHTML = `
    <span style="font-size: 18px; font-weight: bold;">${config.icon}</span>
    <span style="flex: 1; font-size: 14px; line-height: 1.4;">${escapeHtml(message)}</span>
    <button style="background: none; border: none; color: white; cursor: pointer; font-size: 18px; opacity: 0.7; padding: 0 4px;">&times;</button>
  `;

  // Click to dismiss
  notification.addEventListener('click', () => dismissNotification(notification));

  // Close button
  const closeBtn = notification.querySelector('button');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissNotification(notification);
  });

  container.appendChild(notification);
  activeNotifications.push(notification);

  // Animate in
  requestAnimationFrame(() => {
    notification.style.transform = 'translateX(0)';
  });

  // Auto dismiss
  if (displayDuration > 0) {
    setTimeout(() => {
      dismissNotification(notification);
    }, displayDuration);
  }

  return notification;
}

/**
 * Dismiss a notification
 */
export function dismissNotification(notification) {
  if (!notification || !notification.parentNode) return;

  notification.style.transform = 'translateX(120%)';
  notification.style.opacity = '0';

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
    activeNotifications = activeNotifications.filter(n => n !== notification);
  }, 300);
}

/**
 * Dismiss all notifications
 */
export function dismissAllNotifications() {
  [...activeNotifications].forEach(dismissNotification);
}

/**
 * Shorthand methods
 */
export function success(message, duration) {
  return showNotification(message, 'success', duration);
}

export function error(message, duration) {
  return showNotification(message, 'error', duration);
}

export function warning(message, duration) {
  return showNotification(message, 'warning', duration);
}

export function info(message, duration) {
  return showNotification(message, 'info', duration);
}

/**
 * Show confirmation dialog
 * Returns a promise that resolves to true (confirmed) or false (cancelled)
 */
export function confirm(message, options = {}) {
  return new Promise((resolve) => {
    const {
      title = 'Confirm',
      confirmText = 'Confirm',
      cancelText = 'Cancel',
      type = 'warning'
    } = options;

    const overlay = document.createElement('div');
    overlay.className = 'apex-confirm-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      animation: fadeIn 0.2s ease-out;
    `;

    const config = NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.warning;

    overlay.innerHTML = `
      <div style="
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        animation: slideUp 0.3s ease-out;
      ">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
          <span style="
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: ${config.bgColor}20;
            color: ${config.bgColor};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
          ">${config.icon}</span>
          <h3 style="margin: 0; font-size: 18px; color: #1f2937;">${escapeHtml(title)}</h3>
        </div>
        <p style="margin: 0 0 24px; color: #6b7280; line-height: 1.5;">${escapeHtml(message)}</p>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="cancel-btn" style="
            padding: 10px 20px;
            border: 1px solid #d1d5db;
            background: white;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            color: #374151;
          ">${escapeHtml(cancelText)}</button>
          <button class="confirm-btn" style="
            padding: 10px 20px;
            border: none;
            background: ${config.bgColor};
            color: white;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
          ">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;

    const close = (result) => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        resolve(result);
      }, 200);
    };

    overlay.querySelector('.cancel-btn').addEventListener('click', () => close(false));
    overlay.querySelector('.confirm-btn').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });

    document.body.appendChild(overlay);

    // Focus confirm button
    overlay.querySelector('.confirm-btn').focus();
  });
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
if (typeof document !== 'undefined') {
  document.head.appendChild(style);
}

export default {
  show: showNotification,
  dismiss: dismissNotification,
  dismissAll: dismissAllNotifications,
  success,
  error,
  warning,
  info,
  confirm
};
