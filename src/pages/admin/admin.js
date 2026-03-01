/**
 * Admin panel – thin orchestrator.
 *
 * All entity-specific logic lives in ./tabs/*.js
 * Data access is centralised in ./services/admin-data.js
 * Reusable UI primitives live in ./ui/*.js
 */
import template from './admin.html?raw';
import './admin.css';
import { showToast } from '../../components/toast/toast.js';
import { navigateTo } from '../../router/router.js';
import { getSession, getUserRole } from './services/admin-data.js';
import { initModals } from './ui/modal-controller.js';
import { showLoading } from './ui/table-renderer.js';
import { loadUsers } from './tabs/users.js';
import { loadCalendars } from './tabs/calendars.js';
import { loadEvents } from './tabs/events.js';
import { loadParticipants } from './tabs/participants.js';

/* ── Tab registry (replaces switch statement) ─────────────── */
const TAB_LOADERS = {
  users: loadUsers,
  calendars: loadCalendars,
  events: loadEvents,
  participants: loadParticipants,
};

/* ═══════════════════════════════════════════════════════════
   Public entry point
   ═══════════════════════════════════════════════════════════ */
export async function renderAdminPage(outlet) {
  outlet.innerHTML = template;

  const session = await getSession();
  if (!session) { navigateTo('/login'); return; }

  const role = await getUserRole(session.user.id);
  if (role !== 'admin') {
    showToast('Access denied. Admin role required.', 'error');
    navigateTo('/calendar');
    return;
  }

  initModals();
  wireTabs();
  await loadTab('users');
}

/* ── Tab navigation (event delegation) ────────────────────── */
function wireTabs() {
  document.getElementById('admin-tabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('.nav-link');
    if (!btn) return;

    document.querySelectorAll('#admin-tabs .nav-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    await loadTab(btn.dataset.tab);
  });
}

async function loadTab(tab) {
  const loader = TAB_LOADERS[tab];
  if (!loader) return;
  showLoading();
  await loader();
}
