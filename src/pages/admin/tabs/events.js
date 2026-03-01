/**
 * Events tab – data loading, row rendering, view/edit/delete actions.
 * Includes the participant chip editor and attachment manager in the edit modal.
 */
import { esc, fmtDate, fmtDateTime, badge, actionButtons, toLocalDatetime } from '../ui/helpers.js';
import { renderTable } from '../ui/table-renderer.js';
import { showViewModal, showEditModal, confirmDelete } from '../ui/modal-controller.js';
import { showToast } from '../../../components/toast/toast.js';
import * as data from '../services/admin-data.js';

// Attachment count map (eventId -> count) loaded once on tab open
let attachCountMap = new Map();

export async function loadEvents() {
  const [evtResult, attResult] = await Promise.all([
    data.fetchEvents(),
    data.fetchAllAttachmentsCounts(),
  ]);

  if (evtResult.error) { showToast(evtResult.error.message, 'error'); return; }
  const rows = evtResult.data || [];

  // Build attachment count map
  attachCountMap.clear();
  (attResult.data || []).forEach((a) => {
    attachCountMap.set(a.event_id, (attachCountMap.get(a.event_id) || 0) + 1);
  });

  renderTable({
    headers: ['Title', 'Description', 'Date', 'Location', 'Visibility', 'Calendar', 'Creator', 'Files', 'Actions'],
    entityLabel: 'event',
    rows,
    rowRenderer: (e) => {
      const vis = e.is_public
        ? badge('Public', 'bg-success')
        : badge('Private', 'bg-warning text-dark');
      const desc = e.description
        ? (e.description.length > 50 ? esc(e.description.slice(0, 50)) + '…' : esc(e.description))
        : '<span class="text-muted">—</span>';
      const creator = e.users?.full_name || e.users?.email || '—';
      const fileCount = attachCountMap.get(e.id) || 0;
      const fileBadge = fileCount > 0
        ? `<span class="badge bg-info">${fileCount} <i class="bi bi-paperclip"></i></span>`
        : '<span class="text-muted">—</span>';
      return `<tr>
        <td class="fw-medium">${esc(e.title)}</td>
        <td class="desc-cell" title="${esc(e.description || '')}">${desc}</td>
        <td class="text-nowrap">${fmtDate(e.event_date)}</td>
        <td>${esc(e.location || '—')}</td>
        <td>${vis}</td>
        <td>${esc(e.calendars?.title || '—')}</td>
        <td>${esc(creator)}</td>
        <td>${fileBadge}</td>
        ${actionButtons(e.id)}
      </tr>`;
    },
    onView: (e) => viewEvent(e),
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

/* ── View event (with attachments) ────────────────────────── */

async function viewEvent(e) {
  // Show modal immediately with base info, then load attachments async
  const fields = {
    Title: e.title,
    Description: e.description || '—',
    'Date & Time': fmtDateTime(e.event_date),
    Location: e.location || '—',
    Visibility: e.is_public ? 'Public' : 'Private',
    Calendar: e.calendars?.title || '—',
    Creator: e.users?.full_name || e.users?.email || '—',
    Created: fmtDate(e.created_at),
    ID: e.id,
  };

  document.getElementById('adminViewModalLabel').textContent = 'Event Details';
  document.getElementById('admin-view-body').innerHTML = `
    <dl class="row mb-0">
      ${Object.entries(fields).map(([k, v]) => `
        <dt class="col-sm-3">${k}</dt>
        <dd class="col-sm-9">${esc(String(v))}</dd>
      `).join('')}
      <dt class="col-sm-3">Attachments</dt>
      <dd class="col-sm-9" id="admin-view-attachments"><span class="text-muted">Loading…</span></dd>
    </dl>`;

  // Show the view modal (from bootstrap instance)
  const { Modal } = await import('bootstrap');
  const viewModalEl = document.getElementById('adminViewModal');
  Modal.getOrCreateInstance(viewModalEl).show();

  // Load attachments
  const { data: atts } = await data.fetchAttachmentsByEvent(e.id);
  const container = document.getElementById('admin-view-attachments');
  if (!container) return;

  if (!atts || atts.length === 0) {
    container.innerHTML = '<span class="text-muted">None</span>';
    return;
  }

  container.innerHTML = `<div class="attachment-list">${atts.map((att) => {
    const url = data.getAttachmentPublicUrl(att.file_path);
    const isImage = att.file_type.startsWith('image/');
    const icon = isImage
      ? `<img src="${url}" class="att-thumb" alt="" />`
      : `<i class="bi ${attIcon(att.file_type)}"></i>`;
    return `<a href="${url}" target="_blank" class="attachment-link" title="${esc(att.file_name)}">${icon}<span class="att-name">${esc(att.file_name)}</span></a>`;
  }).join('')}</div>`;
}

/* ── Edit event (with participant chips + attachment manager) ── */

function editEvent(e) {
  const local = toLocalDatetime(e.event_date);

  // Closure-scoped participant state — no global / window hack
  let participantIds = [];
  let pendingUploadFiles = [];

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
    </div>
    <hr>
    <div class="mb-3">
      <label class="form-label">Attachments</label>
      <div id="admin-edit-attachments"><span class="text-muted">Loading…</span></div>
      <div class="mt-2">
        <label class="btn btn-outline-secondary btn-sm" for="admin-edit-file-input">
          <i class="bi bi-cloud-arrow-up me-1"></i>Upload Files
        </label>
        <input type="file" id="admin-edit-file-input" class="d-none" multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
      </div>
      <div id="admin-edit-pending-files" class="mt-2 d-flex flex-wrap gap-1"></div>
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

    // Upload pending files
    for (const file of pendingUploadFiles) {
      const session = await data.getSession();
      const { error: upErr } = await data.uploadAttachment(e.id, file, session?.user?.id);
      if (upErr) showToast(`Upload failed: ${file.name}`, 'warning');
    }

    showToast('Event updated.', 'success');
    await loadEvents();
  });

  // Async-load participant UI + attachment UI after modal body is rendered
  loadParticipantEditor(e.id, participantIds);
  loadAttachmentEditor(e.id, pendingUploadFiles);
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

/**
 * Load existing attachments into the edit-event modal and wire up
 * upload / delete UI.  `pendingFiles` is the closure-scoped array
 * that will be uploaded when Save is clicked.
 */
async function loadAttachmentEditor(eventId, pendingFiles) {
  const container = document.getElementById('admin-edit-attachments');
  const fileInput = document.getElementById('admin-edit-file-input');
  const pendingContainer = document.getElementById('admin-edit-pending-files');

  // Load existing
  const { data: atts } = await data.fetchAttachmentsByEvent(eventId);
  let existing = atts || [];

  function renderExisting() {
    if (existing.length === 0) {
      container.innerHTML = '<span class="text-muted">No attachments</span>';
      return;
    }
    container.innerHTML = existing.map((att) => {
      const url = data.getAttachmentPublicUrl(att.file_path);
      const isImage = att.file_type.startsWith('image/');
      const icon = isImage
        ? `<img src="${url}" class="att-thumb" alt="" />`
        : `<i class="bi ${attIcon(att.file_type)}"></i>`;
      return `<div class="admin-att-item d-inline-flex align-items-center gap-1 me-2 mb-1">
        <a href="${url}" target="_blank" class="attachment-link" title="${esc(att.file_name)}">${icon}<span class="att-name">${esc(att.file_name)}</span></a>
        <button type="button" class="btn btn-outline-danger btn-sm admin-att-delete" data-id="${att.id}" data-path="${esc(att.file_path)}" title="Delete" style="padding:0.1rem 0.3rem;font-size:0.7rem">
          <i class="bi bi-trash"></i>
        </button>
      </div>`;
    }).join('');

    container.querySelectorAll('.admin-att-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error: delErr } = await data.deleteAttachment(btn.dataset.id, btn.dataset.path);
        if (delErr) { showToast(delErr.message, 'error'); btn.disabled = false; return; }
        existing = existing.filter((a) => a.id !== btn.dataset.id);
        renderExisting();
        showToast('Attachment deleted.', 'info');
      });
    });
  }

  renderExisting();

  // Pending files upload
  function renderPending() {
    pendingContainer.innerHTML = pendingFiles.map((file, i) => {
      return `<span class="badge bg-secondary d-inline-flex align-items-center gap-1 py-1 px-2">
        <i class="bi ${attIcon(file.type)}"></i> ${esc(file.name)}
        <button type="button" class="btn-close btn-close-white" style="font-size:.55rem" data-idx="${i}" aria-label="Remove"></button>
      </span>`;
    }).join('');

    pendingContainer.querySelectorAll('.btn-close').forEach((btn) => {
      btn.addEventListener('click', () => {
        pendingFiles.splice(Number(btn.dataset.idx), 1);
        renderPending();
      });
    });
  }

  fileInput?.addEventListener('change', () => {
    const MAX = 10 * 1024 * 1024;
    for (const file of fileInput.files) {
      if (file.size > MAX) {
        showToast(`"${file.name}" exceeds 10 MB.`, 'warning');
        continue;
      }
      if (pendingFiles.some((f) => f.name === file.name && f.size === file.size)) continue;
      pendingFiles.push(file);
    }
    fileInput.value = '';
    renderPending();
  });
}

/* ── Shared helpers ───────────────────────────────────────── */
function attIcon(mime) {
  if (!mime) return 'bi-file-earmark';
  if (mime.startsWith('image/')) return 'bi-file-earmark-image';
  if (mime === 'application/pdf') return 'bi-file-earmark-pdf';
  if (mime.includes('word') || mime.includes('.document')) return 'bi-file-earmark-word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'bi-file-earmark-excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bi-file-earmark-ppt';
  if (mime.includes('zip') || mime.includes('compressed')) return 'bi-file-earmark-zip';
  return 'bi-file-earmark';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
