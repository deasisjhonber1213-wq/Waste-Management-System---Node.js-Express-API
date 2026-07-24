

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
    }
};

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

let allReports = [];
let allResidents = [];
let filtered = [];
let activeDateFilter = 'all';
let activeTab = 'reports';
let reportMap = null;
let reportTiles = null;
let isSat = false;
let reportMarkers = [];
let residentMarkers = [];

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

function fitAllPins() {
    const allPins = [...reportMarkers, ...residentMarkers];
    if (allPins.length) {
        const bounds = L.latLngBounds(allPins.map(p => p.marker.getLatLng()));
        reportMap.fitBounds(bounds.pad(0.15));
    }
}

function initReportMap() {
    if (reportMap) return;
    reportMap = L.map('reportMap').setView([8.2317, 123.4018], 13);
    reportTiles = makeTiles();
    applyTile(reportMap, reportTiles, false);
    reportMap.invalidateSize();
}

function makeTiles() {
    return {
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            { attribution: '&copy; OSM & CARTO', subdomains: 'abcd', maxZoom: 20 }),
        sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: '&copy; Esri', maxZoom: 19 }),
        label: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
            { subdomains: 'abcd', maxZoom: 20, opacity: 0.85, pane: 'overlayPane' })
    };
}

function applyTile(map, tiles, sat) {
    Object.values(tiles).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    if (sat) {
        tiles.sat.addTo(map);
        tiles.label.addTo(map);
    } else { tiles.dark.addTo(map); }
}

function toggleSat() {
    isSat = !isSat;
    applyTile(reportMap, reportTiles, isSat);
    const btn = document.getElementById('satBtn');
    btn.innerHTML = isSat ? '🌍 Map' : '🛰️ Satellite';
    btn.classList.toggle('active', isSat);
}

function renderMapPins(data) {
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
                <button class="rp-popup-btn" onclick="viewReport(${r.id})">📋 Full Details</button>
            </div>`;
}

function renderResidentPins(residents) {
    residentMarkers.forEach(({ marker }) => reportMap.removeLayer(marker));
    residentMarkers = [];

    const withLoc = residents.filter(r => r.latitude != null && r.longitude != null);

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
                    <span style="font-size:0.7rem;">📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</span><br>
                        <span style="font-size:0.65rem;color:${isRecent ? '#4ade80' : '#7a8499'}">
                            Last seen: ${fmtTime(r.location_updated_at)}
                        </span>
                        <button class="rp-popup-btn" style="margin-top:6px;" onclick="viewResident(${r.id})">👁 View Details</button>
                    </div>
                    `, { maxWidth: 260 });

        residentMarkers.push({ id: r.id, marker });
    });

    const totalPins = reportMarkers.length + residentMarkers.length;
    document.getElementById('mapPinCount').textContent =
        `${totalPins} total (${reportMarkers.length} reports, ${residentMarkers.length} residents)`;
}

function updateAllMapPins() {
    renderMapPins(filtered);
    renderResidentPins(allResidents);
    fitAllPins();
}

function flyToReport(id) {
    const entry = reportMarkers.find(m => m.id === id);
    if (!entry) return;
    reportMap.flyTo(entry.marker.getLatLng(), 17, { duration: 0.8 });
    setTimeout(() => entry.marker.openPopup(), 900);
}

