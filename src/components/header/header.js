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

  const authNav = header.querySelector('#auth-nav');

  if (session?.user) {
    // User is logged in → show email + Logout button
    const userEmail = session.user.email;
    authNav.innerHTML = `
      <span class="nav-link disabled text-muted d-none d-lg-inline">${userEmail}</span>
      <button class="btn btn-outline-danger btn-sm ms-2" id="logout-btn">Logout</button>
    `;
    authNav.querySelector('#logout-btn').addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  } else {
    // Not logged in → show Login link
    authNav.innerHTML = `
      <a class="btn btn-primary btn-sm" href="/login" data-link="true">Login</a>
    `;
  }

  return header;
}
