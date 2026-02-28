import headerTemplate from './header.html?raw';
import './header.css';
import { supabase } from '../../supabase.js';

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
      <a class="nav-link" href="/home" data-link="true"><i class="bi bi-globe me-1"></i>Public Events</a>
    `;
    const userEmail = session.user.email;
    authNav.innerHTML = `
      <span class="nav-link disabled text-muted d-none d-lg-inline">${userEmail}</span>
      <button class="btn btn-outline-danger btn-sm ms-2" id="logout-btn">Logout</button>
    `;
    authNav.querySelector('#logout-btn').addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
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
