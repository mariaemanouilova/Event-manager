/**
 * Shared UI utility functions for the admin panel.
 * Pure functions — no side effects, no DOM state.
 */

/** HTML-escape a string to prevent XSS */
export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/** Format an ISO date string as "Mar 1, 2026" */
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

/** Format an ISO date string as a full readable date-time */
export function fmtDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Build a Bootstrap badge HTML string */
export function badge(text, colorClass) {
  return `<span class="badge ${colorClass}">${text}</span>`;
}

/** Build the 3-button action cell (View / Edit / Delete) */
export function actionButtons(id) {
  return `<td class="text-end text-nowrap">
    <button class="btn btn-outline-info admin-action-btn me-1 btn-view" data-id="${id}" title="View"><i class="bi bi-eye"></i></button>
    <button class="btn btn-outline-primary admin-action-btn me-1 btn-edit" data-id="${id}" title="Edit"><i class="bi bi-pencil"></i></button>
    <button class="btn btn-outline-danger admin-action-btn btn-delete" data-id="${id}" title="Delete"><i class="bi bi-trash"></i></button>
  </td>`;
}

/** Convert an ISO date to a datetime-local input value */
export function toLocalDatetime(isoStr) {
  const d = new Date(isoStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
