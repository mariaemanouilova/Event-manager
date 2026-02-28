import { Modal } from 'bootstrap';
import template from './admin.html?raw';
import './admin.css';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';
import { navigateTo } from '../../router/router.js';

let currentTab = 'users';
let editModal = null;
let deleteModal = null;
let viewModal = null;
let pendingDeleteFn = null;

/* ═══════════════════════════════════════════════════════════
   Public entry point
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminPage(outlet) {
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { navigateTo('/login'); return; }

  // verify admin role
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', session.user.id)
    .single();

  if (roleRow?.role !== 'admin') {
    showToast('Access denied. Admin role required.', 'error');
    navigateTo('/calendar');
    return;
  }

  initModals();
  wireTabs();
  await loadTab('users');
}

/* ═══════════════════════════════════════════════════════════
   Modals
   ═══════════════════════════════════════════════════════════ */
function initModals() {
  editModal = new Modal(document.getElementById('adminEditModal'));
  deleteModal = new Modal(document.getElementById('adminDeleteModal'));
  viewModal = new Modal(document.getElementById('adminViewModal'));

  document.getElementById('admin-delete-confirm-btn').addEventListener('click', async () => {
    if (pendingDeleteFn) await pendingDeleteFn();
  });
}

/* ═══════════════════════════════════════════════════════════
   Tabs
   ═══════════════════════════════════════════════════════════ */
function wireTabs() {
  document.querySelectorAll('#admin-tabs .nav-link').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#admin-tabs .nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      await loadTab(currentTab);
    });
  });
}

async function loadTab(tab) {
  showLoading();
  switch (tab) {
    case 'users': await loadUsers(); break;
    case 'calendars': await loadCalendars(); break;
    case 'events': await loadEvents(); break;
    case 'participants': await loadParticipants(); break;
  }
}

/* ═══════════════════════════════════════════════════════════
   USERS
   ═══════════════════════════════════════════════════════════ */
