/**
 * Users tab – data loading, row rendering, view/edit/delete actions.
 */
import { esc, fmtDate, badge, actionButtons } from '../ui/helpers.js';
import { renderTable } from '../ui/table-renderer.js';
import { showViewModal, showEditModal, confirmDelete } from '../ui/modal-controller.js';
import { showToast } from '../../../components/toast/toast.js';
import * as data from '../services/admin-data.js';

export async function loadUsers() {
  const { data: rows, error } = await data.fetchUsers();
  if (error) { showToast(error.message, 'error'); return; }

  renderTable({
    headers: ['Email', 'Full Name', 'Role', 'Created', 'Actions'],
    entityLabel: 'user',
    rows: rows || [],
    rowRenderer: (u) => {
      const role = u.user_roles?.role || 'user';
      const roleBadge = role === 'admin'
        ? badge('admin', 'bg-danger')
        : badge('user', 'bg-secondary');
      return `<tr>
        <td>${esc(u.email)}</td>
        <td>${esc(u.full_name || '—')}</td>
        <td>${roleBadge}</td>
        <td class="text-nowrap">${fmtDate(u.created_at)}</td>
        ${actionButtons(u.id)}
      </tr>`;
    },
    onView: (u) => showViewModal('User Details', {
      Email: u.email,
      'Full Name': u.full_name || '—',
      Role: u.user_roles?.role || 'user',
      Created: fmtDate(u.created_at),
      ID: u.id,
    }),
    onEdit: (u) => editUser(u),
    onDelete: (u) => confirmDelete(
      `Delete user <strong>${esc(u.email)}</strong>? This will cascade to all their data.`,
      async () => {
        const { error: e } = await data.deleteUser(u.id);
        if (e) { showToast(e.message, 'error'); return; }
        showToast('User deleted.', 'success');
        await loadUsers();
      },
    ),
  });
}

function editUser(u) {
  const role = u.user_roles?.role || 'user';

  showEditModal('Edit User', `
    <div class="mb-3">
      <label class="form-label">Email</label>
      <input type="email" class="form-control" id="edit-user-email" value="${esc(u.email)}">
    </div>
    <div class="mb-3">
      <label class="form-label">Full Name</label>
      <input type="text" class="form-control" id="edit-user-name" value="${esc(u.full_name || '')}">
    </div>
    <div class="mb-3">
      <label class="form-label">Role</label>
      <select class="form-select" id="edit-user-role">
        <option value="user" ${role === 'user' ? 'selected' : ''}>User</option>
        <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
    </div>
  `, async () => {
    const email = document.getElementById('edit-user-email').value.trim();
    const full_name = document.getElementById('edit-user-name').value.trim();
    const newRole = document.getElementById('edit-user-role').value;

    const { error: e1 } = await data.updateUser(u.id, { email, full_name });
    if (e1) throw e1;

    const { error: e2 } = await data.upsertRole(u.id, newRole);
    if (e2) throw e2;

    showToast('User updated.', 'success');
    await loadUsers();
  });
}
