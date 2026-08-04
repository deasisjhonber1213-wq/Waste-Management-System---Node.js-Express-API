
(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }

    function initSidebar() {
        var hamburger = document.getElementById('hamburger');
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebarOverlay');

        if (!hamburger || !sidebar) return;

        function openSidebar() {
            sidebar.classList.add('open');
            if (overlay) overlay.classList.add('active');
        }

        function closeSidebar() {
            sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
        }

        hamburger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        if (overlay) {
            overlay.addEventListener('click', closeSidebar);
        }

        document.querySelectorAll('.sidebar-nav .nav-item').forEach(function (link) {
            link.addEventListener('click', function () {
                if (window.innerWidth <= 820) {
                    closeSidebar();
                }
            });
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        });
    }
})();

(function () {
    function toggleTheme() {
        var html = document.documentElement;
        var currentTheme = html.getAttribute('data-theme');
        var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeUI(newTheme);
    }

    function updateThemeUI(theme) {
        var toggle = document.getElementById('themeToggleBtn');
        if (!toggle) return;
        var icon = toggle.querySelector('.theme-icon');
        var label = toggle.querySelector('.theme-label');
        if (theme === 'dark') {
            if (icon) icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
            if (label) label.textContent = 'Light Mode';
            toggle.classList.add('dark');
        } else {
            if (icon) icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
            if (label) label.textContent = 'Dark Mode';
            toggle.classList.remove('dark');
        }
    }

    var savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            var themeToggle = document.getElementById('themeToggleBtn');
            if (themeToggle) {
                themeToggle.addEventListener('click', toggleTheme);
                updateThemeUI(document.documentElement.getAttribute('data-theme') || 'light');
            }
        });
    } else {
        var themeToggle = document.getElementById('themeToggleBtn');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
            updateThemeUI(document.documentElement.getAttribute('data-theme') || 'light');
        }
    }
    window.toggleTheme = toggleTheme;
})();

(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReveal);
    } else {
        initReveal();
    }

    function initReveal() {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.reveal').forEach(function (el) {
            observer.observe(el);
        });
    }
})();

const API_URL = window.location.origin + '/api';
console.log('API URL:', API_URL);

function getToken() {
    return localStorage.getItem('token');
}

const API = {
    get: async (endpoint) => {
        return fetch(API_URL + endpoint, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
    },
    post: async (endpoint, data) => {
        return fetch(API_URL + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
    },
    put: async (endpoint, data) => {
        return fetch(API_URL + endpoint, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
    },
    del: async (endpoint) => {
        return fetch(API_URL + endpoint, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
    }
};

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
    }
}
checkAuth();

function doLogout() {
    localStorage.removeItem('token');
    closeModal('logoutConfirmModal');
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}
window.doLogout = doLogout;

function statusBadge(role) {
    const map = {
        'admin': 'badge-gold',
        'driver': 'badge-blue',
        'resident': 'badge-green'
    };
    return `<span class="badge ${map[role] || 'badge-gray'}">${role.toUpperCase()}</span>`;
}

let allUsers = [];
let currentViewUser = null;
let pendingDeleteId = null;
let pendingDeleteName = null;

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadUsers() {
    try {
        const res = await API.get("/admin/users");
        if (!res.ok) throw new Error();
        allUsers = await res.json();
        renderUsers(allUsers);

        document.getElementById("totalUsers").textContent = allUsers.length;
        document.getElementById("totalDrivers").textContent = allUsers.filter(u => u.role === "driver").length;
        document.getElementById("totalResidents").textContent = allUsers.filter(u => u.role === "resident").length;
    } catch (err) {
        console.error('Load users error:', err);
        showToast("Failed to load users", "error");
    }
}

function renderUsers(data) {
    const tbody = document.getElementById("usersBody");
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="empty-state-text">No users found</div></div></td></tr>';
        return;
    }
    tbody.innerHTML = data.map((u, i) => `
                <tr>
                    <td class="table-muted table-mono">${String(i + 1).padStart(2, "0")}</td>
                    <td><strong>${escHtml(u.name)}</strong></td>
                    <td class="table-muted">${escHtml(u.email)}</td>
                    <td>${statusBadge(u.role)}</td>
                    <td class="table-muted">${escHtml(u.phone || "—")}</td>
                    <td class="table-muted" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(u.address || "—")}</td>
                    <td>
                        <div class="flex-row" style="gap:6px;flex-wrap:nowrap;">
                            <button class="btn btn-outline btn-icon btn-sm" title="View" onclick="viewUser(${u.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                            <button class="btn btn-gold btn-icon btn-sm" title="Edit" onclick="openEditUser(${u.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                            <button class="btn btn-danger btn-icon btn-sm" title="Delete" onclick="openDeleteConfirm(${u.id},'${escHtml(u.name)}')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                        </div>
                    </td>
                </tr>`).join("");
}

function filterUsers() {
    const q = document.getElementById("searchInput").value.toLowerCase();
    const role = document.getElementById("roleFilter").value;
    const filtered = allUsers.filter(u =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!role || u.role === role)
    );
    renderUsers(filtered);
}

