/**
 * Reusable modal controller for the admin panel.
 * Wraps the three Bootstrap modals (Edit, Delete, View)
 * and provides a clean API with no global mutable state.
 */
import { Modal } from 'bootstrap';
import { showToast } from '../../../components/toast/toast.js';
import { esc } from './helpers.js';

let editModal = null;
let deleteModal = null;
let viewModal = null;
let pendingDeleteFn = null;

/** Initialise all three admin modals. Call once after template render. */
export function initModals() {
  editModal = new Modal(document.getElementById('adminEditModal'));
  deleteModal = new Modal(document.getElementById('adminDeleteModal'));
  viewModal = new Modal(document.getElementById('adminViewModal'));

  document.getElementById('admin-delete-confirm-btn')
    .addEventListener('click', async () => { if (pendingDeleteFn) await pendingDeleteFn(); });
}

/* ── View modal ───────────────────────────────────────────── */

/**
 * Show the read-only detail modal.
 * @param {string}                title  Modal header text
 * @param {Record<string,string>} fields Key→value pairs to display
 */
export function showViewModal(title, fields) {
  document.getElementById('adminViewModalLabel').textContent = title;
  document.getElementById('admin-view-body').innerHTML = `
    <dl class="row mb-0">
      ${Object.entries(fields).map(([k, v]) => `
        <dt class="col-sm-3">${k}</dt>
        <dd class="col-sm-9">${esc(String(v))}</dd>
      `).join('')}
    </dl>`;
  viewModal.show();
}

/* ── Edit modal ───────────────────────────────────────────── */

/**
 * Show the edit modal with custom body HTML and a save handler.
 * @param {string}        title    Modal header text
 * @param {string}        bodyHtml HTML for the modal body
 * @param {() => Promise} saveFn   Async function executed on Save click
 */
export function showEditModal(title, bodyHtml, saveFn) {
  document.getElementById('adminEditModalLabel').textContent = title;
  document.getElementById('admin-edit-body').innerHTML = bodyHtml;
  wireEditSave(saveFn);
  editModal.show();
}

/**
 * Replace the save-button click handler (clone technique avoids stacking listeners).
 */
function wireEditSave(saveFn) {
  const btn = document.getElementById('admin-edit-save-btn');
  const spinner = document.getElementById('admin-edit-spinner');

  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    spinner.classList.remove('d-none');
    try {
      await saveFn();
      editModal.hide();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      newBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  });
}

/* ── Delete modal ─────────────────────────────────────────── */

/**
 * Show delete confirmation modal.
 * @param {string}        message  Confirmation HTML
 * @param {() => Promise} fn       Async function executed on Delete click
 */
export function confirmDelete(message, fn) {
  document.getElementById('admin-delete-message').innerHTML = message;
  const btn = document.getElementById('admin-delete-confirm-btn');
  const spinner = document.getElementById('admin-delete-spinner');

  pendingDeleteFn = async () => {
    btn.disabled = true;
    spinner.classList.remove('d-none');
    try {
      await fn();
      deleteModal.hide();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.add('d-none');
      pendingDeleteFn = null;
    }
  };

  deleteModal.show();
}
