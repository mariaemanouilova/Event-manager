/**
 * Toast notification system using Bootstrap 5 Toasts.
 * Usage:
 *   import { showToast } from '../../components/toast/toast.js';
 *   showToast('Account created successfully!', 'success');
 *   showToast('Something went wrong', 'error');
 *   showToast('Event updated', 'info');
 */
import { Toast } from 'bootstrap';
import './toast.css';

const ICONS = {
  success: 'bi-check-circle-fill',
  error: 'bi-exclamation-triangle-fill',
  info: 'bi-info-circle-fill',
  warning: 'bi-exclamation-circle-fill',
};

const BG_CLASS = {
  success: 'text-bg-success',
  error: 'text-bg-danger',
  info: 'text-bg-primary',
  warning: 'text-bg-warning',
};

function getOrCreateContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '1090';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Show a toast notification.
 * @param {string} message - The message to display.
 * @param {'success'|'error'|'info'|'warning'} type - Toast type.
 * @param {number} duration - Auto-hide delay in ms (default 4000).
 */
export function showToast(message, type = 'info', duration = 4000) {
  const container = getOrCreateContainer();

  const id = `toast-${Date.now()}`;
  const icon = ICONS[type] || ICONS.info;
  const bg = BG_CLASS[type] || BG_CLASS.info;

  const toastEl = document.createElement('div');
  toastEl.id = id;
  toastEl.className = `toast align-items-center border-0 ${bg}`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');

  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi ${icon} me-2"></i>${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;

  container.appendChild(toastEl);

  // Use Bootstrap's Toast API
  const bsToast = new Toast(toastEl, { delay: duration });
  bsToast.show();

  // Clean up DOM after hidden
  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove();
  });
}
