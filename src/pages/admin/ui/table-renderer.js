/**
 * Reusable table renderer with event-delegation for action buttons.
 * Eliminates the repeated querySelectorAll + forEach pattern.
 */
import { showToast } from '../../../components/toast/toast.js';

/* ── DOM state helpers ────────────────────────────────────── */

export function showLoading() {
  document.getElementById('admin-loading').classList.remove('d-none');
  document.getElementById('admin-table-wrapper').classList.add('d-none');
  document.getElementById('admin-empty').classList.add('d-none');
}

function showTableOrEmpty() {
  document.getElementById('admin-loading').classList.add('d-none');
  const wrapper = document.getElementById('admin-table-wrapper');
  const tbody = document.getElementById('admin-tbody');
  if (tbody.children.length === 0) {
    wrapper.classList.add('d-none');
    document.getElementById('admin-empty').classList.remove('d-none');
  } else {
    wrapper.classList.remove('d-none');
    document.getElementById('admin-empty').classList.add('d-none');
  }
}

/* ── Main render function ─────────────────────────────────── */

/**
 * Render a data table with delegated action buttons.
 *
 * @param {Object}   config
 * @param {string[]} config.headers      Column header labels
 * @param {string}   config.entityLabel  Singular label for row count ("user", "event", …)
 * @param {any[]}    config.rows         Array of data objects
 * @param {Function} config.rowRenderer  (row) => '<tr>…</tr>' HTML string
 * @param {Function} config.onView       (row) => void
 * @param {Function} config.onEdit       (row) => void
 * @param {Function} config.onDelete     (row) => void
 * @param {string}   [config.idField='id'] Field name used as data-id on buttons
 */
export function renderTable({
  headers, entityLabel, rows, rowRenderer,
  onView, onEdit, onDelete, idField = 'id',
}) {
  // Headers
  document.getElementById('admin-thead').innerHTML =
    '<tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr>';

  // Row count
  document.getElementById('admin-row-count').textContent =
    `${rows.length} ${entityLabel}${rows.length !== 1 ? 's' : ''}`;

  // Body
  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = rows.map(rowRenderer).join('');

  showTableOrEmpty();

  // Build a lookup map once for O(1) access
  const rowMap = new Map(rows.map((r) => [String(r[idField]), r]));

  // Event delegation: single listener instead of N * 3 listeners
  tbody.onclick = (e) => {
    const btn = e.target.closest('.btn-view, .btn-edit, .btn-delete');
    if (!btn) return;
    const row = rowMap.get(btn.dataset.id);
    if (!row) return;

    if (btn.classList.contains('btn-view'))   onView(row);
    else if (btn.classList.contains('btn-edit'))   onEdit(row);
    else if (btn.classList.contains('btn-delete')) onDelete(row);
  };
}