function flyToResident(id) {
    const entry = residentMarkers.find(m => m.id === id);
    if (!entry) return;
    reportMap.flyTo(entry.marker.getLatLng(), 15, { duration: 0.8 });
    setTimeout(() => entry.marker.openPopup(), 900);
}

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

        console.log('📊 Reports loaded:', allReports.length);
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

        document.getElementById('c-residents').textContent = allResidents.length;
        document.getElementById('residentCount').textContent = allResidents.length;
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
                                📍 ${latStr}, ${lngStr}<br>
                                    🕐 ${fmtTime(r.location_updated_at)} ${isRecent ? '<span style="color:#4ade80;">(Active)</span>' : ''}
                            </div>
                        </div>
                        <div style="font-size:1.2rem;">📍</div>
                    </div>
                    `;
    }).join('');
}

function updateStatCards(data) {
    const reports = Array.isArray(data) ? data : [];
    document.getElementById('c-missed').textContent = reports.filter(r => r.type === 'missed_pickup').length;
    document.getElementById('c-overflow').textContent = reports.filter(r => r.type === 'overflowing_bin').length;
    document.getElementById('c-illegal').textContent = reports.filter(r => r.type === 'illegal_dumping').length;
}

function setDateFilter(f) {
    activeDateFilter = f;
    ['all', 'today', 'week', 'month'].forEach(k => {
        document.getElementById(`pill-${k}`).classList.toggle('active', k === f);
    });
    applyFilters();
}

function applyFilters() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const tp = document.getElementById('typeFilter').value;

    const reports = Array.isArray(allReports) ? allReports : [];

    filtered = reports.filter(r => {
        const matchQ = !q || (r.description || '').toLowerCase().includes(q);
        const matchTp = !tp || r.type === tp;
        const matchDt = inDateRange(r, activeDateFilter);
        return matchQ && matchTp && matchDt;
    });

    renderTable(filtered);
    renderMapPins(filtered);
    renderResidentPins(allResidents);
    document.getElementById('visibleCount').textContent = filtered.length;

    const totalPins = reportMarkers.length + residentMarkers.length;
    document.getElementById('mapPinCount').textContent =
        `${totalPins} total (${reportMarkers.length} reports, ${residentMarkers.length} residents)`;
}

function renderTable(data) {
    const tbody = document.getElementById('reportsBody');
    if (!data.length) {
        tbody.innerHTML =
            `<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No reports match this filter</div></div></td></tr>`;
        return;
    }
    tbody.innerHTML = data.map((r, i) => {
        const hasLoc = r.latitude != null && r.longitude != null;
        // Check if image_url exists and is valid
        const hasImage = r.image_url && r.image_url.length > 100;
        return `<tr class="${hasLoc ? 'row-has-location' : ''}" ${hasLoc ? `onclick="flyToReport(${r.id})" title="Click to locate on map"` : ''}>
                        <td class="table-mono table-muted">${String(i + 1).padStart(2, '0')}</td>
                        <td><span class="badge ${TYPE_BADGE[r.type] || 'badge-gray'}">${(TYPE_LABEL[r.type] || r.type).replace(/_/g, ' ')}</span></td>
                        <td style="max-width:180px;color:var(--text2);font-size:0.75rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.description || '—')}">
                            ${hasLoc ? '<span title="Has location" style="margin-right:4px;font-size:0.7rem;">📍</span>' : ''}${escHtml(r.description || '—')}
                        </td>
                        <td class="table-muted" style="font-size:0.7rem;">${r.resident_name ? escHtml(r.resident_name) : (r.user_id ? `User #${r.user_id}` : 'Anonymous')}</td>
                        <td class="table-muted" style="font-size:0.7rem;">${fmtDate(r.created_at)}</td>
                        <td style="text-align:center;">${hasImage ? `<img src="${r.image_url}" class="report-img-thumb" onclick="event.stopPropagation();openLightbox('${r.image_url}')" onerror="this.style.display='none'" loading="lazy">` : '—'}</td>
                        <td style="text-align:center;"><button class="btn btn-outline btn-sm btn-icon" onclick='event.stopPropagation();viewReport(${r.id})'>👁</button></td>
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
                            🗺️ Show on Map
                        </button>
                    </div>` :
        '<div style="color:var(--text3);">No location provided</div>';

    document.getElementById('reportModalBody').innerHTML = `
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

function viewResident(id) {
    const r = allResidents.find(x => x.id === id);
    if (!r) return;

    const lastSeen = new Date(r.location_updated_at);
    const isRecent = (Date.now() - lastSeen.getTime()) < 30 * 60 * 1000;

    const lat = r.latitude != null ? parseFloat(r.latitude) : null;
    const lng = r.longitude != null ? parseFloat(r.longitude) : null;
    const latStr = lat != null && !isNaN(lat) ? lat.toFixed(6) : '—';
    const lngStr = lng != null && !isNaN(lng) ? lng.toFixed(6) : '—';

    document.getElementById('residentModalBody').innerHTML = `
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
                                📍 ${latStr}, ${lngStr}
                            </div>
                            <button class="btn btn-outline btn-sm" style="margin-top:6px;"
                                onclick="closeModal('viewResidentModal');flyToResident(${r.id})">
                                🗺️ Show on Map
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

function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tab === 'reports') {
        document.querySelector('.tab-btn:first-child').classList.add('active');
        document.getElementById('reports-tab').classList.add('active');
    } else {
        document.querySelector('.tab-btn:last-child').classList.add('active');
        document.getElementById('residents-tab').classList.add('active');
        renderResidentList();
    }
}

function openLightbox(src) {
    document.getElementById('lightboxImg').src = src;
    document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lightboxImg').src = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

async function loadAdminProfile() {
    try {
        const res = await API.get('/admin/profile');
        if (res.ok) {
            const d = await res.json();
            document.getElementById('adminName').textContent = d.name || 'Admin';
        }
    } catch { }
}

Object.assign(window, {
    viewReport, viewResident, flyToReport, flyToResident, openLightbox, closeLightbox,
    setDateFilter, applyFilters, toggleSat, switchTab, fitAllPins
});

initReportMap();
loadAdminProfile();
loadReports();
loadResidents();

setInterval(loadResidents, 30000);