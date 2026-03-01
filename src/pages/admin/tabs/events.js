/**
 * Events tab – data loading, row rendering, view/edit/delete actions.
 * Includes the participant chip editor in the edit modal.
 */
import { esc, fmtDate, fmtDateTime, badge, actionButtons, toLocalDatetime } from '../ui/helpers.js';
import { renderTable } from '../ui/table-renderer.js';
import { showViewModal, showEditModal, confirmDelete } from '../ui/modal-controller.js';
import { showToast } from '../../../components/toast/toast.js';
import * as data from '../services/admin-data.js';

export async function loadEvents() {
  const { data: rows, error } = await data.fetchEvents();
  if (error) { showToast(error.message, 'error'); return; }

  renderTable({
    headers: ['Title', 'Description', 'Date', 'Location', 'Visibility', 'Calendar', 'Creator', 'Actions'],
    entityLabel: 'event',
    rows: rows || [],
    rowRenderer: (e) => {
      const vis = e.is_public
        ? badge('Public', 'bg-success')
        : badge('Private', 'bg-warning text-dark');
      const desc = e.description
        ? (e.description.length > 50 ? esc(e.description.slice(0, 50)) + '…' : esc(e.description))
        : '<span class="text-muted">—</span>';
      const creator = e.users?.full_name || e.users?.email || '—';
      return `<tr>
        <td class="fw-medium">${esc(e.title)}</td>
        <td class="desc-cell" title="${esc(e.description || '')}">${desc}</td>
        <td class="text-nowrap">${fmtDate(e.event_date)}</td>
        <td>${esc(e.location || '—')}</td>
        <td>${vis}</td>
        <td>${esc(e.calendars?.title || '—')}</td>
        <td>${esc(creator)}</td>
        ${actionButtons(e.id)}
      </tr>`;
    },
    onView: (e) => showViewModal('Event Details', {
      Title: e.title,
      Description: e.description || '—',
      'Date & Time': fmtDateTime(e.event_date),
      Location: e.location || '—',
      Visibility: e.is_public ? 'Public' : 'Private',
      Calendar: e.calendars?.title || '—',
      Creator: e.users?.full_name || e.users?.email || '—',
      Created: fmtDate(e.created_at),
      ID: e.id,
    }),
    onEdit: (e) => editEvent(e),
    onDelete: (e) => confirmDelete(
      `Delete event <strong>${esc(e.title)}</strong>?`,
      async () => {
        const { error: err } = await data.deleteEvent(e.id);
        if (err) { showToast(err.message, 'error'); return; }
        showToast('Event deleted.', 'success');
        await loadEvents();
      },
    ),
  });
}

/* ── Edit event (with participant chips) ──────────────────── */

function editEvent(e) {
  const local = toLocalDatetime(e.event_date);

  // Closure-scoped participant state — no global / window hack
  let participantIds = [];

  const bodyHtml = `
    <div class="mb-3">
      <label class="form-label">Title</label>
      <input type="text" class="form-control" id="edit-evt-title" value="${esc(e.title)}">
    </div>
    <div class="mb-3">
      <label class="form-label">Description</label>
      <textarea class="form-control" id="edit-evt-desc" rows="3">${esc(e.description || '')}</textarea>
    </div>
    <div class="row">
      <div class="col-md-6 mb-3">
        <label class="form-label">Date & Time</label>
        <input type="datetime-local" class="form-control" id="edit-evt-date" value="${local}">
      </div>
      <div class="col-md-6 mb-3">
        <label class="form-label">Location</label>
        <input type="text" class="form-control" id="edit-evt-location" value="${esc(e.location || '')}">
      </div>
    </div>
    <div class="mb-3">
      <label class="form-label">Visibility</label>
      <select class="form-select" id="edit-evt-public">
        <option value="false" ${!e.is_public ? 'selected' : ''}>Private</option>
        <option value="true" ${e.is_public ? 'selected' : ''}>Public</option>
      </select>
    </div>
    <hr>
    <div class="mb-3">
      <label class="form-label">Participants</label>
      <div class="d-flex gap-2 mb-2">
        <select class="form-select" id="edit-evt-user-select" multiple size="3"></select>
        <button type="button" class="btn btn-outline-primary btn-sm align-self-end text-nowrap" id="edit-evt-add-participant">
          <i class="bi bi-plus-lg me-1"></i>Add
        </button>
      </div>
      <div id="edit-evt-participant-chips" class="d-flex flex-wrap gap-1"></div>
    </div>`;

  showEditModal('Edit Event', bodyHtml, async () => {
    const title = document.getElementById('edit-evt-title').value.trim();
    const description = document.getElementById('edit-evt-desc').value.trim();
    const event_date = document.getElementById('edit-evt-date').value;
    const location = document.getElementById('edit-evt-location').value.trim();
    const is_public = document.getElementById('edit-evt-public').value === 'true';

    if (!title || !event_date) throw new Error('Title and date are required.');

    const { error: err } = await data.updateEvent(e.id, {
      title,
      description: description || null,
      event_date: new Date(event_date).toISOString(),
      location: location || null,
      is_public,
    });
    if (err) throw err;

    const { error: pErr } = await data.replaceEventParticipants(e.id, participantIds);
    if (pErr) showToast('Some participants could not be saved.', 'warning');

    showToast('Event updated.', 'success');
    await loadEvents();
  });

  // Async-load participant UI after modal body is rendered
  loadParticipantEditor(e.id, participantIds);
}

/**
 * Populate the participant multi-select + chips inside the edit-event modal.
 * Writes directly into the closure-scoped `participantIds` array.
 */
async function loadParticipantEditor(eventId, participantIds) {
  const { data: parts } = await data.fetchParticipantsByEvent(eventId);
  (parts || []).forEach((p) => participantIds.push(p.user_id));

  const { data: allUsers } = await data.fetchAllUsers();
  const users = allUsers || [];

  function renderSelect() {
    const sel = document.getElementById('edit-evt-user-select');
    if (!sel) return;
    sel.innerHTML = '';
    users.filter((u) => !participantIds.includes(u.id)).forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.full_name ? `${u.full_name} (${u.email})` : u.email;
      sel.appendChild(opt);
    });
  }

  function renderChips() {
    const container = document.getElementById('edit-evt-participant-chips');
    if (!container) return;
    container.innerHTML = participantIds.map((uid) => {
      const u = users.find((x) => x.id === uid);
      const label = u ? (u.full_name ? `${u.full_name} (${u.email})` : u.email) : uid;
      return `<span class="badge bg-primary d-inline-flex align-items-center gap-1 py-1 px-2">
        ${esc(label)}
        <button type="button" class="btn-close btn-close-white" style="font-size:.55rem" data-uid="${uid}" aria-label="Remove"></button>
      </span>`;
    }).join('');

    container.querySelectorAll('.btn-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = participantIds.indexOf(btn.dataset.uid);
        if (idx !== -1) participantIds.splice(idx, 1);
        renderChips();
        renderSelect();
      });
    });
  }

  renderSelect();
  renderChips();

  document.getElementById('edit-evt-add-participant')?.addEventListener('click', () => {
    const sel = document.getElementById('edit-evt-user-select');
    const selected = Array.from(sel.selectedOptions).map((o) => o.value);
    if (selected.length === 0) return;
    selected.forEach((uid) => {
      if (!participantIds.includes(uid)) participantIds.push(uid);
    });
    renderChips();
    renderSelect();
  });
}
