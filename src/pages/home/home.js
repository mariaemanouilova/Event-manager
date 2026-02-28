import template from './home.html?raw';
import './home.css';
import { supabase } from '../../supabase.js';
import { showToast } from '../../components/toast/toast.js';

export async function renderPublicHomePage(outlet) {
  outlet.innerHTML = template;
  await loadPublicEvents();
}

async function loadPublicEvents() {
  const loadingEl = document.getElementById('home-loading');
  const emptyEl = document.getElementById('home-empty');
  const eventsEl = document.getElementById('home-events');

  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, description, event_date, location, calendars(title)')
    .eq('is_public', true)
    .order('event_date', { ascending: true });

  loadingEl.classList.add('d-none');

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  if (!events || events.length === 0) {
    emptyEl.classList.remove('d-none');
    return;
  }

  eventsEl.classList.remove('d-none');
  eventsEl.innerHTML = events.map((evt) => createEventCard(evt)).join('');
}

function createEventCard(evt) {
  const date = new Date(evt.event_date);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });
  const calendarName = evt.calendars?.title || 'Unknown calendar';
  const location = evt.location || 'No location';
  const description = evt.description
    ? (evt.description.length > 100 ? evt.description.slice(0, 100) + '…' : evt.description)
    : 'No description';

  return `
    <div class="col">
      <div class="card event-card h-100 border-0 shadow-sm">
        <div class="card-body">
          <h5 class="card-title">${escapeHtml(evt.title)}</h5>
          <p class="card-text text-muted small mb-2">${escapeHtml(description)}</p>
          <ul class="list-unstyled small mb-0">
            <li class="event-date text-primary"><i class="bi bi-clock me-1"></i>${formattedDate} at ${formattedTime}</li>
            <li class="mt-1"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(location)}</li>
            <li class="mt-1"><i class="bi bi-calendar3 me-1"></i>${escapeHtml(calendarName)}</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
