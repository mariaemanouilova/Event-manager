import template from './event-form.html?raw';
import './event-form.css';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';
import { navigateTo } from '../../router/router.js';
import { insertNotification } from '../../components/notifications/notifications.js';

let participantEmails = [];
let allUsers = [];  // all registered users from DB
let currentUserId = null;
let editingEventId = null; // null = add mode
let pendingFiles = [];          // File objects queued for upload
let existingAttachments = [];   // rows from event_attachments (edit mode)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/* ═══════════════════════════════════════════════════════════
   Public entry points
   ═══════════════════════════════════════════════════════════ */
export async function renderAddEventPage(outlet) {
  editingEventId = null;
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { navigateTo('/login'); return; }
  currentUserId = session.user.id;

  document.getElementById('form-page-title').textContent = 'New Event';
  document.getElementById('evt-submit-label').textContent = 'Create Event';

  pendingFiles = [];
  existingAttachments = [];

  await loadCalendars();
  await loadAllUsers();
  wireAttachmentUpload();
  wireForm();
}

export async function renderEditEventPage(outlet, eventId) {
  editingEventId = eventId;
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { navigateTo('/login'); return; }
  currentUserId = session.user.id;

  document.getElementById('form-page-title').textContent = 'Edit Event';
  document.getElementById('evt-submit-label').textContent = 'Save Changes';

  pendingFiles = [];
  existingAttachments = [];

  await loadCalendars();
  await loadAllUsers();
  await loadEventData(eventId);
  wireAttachmentUpload();
  wireForm();
}

/* ── Load calendars dropdown ──────────────────────────────── */
async function loadCalendars() {
  const { data: calendars, error } = await supabase
    .from('calendars')
    .select('id, title')
    .order('title');

  if (error) { showToast(error.message, 'error'); return; }

  const sel = document.getElementById('evt-calendar');
  (calendars || []).forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.title;
    sel.appendChild(opt);
  });
}

/* ── Load all registered users ────────────────────────────── */
async function loadAllUsers() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, full_name')
    .order('email');

  if (error) { showToast(error.message, 'error'); return; }

  allUsers = users || [];
  populateUserSelect();
}

function populateUserSelect() {
  const sel = document.getElementById('evt-participant-select');
  sel.innerHTML = '';
  allUsers.forEach((u) => {
    if (participantEmails.includes(u.email)) return;
    const opt = document.createElement('option');
    opt.value = u.email;
    opt.textContent = u.full_name ? `${u.full_name} (${u.email})` : u.email;
    sel.appendChild(opt);
  });
}

/* ── Load existing event for edit ─────────────────────────── */
async function loadEventData(eventId) {
  const { data: evt, error } = await supabase
    .from('events')
    .select('*, participants(user_id, users(email))')
    .eq('id', eventId)
    .single();

  if (error || !evt) {
    showToast(error?.message || 'Event not found.', 'error');
    navigateTo('/event');
    return;
  }

  document.getElementById('evt-title').value = evt.title;
  document.getElementById('evt-calendar').value = evt.calendar_id;
  document.getElementById('evt-description').value = evt.description || '';
  document.getElementById('evt-location').value = evt.location || '';

  // datetime-local expects "YYYY-MM-DDTHH:MM"
  const d = new Date(evt.event_date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  document.getElementById('evt-date').value = local;

  // Visibility
  if (evt.is_public) {
    document.getElementById('evt-public').checked = true;
  } else {
    document.getElementById('evt-private').checked = true;
  }

  // Participants
  participantEmails = (evt.participants || [])
    .map((p) => p.users?.email)
    .filter(Boolean);
  renderParticipantChips();

  // Existing attachments
  await loadExistingAttachments(eventId);
}

/* ── Attachment helpers ────────────────────────────────────── */
async function loadExistingAttachments(eventId) {
  const { data, error } = await supabase
    .from('event_attachments')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at');

  if (error) { showToast('Could not load attachments.', 'warning'); return; }
  existingAttachments = data || [];
  renderExistingAttachments();
}

function wireAttachmentUpload() {
  const dropZone = document.getElementById('attachment-drop-zone');
  const fileInput = document.getElementById('evt-attachments');

  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';  // reset so same file can be re-selected
  });

  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });
}

function addFiles(fileList) {
  for (const file of fileList) {
    if (file.size > MAX_FILE_SIZE) {
      showToast(`"${file.name}" exceeds 10 MB limit.`, 'warning');
      continue;
    }
    // avoid duplicates by name+size
    if (pendingFiles.some((f) => f.name === file.name && f.size === file.size)) continue;
    pendingFiles.push(file);
  }
  renderPendingFiles();
}

