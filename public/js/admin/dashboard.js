
const API_URL = window.location.origin + '/api';
console.log('API URL:', API_URL);

function getToken() { return localStorage.getItem('token'); }

const API = {
    get: async (endpoint) => fetch(API_URL + endpoint, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
    post: async (endpoint, data) => fetch(API_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(data)
    }),
    put: async (endpoint, data) => fetch(API_URL + endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(data)
    }),
    del: async (endpoint) => fetch(API_URL + endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } })
};

function fmtDate(date) {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function statusBadge(status) {
    const map = { 'pending': 'badge-warning', 'in_progress': 'badge-info', 'completed': 'badge-success', 'cancelled': 'badge-danger' };
    return `<span class="badge ${map[status] || 'badge-gray'}">${status.replace('_', ' ')}</span>`;
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : ''}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function updateClock() {
    const now = new Date();
    const el = document.getElementById("clock");
    if (el) el.textContent = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
setInterval(updateClock, 1000);
updateClock();


function doLogout() {
    localStorage.removeItem('token');
    closeModal('logoutConfirmModal');
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}

window.doLogout = doLogout;

async function loadStats() {
    try {
        const res = await API.get("/admin/dashboard");
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            throw new Error(error.message || error.error || `Stats request failed (${res.status})`);
        }
        const d = await res.json();
        document.getElementById("s-users").textContent = d.totalUsers ?? "—";
        document.getElementById("s-drivers").textContent = d.totalDrivers ?? "—";
        document.getElementById("s-trucks").textContent = d.totalTrucks ?? "—";
        document.getElementById("s-routes").textContent = d.totalRoutes ?? "—";
        document.getElementById("s-reports").textContent = d.totalReports ?? "—";
        document.getElementById("s-fuel").textContent = d.totalFuelUsed == null
            ? "—"
            : `${Math.round(Number(d.totalFuelUsed) || 0)}L`;
        document.getElementById("opsOpenReports").textContent = d.openReports ?? "—";
        document.getElementById("opsMissedPickups").textContent = d.missedPickupReports ?? "—";
        document.getElementById("opsActiveDetours").textContent = d.activeDetours ?? "—";
        document.getElementById("opsStopExceptions").textContent = d.missedStopExceptions ?? "—";
        renderOperationsWatch(d);
    } catch (err) {
        console.error("Dashboard stats error:", err);
        showToast(`Failed to load stats: ${err.message}`, "error");
    }
}

function renderOperationsWatch(data) {
    const stopList = document.getElementById('opsStopExceptionList');
    const detourList = document.getElementById('opsDetourList');
    const exceptions = Array.isArray(data.recentStopExceptions) ? data.recentStopExceptions : [];
    const detours = Array.isArray(data.detourRoutes) ? data.detourRoutes : [];
    if (stopList) {
        stopList.innerHTML = exceptions.length
            ? exceptions.map(item => `
                <div class="ops-watch-row">
                    <strong>${escapeHTML(item.zoneName || 'Route')}</strong>
                    <span>${escapeHTML(item.stopName)} · ${escapeHTML(item.status)} · ${fmtDate(item.assignedDate)}</span>
                </div>`).join('')
            : '<p class="ops-watch-empty">No missed or inaccessible stops reported in the last 30 days.</p>';
    }
    if (detourList) {
        detourList.innerHTML = detours.length
            ? detours.map(route => `
                <div class="ops-watch-row">
                    <strong>${escapeHTML(route.zoneName || 'Route')} · ${escapeHTML(route.plateNumber || 'Truck')}</strong>
                    <span>${escapeHTML(route.driverName || 'Driver')} · ${route.offRouteUpdates} off-route updates</span>
                </div>`).join('')
            : '<p class="ops-watch-empty">No repeated route deviations detected in the last 15 minutes.</p>';
    }
}

async function loadChart() {
    try {
        const res = await API.get("/admin/analytics");
        if (!res.ok) throw new Error();
        const data = await res.json();
        let reportData = [];
        if (data.type_breakdown && Array.isArray(data.type_breakdown)) {
            reportData = data.type_breakdown;
        } else if (Array.isArray(data)) {
            reportData = data;
        }

        reportData = reportData.filter(d => d.type !== 'ALL');

        if (reportData.length === 0) {
            document.getElementById('reportChart').parentElement.innerHTML =
                '<div class="empty-state" style="padding:40px 20px;"><div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div><div class="empty-state-text">No report data available</div></div>';
            return;
        }

        new Chart(document.getElementById("reportChart"), {
            type: "doughnut",
            data: {
                labels: reportData.map(d => d.type.replace("_", " ").toUpperCase()),
                datasets: [{
                    data: reportData.map(d => d.total),
                    backgroundColor: ["#ffc13c", "#3ddc84", "#ff5c5c", "#60a5fa", "#a78bfa", "#fb923c"],
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            color: "var(--text2)",
                            font: { family: "Outfit", size: 11 },
                            padding: 16,
                            boxWidth: 10
                        }
                    }
                },
                cutout: "65%"
            }
        });
    } catch (err) {
        console.error('Chart error:', err);
        document.getElementById('reportChart').parentElement.innerHTML =
            '<div class="empty-state" style="padding:40px 20px;"><div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div><div class="empty-state-text">Failed to load chart data</div></div>';
    }
}

