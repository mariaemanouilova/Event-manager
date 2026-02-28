import { createHeader } from '../components/header/header.js';
import { createFooter } from '../components/footer/footer.js';
import { renderLandingPage } from '../pages/index/index.js';
import { renderPublicHomePage } from '../pages/home/home.js';
import { renderCalendarPage } from '../pages/calendar/calendar.js';
import { renderLoginPage } from '../pages/login/login.js';
import { supabase } from '../supabase.js';

const routes = {
  '/': renderLandingPage,
  '/home': renderPublicHomePage,
  '/calendar': renderCalendarPage,
  '/login': renderLoginPage,
};

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
  const pageRenderer = routes[path] ?? routes['/'];
  pageRenderer(outlet);
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
