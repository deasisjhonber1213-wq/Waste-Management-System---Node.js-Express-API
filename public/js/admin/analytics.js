
const API_URL = window.location.origin + '/api';
console.log('📡 API URL:', API_URL);

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
    }
};

const PALETTE = ["#ffc13c", "#3ddc84", "#ff5c5c", "#60a5fa", "#a78bfa", "#fb923c"];

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

async function loadDashStats() {
    try {
        const res = await API.get("/admin/dashboard");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        document.getElementById("k-users").textContent = d.totalUsers ?? "—";
        document.getElementById("k-trucks").textContent = d.totalTrucks ?? "—";
        document.getElementById("k-reports").textContent = d.totalReports ?? "—";
        document.getElementById("k-fuel").textContent = d.totalFuelUsed ? Math.round(d.totalFuelUsed) : "0";
    } catch (err) {
        console.error('Load dashboard stats error:', err);
    }
}

async function loadScheduleStats() {
    try {
        const res = await API.get("/admin/pickups");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        document.getElementById("k-sched").textContent = Array.isArray(data) ? data.length : "—";
        const completed = Array.isArray(data) ? data.filter(s => s.status === "completed").length : 0;
        document.getElementById("k-done").textContent = completed;

        const pending = Array.isArray(data) ? data.filter(s => s.status === "pending" || s.status === "in_progress").length : 0;
        const completedCount = completed;
        const missed = Array.isArray(data) ? data.filter(s => s.status === "missed").length : 0;

        new Chart(document.getElementById("barChart"), {
            type: "bar",
            data: {
                labels: ["Pending", "Completed", "Missed"],
                datasets: [{
                    data: [pending, completedCount, missed],
                    backgroundColor: ["#ffc13c", "#3ddc84", "#ff5c5c"],
                    borderRadius: 6,
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "var(--text2)", font: { family: "Outfit" } } },
                    y: { grid: { color: "rgba(255,255,255,0.04)" }, ticks: { color: "var(--text2)", font: { family: "Outfit" } }, beginAtZero: true }
                }
            }
        });
    } catch (err) {
        console.error('Load schedule stats error:', err);
    }
}

async function loadAnalytics() {
    try {
        const res = await API.get("/admin/analytics");
        if (!res.ok) {
            console.error('Analytics API error:', res.status);
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        console.log('📊 Analytics data:', data);

        let reportData = [];
        if (Array.isArray(data)) {
            reportData = data;
        } else if (data && data.type_breakdown && Array.isArray(data.type_breakdown)) {
            reportData = data.type_breakdown;
        } else if (data && data.data && Array.isArray(data.data)) {
            reportData = data.data;
        } else {
            reportData = [];
        }

        const total = reportData.reduce((s, d) => s + Number(d.total || d.count || 0), 0);
        const labels = reportData.map(d => {
            const type = d.type || d.report_type || '';
            return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
        });
        const values = reportData.map(d => Number(d.total || d.count || 0));

        const donutCtx = document.getElementById("donutChart");
        if (donutCtx) {
            new Chart(donutCtx, {
                type: "doughnut",
                data: {
                    labels: labels.length ? labels : ['No Data'],
                    datasets: [{
                        data: labels.length ? values : [1],
                        backgroundColor: labels.length ? PALETTE : ['#333'],
                        borderWidth: 0,
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        legend: { position: "bottom", labels: { color: "var(--text2)", font: { family: "Outfit", size: 11 }, padding: 16, boxWidth: 10 } }
                    },
                    cutout: "68%"
                }
            });
        }

        const metricRows = document.getElementById("metricRows");
        if (metricRows) {
            if (!reportData.length) {
                metricRows.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">No data yet</div></div>';
            } else {
                metricRows.innerHTML = reportData.map((d, i) => {
                    const val = Number(d.total || d.count || 0);
                    const pct = total ? Math.round(val / total * 100) : 0;
                    const color = PALETTE[i % PALETTE.length];
                    return `
                                <div class="metric-card">
                                    <div class="metric-card-header">
                                        <span class="metric-dot" style="background:${color}"></span>
                                        <span class="metric-card-label">${labels[i] || 'Unknown'}</span>
                                        <span class="metric-card-value">${val}</span>
                                    </div>
                                    <div class="metric-bar-track">
                                        <div class="metric-bar-fill" style="width:${Math.max(pct, 2)}%;background:${color}"></div>
                                    </div>
                                    <div class="metric-card-footer">
                                        <span class="metric-percent">${pct}% of total</span>
                                        <span class="metric-count">${val} reports</span>
                                    </div>
                                </div>`;
                }).join("");
            }
        }

        const tableBody = document.getElementById("analyticsTable");
        if (tableBody) {
            if (!reportData.length) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text2)">No data</td></tr>';
            } else {
                tableBody.innerHTML = reportData.map((d, i) => {
                    const val = Number(d.total || d.count || 0);
                    const pct = total ? (val / total * 100).toFixed(1) : 0;
                    const color = PALETTE[i % PALETTE.length];
                    return `
                                <tr>
                                    <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>${labels[i] || 'Unknown'}</span></td>
                                    <td class="table-mono text-gold">${val}</td>
                                    <td class="table-muted">${pct}%</td>
                                    <td><div style="width:${Math.min(pct * 2, 100)}%;height:6px;background:${color};border-radius:3px;min-width:4px;transition:width 0.6s ease"></div></td>
                                </tr>`;
                }).join("");
            }
        }

    } catch (err) {
        console.error('Load analytics error:', err);
        showToast("Failed to load analytics", "error");
        document.getElementById("analyticsTable").innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text2)">Failed to load data</td></tr>';
    }
}

async function exportExcel() {
    showToast("Preparing export…", "info");
    try {
        const token = getToken();
        const res = await fetch(API_URL + "/admin/export-analytics", {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `smartwaste-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Export downloaded!", "success");
    } catch (err) {
        console.error('Export error:', err);
        showToast("Export failed: " + err.message, "error");
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

loadAdminProfile();
loadDashStats();
loadAnalytics();
loadScheduleStats();