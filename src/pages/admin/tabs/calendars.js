/**
 * Calendars tab – data loading, row rendering, view/edit/delete actions.
 */
import { esc, fmtDate, badge, actionButtons } from '../ui/helpers.js';
import { renderTable } from '../ui/table-renderer.js';
import { showViewModal, showEditModal, confirmDelete } from '../ui/modal-controller.js';
import { showToast } from '../../../components/toast/toast.js';
import * as data from '../services/admin-data.js';

export async function loadCalendars() {
  const { data: rows, error } = await data.fetchCalendars();
  if (error) { showToast(error.message, 'error'); return; }

  renderTable({
    headers: ['Title', 'Privacy', 'Creator', 'Created', 'Actions'],
    entityLabel: 'calendar',
    rows: rows || [],
    rowRenderer: (c) => {
      const privacy = c.is_public
        ? badge('Public', 'bg-success')
        : badge('Private', 'bg-warning text-dark');
      const creator = c.users?.full_name || c.users?.email || '—';
      return `<tr>
        <td class="fw-medium">${esc(c.title)}</td>
        <td>${privacy}</td>
        <td>${esc(creator)}</td>
        <td class="text-nowrap">${fmtDate(c.created_at)}</td>
        ${actionButtons(c.id)}
      </tr>`;
    },
    onView: (c) => showViewModal('Calendar Details', {
      Title: c.title,
      Privacy: c.is_public ? 'Public' : 'Private',
      Creator: c.users?.full_name || c.users?.email || '—',
      Created: fmtDate(c.created_at),
      ID: c.id,
    }),
    onEdit: (c) => editCalendar(c),
    onDelete: (c) => confirmDelete(
      `Delete calendar <strong>${esc(c.title)}</strong>? All associated events will be deleted.`,
      async () => {
        const { error: e } = await data.deleteCalendar(c.id);
        if (e) { showToast(e.message, 'error'); return; }
        showToast('Calendar deleted.', 'success');
        await loadCalendars();
      },
    ),
  });
}

function editCalendar(c) {
  showEditModal('Edit Calendar', `
    <div class="mb-3">
      <label class="form-label">Title</label>
      <input type="text" class="form-control" id="edit-cal-title" value="${esc(c.title)}">
    </div>
    <div class="mb-3">
      <label class="form-label">Privacy</label>
      <select class="form-select" id="edit-cal-public">
        <option value="false" ${!c.is_public ? 'selected' : ''}>Private</option>
        <option value="true" ${c.is_public ? 'selected' : ''}>Public</option>
      </select>
    </div>
  `, async () => {
    const title = document.getElementById('edit-cal-title').value.trim();
    const is_public = document.getElementById('edit-cal-public').value === 'true';
    if (!title) throw new Error('Title is required.');

    const { error: e } = await data.updateCalendar(c.id, { title, is_public });
    if (e) throw e;

    showToast('Calendar updated.', 'success');
    await loadCalendars();
  });
}
