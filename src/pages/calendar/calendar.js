import { Modal } from 'bootstrap';
import template from './calendar.html?raw';
import './calendar.css';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';
import { navigateTo } from '../../router/router.js';

// Color palette for calendars (Google Calendar-inspired)
const PALETTE = [
  '#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01',
  '#46bdc6', '#7986cb', '#8e24aa', '#e67c73', '#616161',
];

let calendarInstance = null;
let allEvents = [];
let calendarMeta = []; // { id, title, color, active }
let currentSession = null;
let createCalModal = null;
let isAdmin = false;
let deleteEventModal = null;
let pendingDeleteEventId = null;
let visFilter = { public: true, private: true };
let renderGeneration = 0;

export async function renderCalendarPage(outlet) {
  // Increment generation — any previous in-flight render becomes stale
  const myGen = ++renderGeneration;

  outlet.innerHTML = template;

  // Reset visibility filter state on every render
  visFilter = { public: true, private: true };

  const { data: { session } } = await supabase.auth.getSession();
  if (myGen !== renderGeneration) return; // stale render, bail out
  currentSession = session;

  // Check admin role
  if (session) {
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .single();
    if (myGen !== renderGeneration) return; // stale render, bail out
    isAdmin = roleRow?.role === 'admin';
  }

  await loadEvents(session);
  if (myGen !== renderGeneration) return; // stale render, bail out

  buildFilterChips();
  mountFullCalendar();
  wireVisibilityFilter();
  wireCreateCalendarModal(session);
  wireEventPopup();
  wireDeleteEventModal();
}

