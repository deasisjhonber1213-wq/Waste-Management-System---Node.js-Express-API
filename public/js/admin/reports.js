const API_URL = window.location.origin + '/api';
console.log('API URL:', API_URL);

function getToken() {
    return localStorage.getItem('token');
}

// PUT support was missing from API
const API = {
    get: async (endpoint) => {
        return fetch(API_URL + endpoint, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
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
    delete: async (endpoint) => {
        return fetch(API_URL + endpoint, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + getToken() }
        });
    }
};

const STATUS_LABEL = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved', rejected: 'Rejected' };
const STATUS_BADGE = { pending: 'badge-gold', in_progress: 'badge-blue', resolved: 'badge-green', rejected: 'badge-red' };

const TYPE_COLOR = {
    missed_pickup: '#ffc13c',
    overflowing_bin: '#4ade80',
    illegal_dumping: '#f87171'
};
const TYPE_BADGE = {
    missed_pickup: 'badge-gold',
    overflowing_bin: 'badge-green',
    illegal_dumping: 'badge-red'
};
const TYPE_LABEL = {
    missed_pickup: 'Missed Pickup',
    overflowing_bin: 'Overflowing Bin',
    illegal_dumping: 'Illegal Dumping'
};

// ── State (must be declared before any function that uses them) ──
let allReports = [];
let allResidents = [];
let filtered = [];
let activeDateFilter = 'all';
let activeStatusFilter = 'all';
let activeTab = 'reports';
let reportMap = null;
let reportTiles = null;
let isSat = false;
let reportMarkers = [];
let residentMarkers = [];

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
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function startOfWeek(d) { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }

function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }

function inDateRange(r, filter) {
    if (filter === 'all') return true;
    const d = new Date(r.created_at);
    const now = new Date();
    if (filter === 'today') return d >= startOfDay(now);
    if (filter === 'week') return d >= startOfWeek(now);
    if (filter === 'month') return d >= startOfMonth(now);
    return true;
}

function setStatusFilter(s) {
    activeStatusFilter = s;
    ['all', 'pending', 'in_progress', 'resolved', 'rejected'].forEach(k => {
        const el = document.getElementById(`pill-status-${k}`);
        if (el) el.classList.toggle('active', k === s);
    });
    applyFilters();
}
window.setStatusFilter = setStatusFilter;

function setDateFilter(f) {
    activeDateFilter = f;
    ['all', 'today', 'week', 'month'].forEach(k => {
        const el = document.getElementById(`pill-${k}`);
        if (el) el.classList.toggle('active', k === f);
    });
    applyFilters();
}
window.setDateFilter = setDateFilter;

function applyFilters() {
    const searchEl = document.getElementById('searchInput');
    const typeEl = document.getElementById('typeFilter');
    const q = searchEl ? searchEl.value.toLowerCase() : '';
    const tp = typeEl ? typeEl.value : '';
    const reports = Array.isArray(allReports) ? allReports : [];

    filtered = reports.filter(r => {
        const matchQ = !q || (r.description || '').toLowerCase().includes(q);
        const matchTp = !tp || r.type === tp;
        const matchDt = inDateRange(r, activeDateFilter);
        const matchSt = activeStatusFilter === 'all' || r.status === activeStatusFilter;
        return matchQ && matchTp && matchDt && matchSt;
    });

    renderTable(filtered);
    renderMapPins(filtered);
    renderResidentPins(allResidents);

    const visibleEl = document.getElementById('visibleCount');
    if (visibleEl) visibleEl.textContent = filtered.length;

    const totalPins = reportMarkers.length + residentMarkers.length;
    const pinEl = document.getElementById('mapPinCount');
    if (pinEl) {
        pinEl.textContent =
            `${totalPins} total (${reportMarkers.length} reports, ${residentMarkers.length} residents)`;
    }
}
window.applyFilters = applyFilters;

async function resolveReport(id) {
    try {
        const res = await API.put(`/admin/reports/${id}/status`, { status: 'resolved' });
        if (!res.ok) throw new Error();
        showToast('Report marked resolved', 'success');
        await loadReports();
    } catch {
        showToast('Failed to update report', 'error');
    }
}
window.resolveReport = resolveReport;

