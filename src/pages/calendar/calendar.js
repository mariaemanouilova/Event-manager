import { Modal } from 'bootstrap';
import template from './calendar.html?raw';
import './calendar.css';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';

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

export async function renderCalendarPage(outlet) {
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();
  currentSession = session;

  await loadEvents(session);
  buildFilterChips();
  mountFullCalendar();
  wireCreateCalendarModal(session);
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
    };
  });
}

/* ── Filter chips ─────────────────────────────────────────── */
function buildFilterChips() {
  const container = document.getElementById('calendar-filters');
  if (!container) return;

  container.innerHTML = '<span class="text-muted small me-1">Filter:</span>';

  calendarMeta.forEach((cal) => {
    const chip = document.createElement('span');
    chip.className = `calendar-filter-chip${cal.active ? '' : ' inactive'}`;
    chip.innerHTML = `<span class="calendar-filter-dot" style="background:${cal.color}"></span>${escapeHtml(cal.title)}`;
    chip.addEventListener('click', () => {
      cal.active = !cal.active;
      chip.classList.toggle('inactive', !cal.active);
      updateCalendarEvents();
    });
    container.appendChild(chip);
  });
}

function getVisibleEvents() {
  const activeCalIds = new Set(calendarMeta.filter((c) => c.active).map((c) => c.id));
  return allEvents.filter((e) => activeCalIds.has(e.extendedProps.calendarId));
}

function updateCalendarEvents() {
  if (!calendarInstance) return;
  calendarInstance.removeAllEvents();
  getVisibleEvents().forEach((e) => calendarInstance.addEvent(e));
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
    events: getVisibleEvents(),
    height: 'auto',
    dayMaxEvents: 3,
    eventDisplay: 'block',
    fixedWeekCount: false,
    eventClick(info) {
      const props = info.event.extendedProps;
      const date = new Date(info.event.start);
      const formatted = date.toLocaleString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      showToast(
        `<strong>${escapeHtml(info.event.title)}</strong><br>` +
        `<small>${formatted}</small><br>` +
        `<small><i class="bi bi-geo-alt"></i> ${escapeHtml(props.location || 'No location')}</small><br>` +
        `<small><i class="bi bi-calendar3"></i> ${escapeHtml(props.calendarTitle)}</small>`,
        'info',
        6000
      );
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
  if (calendarInstance) {
    calendarInstance.removeAllEvents();
    getVisibleEvents().forEach((e) => calendarInstance.addEvent(e));
  }
}