/* ── Data loading ─────────────────────────────────────────── */
async function loadEvents(session) {
  const userId = session?.user?.id;

  // 1. Fetch events the user can see (RLS: public + own + invited)
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, description, event_date, location, is_public, calendar_id, creator_id, calendars(id, title, is_public)')
    .order('event_date', { ascending: true });

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  // 2. Fetch calendars the user created (so empty own calendars still appear)
  const { data: ownCalendars, error: calErr } = await supabase
    .from('calendars')
    .select('id, title, is_public')
    .eq('creator_id', userId)
    .order('title');

  if (calErr) {
    showToast(calErr.message, 'error');
  }

  // 3. Build calendarMeta only from relevant calendars:
  //    - calendars the user created (own)
  //    - calendars linked to visible events
  const calMap = new Map();

  // Add own calendars first
  (ownCalendars || []).forEach((c) => {
    calMap.set(c.id, { id: c.id, title: c.title, is_public: c.is_public });
  });

  // Add calendars referenced by visible events
  (events || []).forEach((evt) => {
    if (evt.calendars && !calMap.has(evt.calendar_id)) {
      calMap.set(evt.calendar_id, {
        id: evt.calendars.id,
        title: evt.calendars.title,
        is_public: evt.calendars.is_public,
      });
    }
  });

  // Sort by title and assign colors
  const sortedCals = Array.from(calMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  calendarMeta = sortedCals.map((c, i) => ({
    ...c,
    color: PALETTE[i % PALETTE.length],
    active: true,
  }));

  // 4. Map events to FullCalendar format
  allEvents = (events || []).map((evt) => {
    const meta = calendarMeta.find((c) => c.id === evt.calendar_id);
    return {
      id: evt.id,
      title: evt.title,
      start: evt.event_date,
      extendedProps: {
        description: evt.description,
        location: evt.location,
        calendarId: evt.calendar_id,
        calendarTitle: meta?.title || 'Unknown',
        isPublic: evt.is_public,
        creatorId: evt.creator_id,
      },
      backgroundColor: meta?.color || PALETTE[0],
      borderColor: meta?.color || PALETTE[0],
      classNames: [evt.is_public ? 'evt-public' : 'evt-private'],
    };
  });
}

/* ── Filter chips (sidebar legend) ─────────────────────────── */
function buildFilterChips() {
  const container = document.getElementById('calendar-filters');
  if (!container) return;

  container.innerHTML = '';

  calendarMeta.forEach((cal) => {
    // Count events for this calendar
    const count = allEvents.filter((e) => e.extendedProps.calendarId === cal.id).length;

    const item = document.createElement('div');
    item.className = `cal-legend-item${cal.active ? '' : ' inactive'}`;
    item.innerHTML = `
      <span class="cal-legend-bar" style="background:${cal.color}"></span>
      <span class="cal-legend-dot" style="background:${cal.color}"></span>
      <span class="cal-legend-text">${escapeHtml(cal.title)}</span>
      <span class="cal-legend-count">${count}</span>
    `;
    item.addEventListener('click', () => {
      cal.active = !cal.active;
      item.classList.toggle('inactive', !cal.active);
      updateCalendarEvents();
    });
    container.appendChild(item);
  });

  // Also populate sidebar stats & upcoming
  populateSidebarStats();
  populateUpcomingEvents();
}

function getVisibleEvents() {
  const activeCalIds = new Set(calendarMeta.filter((c) => c.active).map((c) => c.id));
  return allEvents.filter((e) => {
    if (!activeCalIds.has(e.extendedProps.calendarId)) return false;
    if (!visFilter.public && e.extendedProps.isPublic) return false;
    if (!visFilter.private && !e.extendedProps.isPublic) return false;
    return true;
  });
}

function updateCalendarEvents() {
  if (!calendarInstance) return;
  calendarInstance.refetchEvents();
}

/* ── FullCalendar ─────────────────────────────────────────── */
function mountFullCalendar() {
  const el = document.getElementById('fullcalendar');
  if (!el) return;

  calendarInstance = new Calendar(el, {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,dayGridWeek',
    },
    events: function(_fetchInfo, successCallback) {
      successCallback(getVisibleEvents());
    },
    height: 'auto',
    dayMaxEvents: 3,
    eventDisplay: 'block',
    fixedWeekCount: false,
    eventClick(info) {
      info.jsEvent.preventDefault();
      showEventPopup(info.event, info.jsEvent);
    },
  });

  calendarInstance.render();
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/* ── Sidebar: Upcoming Events ─────────────────────────────── */
function populateUpcomingEvents() {
  const container = document.getElementById('cal-upcoming-list');
  if (!container) return;

  const now = new Date();
  const upcoming = allEvents
    .filter((e) => new Date(e.start) >= now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .slice(0, 5);

  if (upcoming.length === 0) {
    container.innerHTML = '<p class="text-muted small mb-0">No upcoming events</p>';
    return;
  }

  container.innerHTML = upcoming.map((evt) => {
    const meta = calendarMeta.find((c) => c.id === evt.extendedProps.calendarId);
    const color = meta?.color || PALETTE[0];
    const date = new Date(evt.start);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="cal-upcoming-item">
        <div class="cal-upcoming-color" style="background:${color}"></div>
        <div class="cal-upcoming-info">
          <div class="cal-upcoming-title">${escapeHtml(evt.title)}</div>
          <div class="cal-upcoming-date">${dateStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

/* ── Sidebar: Stats ───────────────────────────────────────── */
function populateSidebarStats() {
  const totalEl = document.getElementById('cal-stat-total');
  const calsEl = document.getElementById('cal-stat-calendars');
  const upcomingEl = document.getElementById('cal-stat-upcoming');

  if (totalEl) totalEl.textContent = allEvents.length;
  if (calsEl) calsEl.textContent = calendarMeta.length;

  const now = new Date();
  const upcomingCount = allEvents.filter((e) => new Date(e.start) >= now).length;
  if (upcomingEl) upcomingEl.textContent = upcomingCount;

  // Visibility counts
  const pubCount = allEvents.filter((e) => e.extendedProps.isPublic).length;
  const privCount = allEvents.filter((e) => !e.extendedProps.isPublic).length;
  const pubCountEl = document.getElementById('cal-vis-public-count');
  const privCountEl = document.getElementById('cal-vis-private-count');
  if (pubCountEl) pubCountEl.textContent = pubCount;
  if (privCountEl) privCountEl.textContent = privCount;
}

/* ── Visibility filter ────────────────────────────────────── */
function wireVisibilityFilter() {
  const pubBtn = document.getElementById('cal-vis-public-btn');
  const privBtn = document.getElementById('cal-vis-private-btn');

  if (pubBtn) {
    pubBtn.addEventListener('click', () => {
      visFilter.public = !visFilter.public;
      pubBtn.classList.toggle('inactive', !visFilter.public);
      updateCalendarEvents();
    });
  }

  if (privBtn) {
    privBtn.addEventListener('click', () => {
      visFilter.private = !visFilter.private;
      privBtn.classList.toggle('inactive', !visFilter.private);
      updateCalendarEvents();
    });
  }
}

/* ══════════════════════════════════════════════════════════
   Create Calendar modal
   ══════════════════════════════════════════════════════════ */
function wireCreateCalendarModal(session) {
  const modalEl = document.getElementById('createCalendarModal');
  if (!modalEl) return;

  createCalModal = new Modal(modalEl);

  const btn = document.getElementById('create-calendar-btn');
  btn.addEventListener('click', () => {
    // Pre-fill readonly fields
    const creatorField = document.getElementById('cal-creator');
    creatorField.value = session?.user?.email || 'Unknown';

    const dateField = document.getElementById('cal-created-date');
    dateField.value = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Reset editable fields
    document.getElementById('cal-title').value = '';
    document.getElementById('cal-private').checked = true;

    createCalModal.show();
  });

  // Form submit
  const form = document.getElementById('create-calendar-form');
  const spinner = document.getElementById('cal-spinner');
  const submitBtn = document.getElementById('cal-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('cal-title').value.trim();
    if (!title) {
      showToast('Calendar title is required.', 'error');
      return;
    }

    const isPublic = document.querySelector('input[name="cal-privacy"]:checked').value === 'true';

    submitBtn.disabled = true;
    spinner.classList.remove('d-none');

    try {
      const { error } = await supabase
        .from('calendars')
        .insert({
          title,
          is_public: isPublic,
          creator_id: session.user.id,
        });

      if (error) throw error;

      showToast(`Calendar "${title}" created!`, 'success');
      createCalModal.hide();

      // Refresh calendar view to show the new calendar in filters
      await refreshCalendarView();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      spinner.classList.add('d-none');
    }
  });
}

/* ── Refresh entire calendar + filters after creating a calendar ─ */
async function refreshCalendarView() {
  await loadEvents(currentSession);
  buildFilterChips();
  updateCalendarEvents();
}

/* ══════════════════════════════════════════════════════════
   Event Detail Popup (Google Calendar style)
   ══════════════════════════════════════════════════════════ */
function wireEventPopup() {
  document.getElementById('event-popup-close').addEventListener('click', closeEventPopup);
  document.getElementById('event-popup-backdrop').addEventListener('click', closeEventPopup);
}

function showEventPopup(fcEvent, jsEvent) {
  const props = fcEvent.extendedProps;
  const popup = document.getElementById('event-popup');
  const backdrop = document.getElementById('event-popup-backdrop');

  // Find the color from calendarMeta
  const meta = calendarMeta.find((c) => c.id === props.calendarId);
  const color = meta?.color || PALETTE[0];

  // Header
  const header = document.getElementById('event-popup-header');
  header.style.backgroundColor = color;
  document.getElementById('event-popup-title').textContent = fcEvent.title;

  // Body fields
  const date = new Date(fcEvent.start);
  document.getElementById('event-popup-date').textContent = date.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  document.getElementById('event-popup-location').textContent = props.location || 'No location';
  document.getElementById('event-popup-calendar').textContent = props.calendarTitle;
  document.getElementById('event-popup-visibility').textContent = props.isPublic ? 'Public' : 'Private';

  const descRow = document.getElementById('event-popup-desc-row');
  const descEl = document.getElementById('event-popup-desc');
  if (props.description) {
    descEl.textContent = props.description;
    descRow.classList.remove('d-none');
  } else {
    descRow.classList.add('d-none');
  }

  // Attachments
  const attRow = document.getElementById('event-popup-attachments-row');
  const attContainer = document.getElementById('event-popup-attachments');
  attRow.classList.add('d-none');
  attContainer.innerHTML = '';
  loadPopupAttachments(fcEvent.id, attRow, attContainer);

  // Footer — show edit/delete only for creator or admin
  const userId = currentSession?.user?.id;
  const canEdit = userId === props.creatorId || isAdmin;
  const footer = document.getElementById('event-popup-footer');

  if (canEdit) {
    footer.classList.remove('d-none');
    const editBtn = document.getElementById('event-popup-edit');
    editBtn.href = `/event/${fcEvent.id}/edit`;
    editBtn.onclick = (e) => {
      e.preventDefault();
      closeEventPopup();
      navigateTo(`/event/${fcEvent.id}/edit`);
    };

    const deleteBtn = document.getElementById('event-popup-delete');
    deleteBtn.onclick = () => {
      closeEventPopup();
      pendingDeleteEventId = fcEvent.id;
      document.getElementById('cal-delete-event-title').textContent = fcEvent.title;
      deleteEventModal.show();
    };
  } else {
    footer.classList.add('d-none');
  }

  // Position popup near the clicked event
  positionPopup(popup, jsEvent);
  popup.classList.remove('d-none');
  backdrop.classList.remove('d-none');
}

function closeEventPopup() {
  document.getElementById('event-popup').classList.add('d-none');
  document.getElementById('event-popup-backdrop').classList.add('d-none');
}

function positionPopup(popup, jsEvent) {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Temporarily show off-screen to measure
  popup.style.left = '-9999px';
  popup.style.top = '-9999px';
  popup.classList.remove('d-none');
  const rect = popup.getBoundingClientRect();
  popup.classList.add('d-none');

  let left = jsEvent.clientX + margin;
  let top = jsEvent.clientY + margin;

  // Keep within viewport
  if (left + rect.width > vw - margin) left = vw - rect.width - margin;
  if (top + rect.height > vh - margin) top = vh - rect.height - margin;
  if (left < margin) left = margin;
  if (top < margin) top = margin;

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/* ── Popup attachments ───────────────────────────────────── */
async function loadPopupAttachments(eventId, row, container) {
  const { data } = await supabase
    .from('event_attachments')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at');

  if (!data || data.length === 0) return;

  container.innerHTML = data.map((att) => {
    const { data: urlData } = supabase.storage.from('event-attachments').getPublicUrl(att.file_path);
    const url = urlData?.publicUrl || '#';
    const isImage = att.file_type.startsWith('image/');
    const icon = isImage
      ? `<img src="${url}" class="att-thumb" alt="" />`
      : `<i class="bi ${popupAttIcon(att.file_type)}"></i>`;
    return `<a href="${url}" target="_blank" class="attachment-link" title="${escapeHtml(att.file_name)}">${icon}<span class="att-name">${escapeHtml(att.file_name)}</span></a>`;
  }).join('');
  row.classList.remove('d-none');
}

function popupAttIcon(mime) {
  if (mime.startsWith('image/')) return 'bi-file-earmark-image';
  if (mime === 'application/pdf') return 'bi-file-earmark-pdf';
  if (mime.includes('word') || mime.includes('.document')) return 'bi-file-earmark-word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'bi-file-earmark-excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'bi-file-earmark-ppt';
  return 'bi-file-earmark';
}

/* ── Delete Event from calendar ───────────────────────────── */
function wireDeleteEventModal() {
  const modalEl = document.getElementById('calDeleteEventModal');
  if (!modalEl) return;
  deleteEventModal = new Modal(modalEl);

  const btn = document.getElementById('cal-delete-event-btn');
  const spinner = document.getElementById('cal-delete-spinner');

  btn.addEventListener('click', async () => {
    if (!pendingDeleteEventId) return;
    btn.disabled = true;
    spinner.classList.remove('d-none');

    try {
      const { error } = await supabase.from('events').delete().eq('id', pendingDeleteEventId);
      if (error) throw error;

      showToast('Event deleted.', 'success');
      deleteEventModal.hide();
      await refreshCalendarView();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      spinner.classList.add('d-none');
      pendingDeleteEventId = null;
    }
  });
}