async function loadUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, created_at, user_roles(role)')
    .order('created_at', { ascending: false });

  if (error) { showToast(error.message, 'error'); return; }
  const rows = data || [];

  setHeaders(['Email', 'Full Name', 'Role', 'Created', 'Actions']);
  setRowCount(rows.length, 'user');

  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = rows.map((u) => {
    const role = u.user_roles?.role || 'user';
    const roleBadge = role === 'admin'
      ? '<span class="badge bg-danger">admin</span>'
      : '<span class="badge bg-secondary">user</span>';
    return `<tr>
      <td>${esc(u.email)}</td>
      <td>${esc(u.full_name || '—')}</td>
      <td>${roleBadge}</td>
      <td class="text-nowrap">${fmtDate(u.created_at)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-outline-info admin-action-btn me-1 btn-view" data-id="${u.id}" title="View"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-primary admin-action-btn me-1 btn-edit" data-id="${u.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger admin-action-btn btn-delete" data-id="${u.id}" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  showTable();

  // Wire actions
  tbody.querySelectorAll('.btn-view').forEach((b) => b.addEventListener('click', () => {
    const u = rows.find((r) => r.id === b.dataset.id);
    showViewModal('User Details', {
      Email: u.email,
      'Full Name': u.full_name || '—',
      Role: u.user_roles?.role || 'user',
      Created: fmtDate(u.created_at),
      ID: u.id,
    });
  }));

  tbody.querySelectorAll('.btn-edit').forEach((b) => b.addEventListener('click', () => {
    const u = rows.find((r) => r.id === b.dataset.id);
    showEditUserModal(u);
  }));

  tbody.querySelectorAll('.btn-delete').forEach((b) => b.addEventListener('click', () => {
    const u = rows.find((r) => r.id === b.dataset.id);
    confirmDelete(`Delete user <strong>${esc(u.email)}</strong>? This will cascade to all their data.`, async () => {
      const { error: e } = await supabase.from('users').delete().eq('id', u.id);
      if (e) { showToast(e.message, 'error'); return; }
      showToast('User deleted.', 'success');
      await loadUsers();
    });
  }));
}

function showEditUserModal(u) {
  const role = u.user_roles?.role || 'user';
  document.getElementById('adminEditModalLabel').textContent = 'Edit User';
  document.getElementById('admin-edit-body').innerHTML = `
    <div class="mb-3">
      <label class="form-label">Email</label>
      <input type="email" class="form-control" id="edit-user-email" value="${esc(u.email)}">
    </div>
    <div class="mb-3">
      <label class="form-label">Full Name</label>
      <input type="text" class="form-control" id="edit-user-name" value="${esc(u.full_name || '')}">
    </div>
    <div class="mb-3">
      <label class="form-label">Role</label>
      <select class="form-select" id="edit-user-role">
        <option value="user" ${role === 'user' ? 'selected' : ''}>User</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
    </div>
  `;

  wireEditSave(async () => {
    const email = document.getElementById('edit-user-email').value.trim();
    const full_name = document.getElementById('edit-user-name').value.trim();
    const newRole = document.getElementById('edit-user-role').value;

    const { error: e1 } = await supabase.from('users').update({ email, full_name: full_name || null }).eq('id', u.id);
    if (e1) throw e1;

    // Upsert role
    const { error: e2 } = await supabase.from('user_roles').upsert({ user_id: u.id, role: newRole });
    if (e2) throw e2;

    showToast('User updated.', 'success');
    await loadUsers();
  });

  editModal.show();
}

/* ═══════════════════════════════════════════════════════════
   CALENDARS
   ═══════════════════════════════════════════════════════════ */
async function loadCalendars() {
  const { data, error } = await supabase
    .from('calendars')
    .select('id, title, is_public, creator_id, created_at, users!calendars_creator_id_fkey(email, full_name)')
    .order('created_at', { ascending: false });

  if (error) { showToast(error.message, 'error'); return; }
  const rows = data || [];

  setHeaders(['Title', 'Privacy', 'Creator', 'Created', 'Actions']);
  setRowCount(rows.length, 'calendar');

  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = rows.map((c) => {
    const privacy = c.is_public
      ? '<span class="badge bg-success">Public</span>'
      : '<span class="badge bg-warning text-dark">Private</span>';
    const creator = c.users?.full_name || c.users?.email || '—';
    return `<tr>
      <td class="fw-medium">${esc(c.title)}</td>
      <td>${privacy}</td>
      <td>${esc(creator)}</td>
      <td class="text-nowrap">${fmtDate(c.created_at)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-outline-info admin-action-btn me-1 btn-view" data-id="${c.id}" title="View"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-primary admin-action-btn me-1 btn-edit" data-id="${c.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger admin-action-btn btn-delete" data-id="${c.id}" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  showTable();

  tbody.querySelectorAll('.btn-view').forEach((b) => b.addEventListener('click', () => {
    const c = rows.find((r) => r.id === b.dataset.id);
    showViewModal('Calendar Details', {
      Title: c.title,
      Privacy: c.is_public ? 'Public' : 'Private',
      Creator: c.users?.full_name || c.users?.email || '—',
      Created: fmtDate(c.created_at),
      ID: c.id,
    });
  }));

  tbody.querySelectorAll('.btn-edit').forEach((b) => b.addEventListener('click', () => {
    const c = rows.find((r) => r.id === b.dataset.id);
    showEditCalendarModal(c);
  }));

  tbody.querySelectorAll('.btn-delete').forEach((b) => b.addEventListener('click', () => {
    const c = rows.find((r) => r.id === b.dataset.id);
    confirmDelete(`Delete calendar <strong>${esc(c.title)}</strong>? All associated events will be deleted.`, async () => {
      const { error: e } = await supabase.from('calendars').delete().eq('id', c.id);
      if (e) { showToast(e.message, 'error'); return; }
      showToast('Calendar deleted.', 'success');
      await loadCalendars();
    });
  }));
}

function showEditCalendarModal(c) {
  document.getElementById('adminEditModalLabel').textContent = 'Edit Calendar';
  document.getElementById('admin-edit-body').innerHTML = `
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
  `;

  wireEditSave(async () => {
    const title = document.getElementById('edit-cal-title').value.trim();
    const is_public = document.getElementById('edit-cal-public').value === 'true';
    if (!title) throw new Error('Title is required.');

    const { error: e } = await supabase.from('calendars').update({ title, is_public }).eq('id', c.id);
    if (e) throw e;

    showToast('Calendar updated.', 'success');
    await loadCalendars();
  });

  editModal.show();
}

/* ═══════════════════════════════════════════════════════════
   EVENTS
   ═══════════════════════════════════════════════════════════ */
async function loadEvents() {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, description, event_date, location, is_public, creator_id, calendar_id, created_at, users!events_creator_id_fkey(email, full_name), calendars(title)')
    .order('event_date', { ascending: false });

  if (error) { showToast(error.message, 'error'); return; }
  const rows = data || [];

  setHeaders(['Title', 'Description', 'Date', 'Location', 'Visibility', 'Calendar', 'Creator', 'Actions']);
  setRowCount(rows.length, 'event');

  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = rows.map((e) => {
    const vis = e.is_public
      ? '<span class="badge bg-success">Public</span>'
      : '<span class="badge bg-warning text-dark">Private</span>';
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
      <td class="text-end text-nowrap">
        <button class="btn btn-outline-info admin-action-btn me-1 btn-view" data-id="${e.id}" title="View"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-primary admin-action-btn me-1 btn-edit" data-id="${e.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger admin-action-btn btn-delete" data-id="${e.id}" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  showTable();

  tbody.querySelectorAll('.btn-view').forEach((b) => b.addEventListener('click', () => {
    const e = rows.find((r) => r.id === b.dataset.id);
    const d = new Date(e.event_date);
    showViewModal('Event Details', {
      Title: e.title,
      Description: e.description || '—',
      'Date & Time': d.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      Location: e.location || '—',
      Visibility: e.is_public ? 'Public' : 'Private',
      Calendar: e.calendars?.title || '—',
      Creator: e.users?.full_name || e.users?.email || '—',
      Created: fmtDate(e.created_at),
      ID: e.id,
    });
  }));

  tbody.querySelectorAll('.btn-edit').forEach((b) => b.addEventListener('click', () => {
    const e = rows.find((r) => r.id === b.dataset.id);
    showEditEventModal(e);
  }));

  tbody.querySelectorAll('.btn-delete').forEach((b) => b.addEventListener('click', () => {
    const e = rows.find((r) => r.id === b.dataset.id);
    confirmDelete(`Delete event <strong>${esc(e.title)}</strong>?`, async () => {
      const { error: err } = await supabase.from('events').delete().eq('id', e.id);
      if (err) { showToast(err.message, 'error'); return; }
      showToast('Event deleted.', 'success');
      await loadEvents();
    });
  }));
}

function showEditEventModal(e) {
  const d = new Date(e.event_date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  document.getElementById('adminEditModalLabel').textContent = 'Edit Event';
  document.getElementById('admin-edit-body').innerHTML = `
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
  `;

  // Load current participants + all users for the select
  let currentParticipantIds = [];

  (async () => {
    // Fetch current participants
    const { data: parts } = await supabase
      .from('participants')
      .select('user_id, users(email, full_name)')
      .eq('event_id', e.id);

    currentParticipantIds = (parts || []).map((p) => p.user_id);

    // Fetch all users
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, email, full_name')
      .order('email');

    const users = allUsers || [];

    function renderSelect() {
      const sel = document.getElementById('edit-evt-user-select');
      sel.innerHTML = '';
      users.filter((u) => !currentParticipantIds.includes(u.id)).forEach((u) => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.full_name ? `${u.full_name} (${u.email})` : u.email;
        sel.appendChild(opt);
      });
    }

    function renderChips() {
      const container = document.getElementById('edit-evt-participant-chips');
      container.innerHTML = currentParticipantIds.map((uid) => {
        const u = users.find((x) => x.id === uid);
        const label = u ? (u.full_name ? `${u.full_name} (${u.email})` : u.email) : uid;
        return `<span class="badge bg-primary d-inline-flex align-items-center gap-1 py-1 px-2">
          ${esc(label)}
          <button type="button" class="btn-close btn-close-white" style="font-size:.55rem" data-uid="${uid}" aria-label="Remove"></button>
        </span>`;
      }).join('');

      container.querySelectorAll('.btn-close').forEach((btn) => {
        btn.addEventListener('click', () => {
          currentParticipantIds = currentParticipantIds.filter((id) => id !== btn.dataset.uid);
          renderChips();
          renderSelect();
        });
      });
    }

    renderSelect();
    renderChips();

    document.getElementById('edit-evt-add-participant').addEventListener('click', () => {
      const sel = document.getElementById('edit-evt-user-select');
      const selected = Array.from(sel.selectedOptions).map((o) => o.value);
      if (selected.length === 0) return;
      selected.forEach((uid) => {
        if (!currentParticipantIds.includes(uid)) currentParticipantIds.push(uid);
      });
      renderChips();
      renderSelect();
    });

    // Store ref for save handler
    window.__adminEditParticipantIds = currentParticipantIds;
    window.__adminEditParticipantGetter = () => currentParticipantIds;
  })();

  wireEditSave(async () => {
    const title = document.getElementById('edit-evt-title').value.trim();
    const description = document.getElementById('edit-evt-desc').value.trim();
    const event_date = document.getElementById('edit-evt-date').value;
    const location = document.getElementById('edit-evt-location').value.trim();
    const is_public = document.getElementById('edit-evt-public').value === 'true';

    if (!title || !event_date) throw new Error('Title and date are required.');

    const { error: err } = await supabase.from('events').update({
      title,
      description: description || null,
      event_date: new Date(event_date).toISOString(),
      location: location || null,
      is_public,
    }).eq('id', e.id);

    if (err) throw err;

    // Sync participants: delete all, re-insert current list
    const participantIds = window.__adminEditParticipantGetter ? window.__adminEditParticipantGetter() : [];

    await supabase.from('participants').delete().eq('event_id', e.id);

    if (participantIds.length > 0) {
      const rows = participantIds.map((uid) => ({
        event_id: e.id,
        user_id: uid,
        status: 'invited',
      }));
      const { error: pErr } = await supabase.from('participants').insert(rows);
      if (pErr) showToast('Some participants could not be saved.', 'warning');
    }

    showToast('Event updated.', 'success');
    await loadEvents();
  });

  editModal.show();
}

/* ═══════════════════════════════════════════════════════════
   PARTICIPANTS
   ═══════════════════════════════════════════════════════════ */
async function loadParticipants() {
  const { data, error } = await supabase
    .from('participants')
    .select('id, status, created_at, event_id, user_id, events(title), users(email, full_name)')
    .order('created_at', { ascending: false });

  if (error) { showToast(error.message, 'error'); return; }
  const rows = data || [];

  setHeaders(['User', 'Event', 'Status', 'Created', 'Actions']);
  setRowCount(rows.length, 'participant');

  const statusColors = {
    attending: 'bg-success',
    declined: 'bg-danger',
    maybe: 'bg-warning text-dark',
    invited: 'bg-info',
  };

  const tbody = document.getElementById('admin-tbody');
  tbody.innerHTML = rows.map((p) => {
    const user = p.users?.full_name || p.users?.email || '—';
    const event = p.events?.title || '—';
    const badge = statusColors[p.status] || 'bg-secondary';
    return `<tr>
      <td>${esc(user)}</td>
      <td class="fw-medium">${esc(event)}</td>
      <td><span class="badge ${badge}">${p.status}</span></td>
      <td class="text-nowrap">${fmtDate(p.created_at)}</td>
      <td class="text-end text-nowrap">
        <button class="btn btn-outline-info admin-action-btn me-1 btn-view" data-id="${p.id}" title="View"><i class="bi bi-eye"></i></button>
        <button class="btn btn-outline-primary admin-action-btn me-1 btn-edit" data-id="${p.id}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger admin-action-btn btn-delete" data-id="${p.id}" title="Delete"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  showTable();

  tbody.querySelectorAll('.btn-view').forEach((b) => b.addEventListener('click', () => {
    const p = rows.find((r) => r.id === b.dataset.id);
    showViewModal('Participant Details', {
      User: p.users?.full_name || p.users?.email || '—',
      Event: p.events?.title || '—',
      Status: p.status,
      Created: fmtDate(p.created_at),
      'Participant ID': p.id,
      'Event ID': p.event_id,
      'User ID': p.user_id,
    });
  }));

  tbody.querySelectorAll('.btn-edit').forEach((b) => b.addEventListener('click', () => {
    const p = rows.find((r) => r.id === b.dataset.id);
    showEditParticipantModal(p);
  }));

  tbody.querySelectorAll('.btn-delete').forEach((b) => b.addEventListener('click', () => {
    const p = rows.find((r) => r.id === b.dataset.id);
    const label = `${p.users?.email || 'user'} from ${p.events?.title || 'event'}`;
    confirmDelete(`Remove participant <strong>${esc(label)}</strong>?`, async () => {
      const { error: e } = await supabase.from('participants').delete().eq('id', p.id);
      if (e) { showToast(e.message, 'error'); return; }
      showToast('Participant removed.', 'success');
      await loadParticipants();
    });
  }));
}

function showEditParticipantModal(p) {
  document.getElementById('adminEditModalLabel').textContent = 'Edit Participant';
  document.getElementById('admin-edit-body').innerHTML = `
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
  `;

  wireEditSave(async () => {
    const status = document.getElementById('edit-part-status').value;
    const { error: e } = await supabase.from('participants').update({ status }).eq('id', p.id);
    if (e) throw e;

    showToast('Participant updated.', 'success');
    await loadParticipants();
  });

  editModal.show();
}

/* ═══════════════════════════════════════════════════════════
   Shared helpers
   ═══════════════════════════════════════════════════════════ */
function showLoading() {
  document.getElementById('admin-loading').classList.remove('d-none');
  document.getElementById('admin-table-wrapper').classList.add('d-none');
  document.getElementById('admin-empty').classList.add('d-none');
}

function showTable() {
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

function setHeaders(cols) {
  document.getElementById('admin-thead').innerHTML =
    '<tr>' + cols.map((c) => `<th>${c}</th>`).join('') + '</tr>';
}

function setRowCount(count, label) {
  document.getElementById('admin-row-count').textContent =
    `${count} ${label}${count !== 1 ? 's' : ''}`;
}

function showViewModal(title, fields) {
  document.getElementById('adminViewModalLabel').textContent = title;
  document.getElementById('admin-view-body').innerHTML = `
    <dl class="row mb-0">
      ${Object.entries(fields).map(([k, v]) => `
        <dt class="col-sm-3">${k}</dt>
        <dd class="col-sm-9">${esc(String(v))}</dd>
      `).join('')}
    </dl>
  `;
  viewModal.show();
}

function confirmDelete(message, fn) {
  document.getElementById('admin-delete-message').innerHTML = message;
  const btn = document.getElementById('admin-delete-confirm-btn');
  const spinner = document.getElementById('admin-delete-spinner');

  pendingDeleteFn = async () => {
    btn.disabled = true;
    spinner.classList.remove('d-none');
    try {
      await fn();
      deleteModal.hide();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.add('d-none');
      pendingDeleteFn = null;
    }
  };

  deleteModal.show();
}

function wireEditSave(saveFn) {
  const btn = document.getElementById('admin-edit-save-btn');
  const spinner = document.getElementById('admin-edit-spinner');

  // Remove old listeners by cloning
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    spinner.classList.remove('d-none');
    try {
      await saveFn();
      editModal.hide();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      newBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
