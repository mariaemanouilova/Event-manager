import { createHeader } from '../components/header/header.js';
import { createFooter } from '../components/footer/footer.js';
import { renderLandingPage } from '../pages/index/index.js';
import { renderPublicHomePage } from '../pages/home/home.js';
import { renderCalendarPage } from '../pages/calendar/calendar.js';
import { renderLoginPage } from '../pages/login/login.js';
import { renderEventsPage } from '../pages/events/events.js';
import { renderAddEventPage, renderEditEventPage } from '../pages/event-form/event-form.js';
import { renderInvitationsPage } from '../pages/invitations/invitations.js';
import { supabase } from '../supabase.js';

/* ── Static routes ──────────────────────────────────────── */
const routes = {
  '/': renderLandingPage,
  '/home': renderPublicHomePage,
  '/calendar': renderCalendarPage,
  '/login': renderLoginPage,
  '/event': renderEventsPage,
  '/event/add': renderAddEventPage,
  '/invitations': renderInvitationsPage,
};

/* ── Dynamic route patterns ───────────────────────────────── */
const dynamicRoutes = [
  {
    pattern: /^\/event\/([0-9a-f-]+)\/edit$/,
    handler: (outlet, match) => renderEditEventPage(outlet, match[1]),
  },
];

function normalizePath(pathname) {
  if (!pathname) return '/';
  return pathname.endsWith('/') && pathname !== '/'
    ? pathname.slice(0, -1)
    : pathname;
}

function mountLayout(rootElement, session) {
  rootElement.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const header = createHeader(session);
  const main = document.createElement('main');
  main.className = 'app-main container';
  const footer = createFooter();

  shell.appendChild(header);
  shell.appendChild(main);
  shell.appendChild(footer);
  rootElement.appendChild(shell);

  return main;
}

async function renderRoute() {
  const root = document.querySelector('#app');
  if (!root) return;

  // Get current session
  const { data: { session } } = await supabase.auth.getSession();

  const outlet = mountLayout(root, session);
  const path = normalizePath(window.location.pathname);

  // 1. Try static routes
  if (routes[path]) {
    routes[path](outlet);
    return;
  }

  // 2. Try dynamic routes
  for (const { pattern, handler } of dynamicRoutes) {
    const match = path.match(pattern);
    if (match) {
      handler(outlet, match);
      return;
    }
  }

  // 3. Fallback
  routes['/'](outlet);
}

function onLinkClick(event) {
  const anchor = event.target.closest('a[data-link="true"], a.router-link');
  if (!anchor) return;

  // Only intercept for internal links starting with /
  const href = anchor.getAttribute('href');
  if (!href || !href.startsWith('/')) return;

  event.preventDefault();
  window.history.pushState({}, '', href);
  renderRoute();
}

export function navigateTo(path) {
  window.history.pushState({}, '', path);
  renderRoute();
}

export function renderApp() {
  window.addEventListener('popstate', renderRoute);
  document.addEventListener('click', onLinkClick);

  // Listen for auth state changes (login/logout)
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      navigateTo('/calendar');
    } else if (event === 'SIGNED_OUT') {
      navigateTo('/');
    }
  });

  renderRoute();
}