function renderPendingFiles() {
  const container = document.getElementById('attachment-preview-list');
  container.innerHTML = pendingFiles.map((file, i) => {
    const isImage = file.type.startsWith('image/');
    const thumb = isImage
      ? `<img src="${URL.createObjectURL(file)}" class="attachment-thumb" alt="" />`
      : `<i class="bi ${fileIcon(file.type)} attachment-icon"></i>`;
    return `
      <div class="attachment-card">
        ${thumb}
        <div class="attachment-info">
          <span class="attachment-name" title="${esc(file.name)}">${esc(file.name)}</span>
          <span class="attachment-size">${formatBytes(file.size)}</span>
        </div>
        <button type="button" class="btn-remove-attachment" data-index="${i}" title="Remove">&times;</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.btn-remove-attachment').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingFiles.splice(Number(btn.dataset.index), 1);
      renderPendingFiles();
    });
  });
}

function renderExistingAttachments() {
  const container = document.getElementById('attachment-existing-list');
  container.innerHTML = existingAttachments.map((att) => {
    const isImage = att.file_type.startsWith('image/');
    const publicUrl = getAttachmentPublicUrl(att.file_path);
    const thumb = isImage
      ? `<img src="${publicUrl}" class="attachment-thumb" alt="" />`
      : `<i class="bi ${fileIcon(att.file_type)} attachment-icon"></i>`;
    return `
      <div class="attachment-card">
        ${thumb}
        <div class="attachment-info">
          <a href="${publicUrl}" target="_blank" class="attachment-name" title="${esc(att.file_name)}">${esc(att.file_name)}</a>
          <span class="attachment-size">${formatBytes(att.file_size)}</span>
        </div>
        <button type="button" class="btn-remove-attachment btn-remove-existing" data-id="${att.id}" data-path="${esc(att.file_path)}" title="Remove">&times;</button>
      </div>`;
  }).join('');

  container.querySelectorAll('.btn-remove-existing').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const attId = btn.dataset.id;
      const path = btn.dataset.path;
      await supabase.storage.from('event-attachments').remove([path]);
      await supabase.from('event_attachments').delete().eq('id', attId);
      existingAttachments = existingAttachments.filter((a) => a.id !== attId);
      renderExistingAttachments();
      showToast('Attachment removed.', 'info');
    });
  });
}

function getAttachmentPublicUrl(path) {
  const { data } = supabase.storage.from('event-attachments').getPublicUrl(path);
  return data?.publicUrl || '';
}

async function uploadAttachments(eventId) {
  if (pendingFiles.length === 0) return;

  for (const file of pendingFiles) {
    const filePath = `${eventId}/${Date.now()}_${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from('event-attachments')
      .upload(filePath, file, { upsert: false });

    if (uploadErr) {
      showToast(`Upload failed for "${file.name}": ${uploadErr.message}`, 'error');
      continue;
    }

    const { error: dbErr } = await supabase
      .from('event_attachments')
      .insert({
        event_id: eventId,
        file_name: file.name,
        file_path: filePath,
        file_type: file.type || 'application/octet-stream',
        file_size: file.size,
        uploaded_by: currentUserId,
      });

    if (dbErr) {
      showToast(`Could not save record for "${file.name}".`, 'warning');
    }
  }

  pendingFiles = [];
}

function fileIcon(mimeType) {
  if (mimeType.startsWith('image/')) return 'bi-file-earmark-image';
  if (mimeType === 'application/pdf') return 'bi-file-earmark-pdf';
  if (mimeType.includes('word') || mimeType.includes('.document')) return 'bi-file-earmark-word';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'bi-file-earmark-excel';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'bi-file-earmark-ppt';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'bi-file-earmark-zip';
  return 'bi-file-earmark';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/* ── Participant chips ────────────────────────────────────── */
function wireParticipantAdd() {
  const sel = document.getElementById('evt-participant-select');
  const btn = document.getElementById('add-participant-btn');

  btn.addEventListener('click', () => {
    const selected = Array.from(sel.selectedOptions).map((o) => o.value);
    if (selected.length === 0) {
      showToast('Select at least one user to add.', 'warning');
      return;
    }
    let added = 0;
    selected.forEach((email) => {
      if (!participantEmails.includes(email)) {
        participantEmails.push(email);
        added++;
      }
    });
    if (added > 0) {
      renderParticipantChips();
      populateUserSelect();
    }
  });
}

function renderParticipantChips() {
  const container = document.getElementById('participant-list');
  container.innerHTML = participantEmails.map((email, i) => {
    const user = allUsers.find((u) => u.email === email);
    const label = user?.full_name ? `${user.full_name} (${email})` : email;
    return `
      <span class="participant-chip">
        ${esc(label)}
        <button type="button" class="btn-remove" data-index="${i}" title="Remove">&times;</button>
      </span>
    `;
  }).join('');

  container.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      participantEmails.splice(Number(btn.dataset.index), 1);
      renderParticipantChips();
      populateUserSelect(); // put removed user back into dropdown
    });
  });
}