async function deleteReport(id) {
    if (!window.confirm(`Permanently delete report #${id}? This cannot be undone.`)) return;

    try {
        const res = await API.delete(`/admin/reports/${encodeURIComponent(id)}`);
        const result = await res.json();
        if (!res.ok) {
            throw new Error(result.error || result.message || 'Failed to delete report');
        }

        allReports = allReports.filter(report => String(report.id) !== String(id));
        updateStatCards(allReports);
        applyFilters();
        showToast(result.message || 'Report deleted successfully', 'success');
    } catch (err) {
        console.error('Delete report error:', err);
        showToast(err.message || 'Failed to delete report', 'error');
    }
}
window.deleteReport = deleteReport;

function fitAllPins() {
    const allPins = [...reportMarkers, ...residentMarkers];
    if (allPins.length && reportMap) {
        const bounds = L.latLngBounds(allPins.map(p => p.marker.getLatLng()));
        reportMap.fitBounds(bounds.pad(0.15));
    }
}
window.fitAllPins = fitAllPins;

function initReportMap() {
    if (reportMap) return;
    reportMap = L.map('reportMap').setView([8.2317, 123.4018], 13);
    reportTiles = makeTiles();
    applyTile(reportMap, reportTiles, false);
    reportMap.invalidateSize();
}

// Free CARTO basemap key — get your own at https://carto.com/basemaps/apikey
// (free, no card, ~1 min via email — 5M tile requests/month). Paste it below.
const CARTO_API_KEY = "cb1_29ri_1_ec22111e95ba27720f0b3c7b";

function makeTiles() {
    return {
        // CARTO Dark Matter — detailed roads/streets, retina-sharp, zoom 20
        dark: L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=' + CARTO_API_KEY,
            {
                attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                subdomains: 'abcd',
                maxZoom: 20,
                detectRetina: true
            }
        ),
        // Satellite (Esri — still free, no key required)
        sat: L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            {
                attribution: '&copy; Esri',
                maxZoom: 19
            }
        ),
        // Street/road labels overlay for satellite view — free, no API key, sharper than old Esri Reference layer
        label: L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png?key=' + CARTO_API_KEY,
            {
                attribution: '',
                subdomains: 'abcd',
                maxZoom: 20,
                opacity: 0.9,
                pane: 'overlayPane',
                detectRetina: true
            }
        )
    };
}

function applyTile(map, tiles, isSat) {
    Object.values(tiles).forEach(l => {
        if (l && map.hasLayer(l)) map.removeLayer(l);
    });
    if (isSat) {
        tiles.sat.addTo(map);
        if (tiles.label) tiles.label.addTo(map);
    } else {
        tiles.dark.addTo(map);
        if (tiles.label) tiles.label.addTo(map);   // roads/names on dark base
    }
}

function toggleSat() {
    isSat = !isSat;
    applyTile(reportMap, reportTiles, isSat);
    const btn = document.getElementById('satBtn');
    if (btn) {
        btn.innerHTML = isSat ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Map` : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg> Satellite`;
        btn.classList.toggle('active', isSat);
    }
}
window.toggleSat = toggleSat;

function renderMapPins(data) {
    if (!reportMap) return;
    reportMarkers.forEach(({ marker }) => reportMap.removeLayer(marker));
    reportMarkers = [];

    const withLoc = data.filter(r => r.latitude != null && r.longitude != null);

    withLoc.forEach(r => {
        const color = TYPE_COLOR[r.type] || '#a78bfa';
        const icon = L.divIcon({
            html: `<div class="rp-dot" style="background:${color};"></div>`,
            iconSize: [14, 14], iconAnchor: [7, 7], className: ''
        });

        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);

        if (isNaN(lat) || isNaN(lng)) return;

        const marker = L.marker([lat, lng], { icon })
            .addTo(reportMap)
            .bindPopup(buildReportPopupHtml(r), { maxWidth: 280, className: 'rp-popup' });

        reportMarkers.push({ id: r.id, marker });
    });
}

