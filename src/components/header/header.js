import headerTemplate from './header.html?raw';
import './header.css';
import { supabase } from '../../supabase.js';
import { createNotificationBell, startNotificationListener, stopNotificationListener }
  from '../notifications/notifications.js';

/**
 * Creates the header element and populates auth-related nav items
 * based on the current session.
 * @param {object|null} session - The current Supabase session (or null if logged out).
 */
export function createHeader(session) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = headerTemplate;
  const header = wrapper.firstElementChild;

  const mainNav = header.querySelector('#main-nav');
  const authNav = header.querySelector('#auth-nav');

  if (session?.user) {
    // Logged-in navigation
    mainNav.innerHTML = `
      <a class="nav-link" href="/calendar" data-link="true"><i class="bi bi-calendar3 me-1"></i>Calendar</a>
      <a class="nav-link" href="/event" data-link="true"><i class="bi bi-list-ul me-1"></i>My Events</a>
      <a class="nav-link" href="/invitations" data-link="true"><i class="bi bi-envelope-open me-1"></i>Invitations</a>
      <a class="nav-link" href="/home" data-link="true"><i class="bi bi-globe me-1"></i>Public Events</a>
    `;
    const userEmail = session.user.email;

    // Build notification bell + auth controls
    const bellEl = createNotificationBell();

    authNav.innerHTML = `
      <span class="nav-link disabled text-muted d-none d-lg-inline">${userEmail}</span>
    `;
    // Insert bell before the email / logout area
    authNav.prepend(bellEl);

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'btn btn-outline-danger btn-sm ms-2';
    logoutBtn.id = 'logout-btn';
    logoutBtn.textContent = 'Logout';
    authNav.appendChild(logoutBtn);

    logoutBtn.addEventListener('click', async () => {
      stopNotificationListener();
      await supabase.auth.signOut();
    });

    // Start realtime notifications for this user
    startNotificationListener(session.user.id);
  } else {
    // Guest navigation
    mainNav.innerHTML = `
      <a class="nav-link" href="/" data-link="true"><i class="bi bi-house me-1"></i>Home</a>
      <a class="nav-link" href="/home" data-link="true"><i class="bi bi-globe me-1"></i>Public Events</a>
    `;
    authNav.innerHTML = `
      <a class="btn btn-primary btn-sm" href="/login" data-link="true">Login</a>
    `;
  }

  return header;
}