/* ── Form submit ──────────────────────────────────────────── */
function wireForm() {
  participantEmails = editingEventId ? participantEmails : [];
  if (!editingEventId) renderParticipantChips();
  wireParticipantAdd();

  const form = document.getElementById('event-form');
  const spinner = document.getElementById('evt-spinner');
  const submitBtn = document.getElementById('evt-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('evt-title').value.trim();
    const calendarId = document.getElementById('evt-calendar').value;
    const eventDate = document.getElementById('evt-date').value;
    const location = document.getElementById('evt-location').value.trim();
    const description = document.getElementById('evt-description').value.trim();
    const isPublic = document.querySelector('input[name="evt-visibility"]:checked').value === 'true';

    if (!title || !calendarId || !eventDate) {
      showToast('Please fill in required fields.', 'error');
      return;
    }

    submitBtn.disabled = true;
    spinner.classList.remove('d-none');

    try {
      if (editingEventId) {
        await updateEvent(editingEventId, { title, calendarId, eventDate, location, description, isPublic });
        await uploadAttachments(editingEventId);
        showToast('Event updated.', 'success');
      } else {
        const newEventId = await createEvent({ title, calendarId, eventDate, location, description, isPublic });
        await uploadAttachments(newEventId);
        showToast('Event created.', 'success');
      }
      navigateTo('/event');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  });
}

/* ── CRUD operations ──────────────────────────────────────── */
async function createEvent({ title, calendarId, eventDate, location, description, isPublic }) {
  const { data: evt, error } = await supabase
    .from('events')
    .insert({
      title,
      calendar_id: calendarId,
      event_date: new Date(eventDate).toISOString(),
      location: location || null,
      description: description || null,
      is_public: isPublic,
      creator_id: currentUserId,
    })
    .select()
    .single();

  if (error) throw error;
  await syncParticipants(evt.id);
  return evt.id;
}

async function updateEvent(eventId, { title, calendarId, eventDate, location, description, isPublic }) {
  const { error } = await supabase
    .from('events')
    .update({
      title,
      calendar_id: calendarId,
      event_date: new Date(eventDate).toISOString(),
      location: location || null,
      description: description || null,
      is_public: isPublic,
    })
    .eq('id', eventId);

  if (error) throw error;
  await syncParticipants(eventId);
}

async function syncParticipants(eventId) {
  if (participantEmails.length === 0) return;

  // Resolve emails → user ids
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, email')
    .in('email', participantEmails);

  if (usersErr) { showToast('Could not resolve some participants.', 'warning'); return; }

  const foundEmails = (users || []).map((u) => u.email);
  const notFound = participantEmails.filter((e) => !foundEmails.includes(e));
  if (notFound.length) {
    showToast(`Not registered users skipped: ${notFound.join(', ')}`, 'warning');
  }

  // Delete existing participants for this event (we'll re-insert)
  await supabase.from('participants').delete().eq('event_id', eventId);

  // Insert fresh list
  const rows = (users || []).map((u) => ({
    event_id: eventId,
    user_id: u.id,
    status: 'invited',
  }));

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('participants').insert(rows);
    if (insErr) showToast('Some participants could not be added.', 'warning');
  }

  // ── Send invitation notifications to each participant ───────
  // Fetch event title for the notification message
  const { data: evt } = await supabase
    .from('events')
    .select('title')
    .eq('id', eventId)
    .single();

  const eventTitle = evt?.title || 'an event';

  // Get current user's display info
  const { data: creator } = await supabase
    .from('users')
    .select('full_name, email')
    .eq('id', currentUserId)
    .single();

  const creatorName = creator?.full_name || creator?.email || 'Someone';

  for (const u of (users || [])) {
    await insertNotification({
      userId: u.id,
      eventId,
      message: `${creatorName} invited you to "${eventTitle}"`,
      type: 'invitation',
    });
  }
}

/* ── Helpers ──────────────────────────────────────────────── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
