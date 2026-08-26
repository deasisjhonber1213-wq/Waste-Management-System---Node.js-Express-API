/**
 * Admin Users page — full client logic
 * Expects API under /api/admin (protect + adminOnly)
 *
 * Auto-verify: when admin creates a user we send verified: true
 * so the account can log in immediately (no email PIN required).
 */

const API = window.location.origin + "/api/admin";
const AUTH_API = window.location.origin + "/api/auth";

let allUsers = [];
let currentViewUser = null;
let pendingDeleteId = null;

/* ---------- Auth helpers ---------- */
function getToken() {
    return localStorage.getItem("token");
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        Authorization: "Bearer " + getToken()
    };
}

function requireAuth() {
    if (!getToken()) {
        window.location = "/login";
        return false;
    }
    return true;
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
    if (!requireAuth()) return;

    // Fill admin name in sidebar
    try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        const nameEl = document.getElementById("adminName");
        if (nameEl) nameEl.textContent = user.fullName || user.name || "Admin";
    } catch (_) { }

    loadUsers();
});

/* ---------- Load & render ---------- */
async function loadUsers() {
    const tbody = document.getElementById("usersBody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text2)">
            <span class="loading-spinner"></span></td></tr>`;
    }

    try {
        const res = await fetch(API + "/users", { headers: authHeaders() });
        if (res.status === 401 || res.status === 403) {
            localStorage.clear();
            window.location = "/login";
            return;
        }
        const data = await res.json();
        // Support both array and { users: [] } shapes
        allUsers = Array.isArray(data) ? data : (data.users || data.data || []);
        updateStats();
        filterUsers();
    } catch (err) {
        console.error(err);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--red)">
                Failed to load users. Check connection.</td></tr>`;
        }
        if (typeof showToast === "function") showToast("Failed to load users", "error");
    }
}

function updateStats() {
    const total = allUsers.length;
    const drivers = allUsers.filter(u => (u.role || "").toLowerCase() === "driver").length;
    const residents = allUsers.filter(u => (u.role || "").toLowerCase() === "resident").length;

    const el = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
    el("totalUsers", total);
    el("totalDrivers", drivers);
    el("totalResidents", residents);
}

function filterUsers() {
    const q = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
    const role = (document.getElementById("roleFilter")?.value || "").toLowerCase();

    let list = allUsers.slice();

    if (role) {
        list = list.filter(u => (u.role || "").toLowerCase() === role);
    }
    if (q) {
        list = list.filter(u => {
            const name = (u.fullName || u.name || "").toLowerCase();
            const email = (u.email || "").toLowerCase();
            const phone = (u.phone || u.mobile || "").toLowerCase();
            const addr = (u.homeAddress || u.address || "").toLowerCase();
            return name.includes(q) || email.includes(q) || phone.includes(q) || addr.includes(q);
        });
    }

    renderTable(list);
}

