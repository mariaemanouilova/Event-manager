/**
 * Notification system — realtime bell icon + dropdown + popup toasts.
 *
 * Usage (from header):
 *   import { createNotificationBell, startNotificationListener, stopNotificationListener }
 *     from '../../components/notifications/notifications.js';
 *
 *   // Append bell into the header
 *   const bell = createNotificationBell();
 *   nav.appendChild(bell);
 *
 *   // Start/stop realtime subscription
 *   startNotificationListener(userId);
 *   stopNotificationListener();
 */
import './notifications.css';
import { supabase } from '../../supabase.js';
import { showToast } from '../toast/toast.js';

let channel = null;
let notifications = [];
let currentUserId = null;
let dropdownOpen = false;

/* ─── DOM references (set once on createNotificationBell) ── */
let bellBtn = null;
let badgeEl = null;
let dropdownEl = null;
let listEl = null;

const TYPE_ICONS = {
  invitation: 'bi-envelope-plus',
  rsvp_update: 'bi-person-check',
  info: 'bi-info-circle',
};

/* ═══════════════════════════════════════════════════════════
   Public: Create the bell element (call once per page render)
   ═══════════════════════════════════════════════════════════ */
export function createNotificationBell() {
  const wrapper = document.createElement('div');
  wrapper.className = 'notification-wrapper';

  wrapper.innerHTML = `
    <button class="notification-bell" title="Notifications" type="button">
      <i class="bi bi-bell"></i>
      <span class="notification-badge d-none" id="notif-badge">0</span>
    </button>
    <div class="notification-dropdown" id="notif-dropdown">
      <div class="notification-dropdown-header">
        <span>Notifications</span>
        <button id="mark-all-read-btn">Mark all read</button>
      </div>
      <ul class="notification-list" id="notif-list"></ul>
    </div>
  `;

  bellBtn = wrapper.querySelector('.notification-bell');
  badgeEl = wrapper.querySelector('#notif-badge');
  dropdownEl = wrapper.querySelector('#notif-dropdown');
  listEl = wrapper.querySelector('#notif-list');

  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  wrapper.querySelector('#mark-all-read-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    markAllRead();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (dropdownOpen && !wrapper.contains(e.target)) {
      closeDropdown();
    }
  });

  return wrapper;
}

/* ═══════════════════════════════════════════════════════════
   Public: Start realtime listener
   ═══════════════════════════════════════════════════════════ */
export async function startNotificationListener(userId) {
  currentUserId = userId;

  // Load existing unread notifications
  await loadNotifications();
  renderDropdown();

  // Subscribe to INSERT on notifications table filtered by user_id
  channel = supabase
    .channel('notifications-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const newNotif = payload.new;
        notifications.unshift(newNotif);
        updateBadge();
        renderDropdown();

        // Show a popup toast for the new notification
        const toastType = newNotif.type === 'invitation' ? 'info' : 'success';
        showToast(newNotif.message, toastType, 6000);
      },
    )
    .subscribe();
}

/* ═══════════════════════════════════════════════════════════
   Public: Stop realtime listener
   ═══════════════════════════════════════════════════════════ */
export function stopNotificationListener() {
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  notifications = [];
  currentUserId = null;
}

/* ═══════════════════════════════════════════════════════════
   Public: Insert a notification (called from event-form / invitations)
   ═══════════════════════════════════════════════════════════ */
export async function insertNotification({ userId, eventId, message, type = 'info' }) {
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, event_id: eventId, message, type });

  if (error) console.error('Failed to insert notification:', error.message);
}

/* ── Load notifications from DB ───────────────────────────── */
async function loadNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to load notifications:', error.message);
    return;
  }
  notifications = data || [];
  updateBadge();
}

/* ── Dropdown toggle ──────────────────────────────────────── */
function toggleDropdown() {
  dropdownOpen ? closeDropdown() : openDropdown();
}

function openDropdown() {
  dropdownOpen = true;
  dropdownEl.classList.add('show');
}

function closeDropdown() {
  dropdownOpen = false;
  dropdownEl.classList.remove('show');
}

/* ── Badge count ──────────────────────────────────────────── */
function updateBadge() {
  if (!badgeEl) return;
  const unread = notifications.filter((n) => !n.is_read).length;
  if (unread > 0) {
    badgeEl.textContent = unread > 99 ? '99+' : unread;
    badgeEl.classList.remove('d-none');
  } else {
    badgeEl.classList.add('d-none');
  }
}

/* ── Render dropdown list ─────────────────────────────────── */
function renderDropdown() {
  if (!listEl) return;

  if (notifications.length === 0) {
    listEl.innerHTML = '<li class="notification-empty"><i class="bi bi-bell-slash me-1"></i>No notifications yet</li>';
    return;
  }

  listEl.innerHTML = notifications.map((n) => {
    const icon = TYPE_ICONS[n.type] || TYPE_ICONS.info;
    const time = timeAgo(n.created_at);
    const unreadClass = n.is_read ? '' : ' unread';

    return `
      <li class="notification-item${unreadClass}" data-id="${n.id}">
        <div class="notification-icon ${n.type || 'info'}">
          <i class="bi ${icon}"></i>
        </div>
        <div class="notification-body">
          <div class="notification-message">${esc(n.message)}</div>
          <div class="notification-time">${time}</div>
        </div>
      </li>`;
  }).join('');

  // Click to mark as read
  listEl.querySelectorAll('.notification-item').forEach((el) => {
    el.addEventListener('click', () => markAsRead(el.dataset.id));
  });
}

/* ── Mark single notification read ────────────────────────── */
async function markAsRead(notifId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId);

  if (error) return;

  const notif = notifications.find((n) => n.id === notifId);
  if (notif) notif.is_read = true;
  updateBadge();
  renderDropdown();
}

/* ── Mark all read ────────────────────────────────────────── */
async function markAllRead() {
  const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
  if (unreadIds.length === 0) return;

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .in('id', unreadIds);

  if (error) {
    showToast('Could not mark all as read.', 'error');
    return;
  }

  notifications.forEach((n) => { n.is_read = true; });
  updateBadge();
  renderDropdown();
}

/* ── Helpers ──────────────────────────────────────────────── */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
