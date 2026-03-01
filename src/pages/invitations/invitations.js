import { Modal } from 'bootstrap';
import template from './invitations.html?raw';
import './invitations.css';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';
import { navigateTo } from '../../router/router.js';
import { insertNotification } from '../../components/notifications/notifications.js';

let invitations = [];
let sortAsc = true; // true = ascending (oldest first), false = descending
let currentUserId = null;
let detailModal = null;

export async function renderInvitationsPage(outlet) {
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { navigateTo('/login'); return; }
  currentUserId = session.user.id;

  await loadInvitations();
  renderTable();
  wireSortButton();
  wireDetailModal();
}

/* ── Load data ────────────────────────────────────────────── */
async function loadInvitations() {
  const { data, error } = await supabase
    .from('participants')
    .select(`
      id,
      status,
      event_id,
      events (
        id, title, description, event_date, location, is_public,
        creator_id,
        users!events_creator_id_fkey ( email, full_name ),
        calendars ( title )
      )
    `)
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false });

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  // Keep only private events — public events don't belong in invitations
  invitations = (data || []).filter((p) => p.events && !p.events.is_public);
}

/* ── Sorting ──────────────────────────────────────────────── */
function wireSortButton() {
  const btn = document.getElementById('sort-date-btn');
  btn.addEventListener('click', () => {
    sortAsc = !sortAsc;
    document.getElementById('sort-icon').className = sortAsc ? 'bi bi-sort-up' : 'bi bi-sort-down';
    renderTable();
  });
}

function getSorted() {
  return [...invitations].sort((a, b) => {
    const da = new Date(a.events.event_date);
    const db = new Date(b.events.event_date);
    return sortAsc ? da - db : db - da;
  });
}

/* ── Render table ─────────────────────────────────────────── */
function renderTable() {
  const loading = document.getElementById('inv-loading');
  const empty = document.getElementById('inv-empty');
  const wrapper = document.getElementById('inv-table-wrapper');
  const tbody = document.getElementById('inv-tbody');
  const countBadge = document.getElementById('inv-count');

  loading.classList.add('d-none');

  countBadge.textContent = `${invitations.length} invitation${invitations.length !== 1 ? 's' : ''}`;

  if (invitations.length === 0) {
    empty.classList.remove('d-none');
    wrapper.classList.add('d-none');
    return;
  }

  empty.classList.add('d-none');
  wrapper.classList.remove('d-none');

  const sorted = getSorted();

  tbody.innerHTML = sorted.map((inv) => {
    const evt = inv.events;
    const date = new Date(evt.event_date);
    const fmtDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const fmtTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const desc = evt.description
      ? (evt.description.length > 60 ? esc(evt.description.slice(0, 60)) + '…' : esc(evt.description))
      : '<span class="text-muted">—</span>';

    const creator = evt.users?.full_name || evt.users?.email || '—';
    const calTitle = evt.calendars?.title || '—';

    return `
      <tr>
        <td class="fw-medium">${esc(evt.title)}</td>
        <td class="desc-cell" title="${esc(evt.description || '')}">${desc}</td>
        <td class="text-nowrap">${fmtDate}<br><small class="text-muted">${fmtTime}</small></td>
        <td>${esc(creator)}</td>
        <td>${esc(calTitle)}</td>
        <td>
          <select class="form-select form-select-sm status-select" data-participant-id="${inv.id}" data-current="${inv.status}">
            <option value="invited"  ${inv.status === 'invited'   ? 'selected' : ''}>Invited</option>
            <option value="attending" ${inv.status === 'attending' ? 'selected' : ''}>Attending</option>
            <option value="maybe"    ${inv.status === 'maybe'     ? 'selected' : ''}>Maybe</option>
            <option value="declined" ${inv.status === 'declined'  ? 'selected' : ''}>Declined</option>
          </select>
        </td>
        <td class="text-end">
          <button class="btn btn-outline-primary btn-sm btn-view-event" data-event='${JSON.stringify(evt).replace(/'/g, '&#39;')}' title="View Event">
            <i class="bi bi-eye me-1"></i>View
          </button>
        </td>
      </tr>`;
  }).join('');

  // Wire status change handlers
  tbody.querySelectorAll('.status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const participantId = sel.dataset.participantId;
      const newStatus = sel.value;
      const oldStatus = sel.dataset.current;

      const { error } = await supabase
        .from('participants')
        .update({ status: newStatus })
        .eq('id', participantId);

      if (error) {
        showToast(error.message, 'error');
        sel.value = oldStatus; // revert
        return;
      }

      sel.dataset.current = newStatus;
      // Update local data
      const inv = invitations.find((i) => i.id === participantId);
      if (inv) inv.status = newStatus;

      showToast(`RSVP updated to "${newStatus}".`, 'success');

      // ── Notify the event creator about the RSVP change ──────
      if (inv?.events) {
        const evt = inv.events;
        const creatorId = evt.creator_id;

        // Only notify if creator is a different user
        if (creatorId && creatorId !== currentUserId) {
          // Get current user's display name
          const { data: me } = await supabase
            .from('users')
            .select('full_name, email')
            .eq('id', currentUserId)
            .single();

          const myName = me?.full_name || me?.email || 'A participant';

          await insertNotification({
            userId: creatorId,
            eventId: evt.id,
            message: `${myName} changed RSVP to "${newStatus}" for "${evt.title}"`,
            type: 'rsvp_update',
          });
        }
      }
    });
  });

  // Wire view-event buttons
  tbody.querySelectorAll('.btn-view-event').forEach((btn) => {
    btn.addEventListener('click', () => {
      const evt = JSON.parse(btn.dataset.event);
      showEventDetail(evt);
    });
  });
}

/* ── Event detail modal ───────────────────────────────────── */
function wireDetailModal() {
  const modalEl = document.getElementById('eventDetailModal');
  detailModal = new Modal(modalEl);
}

function showEventDetail(evt) {
  const date = new Date(evt.event_date);
  const fmtDate = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const creator = evt.users?.full_name || evt.users?.email || '—';
  const calTitle = evt.calendars?.title || '—';
  const visibility = evt.is_public ? 'Public' : 'Private';

  document.getElementById('eventDetailModalLabel').textContent = evt.title;
  document.getElementById('event-detail-body').innerHTML = `
    <dl class="row mb-0">
      <dt class="col-sm-3">Date &amp; Time</dt>
      <dd class="col-sm-9">${fmtDate} at ${fmtTime}</dd>

      <dt class="col-sm-3">Location</dt>
      <dd class="col-sm-9">${esc(evt.location || 'Not specified')}</dd>

      <dt class="col-sm-3">Description</dt>
      <dd class="col-sm-9">${esc(evt.description || 'No description')}</dd>

      <dt class="col-sm-3">Visibility</dt>
      <dd class="col-sm-9"><span class="badge ${evt.is_public ? 'bg-success' : 'bg-danger'}">${visibility}</span></dd>

      <dt class="col-sm-3">Creator</dt>
      <dd class="col-sm-9">${esc(creator)}</dd>

      <dt class="col-sm-3">Calendar</dt>
      <dd class="col-sm-9">${esc(calTitle)}</dd>
    </dl>
  `;

  detailModal.show();
}

/* ── Helpers ──────────────────────────────────────────────── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
