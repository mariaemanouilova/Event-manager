/**
 * Participants tab – data loading, row rendering, view/edit/delete actions.
 */
import { esc, fmtDate, badge, actionButtons } from '../ui/helpers.js';
import { renderTable } from '../ui/table-renderer.js';
import { showViewModal, showEditModal, confirmDelete } from '../ui/modal-controller.js';
import { showToast } from '../../../components/toast/toast.js';
import * as data from '../services/admin-data.js';

const STATUS_COLORS = {
  attending: 'bg-success',
  declined: 'bg-danger',
  maybe: 'bg-warning text-dark',
  invited: 'bg-info',
};

export async function loadParticipants() {
  const { data: rows, error } = await data.fetchParticipants();
  if (error) { showToast(error.message, 'error'); return; }

  renderTable({
    headers: ['User', 'Event', 'Status', 'Created', 'Actions'],
    entityLabel: 'participant',
    rows: rows || [],
    rowRenderer: (p) => {
      const user = p.users?.full_name || p.users?.email || '—';
      const event = p.events?.title || '—';
      const color = STATUS_COLORS[p.status] || 'bg-secondary';
      return `<tr>
        <td>${esc(user)}</td>
        <td class="fw-medium">${esc(event)}</td>
        <td>${badge(p.status, color)}</td>
        <td class="text-nowrap">${fmtDate(p.created_at)}</td>
        ${actionButtons(p.id)}
      </tr>`;
    },
    onView: (p) => showViewModal('Participant Details', {
      User: p.users?.full_name || p.users?.email || '—',
      Event: p.events?.title || '—',
      Status: p.status,
      Created: fmtDate(p.created_at),
      'Participant ID': p.id,
      'Event ID': p.event_id,
      'User ID': p.user_id,
    }),
    onEdit: (p) => editParticipant(p),
    onDelete: (p) => {
      const label = `${p.users?.email || 'user'} from ${p.events?.title || 'event'}`;
      confirmDelete(
        `Remove participant <strong>${esc(label)}</strong>?`,
        async () => {
          const { error: e } = await data.deleteParticipant(p.id);
          if (e) { showToast(e.message, 'error'); return; }
          showToast('Participant removed.', 'success');
          await loadParticipants();
        },
      );
    },
  });
}

function editParticipant(p) {
  showEditModal('Edit Participant', `
    <div class="mb-3">
      <label class="form-label">User</label>
      <input type="text" class="form-control" value="${esc(p.users?.full_name || p.users?.email || '—')}" disabled readonly>
    </div>
    <div class="mb-3">
      <label class="form-label">Event</label>
      <input type="text" class="form-control" value="${esc(p.events?.title || '—')}" disabled readonly>
    </div>
    <div class="mb-3">
      <label class="form-label">Status</label>
      <select class="form-select" id="edit-part-status">
        <option value="invited"   ${p.status === 'invited'   ? 'selected' : ''}>Invited</option>
        <option value="attending"  ${p.status === 'attending' ? 'selected' : ''}>Attending</option>
        <option value="maybe"      ${p.status === 'maybe'    ? 'selected' : ''}>Maybe</option>
        <option value="declined"   ${p.status === 'declined' ? 'selected' : ''}>Declined</option>
      </select>
    </div>
  `, async () => {
    const status = document.getElementById('edit-part-status').value;
    const { error: e } = await data.updateParticipant(p.id, { status });
    if (e) throw e;

    showToast('Participant updated.', 'success');
    await loadParticipants();
  });
}