async function addUser() {
    const body = {
        name: document.getElementById("uName").value.trim(),
        email: document.getElementById("uEmail").value.trim(),
        password: document.getElementById("uPass").value,
        role: document.getElementById("uRole").value,
        phone: document.getElementById("uPhone").value.trim(),
        address: document.getElementById("uAddress").value.trim(),
    };
    if (!body.name || !body.email || !body.password) {
        showToast("Name, email and password required", "error");
        return;
    }
    try {
        const res = await API.post("/auth/register", body);
        if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
        }
        closeModal("addUserModal");
        showToast("User created successfully", "success");
        loadUsers();
        document.getElementById("uName").value = '';
        document.getElementById("uEmail").value = '';
        document.getElementById("uPass").value = '';
        document.getElementById("uPhone").value = '';
        document.getElementById("uAddress").value = '';
    } catch (err) {
        showToast("Failed to create user: " + err.message, "error");
    }
}

function openEditUser(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) {
        showToast("User not found", "error");
        return;
    }
    document.getElementById("editUserId").value = user.id;
    document.getElementById("editName").value = user.name || '';
    document.getElementById("editEmail").value = user.email || '';
    document.getElementById("editPhone").value = user.phone || '';
    document.getElementById("editAddress").value = user.address || '';
    document.getElementById("editRole").value = user.role || 'resident';
    document.getElementById("editPassword").value = '';
    document.getElementById("editPasswordConfirm").value = '';
    openModal("editUserModal");
}

async function updateUser() {
    const id = document.getElementById("editUserId").value;
    const name = document.getElementById("editName").value.trim();
    const email = document.getElementById("editEmail").value.trim();
    const phone = document.getElementById("editPhone").value.trim();
    const address = document.getElementById("editAddress").value.trim();
    const role = document.getElementById("editRole").value;
    const password = document.getElementById("editPassword").value;
    const passwordConfirm = document.getElementById("editPasswordConfirm").value;

    if (!name || !email) {
        showToast("Name and email are required", "error");
        return;
    }

    if (password || passwordConfirm) {
        if (password !== passwordConfirm) {
            showToast("Passwords do not match", "error");
            return;
        }
        if (password.length < 6) {
            showToast("Password must be at least 6 characters", "error");
            return;
        }
    }

    const payload = { name, email, phone, address, role };
    if (password) payload.password = password;

    try {
        const res = await API.put(`/admin/users/${id}`, payload);
        if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
        }
        closeModal("editUserModal");
        showToast("User updated successfully", "success");
        loadUsers();
    } catch (err) {
        showToast("Failed to update user: " + err.message, "error");
    }
}

async function viewUser(id) {
    try {
        const user = allUsers.find(u => u.id === id);
        if (user) {
            showUserDetails(user);
            return;
        }
        const res = await API.get(`/admin/users/${id}`);
        if (!res.ok) throw new Error();
        const u = await res.json();
        showUserDetails(u);
    } catch (err) {
        console.error('View user error:', err);
        showToast("Failed to load user details", "error");
    }
}

