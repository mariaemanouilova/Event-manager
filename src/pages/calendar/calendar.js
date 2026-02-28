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

export async function renderCalendarPage(outlet) {
  outlet.innerHTML = template;

  const { data: { session } } = await supabase.auth.getSession();

  await loadEvents(session);
  buildFilterChips();
  mountFullCalendar();
}

/* ── Data loading ─────────────────────────────────────────── */
async function loadEvents(session) {
  // Fetch public events
  let query = supabase
    .from('events')
    .select('id, title, description, event_date, location, is_public, calendar_id, creator_id, calendars(id, title, is_public)')
    .order('event_date', { ascending: true });

  const { data: events, error } = await query;

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  // Build unique calendar list and assign colors
  const calMap = new Map();
  (events || []).forEach((evt) => {
    const cal = evt.calendars;
    if (cal && !calMap.has(cal.id)) {
      calMap.set(cal.id, { id: cal.id, title: cal.title, is_public: cal.is_public });
    }
  });

  calendarMeta = Array.from(calMap.values()).map((c, i) => ({
    ...c,
    color: PALETTE[i % PALETTE.length],
    active: true,
  }));

  // Map events to FullCalendar format
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