async function loadRecentReports() {
    try {
        const res = await API.get("/admin/reports");
        if (!res.ok) throw new Error();
        const data = await res.json();
        const el = document.getElementById("recentReports");

        let reports = [];
        if (Array.isArray(data)) {
            reports = data;
        } else if (data.data && Array.isArray(data.data)) {
            reports = data.data;
        }

        if (!reports.length) {
            el.innerHTML = '<div class="empty-state"><span class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg></span><div class="empty-state-text">No reports yet</div></div>';
            return;
        }

        el.innerHTML = reports.slice(0, 5).map(r => `
                    <div class="activity-item">
                        <div class="activity-dot" style="background:${r.type === 'missed_pickup' ? 'var(--gold)' : r.type === 'overflowing_bin' ? 'var(--green)' : 'var(--red)'}"></div>
                        <div>
                            <div class="activity-text">${(r.type || '').replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown'}</div>
                            <div class="activity-time">${r.description?.slice(0, 60) || "No description"}</div>
                            <div class="activity-time">${fmtDate(r.created_at || new Date())}</div>
                        </div>
                    </div>`).join("");
    } catch (err) {
        console.error('Recent reports error:', err);
        document.getElementById("recentReports").innerHTML =
            '<div class="empty-state"><span class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><div class="empty-state-text">Failed to load reports</div></div>';
    }
}

async function loadPickups() {
    try {
        const res = await API.get("/admin/pickups");
        if (!res.ok) throw new Error();
        const data = await res.json();
        const tbody = document.getElementById("pickupBody");
        if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text2)">No schedules found</td></tr>'; return; }
        tbody.innerHTML = data.slice(0, 7).map(p => `
                    <tr>
                        <td class="table-mono">${fmtDate(p.assigned_date)}</td>
                        <td>${p.driver_name || "—"}</td>
                        <td class="table-mono">${p.truck_plate || "—"}</td>
                        <td>${p.zone_name || "—"}</td>
                        <td>${statusBadge(p.status)}</td>
                    </tr>`).join("");
    } catch (err) {
        console.error('Pickups error:', err);
    }
}

async function loadProfile() {
    try {
        const res = await API.get("/admin/profile");
        if (!res.ok) throw new Error();
        const d = await res.json();
        document.getElementById("adminName").textContent = d.name || "Admin";
    } catch { }
}

function checkAuth() {
    if (!getToken()) window.location.href = '/login.html';
}
checkAuth();
loadStats();
loadChart();
loadRecentReports();
loadPickups();
loadProfile();