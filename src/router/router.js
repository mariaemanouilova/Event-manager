import { createHeader } from '../components/header/header.js';
import { createFooter } from '../components/footer/footer.js';
import { renderHomePage } from '../pages/index/index.js';
import { renderCalendarPage } from '../pages/calendar/calendar.js';

const routes = {
  '/': renderHomePage,
  '/calender': renderCalendarPage,
};

function normalizePath(pathname) {
  if (!pathname) return '/';
  return pathname.endsWith('/') && pathname !== '/'
    ? pathname.slice(0, -1)
    : pathname;
}

function mountLayout(rootElement) {
  rootElement.innerHTML = '';

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const header = createHeader();
  const main = document.createElement('main');
  main.className = 'app-main container';
  const footer = createFooter();

  shell.appendChild(header);
  shell.appendChild(main);
  shell.appendChild(footer);
  rootElement.appendChild(shell);

  return main;
}

function renderRoute() {
  const root = document.querySelector('#app');
  if (!root) return;

  const outlet = mountLayout(root);
  const path = normalizePath(window.location.pathname);
  const pageRenderer = routes[path] ?? routes['/'];
  pageRenderer(outlet);
}

function onLinkClick(event) {
  const anchor = event.target.closest('a[data-link="true"]');
  if (!anchor) return;

  event.preventDefault();
  const href = anchor.getAttribute('href');
  if (!href) return;

  window.history.pushState({}, '', href);
  renderRoute();
}

export function renderApp() {
  window.addEventListener('popstate', renderRoute);
  document.addEventListener('click', onLinkClick);
  renderRoute();
}
