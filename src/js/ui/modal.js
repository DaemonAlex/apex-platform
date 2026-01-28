/**
 * APEX Modal Module
 * Reusable modal/dialog system
 *
 * Phase 4: UI Modules
 */

/**
 * Active modals stack
 */
let modalStack = [];
let modalIdCounter = 0;

/**
 * Modal configuration defaults
 */
const DEFAULTS = {
  width: '500px',
  maxWidth: '90vw',
  maxHeight: '85vh',
  closeOnOverlay: true,
  closeOnEscape: true,
  showClose: true,
  animate: true
};

/**
 * Create and show a modal
 */
export function createModal(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const modalId = `apex-modal-${++modalIdCounter}`;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = modalId;
  overlay.className = 'apex-modal-overlay';
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
    z-index: ${10000 + modalStack.length};
    opacity: 0;
    transition: opacity 0.2s ease-out;
  `;

  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'apex-modal';
  modal.style.cssText = `
    background: white;
    border-radius: 12px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: ${config.width};
    max-width: ${config.maxWidth};
    max-height: ${config.maxHeight};
    display: flex;
    flex-direction: column;
    transform: scale(0.95) translateY(-20px);
    transition: transform 0.3s ease-out;
    overflow: hidden;
  `;

  // Build modal content
  let modalHTML = '';

  // Header
  if (config.title) {
    modalHTML += `
      <div class="apex-modal-header" style="
        padding: 20px 24px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
      ">
        <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">${escapeHtml(config.title)}</h2>
        ${config.showClose ? `
          <button class="apex-modal-close" style="
            background: none;
            border: none;
            font-size: 24px;
            color: #9ca3af;
            cursor: pointer;
            padding: 0;
            line-height: 1;
          ">&times;</button>
        ` : ''}
      </div>
    `;
  }

  // Body
  modalHTML += `
    <div class="apex-modal-body" style="
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    ">
      ${config.content || ''}
    </div>
  `;

  // Footer
  if (config.footer || config.buttons) {
    modalHTML += `
      <div class="apex-modal-footer" style="
        padding: 16px 24px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      ">
        ${config.footer || buildButtons(config.buttons)}
      </div>
    `;
  }

  modal.innerHTML = modalHTML;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Modal instance
  const instance = {
    id: modalId,
    overlay,
    modal,
    config,

    // Close the modal
    close: () => closeModal(instance),

    // Get the body element
    getBody: () => modal.querySelector('.apex-modal-body'),

    // Set body content
    setContent: (html) => {
      const body = modal.querySelector('.apex-modal-body');
      if (body) body.innerHTML = html;
    },

    // Get form data if modal contains a form
    getFormData: () => {
      const form = modal.querySelector('form');
      return form ? Object.fromEntries(new FormData(form)) : null;
    }
  };

  // Add to stack
  modalStack.push(instance);

  // Event handlers
  if (config.closeOnOverlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) instance.close();
    });
  }

  if (config.showClose) {
    const closeBtn = modal.querySelector('.apex-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => instance.close());
  }

  if (config.closeOnEscape) {
    const escHandler = (e) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === instance) {
        instance.close();
      }
    };
    document.addEventListener('keydown', escHandler);
    instance._escHandler = escHandler;
  }

  // Button handlers
  if (config.buttons) {
    config.buttons.forEach((btn, idx) => {
      const btnEl = modal.querySelector(`[data-btn-index="${idx}"]`);
      if (btnEl && btn.onClick) {
        btnEl.addEventListener('click', () => btn.onClick(instance));
      }
    });
  }

  // Callback
  if (config.onOpen) {
    config.onOpen(instance);
  }

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    modal.style.transform = 'scale(1) translateY(0)';
  });

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  return instance;
}

/**
 * Close a modal
 */
function closeModal(instance) {
  if (!instance || !instance.overlay.parentNode) return;

  // Callback
  if (instance.config.onClose) {
    instance.config.onClose(instance);
  }

  // Animate out
  instance.overlay.style.opacity = '0';
  instance.modal.style.transform = 'scale(0.95) translateY(-20px)';

  setTimeout(() => {
    if (instance.overlay.parentNode) {
      instance.overlay.parentNode.removeChild(instance.overlay);
    }

    // Remove from stack
    modalStack = modalStack.filter(m => m !== instance);

    // Remove escape handler
    if (instance._escHandler) {
      document.removeEventListener('keydown', instance._escHandler);
    }

    // Restore body scroll if no more modals
    if (modalStack.length === 0) {
      document.body.style.overflow = '';
    }
  }, 200);
}

/**
 * Close the topmost modal
 */
export function closeTopModal() {
  if (modalStack.length > 0) {
    modalStack[modalStack.length - 1].close();
  }
}

/**
 * Close all modals
 */
export function closeAllModals() {
  [...modalStack].reverse().forEach(instance => instance.close());
}

/**
 * Build button HTML from config
 */
function buildButtons(buttons) {
  if (!buttons || !Array.isArray(buttons)) return '';

  return buttons.map((btn, idx) => {
    const isPrimary = btn.primary || btn.type === 'primary';
    const isDanger = btn.danger || btn.type === 'danger';

    let bgColor = '#f3f4f6';
    let textColor = '#374151';
    let borderColor = '#d1d5db';

    if (isPrimary) {
      bgColor = '#3b82f6';
      textColor = '#ffffff';
      borderColor = '#3b82f6';
    } else if (isDanger) {
      bgColor = '#ef4444';
      textColor = '#ffffff';
      borderColor = '#ef4444';
    }

    return `
      <button
        data-btn-index="${idx}"
        style="
          padding: 10px 20px;
          background: ${bgColor};
          color: ${textColor};
          border: 1px solid ${borderColor};
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        "
      >${escapeHtml(btn.label || btn.text || 'Button')}</button>
    `;
  }).join('');
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Convenience: Alert modal
 */
export function alert(message, title = 'Alert') {
  return new Promise((resolve) => {
    createModal({
      title,
      content: `<p style="margin: 0; color: #374151;">${escapeHtml(message)}</p>`,
      buttons: [
        { label: 'OK', primary: true, onClick: (m) => { m.close(); resolve(); } }
      ]
    });
  });
}

/**
 * Convenience: Prompt modal
 */
export function prompt(message, defaultValue = '', title = 'Input') {
  return new Promise((resolve) => {
    const inputId = `prompt-input-${Date.now()}`;
    const modal = createModal({
      title,
      content: `
        <p style="margin: 0 0 16px; color: #374151;">${escapeHtml(message)}</p>
        <input
          id="${inputId}"
          type="text"
          value="${escapeHtml(defaultValue)}"
          style="
            width: 100%;
            padding: 10px 14px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
          "
        />
      `,
      buttons: [
        { label: 'Cancel', onClick: (m) => { m.close(); resolve(null); } },
        {
          label: 'OK',
          primary: true,
          onClick: (m) => {
            const input = document.getElementById(inputId);
            m.close();
            resolve(input ? input.value : '');
          }
        }
      ],
      onOpen: () => {
        const input = document.getElementById(inputId);
        if (input) {
          input.focus();
          input.select();
        }
      }
    });

    // Handle Enter key
    const input = document.getElementById(inputId);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          modal.close();
          resolve(input.value);
        }
      });
    }
  });
}

export default {
  create: createModal,
  closeTop: closeTopModal,
  closeAll: closeAllModals,
  alert,
  prompt
};
