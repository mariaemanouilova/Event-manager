import template from './home.html?raw';
import './home.css';
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';

// Color palette for calendars (same as calendar page)
const PALETTE = [
  '#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01',
  '#46bdc6', '#7986cb', '#8e24aa', '#e67c73', '#616161',
];

let calendarInstance = null;
let allEvents = [];
let calendarMeta = []; // { id, title, color, active }

export async function renderPublicHomePage(outlet) {
  outlet.innerHTML = template;

  await loadPublicEvents();
  buildFilterChips();
  mountFullCalendar();
  wireEventPopup();
}

/* ── Data loading (uses security-definer RPC to bypass RLS) ─ */
async function loadPublicEvents() {
  const { data: events, error } = await supabase.rpc('get_public_events');

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  // Build calendar metadata from the events
  const calMap = new Map();
  (events || []).forEach((evt) => {
    if (evt.calendar_id && !calMap.has(evt.calendar_id)) {
      calMap.set(evt.calendar_id, {
        id: evt.calendar_id,
        title: evt.calendar_title || 'Unknown',
      });
    }
  });

  const sortedCals = Array.from(calMap.values()).sort((a, b) => a.title.localeCompare(b.title));
  calendarMeta = sortedCals.map((c, i) => ({
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
      },
      backgroundColor: meta?.color || PALETTE[0],
      borderColor: meta?.color || PALETTE[0],
    };
  });
}

/* ── Filter chips ─────────────────────────────────────────── */
function buildFilterChips() {
  const container = document.getElementById('home-calendar-filters');
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
  const el = document.getElementById('home-fullcalendar');
  if (!el) return;

  calendarInstance = new Calendar(el, {
    plugins: [dayGridPlugin],
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
      info.jsEvent.preventDefault();
      showEventPopup(info.event, info.jsEvent);
    },
  });

  calendarInstance.render();
}

/* ── Event popup (read-only) ──────────────────────────────── */
function wireEventPopup() {
  document.getElementById('home-event-popup-close').addEventListener('click', closeEventPopup);
  document.getElementById('home-event-popup-backdrop').addEventListener('click', closeEventPopup);
}

function showEventPopup(fcEvent, jsEvent) {
  const props = fcEvent.extendedProps;
  const popup = document.getElementById('home-event-popup');
  const backdrop = document.getElementById('home-event-popup-backdrop');

  // Header color
  const meta = calendarMeta.find((c) => c.id === props.calendarId);
  const color = meta?.color || PALETTE[0];
  document.getElementById('home-event-popup-header').style.backgroundColor = color;
  document.getElementById('home-event-popup-title').textContent = fcEvent.title;

  // Body
  const date = new Date(fcEvent.start);
  document.getElementById('home-event-popup-date').textContent = date.toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  document.getElementById('home-event-popup-location').textContent = props.location || 'No location';
  document.getElementById('home-event-popup-calendar').textContent = props.calendarTitle;

  const descRow = document.getElementById('home-event-popup-desc-row');
  const descEl = document.getElementById('home-event-popup-desc');
  if (props.description) {
    descEl.textContent = props.description;
    descRow.classList.remove('d-none');
  } else {
    descRow.classList.add('d-none');
  }

  // Position & show
  positionPopup(popup, jsEvent);
  popup.classList.remove('d-none');
  backdrop.classList.remove('d-none');
}

function closeEventPopup() {
  document.getElementById('home-event-popup').classList.add('d-none');
  document.getElementById('home-event-popup-backdrop').classList.add('d-none');
}

function positionPopup(popup, jsEvent) {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  popup.style.left = '-9999px';
  popup.style.top = '-9999px';
  popup.classList.remove('d-none');
  const rect = popup.getBoundingClientRect();
  popup.classList.add('d-none');

  let left = jsEvent.clientX + margin;
  let top = jsEvent.clientY + margin;

  if (left + rect.width > vw - margin) left = vw - rect.width - margin;
  if (top + rect.height > vh - margin) top = vh - rect.height - margin;
  if (left < margin) left = margin;
  if (top < margin) top = margin;

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

/* ── Helpers ──────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