function showUserDetails(u) {
    currentViewUser = u;
    document.getElementById("viewUserBody").innerHTML = `
                <div class="form-grid form-grid-2" style="gap:14px">
                    <div><div class="form-label">Name</div><div style="font-weight:600;margin-top:4px">${escHtml(u.name)}</div></div>
                    <div><div class="form-label">Email</div><div style="margin-top:4px">${escHtml(u.email)}</div></div>
                    <div><div class="form-label">Role</div><div style="margin-top:4px">${statusBadge(u.role)}</div></div>
                    <div><div class="form-label">Phone</div><div style="margin-top:4px">${escHtml(u.phone || "—")}</div></div>
                    <div style="grid-column:1/-1"><div class="form-label">Address</div><div style="margin-top:4px">${escHtml(u.address || "—")}</div></div>
                </div>`;
    openModal("viewUserModal");
}

function openEditFromView() {
    if (currentViewUser) {
        closeModal("viewUserModal");
        openEditUser(currentViewUser.id);
    }
}

function openDeleteConfirm(id, name) {
    pendingDeleteId = id;
    pendingDeleteName = name;
    document.getElementById("deleteUserName").textContent = name;
    document.getElementById("deleteConfirmInput").value = '';
    document.getElementById("deleteConfirmInput").className = 'confirm-delete-input';
    document.getElementById("deleteConfirmError").style.display = 'none';
    document.getElementById("deleteConfirmBtn").disabled = true;
    openModal("deleteConfirmModal");
    setTimeout(() => {
        document.getElementById("deleteConfirmInput").focus();
    }, 300);
}

function onDeleteConfirmInput() {
    const input = document.getElementById("deleteConfirmInput");
    const btn = document.getElementById("deleteConfirmBtn");
    const error = document.getElementById("deleteConfirmError");
    const value = input.value.trim();

    if (value === "DELETE") {
        input.className = 'confirm-delete-input success';
        error.style.display = 'none';
        btn.disabled = false;
    } else if (value && value !== "DELETE") {
        input.className = 'confirm-delete-input error';
        error.style.display = 'block';
        btn.disabled = true;
    } else {
        input.className = 'confirm-delete-input';
        error.style.display = 'none';
        btn.disabled = true;
    }
}

async function confirmDeleteUser() {
    const input = document.getElementById("deleteConfirmInput");
    const value = input.value.trim();

    if (value !== "DELETE") {
        showToast('Please type "DELETE" to confirm', "error");
        return;
    }

    if (!pendingDeleteId) return;

    try {
        const res = await API.del(`/admin/users/${pendingDeleteId}`);
        if (!res.ok) {
            const err = await res.text();
            throw new Error(err);
        }
        closeModal("deleteConfirmModal");
        showToast(`User "${pendingDeleteName}" deleted successfully`, "success");
        pendingDeleteId = null;
        pendingDeleteName = null;
        loadUsers();
    } catch (err) {
        showToast("Failed to delete user: " + err.message, "error");
    }
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    } else {
        input.type = "password";
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    }
}

async function loadAdminProfile() {
    try {
        const res = await API.get("/admin/profile");
        if (res.ok) {
            const data = await res.json();
            document.getElementById("adminName").textContent = data.name || "Admin";
        }
    } catch { }
}

function openModal(id) {
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const deleteModal = document.getElementById('deleteConfirmModal');
        if (deleteModal && deleteModal.classList.contains('open')) {
            closeModal('deleteConfirmModal');
        }
    }
    if (e.key === 'Enter') {
        const deleteInput = document.getElementById('deleteConfirmInput');
        if (deleteInput && document.getElementById('deleteConfirmModal').classList.contains('open')) {
            const btn = document.getElementById('deleteConfirmBtn');
            if (!btn.disabled) {
                confirmDeleteUser();
            }
        }
    }
});

window.openModal = openModal;
window.closeModal = closeModal;
window.addUser = addUser;
window.viewUser = viewUser;
window.filterUsers = filterUsers;
window.openEditUser = openEditUser;
window.updateUser = updateUser;
window.openEditFromView = openEditFromView;
window.openDeleteConfirm = openDeleteConfirm;
window.confirmDeleteUser = confirmDeleteUser;
window.onDeleteConfirmInput = onDeleteConfirmInput;
window.togglePasswordVisibility = togglePasswordVisibility;
window.doLogout = doLogout;

loadAdminProfile();
loadUsers();