/**
 * APEX Sanitizer Utility
 * ASRB 5.1.1 - Centralized XSS protection for frontend
 *
 * Replaces duplicate escapeHtml() in modal.js, notifications.js, and index.html
 */

/**
 * Escape HTML entities to prevent XSS
 * Uses the DOM textContent trick which escapes all HTML entities including quotes
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') str = String(str);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Sanitize HTML using DOMPurify for cases where limited HTML is intentional
 * (rich text notes, etc.)
 * Falls back to escapeHtml if DOMPurify is not loaded
 */
export function sanitizeHTML(html) {
  if (!html) return '';
  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style']
    });
  }
  // Fallback: strip all HTML
  return escapeHtml(html);
}

export default { escapeHtml, sanitizeHTML };
