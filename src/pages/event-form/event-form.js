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

  await loadCalendars();
  await loadAllUsers();
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

  await loadCalendars();
  await loadAllUsers();
  await loadEventData(eventId);
  wireForm();
}

/* ── Load calendars dropdown ──────────────────────────────── */
async function loadCalendars() {
  const { data: calendars, error } = await supabase
    .from('calendars')
    .select('id, title')
    .eq('creator_id', currentUserId)
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
        showToast('Event updated.', 'success');
      } else {
        await createEvent({ title, calendarId, eventDate, location, description, isPublic });
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