function buildReportPopupHtml(r) {
    const color = TYPE_COLOR[r.type] || '#a78bfa';
    const label = TYPE_LABEL[r.type] || r.type.replace(/_/g, ' ');
    const imgHtml = r.image_url ?
        `<img class="rp-popup-img" src="${escHtml(r.image_url)}"
                        alt="Report photo"
                        onclick="event.stopPropagation();openLightbox('${escHtml(r.image_url)}')"
                        onerror="this.style.display='none'">` :
        '<div style="color:var(--text3);font-size:0.7rem;">No photo</div>';
    const desc = r.description ? escHtml(r.description).substring(0, 120) + (r.description.length > 120 ? '…' : '') :
        'No description';
    return `
                    <div>
                        <div class="rp-popup-type" style="color:${color};">${label}</div>
                        ${imgHtml}
                        <div class="rp-popup-desc">${desc}</div>
                        <div class="rp-popup-meta">
                            <span>${r.resident_name ? escHtml(r.resident_name) : (r.user_id ? `User #${r.user_id}` : 'Anonymous')}</span>
                            <span>${fmtDate(r.created_at)}</span>
                        </div>
                        <button class="rp-popup-btn" onclick="viewReport(${r.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> Full Details</button>
                    </div>`;
}

function renderResidentPins(residents) {
    if (!reportMap) return;
    residentMarkers.forEach(({ marker }) => reportMap.removeLayer(marker));
    residentMarkers = [];

    const withLoc = (residents || []).filter(r => r.latitude != null && r.longitude != null);

    withLoc.forEach(r => {
        const icon = L.divIcon({
            html: `<div class="resident-dot" style="background:#60a5fa;"></div>`,
            iconSize: [12, 12], iconAnchor: [6, 6], className: ''
        });

        const lat = parseFloat(r.latitude);
        const lng = parseFloat(r.longitude);

        if (isNaN(lat) || isNaN(lng)) return;

        const lastSeen = new Date(r.location_updated_at);
        const isRecent = (Date.now() - lastSeen.getTime()) < 30 * 60 * 1000;

        const marker = L.marker([lat, lng], { icon })
            .addTo(reportMap)
            .bindPopup(`
                            <div>
                                <strong style="color:#60a5fa;">👤 ${escHtml(r.name || 'Resident')}</strong><br>
                                <span style="font-size:0.7rem;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br>
                                <span style="font-size:0.65rem;color:${isRecent ? '#4ade80' : '#7a8499'}">
                                    Last seen: ${fmtTime(r.location_updated_at)}
                                </span>
                                <button class="rp-popup-btn" style="margin-top:6px;" onclick="viewResident(${r.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View Details</button>
                            </div>
                        `, { maxWidth: 260 });

        residentMarkers.push({ id: r.id, marker });
    });

    const totalPins = reportMarkers.length + residentMarkers.length;
    const pinEl = document.getElementById('mapPinCount');
    if (pinEl) {
        pinEl.textContent =
            `${totalPins} total (${reportMarkers.length} reports, ${residentMarkers.length} residents)`;
    }
}

function updateAllMapPins() {
    renderMapPins(filtered);
    renderResidentPins(allResidents);
    fitAllPins();
}

function flyToReport(id) {
    const entry = reportMarkers.find(m => m.id === id);
    if (!entry || !reportMap) return;
    reportMap.flyTo(entry.marker.getLatLng(), 17, { duration: 0.8 });
    setTimeout(() => entry.marker.openPopup(), 900);
}
window.flyToReport = flyToReport;

function flyToResident(id) {
    const entry = residentMarkers.find(m => m.id === id);
    if (!entry || !reportMap) return;
    reportMap.flyTo(entry.marker.getLatLng(), 15, { duration: 0.8 });
    setTimeout(() => entry.marker.openPopup(), 900);
}
window.flyToResident = flyToResident;

async function loadReports() {
    try {
        const res = await API.get('/admin/reports');
        if (!res.ok) throw new Error('Failed to fetch reports');
        const data = await res.json();

        if (Array.isArray(data)) {
            allReports = data;
        } else if (data && data.data && Array.isArray(data.data)) {
            allReports = data.data;
        } else {
            allReports = [];
        }

        console.log('Reports loaded:', allReports.length);
        updateStatCards(allReports);
        applyFilters();
    } catch (err) {
        console.error('Load reports error:', err);
        allReports = [];
        updateStatCards([]);
        applyFilters();
        showToast('Failed to load reports', 'error');
    }
}

async function loadResidents() {
    try {
        const res = await API.get('/admin/resident-locations');
        if (!res.ok) throw new Error('Failed to fetch residents');
        allResidents = await res.json();

        if (!Array.isArray(allResidents)) {
            allResidents = [];
        }

        const cRes = document.getElementById('c-residents');
        const rCount = document.getElementById('residentCount');
        if (cRes) cRes.textContent = allResidents.length;
        if (rCount) rCount.textContent = allResidents.length;
        renderResidentList();
        updateAllMapPins();
    } catch (err) {
        console.error('Load residents error:', err);
        allResidents = [];
        showToast('Failed to load resident locations', 'error');
    }
}

function renderResidentList() {
    const container = document.getElementById('residentList');
    if (!container) return;

    if (!allResidents.length) {
        container.innerHTML =
            '<div style="text-align:center;padding:32px;color:var(--text2)">No active residents found</div>';
        return;
    }

    container.innerHTML = allResidents.map(r => {
        const lastSeen = new Date(r.location_updated_at);
        const isRecent = (Date.now() - lastSeen.getTime()) < 30 * 60 * 1000;
        const lat = r.latitude != null ? parseFloat(r.latitude) : null;
        const lng = r.longitude != null ? parseFloat(r.longitude) : null;
        const latStr = lat != null && !isNaN(lat) ? lat.toFixed(5) : '—';
        const lngStr = lng != null && !isNaN(lng) ? lng.toFixed(5) : '—';

        return `
                        <div class="resident-card" onclick="viewResident(${r.id})">
                            <div class="resident-avatar">👤</div>
                            <div class="resident-info">
                                <div class="resident-name">${escHtml(r.name || 'Resident')}</div>
                                <div class="resident-loc-time">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${latStr}, ${lngStr}<br>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${fmtTime(r.location_updated_at)} ${isRecent ? '<span style="color:#4ade80;">(Active)</span>' : ''}
                                </div>
                            </div>
                            <div style="font-size:1.2rem;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                        </div>
                    `;
    }).join('');
}

function updateStatCards(data) {
    const reports = Array.isArray(data) ? data : [];
    const cMissed = document.getElementById('c-missed');
    const cOverflow = document.getElementById('c-overflow');
    const cIllegal = document.getElementById('c-illegal');
    if (cMissed) cMissed.textContent = reports.filter(r => r.type === 'missed_pickup').length;
    if (cOverflow) cOverflow.textContent = reports.filter(r => r.type === 'overflowing_bin').length;
    if (cIllegal) cIllegal.textContent = reports.filter(r => r.type === 'illegal_dumping').length;
}

function renderTable(data) {
    const tbody = document.getElementById('reportsBody');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML =
            `<tr><td colspan="8"><div class="empty-state" style="text-align:center;padding:32px;color:var(--text2)">No reports match the current filters</div></td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((r, i) => {
        const hasLoc = r.latitude != null && r.longitude != null;
        const hasImage = r.image_url && r.image_url.length > 100;
        return `<tr class="${hasLoc ? 'row-has-location' : ''}" ${hasLoc ? `onclick="flyToReport(${r.id})" title="Click to locate on map"` : ''}>
                <td class="table-mono table-muted">${String(i + 1).padStart(2, '0')}</td>
                <td><span class="badge ${TYPE_BADGE[r.type] || 'badge-gray'}">${(TYPE_LABEL[r.type] || r.type).replace(/_/g, ' ')}</span></td>
                <td style="max-width:180px;color:var(--text2);font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.description || '—')}">
                    ${hasLoc ? '<span title="Has location" style="margin-right:4px;display:inline-flex;align-items:center;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>' : ''}${escHtml(r.description || '—')}
                </td>
                <td class="table-muted" style="font-size:0.7rem;">${r.resident_name ? escHtml(r.resident_name) : (r.user_id ? `User #${r.user_id}` : 'Anonymous')}</td>
                <td class="table-muted" style="font-size:0.7rem;">${fmtDate(r.created_at)}</td>
                <td><span class="badge ${STATUS_BADGE[r.status] || 'badge-gray'}">${STATUS_LABEL[r.status] || r.status || 'pending'}</span></td>
                <td style="text-align:center;">${hasImage ? `<img src="${r.image_url}" class="report-img-thumb" onclick="event.stopPropagation();openLightbox('${r.image_url}')" onerror="this.style.display='none'" loading="lazy">` : '—'}</td>
                <td class="report-actions">
                    <button class="btn btn-outline btn-sm btn-icon" onclick='event.stopPropagation();viewReport(${r.id})'><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                    ${r.status !== 'resolved' ? `<button class="btn btn-outline btn-sm btn-icon" title="Mark resolved" onclick='event.stopPropagation();resolveReport(${r.id})'><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
                    <button class="btn btn-outline btn-sm btn-icon btn-delete-report" title="Delete report" aria-label="Delete report ${r.id}" onclick='event.stopPropagation();deleteReport(${r.id})'><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg></button>
                </td>
             </tr>`;
    }).join('');
}

function viewReport(id) {
    const r = allReports.find(x => x.id === id);
    if (!r) return;

    const color = TYPE_COLOR[r.type] || '#a78bfa';
    const label = TYPE_LABEL[r.type] || r.type.replace(/_/g, ' ');

    const imgSection = r.image_url ? `
                        <div>
                            <div class="form-label" style="margin-bottom:6px;">Photo</div>
                            <img src="${escHtml(r.image_url)}"
                                 alt="Report photo"
                                 style="width:100%;max-height:220px;object-fit:cover;border-radius:8px;cursor:pointer;"
                                 onclick="openLightbox('${escHtml(r.image_url)}')"
                                 onerror="this.parentElement.style.display='none'">
                        </div>` :
        '<div style="color:var(--text3);">No photo attached</div>';

    const locSection = (r.latitude != null && r.longitude != null) ? `
                        <div>
                            <div class="form-label" style="margin-bottom:4px;">Location</div>
                            <div style="font-family:var(--mono);font-size:0.8rem;color:var(--text2);">
                                ${Number(r.latitude).toFixed(6)}, ${Number(r.longitude).toFixed(6)}
                            </div>
                            <button class="btn btn-outline btn-sm" style="margin-top:6px;"
                                    onclick="closeModal('viewReportModal');flyToReport(${r.id})">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> Show on Map
                            </button>
                        </div>` :
        '<div style="color:var(--text3);">No location provided</div>';

    const body = document.getElementById('reportModalBody');
    if (!body) return;

    body.innerHTML = `
                        <div style="display:flex;flex-direction:column;gap:16px;">
                            <div>
                                <div class="form-label">Type</div>
                                <div style="margin-top:6px;"><span class="badge ${TYPE_BADGE[r.type] || 'badge-gray'}" style="background:${color}20;color:${color};">${label}</span></div>
                            </div>
                            <div>
                                <div class="form-label">Description</div>
                                <div style="margin-top:6px;font-size:0.85rem;color:var(--text);line-height:1.6;background:var(--bg3);padding:12px;border-radius:8px;">
                                    ${escHtml(r.description || 'No description provided.')}
                                </div>
                            </div>
                            ${imgSection}
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                                <div>
                                    <div class="form-label">Reporter</div>
                                    <div style="margin-top:4px;font-size:0.8rem;">
                                        ${r.resident_name ? escHtml(r.resident_name) : (r.user_id ? `User #${r.user_id}` : 'Anonymous')}
                                    </div>
                                </div>
                                <div>
                                    <div class="form-label">Submitted</div>
                                    <div style="margin-top:4px;font-size:0.8rem;">${fmtDate(r.created_at)}</div>
                                </div>
                            </div>
                            ${locSection}
                        </div>`;
    openModal('viewReportModal');
}
window.viewReport = viewReport;

function viewResident(id) {
    const r = allResidents.find(x => x.id === id);
    if (!r) return;

    const lastSeen = new Date(r.location_updated_at);
    const isRecent = (Date.now() - lastSeen.getTime()) < 30 * 60 * 1000;

    const lat = r.latitude != null ? parseFloat(r.latitude) : null;
    const lng = r.longitude != null ? parseFloat(r.longitude) : null;
    const latStr = lat != null && !isNaN(lat) ? lat.toFixed(6) : '—';
    const lngStr = lng != null && !isNaN(lng) ? lng.toFixed(6) : '—';

    const body = document.getElementById('residentModalBody');
    if (!body) return;

    body.innerHTML = `
                        <div style="display:flex;flex-direction:column;gap:16px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:50px;height:50px;background:var(--blue-dim);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">👤</div>
                                <div>
                                    <div class="form-label">Name</div>
                                    <div style="font-size:1rem;font-weight:700;">${escHtml(r.name || 'Resident')}</div>
                                </div>
                            </div>
                            <div>
                                <div class="form-label">Location</div>
                                <div style="font-family:var(--mono);font-size:0.8rem;color:var(--text2);">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${latStr}, ${lngStr}
                                </div>
                                <button class="btn btn-outline btn-sm" style="margin-top:6px;"
                                        onclick="closeModal('viewResidentModal');flyToResident(${r.id})">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> Show on Map
                                </button>
                            </div>
                            <div>
                                <div class="form-label">Last Seen</div>
                                <div style="color:${isRecent ? '#4ade80' : '#7a8499'}">
                                    ${fmtDate(r.location_updated_at)} at ${fmtTime(r.location_updated_at)}
                                    ${isRecent ? ' (Active)' : ''}
                                </div>
                            </div>
                            ${r.address ? `<div><div class="form-label">Address</div><div style="font-size:0.85rem;">${escHtml(r.address)}</div></div>` : ''}
                        </div>`;
    openModal('viewResidentModal');
}
window.viewResident = viewResident;

function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tab === 'reports') {
        const btn = document.querySelector('.tab-btn:first-child');
        if (btn) btn.classList.add('active');
        const content = document.getElementById('reports-tab');
        if (content) content.classList.add('active');
    } else {
        const btn = document.querySelector('.tab-btn:last-child');
        if (btn) btn.classList.add('active');
        const content = document.getElementById('residents-tab');
        if (content) content.classList.add('active');
        renderResidentList();
    }
}
window.switchTab = switchTab;

function openLightbox(src) {
    const img = document.getElementById('lightboxImg');
    const box = document.getElementById('lightbox');
    if (img) img.src = src;
    if (box) box.classList.add('open');
}
window.openLightbox = openLightbox;

function closeLightbox() {
    const box = document.getElementById('lightbox');
    const img = document.getElementById('lightboxImg');
    if (box) box.classList.remove('open');
    if (img) img.src = '';
}
window.closeLightbox = closeLightbox;

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

async function loadAdminProfile() {
    try {
        const res = await API.get('/admin/profile');
        if (res.ok) {
            const d = await res.json();
            const nameEl = document.getElementById('adminName');
            if (nameEl) nameEl.textContent = d.name || 'Admin';
        }
    } catch { }
}

// Expose remaining helpers
Object.assign(window, {
    viewReport, viewResident, flyToReport, flyToResident,
    openLightbox, closeLightbox, setDateFilter, setStatusFilter,
    applyFilters, toggleSat, switchTab, fitAllPins, resolveReport, deleteReport
});

// Boot
initReportMap();
loadAdminProfile();
loadReports();
loadResidents();

setInterval(loadResidents, 30000);