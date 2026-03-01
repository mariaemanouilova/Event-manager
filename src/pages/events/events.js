import { Modal } from 'bootstrap';
import template from './events.html?raw';
import './events.css';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';
import { navigateTo } from '../../router/router.js';

let allEvents = [];      // full dataset
let filteredEvents = [];  // after filters
let currentUserId = null;
let deleteModal = null;
let pendingDeleteId = null;

export async function renderEventsPage(outlet) {
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { navigateTo('/login'); return; }
  currentUserId = session.user.id;

  await loadEvents();
  applyFilters();
  wireFilters();
  wireDeleteModal();
}

/* ── Data ─────────────────────────────────────────────────── */
async function loadEvents() {
  // 1. Events I created
  const { data: created, error: errCreated } = await supabase
    .from('events')
    .select('id, title, description, event_date, location, is_public, creator_id, calendar_id, calendars(id, title), participants(user_id, status, users(email, full_name))')
    .eq('creator_id', currentUserId)
    .order('event_date', { ascending: false });

  if (errCreated) { showToast(errCreated.message, 'error'); return; }

  // 2. Events I'm invited to (but didn't create)
  const { data: invitedParts, error: errInvited } = await supabase
    .from('participants')
    .select('event_id, status, events(id, title, description, event_date, location, is_public, creator_id, calendar_id, calendars(id, title), participants(user_id, status, users(email, full_name)))')
    .eq('user_id', currentUserId);

  if (errInvited) { showToast(errInvited.message, 'error'); return; }

  // Merge, avoiding duplicates — exclude public events (they belong in Calendar / Public Events)
  const eventMap = new Map();
  (created || []).forEach((e) => {
    if (!e.is_public) eventMap.set(e.id, { ...e, _source: 'created' });
  });
  (invitedParts || []).forEach((p) => {
    const e = p.events;
    if (e && !e.is_public && !eventMap.has(e.id)) {
      eventMap.set(e.id, { ...e, _source: 'invited' });
    }
  });

  allEvents = Array.from(eventMap.values());

  // Populate calendar filter dropdown
  const calSelect = document.getElementById('filter-calendar');
  const cals = new Map();
  allEvents.forEach((e) => {
    if (e.calendars && !cals.has(e.calendars.id)) {
      cals.set(e.calendars.id, e.calendars.title);
    }
  });
  calSelect.innerHTML = '<option value="">All calendars</option>';
  cals.forEach((title, id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = title;
    calSelect.appendChild(opt);
  });
}

/* ── Filters ──────────────────────────────────────────────── */
function wireFilters() {
  document.getElementById('filter-calendar').addEventListener('change', applyFilters);
  document.getElementById('filter-ownership').addEventListener('change', applyFilters);
}

function applyFilters() {
  const calId = document.getElementById('filter-calendar').value;
  const ownership = document.getElementById('filter-ownership').value;

  filteredEvents = allEvents.filter((e) => {
    if (calId && e.calendar_id !== calId) return false;
    if (ownership === 'created' && e.creator_id !== currentUserId) return false;
    if (ownership === 'invited' && e.creator_id === currentUserId) return false;
    return true;
  });

  renderTable();
}

/* ── Table rendering ──────────────────────────────────────── */
function renderTable() {
  const loading = document.getElementById('events-loading');
  const empty = document.getElementById('events-empty');
  const wrapper = document.getElementById('events-table-wrapper');
  const tbody = document.getElementById('events-tbody');
  const countBadge = document.getElementById('events-count');

  loading.classList.add('d-none');
  countBadge.textContent = `${filteredEvents.length} event${filteredEvents.length !== 1 ? 's' : ''}`;

  if (filteredEvents.length === 0) {
    empty.classList.remove('d-none');
    wrapper.classList.add('d-none');
    return;
  }

  empty.classList.add('d-none');
  wrapper.classList.remove('d-none');

  tbody.innerHTML = filteredEvents.map((evt) => {
    const date = new Date(evt.event_date);
    const fmtDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const fmtTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const desc = evt.description
      ? (evt.description.length > 60 ? esc(evt.description.slice(0, 60)) + '…' : esc(evt.description))
      : '<span class="text-muted">—</span>';
    const statusBadge = evt.is_public
      ? '<span class="badge badge-public">Public</span>'
      : '<span class="badge badge-private">Private</span>';
    const calTitle = evt.calendars?.title ? esc(evt.calendars.title) : '—';
    const isOwner = evt.creator_id === currentUserId;

    // Participants list
    const parts = (evt.participants || []).map((p) => {
      const name = p.users?.full_name || p.users?.email || 'Unknown';
      const cls = statusColor(p.status);
      return `<span class="badge ${cls}" title="${esc(p.status)}">${esc(name)}</span>`;
    }).join('');

    // Creator display — show "Me" or fetch email later (for now, use creator_id check)
    const creatorLabel = isOwner ? '<em>Me</em>' : '<span class="text-muted">Other</span>';

    return `
      <tr>
        <td class="fw-medium">${esc(evt.title)}</td>
        <td class="desc-cell" title="${esc(evt.description || '')}">${desc}</td>
        <td><div class="participant-badges">${parts || '<span class="text-muted">—</span>'}</div></td>
        <td class="text-nowrap">${fmtDate}<br><small class="text-muted">${fmtTime}</small></td>
        <td>${esc(evt.location || '—')}</td>
        <td>${statusBadge}</td>
        <td>${creatorLabel}</td>
        <td>${calTitle}</td>
        <td class="text-end text-nowrap">
          ${isOwner ? `<a href="/event/${evt.id}/edit" data-link="true" class="btn btn-outline-primary btn-sm me-1" title="Edit">
            <i class="bi bi-pencil-square"></i>
          </a>
          <button class="btn btn-outline-danger btn-sm btn-delete-event" data-id="${evt.id}" data-title="${esc(evt.title)}" title="Delete">
            <i class="bi bi-trash"></i>
          </button>` : ''}
        </td>
      </tr>`;
  }).join('');

  // Re-attach delete buttons
  tbody.querySelectorAll('.btn-delete-event').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingDeleteId = btn.dataset.id;
      document.getElementById('delete-event-title').textContent = btn.dataset.title;
      deleteModal.show();
    });
  });
}

/* ── Delete ────────────────────────────────────────────────── */
function wireDeleteModal() {
  const modalEl = document.getElementById('deleteEventModal');
  deleteModal = new Modal(modalEl);

  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    const spinner = document.getElementById('delete-spinner');
    const btn = document.getElementById('confirm-delete-btn');
    btn.disabled = true;
    spinner.classList.remove('d-none');

    const { error } = await supabase.from('events').delete().eq('id', pendingDeleteId);

    btn.disabled = false;
    spinner.classList.add('d-none');
    deleteModal.hide();

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Event deleted.', 'info');
    allEvents = allEvents.filter((e) => e.id !== pendingDeleteId);
    pendingDeleteId = null;
    applyFilters();
  });
}

/* ── Helpers ──────────────────────────────────────────────── */
function statusColor(status) {
  switch (status) {
    case 'attending': return 'bg-success';
    case 'declined': return 'bg-danger';
    case 'maybe': return 'bg-warning text-dark';
    default: return 'bg-secondary';
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
