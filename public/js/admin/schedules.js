
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

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status) {
    const map = {
        'pending': 'badge-warning',
        'in_progress': 'badge-info',
        'completed': 'badge-success',
        'cancelled': 'badge-danger'
    };
    return `<span class="badge ${map[status] || 'badge-gray'}">${(status || 'pending').replace('_', ' ').toUpperCase()}</span>`;
}

let allSchedules = [];

async function loadSchedules() {
    try {
        const res = await API.get("/admin/pickups");
        if (!res.ok) {
            console.error('Failed to load schedules:', res.status);
            throw new Error(`HTTP ${res.status}`);
        }
        allSchedules = await res.json();
        console.log('Schedules loaded:', allSchedules.length);
        renderSchedules(allSchedules);
        document.getElementById("totalSched").textContent = allSchedules.length;
        document.getElementById("pendingSched").textContent = allSchedules.filter(s => s.status === "pending" || s.status === "in_progress").length;
        document.getElementById("doneSched").textContent = allSchedules.filter(s => s.status === "completed").length;
    } catch (err) {
        console.error('Load schedules error:', err);
        showToast("Failed to load schedules", "error");
        document.getElementById("schedBody").innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text2)">Failed to load schedules</td></tr>';
    }
}

function renderSchedules(data) {
    const tbody = document.getElementById("schedBody");
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div class="empty-state-text">No schedules found</div></div></td></tr>';
        return;
    }
    tbody.innerHTML = data.map((s, i) => `
                <tr>
                    <td class="table-mono table-muted">${String(i + 1).padStart(2, "0")}</td>
                    <td class="table-mono">${fmtDate(s.assigned_date)}</td>
                    <td>${s.driver_name || "—"}</td>
                    <td class="table-mono text-gold">${s.truck_plate || "—"}</td>
                    <td>${s.zone_name || "—"}</td>
                    <td><span class="badge badge-gray">${s.pickup_type || "regular"}</span></td>
                    <td>${statusBadge(s.status)}</td>
                    <td>
                        <div class="flex-row" style="gap:6px;flex-wrap:nowrap;">
                            <button class="btn btn-outline btn-sm btn-icon" title="Edit" onclick="openEdit(${s.id},'${s.status || 'pending'}','${s.assigned_date?.slice(0, 10) || ''}','${s.pickup_type || 'regular'}')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                            <button class="btn btn-danger btn-sm btn-icon" title="Delete" onclick="deleteSchedule(${s.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                        </div>
                    </td>
                </tr>`).join("");
}

function filterSchedules() {
    const q = document.getElementById("searchInput").value.toLowerCase();
    const st = document.getElementById("statusFilter").value;
    const filtered = allSchedules.filter(s =>
        (!q || (s.driver_name || "").toLowerCase().includes(q) || (s.zone_name || "").toLowerCase().includes(q) || (s.truck_plate || "").toLowerCase().includes(q)) &&
        (!st || s.status === st)
    );
    renderSchedules(filtered);
}

async function loadFormData() {
    try {
        const [uRes, tRes, rRes] = await Promise.all([
            API.get("/admin/users"),
            API.get("/admin/trucks"),
            API.get("/admin/routes")
        ]);
        const users = await uRes.json();
        const trucks = await tRes.json();
        const routes = await rRes.json();
        document.getElementById("aDriver").innerHTML = '<option value="">Select driver…</option>' +
            (Array.isArray(users) ? users.filter(u => u.role === "driver").map(u => `<option value="${u.id}">${u.name}</option>`).join("") : '');
        document.getElementById("aTruck").innerHTML = '<option value="">Select truck…</option>' +
            (Array.isArray(trucks) ? trucks.map(t => `<option value="${t.id}">${t.plate_number}</option>`).join("") : '');
        document.getElementById("aRoute").innerHTML = '<option value="">Select route…</option>' +
            (Array.isArray(routes) ? routes.map(r => `<option value="${r.id}">${r.zone_name}</option>`).join("") : '');
    } catch (err) {
        console.error('Load form data error:', err);
    }
}

async function assignRoute() {
    const body = {
        driver_id: document.getElementById("aDriver").value,
        truck_id: document.getElementById("aTruck").value,
        route_id: document.getElementById("aRoute").value,
        assigned_date: document.getElementById("aDate").value,
        pickup_type: document.getElementById("aType").value,
    };
    if (!body.driver_id || !body.truck_id || !body.route_id || !body.assigned_date) {
        showToast("Fill all fields", "error");
        return;
    }
    try {
        const res = await API.post("/admin/assign-route", body);
        if (!res.ok) {
            const err = await res.text();
            console.error('Assign error:', err);
            throw new Error(err);
        }
        closeModal("assignModal");
        showToast("Route assigned successfully", "success");
        loadSchedules();
    } catch (err) {
        console.error('Assign failed:', err);
        showToast("Assignment failed: " + err.message, "error");
    }
}

function openEdit(id, status, date, type) {
    document.getElementById("editId").value = id;
    document.getElementById("editStatus").value = status || 'pending';
    document.getElementById("editDate").value = date || "";
    document.getElementById("editType").value = type || 'regular';
    openModal("editModal");
}

async function updateSchedule() {
    const id = document.getElementById("editId").value;
    const status = document.getElementById("editStatus").value;
    const date = document.getElementById("editDate").value;
    const pickup_type = document.getElementById("editType").value;

    try {
        const payload = {};
        if (status) payload.status = status;
        if (date) payload.assigned_date = date;
        if (pickup_type) payload.pickup_type = pickup_type;

        console.log('Updating schedule:', id, payload);

        const res = await API.put(`/admin/pickups/${id}`, payload);
        if (!res.ok) {
            const err = await res.text();
            console.error('Update error:', err);
            throw new Error(err);
        }
        closeModal("editModal");
        showToast("Schedule updated successfully", "success");
        loadSchedules();
    } catch (err) {
        console.error('Update failed:', err);
        showToast("Update failed: " + err.message, "error");
    }
}

let pendingDeleteScheduleId = null;

function deleteSchedule(id) {
    pendingDeleteScheduleId = id;
    document.getElementById('deleteScheduleConfirmBtn').onclick = executeDeleteSchedule;
    openModal('deleteScheduleModal');
}

async function executeDeleteSchedule() {
    const id = pendingDeleteScheduleId;
    if (!id) return;
    try {
        const res = await API.del(`/admin/pickups/${id}`);
        if (!res.ok) throw new Error(await res.text());
        closeModal('deleteScheduleModal');
        showToast("Schedule deleted", "success");
        loadSchedules();
    } catch (err) {
        console.error('Delete failed:', err);
        showToast("Delete failed: " + err.message, "error");
    }
    pendingDeleteScheduleId = null;
}
window.deleteSchedule = deleteSchedule;

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

document.getElementById("aDate").value = new Date().toISOString().slice(0, 10);

window.openModal = openModal;
window.closeModal = closeModal;
window.assignRoute = assignRoute;
window.openEdit = openEdit;
window.updateSchedule = updateSchedule;
window.deleteSchedule = deleteSchedule;
window.filterSchedules = filterSchedules;

loadAdminProfile();
loadSchedules();
loadFormData();