function renderTable(list) {
    const tbody = document.getElementById("usersBody");
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text2)">
            No users found.</td></tr>`;
        return;
    }

    const esc = (typeof escHtml === "function") ? escHtml : (s) => String(s ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    tbody.innerHTML = list.map((u, i) => {
        const id = u._id || u.id;
        const name = u.fullName || u.name || "—";
        const email = u.email || "—";
        const role = (u.role || "resident").toLowerCase();
        const phone = u.phone || u.mobile || "—";
        const addr = u.homeAddress || u.address || "—";
        const verified = u.isVerified === true || u.emailVerified === true || u.verified === true;

        const roleBadge = (typeof statusBadge === "function")
            ? statusBadge(role)
            : `<span class="badge badge-${role === "admin" ? "gold" : role === "driver" ? "blue" : "gray"}">${role.toUpperCase()}</span>`;

        const verifyBadge = verified
            ? `<span class="badge badge-success" title="Email verified" style="margin-left:6px;font-size:0.7rem">✓</span>`
            : `<span class="badge badge-warning" title="Not verified" style="margin-left:6px;font-size:0.7rem">!</span>`;

        return `<tr>
            <td>${i + 1}</td>
            <td>${esc(name)}${verifyBadge}</td>
            <td>${esc(email)}</td>
            <td>${roleBadge}</td>
            <td>${esc(phone)}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(addr)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn-icon" title="View" onclick="viewUser('${id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="btn-icon" title="Edit" onclick="openEditUser('${id}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button class="btn-icon danger" title="Delete" onclick="openDeleteUser('${id}', '${esc(name).replace(/'/g, "\\'")}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

/* ---------- Add User (admin-created → auto-verified) ---------- */
async function addUser() {
    const fullName = document.getElementById("uName")?.value.trim();
    const email = document.getElementById("uEmail")?.value.trim().toLowerCase();
    const password = document.getElementById("uPass")?.value;
    const role = document.getElementById("uRole")?.value || "resident";
    const phone = document.getElementById("uPhone")?.value.trim();
    const homeAddress = document.getElementById("uAddress")?.value.trim();

    if (!fullName || !email || !password) {
        showToast("Name, email and password are required.", "error");
        return;
    }
    if (password.length < 8) {
        showToast("Password must be at least 8 characters.", "error");
        return;
    }

    // Admin-created users are auto-verified so they can log in immediately
    const payload = {
        fullName,
        email,
        password,
        role,
        phone: phone || undefined,
        homeAddress: homeAddress || undefined,
        // These flags tell the backend to skip email verification
        isVerified: true,
        emailVerified: true,
        verified: true
    };

    try {
        const res = await fetch(API + "/users", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        let data = {};
        try { data = await res.json(); } catch (_) { }

        if (res.ok) {
            showToast(data.message || "User created and auto-verified.", "success");
            closeModal("addUserModal");
            // Clear form
            ["uName", "uEmail", "uPass", "uPhone", "uAddress"].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = "";
            });
            document.getElementById("uRole").value = "resident";
            loadUsers();
        } else {
            const msg = data.error || data.message ||
                (Array.isArray(data.errors) ? data.errors.map(e => e.msg || e).join(" · ") : null) ||
                "Failed to create user.";
            showToast(msg, "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Network error while creating user.", "error");
    }
}

/* ---------- View ---------- */
function findUser(id) {
    return allUsers.find(u => String(u._id || u.id) === String(id));
}

function viewUser(id) {
    const u = findUser(id);
    if (!u) return showToast("User not found.", "error");
    currentViewUser = u;

    const esc = (typeof escHtml === "function") ? escHtml : (s) => String(s ?? "");
    const verified = u.isVerified === true || u.emailVerified === true || u.verified === true;
    const body = document.getElementById("viewUserBody");
    if (!body) return;

    body.innerHTML = `
        <div style="display:grid;gap:14px;">
            <div><div class="form-label">Full Name</div><div style="font-weight:600">${esc(u.fullName || u.name)}</div></div>
            <div><div class="form-label">Email</div><div>${esc(u.email)}</div></div>
            <div><div class="form-label">Role</div><div>${esc((u.role || "").toUpperCase())}</div></div>
            <div><div class="form-label">Phone</div><div>${esc(u.phone || u.mobile || "—")}</div></div>
            <div><div class="form-label">Address</div><div>${esc(u.homeAddress || u.address || "—")}</div></div>
            <div><div class="form-label">Email Status</div>
                <div>${verified
            ? '<span class="badge badge-success">Verified</span>'
            : '<span class="badge badge-warning">Not verified</span>'}</div>
            </div>
            <div><div class="form-label">Created</div>
                <div>${u.createdAt ? (typeof fmtDateTime === "function" ? fmtDateTime(u.createdAt) : new Date(u.createdAt).toLocaleString()) : "—"}</div>
            </div>
        </div>`;

    openModal("viewUserModal");
}

function openEditFromView() {
    if (!currentViewUser) return;
    closeModal("viewUserModal");
    openEditUser(currentViewUser._id || currentViewUser.id);
}

/* ---------- Edit ---------- */
function openEditUser(id) {
    const u = findUser(id);
    if (!u) return showToast("User not found.", "error");

    document.getElementById("editUserId").value = u._id || u.id;
    document.getElementById("editName").value = u.fullName || u.name || "";
    document.getElementById("editEmail").value = u.email || "";
    document.getElementById("editPhone").value = u.phone || u.mobile || "";
    document.getElementById("editAddress").value = u.homeAddress || u.address || "";
    document.getElementById("editRole").value = (u.role || "resident").toLowerCase();
    document.getElementById("editPassword").value = "";
    document.getElementById("editPasswordConfirm").value = "";

    openModal("editUserModal");
}

async function updateUser() {
    const id = document.getElementById("editUserId")?.value;
    if (!id) return;

    const fullName = document.getElementById("editName")?.value.trim();
    const email = document.getElementById("editEmail")?.value.trim().toLowerCase();
    const phone = document.getElementById("editPhone")?.value.trim();
    const homeAddress = document.getElementById("editAddress")?.value.trim();
    const role = document.getElementById("editRole")?.value;
    const password = document.getElementById("editPassword")?.value;
    const passwordConfirm = document.getElementById("editPasswordConfirm")?.value;

    if (!fullName || !email) {
        showToast("Name and email are required.", "error");
        return;
    }

    if (password) {
        if (password.length < 8) {
            showToast("New password must be at least 8 characters.", "error");
            return;
        }
        if (password !== passwordConfirm) {
            showToast("Password confirmation does not match.", "error");
            return;
        }
    }

    const payload = {
        fullName,
        email,
        role,
        phone: phone || undefined,
        homeAddress: homeAddress || undefined
    };
    if (password) payload.password = password;

    try {
        const res = await fetch(API + "/users/" + id, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });
        let data = {};
        try { data = await res.json(); } catch (_) { }

        if (res.ok) {
            showToast(data.message || "User updated.", "success");
            closeModal("editUserModal");
            loadUsers();
        } else {
            showToast(data.error || data.message || "Update failed.", "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Network error while updating user.", "error");
    }
}

/* ---------- Delete ---------- */
function openDeleteUser(id, name) {
    pendingDeleteId = id;
    const nameEl = document.getElementById("deleteUserName");
    if (nameEl) nameEl.textContent = name || "this user";
    const input = document.getElementById("deleteConfirmInput");
    if (input) input.value = "";
    const btn = document.getElementById("deleteConfirmBtn");
    if (btn) btn.disabled = true;
    const err = document.getElementById("deleteConfirmError");
    if (err) err.style.display = "none";
    openModal("deleteConfirmModal");
}

function onDeleteConfirmInput() {
    const val = (document.getElementById("deleteConfirmInput")?.value || "").trim();
    const btn = document.getElementById("deleteConfirmBtn");
    const err = document.getElementById("deleteConfirmError");
    const ok = val === "DELETE";
    if (btn) btn.disabled = !ok;
    if (err) err.style.display = val && !ok ? "block" : "none";
}

async function confirmDeleteUser() {
    if (!pendingDeleteId) return;
    const input = document.getElementById("deleteConfirmInput");
    if ((input?.value || "").trim() !== "DELETE") {
        showToast('Type "DELETE" to confirm.', "error");
        return;
    }

    try {
        const res = await fetch(API + "/users/" + pendingDeleteId, {
            method: "DELETE",
            headers: authHeaders()
        });
        let data = {};
        try { data = await res.json(); } catch (_) { }

        if (res.ok) {
            showToast(data.message || "User deleted.", "success");
            closeModal("deleteConfirmModal");
            pendingDeleteId = null;
            loadUsers();
        } else {
            showToast(data.error || data.message || "Delete failed.", "error");
        }
    } catch (err) {
        console.error(err);
        showToast("Network error while deleting user.", "error");
    }
}

/* ---------- Password visibility ---------- */
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    if (btn) btn.style.opacity = showing ? "0.6" : "1";
}

/* ---------- Logout ---------- */
function doLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    window.location = "/login";
}

/* Expose for inline onclick handlers in the HTML */
window.filterUsers = filterUsers;
window.addUser = addUser;
window.viewUser = viewUser;
window.openEditFromView = openEditFromView;
window.openEditUser = openEditUser;
window.updateUser = updateUser;
window.openDeleteUser = openDeleteUser;
window.onDeleteConfirmInput = onDeleteConfirmInput;
window.confirmDeleteUser = confirmDeleteUser;
window.togglePasswordVisibility = togglePasswordVisibility;
window.doLogout = doLogout;