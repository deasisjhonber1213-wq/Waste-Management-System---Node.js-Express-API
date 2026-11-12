function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
    document.body.style.overflow = '';
}
window.openModal = openModal;
window.closeModal = closeModal;

// ---- API ----
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
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${msg}</span>`;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
    }
}
checkAuth();

// ---- LOGOUT ----
function doLogout() {
    localStorage.removeItem('token');
    closeModal('logoutConfirmModal');
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}
window.doLogout = doLogout;

let allRoutes = [];
let selectedRoute = null;
let isEditingId = null;

let markingMap = null;
let isMarkingMapSatellite = false;
let activeLayer = 'road';

let roadPoints = [];
let roadMarkers = [];
let ghostMarkers = [];
let roadPolyline = null;

let pinPoints = [];
let pinMarkers = [];

let mrfPoints = [];
let mrfMarkers = [];

let detailMap = null;
let isDetailMapSatellite = false;

let globalMRFLocations = [];
let facilityMarkerLayers = { marking: [], detail: [], pick: [] };
let mrfPickMap = null, mrfPickTiles = null, isMRFPickSatellite = false;
let mrfPendingMarker = null, mrfPendingCircle = null, mrfPendingLatLng = null;
let mrfUserLocationMarker = null;

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

let markingTiles = null;
let detailTiles = null;

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
function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseWaypoints(json) {
    if (!json) return { road: [], pins: [], mrf: [] };
    try {
        let parsed = typeof json === 'string' ? JSON.parse(json) : json;
        if (Array.isArray(parsed)) return { road: parsed, pins: [], mrf: [] };
        if (parsed && typeof parsed === 'object') {
            return {
                road: parsed.road || [],
                pins: parsed.pins || [],
                mrf: parsed.mrf || []
            };
        }
        return { road: [], pins: [], mrf: [] };
    } catch (e) {
        return { road: [], pins: [], mrf: [] };
    }
}

function getMRFIcon(inUse = true) {
    if (inUse) {
        // Solid green — this facility IS a stop on the current route
        return L.divIcon({
            className: "",
            html: `<div class="mrf-wrap"><div class="mrf-pulse-ring"></div><div class="mrf-pin"><span style="font-size:15px">🏭</span></div></div>`,
            iconSize: [36, 36], iconAnchor: [18, 18]
        });
    }
    // Hollow blue/dashed — reference only, not yet used on this route
    return L.divIcon({
        className: "",
        html: `<div class="mrf-wrap"><div class="mrf-ref-pin"><span style="font-size:14px">🏭</span></div></div>`,
        iconSize: [34, 34], iconAnchor: [17, 17]
    });
}

async function loadRoutes() {
    try {
        const res = await API.get('/admin/routes');
        if (!res.ok) throw new Error();
        allRoutes = await res.json();
        console.log('Loaded routes:', allRoutes.length);
        renderRouteList(allRoutes);
        document.getElementById('routeCount').textContent = allRoutes.length;
    } catch (error) {
        console.error('Failed to load routes:', error);
        showToast('Failed to load routes', 'error');
    }
}

function renderRouteList(data) {
    const c = document.getElementById('routeList');
    if (!data.length) {
        c.innerHTML = `<div class="empty-state">
                    <div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></div>
                    <div class="empty-state-text">No routes yet</div>
                    <button class="btn btn-gold btn-sm" onclick="openAddModal()" style="margin-top:12px;">+ Add First Route</button>
                </div>`;
        return;
    }
    c.innerHTML = data.map(r => {
        const { road, pins, mrf } = parseWaypoints(r.waypoints_json);
        const isActive = selectedRoute?.id === r.id;
        const total = road.length + pins.length + mrf.length;
        return `<div class="route-card ${isActive ? 'active' : ''}" onclick="selectRoute(${r.id})">
                    <div class="route-name"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${escHtml(r.zone_name)}</div>
                    <div class="route-desc">${escHtml(r.description || 'No description')}</div>
                    <div class="route-meta">
                        <span class="badge badge-gray"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${fmtDate(r.created_at)}</span>
                        <span class="badge badge-gold"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L8 5"/><path d="M16 5l4 14"/><path d="M12 5v14"/><path d="M8 12h8"/></svg> ${road.length}</span>
                        <span class="badge badge-gold"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${pins.length}</span>
                        <span class="badge badge-gold">🏭 ${mrf.length}</span>
                    </div>
                </div>`;
    }).join('');
}

function filterRoutes() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    renderRouteList(allRoutes.filter(r => r.zone_name.toLowerCase().includes(q)));
}

function selectRoute(id) {
    selectedRoute = allRoutes.find(r => r.id === id);
    if (!selectedRoute) return;
    renderRouteList(allRoutes);
    renderDetail(selectedRoute);
}

function renderDetail(route) {
    if (detailMap) {
        detailMap.remove(); detailMap = null;
        detailTiles = null;
    }

    const { road, pins, mrf } = parseWaypoints(route.waypoints_json);
    const hasAny = road.length || pins.length || mrf.length;

    document.getElementById('detailActions').innerHTML = `
                <button class="btn btn-outline btn-sm" onclick="openEditModal(${route.id})"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit</button>
                <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${route.id},'${escHtml(route.zone_name)}')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete</button>
            `;

    const listHtml = [
        ...road.map((p, i) => `<div class="waypoint-item">
                    <div class="waypoint-num road-num">${i + 1}</div>
                    <span style="flex:1;color:var(--text2);">Road vertex ${i + 1}</span>
                    <span class="text-mono text-muted" style="font-size:0.65rem;">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</span>
                </div>`),
        ...pins.map((p, i) => `<div class="waypoint-item">
                    <div class="waypoint-num pin-num">${i + 1}</div>
                    <span style="flex:1;color:var(--text2);">Stop ${i + 1}</span>
                    <span class="text-mono text-muted" style="font-size:0.65rem;">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</span>
                </div>`),
        ...mrf.map((p, i) => `<div class="waypoint-item">
                    <div class="waypoint-num mrf-num">🏭</div>
                    <span style="flex:1;color:var(--text2);">MRF Stop ${i + 1}</span>
                    <span class="text-mono text-muted" style="font-size:0.65rem;">${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}</span>
                </div>`)
    ].join('') || '<div class="text-muted" style="padding:12px 0;text-align:center;">No points mapped</div>';

    document.getElementById('routeDetailBody').innerHTML = `
                <div>
                    <div class="detail-zone-name">${escHtml(route.zone_name)}</div>
                    <div class="detail-desc">${escHtml(route.description || 'No description.')}</div>
                    <div class="detail-stats">
                        <div class="detail-stat"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L8 5"/><path d="M16 5l4 14"/><path d="M12 5v14"/><path d="M8 12h8"/></svg> <span class="num">${road.length}</span> Road vertices</div>
                        <div class="detail-stat"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <span class="num">${pins.length}</span> Stops</div>
                        <div class="detail-stat">🏭 <span class="num">${mrf.length}</span> MRF stops</div>
                        <div class="detail-stat"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> <span class="num">${fmtDate(route.created_at)}</span></div>
                    </div>
                    ${hasAny ? `
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <span class="text-muted text-mono" style="font-size:0.65rem;">ROUTE MAP</span>
                            <button class="map-tool-btn" id="detailMapSatBtn" onclick="toggleDetailMapSatellite()" style="padding:3px 10px;font-size:0.65rem;">🛰️ Satellite</button>
                        </div>
                        <div class="route-map-wrap"><div id="routeDetailMap"></div></div>
                    ` : ''}
                    <div style="margin-top:14px;">
                        <div class="form-label" style="margin-bottom:6px;">ALL POINTS</div>
                        <div class="waypoints-list">${listHtml}</div>
                    </div>
                </div>
            `;
    if (hasAny) setTimeout(() => initDetailMap(road, pins, mrf), 100);
}

function initDetailMap(road, pins, mrf) {
    if (detailMap) {
        detailMap.remove(); detailMap = null;
        detailTiles = null;
    }
    isDetailMapSatellite = false;

    const allPts = [...road, ...pins, ...mrf];
    const center = allPts.length ? [allPts[0].lat, allPts[0].lng] : [8.2317, 123.4018];
    detailMap = L.map('routeDetailMap', { zoomControl: true }).setView(center, 14);
    detailTiles = makeTiles();
    applyTile(detailMap, detailTiles, false);
    detailMap.invalidateSize();

    if (road.length > 1) {
        L.polyline(road.map(p => [p.lat, p.lng]),
            { color: '#60a5fa', weight: 4, opacity: 0.9 }).addTo(detailMap);
    }
    if (road.length >= 1) {
        L.circleMarker([road[0].lat, road[0].lng],
            { radius: 7, color: '#4ade80', fillColor: '#4ade80', fillOpacity: 1, weight: 2 })
            .bindPopup('<b>▶ Start</b>').addTo(detailMap);
    }
    if (road.length >= 2) {
        const last = road[road.length - 1];
        L.circleMarker([last.lat, last.lng],
            { radius: 7, color: '#f87171', fillColor: '#f87171', fillOpacity: 1, weight: 2 })
            .bindPopup('<b>■ End</b>').addTo(detailMap);
    }
    pins.forEach((p, i) => {
        const icon = L.divIcon({
            html: `<div style="width:26px;height:26px;background:var(--gold);border-radius:50%;border:2.5px solid #fff;color:#1a1a1a;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${i + 1}</div>`,
            iconSize: [26, 26], iconAnchor: [13, 13], className: ''
        });
        L.marker([p.lat, p.lng], { icon }).bindPopup(`<b>Stop ${i + 1}</b>`).addTo(detailMap);
    });

    mrf.forEach((p) => {
        const icon = getMRFIcon();
        L.marker([p.lat, p.lng], { icon }).bindPopup(`<b>🏭 MRF Stop</b>`).addTo(detailMap);
    });

    if (allPts.length) detailMap.fitBounds(L.latLngBounds(allPts.map(p => [p.lat, p.lng])).pad(0.25));
}

function toggleDetailMapSatellite() {
    if (!detailMap || !detailTiles) return;
    isDetailMapSatellite = !isDetailMapSatellite;
    applyTile(detailMap, detailTiles, isDetailMapSatellite);
    const btn = document.getElementById('detailMapSatBtn');
    if (btn) btn.innerHTML = isDetailMapSatellite ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Map` : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg> Satellite`;
}

function scheduleMapInit(fn) {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fn, 50)));
}

function openAddModal() {
    isEditingId = null;
    document.getElementById('modalHeading').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> Add Route / Zone`;
    document.getElementById('rZone').value = '';
    document.getElementById('rDesc').value = '';
    openModal('addRouteModal');
    scheduleMapInit(() => {
        initMarkingMap();
        setActiveLayer('road');
    });
}

function openEditModal(id) {
    const route = allRoutes.find(r => r.id === id);
    if (!route) return;
    isEditingId = id;
    document.getElementById('modalHeading').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit Route`;
    document.getElementById('rZone').value = route.zone_name;
    document.getElementById('rDesc').value = route.description || '';
    openModal('addRouteModal');

    scheduleMapInit(() => {
        initMarkingMap();
        setActiveLayer('road');
        const { road, pins, mrf } = parseWaypoints(route.waypoints_json);
        roadPoints = road.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
        rebuildRoadMarkersFromPoints();
        rebuildRoadPolyline();
        rebuildGhostHandles();
        updateUI();
        pins.forEach(p => addPinMarker(p.lat, p.lng));
        mrf.forEach(p => addMRFMarker(p.lat, p.lng));
        const allPts = [...road, ...pins, ...mrf];
        if (allPts.length && markingMap) {
            markingMap.fitBounds(L.latLngBounds(allPts.map(p => [p.lat, p.lng])).pad(0.3));
        }
        markingMap.invalidateSize();
        updateUI();
    });
}

function initMarkingMap() {
    if (markingMap) { markingMap.remove(); markingMap = null; }
    roadPoints = [];
    roadMarkers = [];
    ghostMarkers = [];
    roadPolyline = null;
    pinPoints = [];
    pinMarkers = [];
    mrfPoints = [];
    mrfMarkers = [];

    markingMap = L.map('markingMap', { zoomControl: true }).setView([8.2317, 123.4018], 14);
    markingTiles = makeTiles();
    applyTile(markingMap, markingTiles, false);
    markingMap.invalidateSize();

    markingMap.on('click', e => {
        if (mrfPlacementActive) return;   // MRF-mode click is handled by its own one-time listener
        if (activeLayer === 'road') addRoadVertex(e.latlng.lat, e.latlng.lng);
        if (activeLayer === 'pin') addPinMarker(e.latlng.lat, e.latlng.lng);
    });
    renderFacilityReferenceLayer(markingMap, 'marking', { allowUse: true });
    updateUI();
}

function setActiveLayer(layer) {
    activeLayer = layer;
    document.getElementById('pillRoad').className = 'layer-pill' + (layer === 'road' ? ' active-road' : '');
    document.getElementById('pillPin').className = 'layer-pill' + (layer === 'pin' ? ' active-pin' : '');
    if (markingMap) markingMap.invalidateSize();
    updateUI();
}

function addRoadVertex(lat, lng, insertAfterIdx = null) {
    if (insertAfterIdx !== null) {
        roadPoints.splice(insertAfterIdx + 1, 0, { lat, lng });
        rebuildRoadMarkersFromPoints();
        rebuildRoadPolyline();
        rebuildGhostHandles();
    } else {
        roadPoints.push({ lat, lng });
        createRoadMarker(roadPoints.length - 1);
        rebuildRoadPolyline();
        if (roadPoints.length > 1) createGhostHandle(roadPoints.length - 2);
    }
    updateUI();
}

function rebuildRoadMarkersFromPoints() {
    roadMarkers.forEach(m => markingMap.removeLayer(m));
    roadMarkers = [];
    roadPoints.forEach((_, idx) => createRoadMarker(idx));
}

function createRoadMarker(idx) {
    const pt = roadPoints[idx];
    const icon = L.divIcon({
        html: `<div class="road-vertex"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6], className: ''
    });
    const marker = L.marker([pt.lat, pt.lng], { icon, draggable: true, zIndexOffset: 100 }).addTo(markingMap);
    marker.on('drag', () => {
        roadPoints[idx] = { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng };
        rebuildRoadPolyline();
    });
    marker.on('dragend', () => {
        rebuildGhostHandles();
        updateUI();
    });
    marker.on('contextmenu', e => {
        L.DomEvent.stopPropagation(e);
        roadPoints.splice(idx, 1);
        rebuildRoadMarkersFromPoints();
        rebuildRoadPolyline();
        rebuildGhostHandles();
        updateUI();
    });
    roadMarkers.push(marker);
}

function rebuildRoadPolyline() {
    if (roadPoints.length > 1) {
        const latLngs = roadPoints.map(p => [p.lat, p.lng]);
        if (roadPolyline) {
            roadPolyline.setLatLngs(latLngs);
        } else {
            roadPolyline = L.polyline(latLngs,
                { color: '#60a5fa', weight: 4, opacity: 0.9 }).addTo(markingMap);
        }
    } else if (roadPolyline) {
        markingMap.removeLayer(roadPolyline);
        roadPolyline = null;
    }
}

function rebuildGhostHandles() {
    ghostMarkers.forEach(m => markingMap.removeLayer(m));
    ghostMarkers = [];
    for (let i = 0; i < roadPoints.length - 1; i++) {
        createGhostHandle(i);
    }
}

function createGhostHandle(segmentIdx) {
    const a = roadPoints[segmentIdx];
    const b = roadPoints[segmentIdx + 1];
    const icon = L.divIcon({
        html: `<div class="ghost-handle"></div>`,
        iconSize: [10, 10], iconAnchor: [5, 5], className: ''
    });
    const marker = L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2],
        { icon, draggable: true, zIndexOffset: 50 }).addTo(markingMap);
    marker.on('dragstart', () => {
        const pos = marker.getLatLng();
        markingMap.removeLayer(marker);
        const idx = ghostMarkers.indexOf(marker);
        if (idx >= 0) ghostMarkers.splice(idx, 1);
        roadPoints.splice(segmentIdx + 1, 0, { lat: pos.lat, lng: pos.lng });
        rebuildRoadMarkersFromPoints();
        rebuildRoadPolyline();
        rebuildGhostHandles();
        updateUI();
    });
    ghostMarkers.push(marker);
}

function addPinMarker(lat, lng) {
    pinPoints.push({ lat, lng });
    const n = pinPoints.length;
    const icon = L.divIcon({
        html: `<div style="width:26px;height:26px;background:var(--gold);border-radius:50%;border:2.5px solid #fff;color:#1a1a1a;font-weight:700;font-size:11px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${n}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13], className: ''
    });
    const m = L.marker([lat, lng], { icon, draggable: true, zIndexOffset: 200 })
        .bindPopup(`<strong>Stop ${n}</strong>`).addTo(markingMap);
    m.on('dragend', () => {
        const idx = pinMarkers.indexOf(m);
        if (idx >= 0) {
            pinPoints[idx] = { lat: m.getLatLng().lat, lng: m.getLatLng().lng };
            updateUI();
        }
    });
    pinMarkers.push(m);
    updateUI();
}

let mrfPlacementActive = false;

function markMRFManual() {
    if (!markingMap) return;
    mrfPlacementActive = true;
    showToast('Click on the map to place the MRF Stop', 'info');
    markingMap.getContainer().style.cursor = 'crosshair';
    markingMap.once('click', e => {
        mrfPlacementActive = false;
        markingMap.getContainer().style.cursor = '';
        addMRFMarker(e.latlng.lat, e.latlng.lng);
        showToast('MRF Stop placed', 'success');
    });
}
let mrfIdCounter = 0;
const mrfMarkerById = new Map();

function addMRFMarker(lat, lng) {
    const id = ++mrfIdCounter;
    mrfPoints.push({ lat, lng, _id: id });
    const icon = getMRFIcon(true); // true = active/in-route style
    const m = L.marker([lat, lng], { icon, draggable: true, zIndexOffset: 300 })
        .addTo(markingMap);
    m.bindPopup(`
        <b>🏭 MRF Stop</b>
        <br><button onclick="removeMRFStop(${id})"
            style="margin-top:6px;width:100%;padding:6px;border-radius:6px;border:1px solid #f87171;background:rgba(248,113,113,.12);color:#f87171;font-weight:700;font-size:.65rem;cursor:pointer;">
            ✕ Remove This Stop
        </button>`);
    m.on('dragend', () => {
        const idx = mrfPoints.findIndex(p => p._id === id);
        if (idx >= 0) {
            mrfPoints[idx] = { ...mrfPoints[idx], lat: m.getLatLng().lat, lng: m.getLatLng().lng };
            updateUI();
        }
    });
    m.on('contextmenu', e => {
        L.DomEvent.stopPropagation(e);
        removeMRFStop(id);
    });
    mrfMarkerById.set(id, m);
    mrfMarkers.push(m);
    updateUI();
}

function removeMRFStop(id) {
    const m = mrfMarkerById.get(id);
    if (!m) return;
    markingMap.removeLayer(m);
    mrfMarkerById.delete(id);
    const mi = mrfMarkers.indexOf(m);
    if (mi >= 0) mrfMarkers.splice(mi, 1);
    const pi = mrfPoints.findIndex(p => p._id === id);
    if (pi >= 0) mrfPoints.splice(pi, 1);
    updateUI();
}
window.removeMRFStop = removeMRFStop;

function undoLast() {
    const undoRoad = () => {
        if (!roadPoints.length) return false;
        roadPoints.pop();
        rebuildRoadMarkersFromPoints();
        rebuildRoadPolyline();
        rebuildGhostHandles();
        return true;
    };
    const undoPin = () => {
        if (!pinPoints.length) return false;
        pinPoints.pop();
        const m = pinMarkers.pop();
        if (m) markingMap.removeLayer(m);
        return true;
    };
    const undoMRF = () => {
        const lastPoint = mrfPoints[mrfPoints.length - 1];
        if (!lastPoint) return false;
        removeMRFStop(lastPoint._id);
        return true;
    };
    const undoActions = activeLayer === 'road'
        ? [undoRoad, undoPin, undoMRF]
        : [undoPin, undoRoad, undoMRF];
    if (!undoActions.some(undo => undo())) {
        showToast('Nothing to undo', 'info');
        return;
    }
    updateUI();
}

function clearActiveLayer() {
    if (activeLayer === 'road') {
        roadPoints = [];
        roadMarkers.forEach(m => markingMap?.removeLayer(m));
        roadMarkers = [];
        ghostMarkers.forEach(m => markingMap?.removeLayer(m));
        ghostMarkers = [];
        if (roadPolyline) {
            markingMap?.removeLayer(roadPolyline);
            roadPolyline = null;
        }
    } else if (activeLayer === 'pin') {
        pinPoints = [];
        pinMarkers.forEach(m => markingMap?.removeLayer(m));
        pinMarkers = [];
    }
    updateUI();
}

function clearAll() {
    roadPoints = [];
    roadMarkers.forEach(m => markingMap?.removeLayer(m));
    roadMarkers = [];
    ghostMarkers.forEach(m => markingMap?.removeLayer(m));
    ghostMarkers = [];
    if (roadPolyline) {
        markingMap?.removeLayer(roadPolyline);
        roadPolyline = null;
    }
    pinPoints = [];
    pinMarkers.forEach(m => markingMap?.removeLayer(m));
    pinMarkers = [];
    mrfPoints = [];
    mrfMarkers.forEach(m => markingMap?.removeLayer(m));
    mrfMarkers = [];
    updateUI();
}

function toggleMarkingMapSatellite() {
    if (!markingMap || !markingTiles) return;
    isMarkingMapSatellite = !isMarkingMapSatellite;
    applyTile(markingMap, markingTiles, isMarkingMapSatellite);
    const btn = document.getElementById('markingMapSatBtn');
    btn.innerHTML = isMarkingMapSatellite ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Map` : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg> Satellite`;
    btn.classList.toggle('active', isMarkingMapSatellite);
}

function gotoMyLocation() {
    if (!navigator.geolocation) { showToast('Geolocation not supported', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
        pos => {
            if (markingMap) {
                markingMap.setView([pos.coords.latitude, pos.coords.longitude], 16);
            }
        },
        () => showToast('Could not get location', 'error')
    );
}

function updateUI() {
    const roadN = roadPoints.length,
        pinN = pinPoints.length,
        mrfN = mrfPoints.length;
    document.getElementById('wpCountLabel').innerHTML =
        `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19L8 5"/><path d="M16 5l4 14"/><path d="M12 5v14"/><path d="M8 12h8"/></svg> ${roadN} road · <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${pinN} stop${pinN !== 1 ? 's' : ''} · 🏭 ${mrfN} MRF`;
    document.getElementById('layerSummary').innerHTML = `
                <span><span class="dot" style="background:#60a5fa;"></span> ${roadN} road vertex${roadN !== 1 ? 'es' : ''}</span>
                <span><span class="dot" style="background:var(--gold);"></span> ${pinN} stop${pinN !== 1 ? 's' : ''}</span>
                <span><span class="dot" style="background:#fbbf24;"></span> ${mrfN} MRF stop${mrfN !== 1 ? 's' : ''}</span>
            `;

    const mini = document.getElementById('wpMiniList');
    let pts, numClass, label;
    if (activeLayer === 'road') {
        pts = roadPoints;
        numClass = 'road-num';
        label = 'Vertex';
    } else {
        pts = pinPoints;
        numClass = 'pin-num';
        label = 'Stop';
    }

    if (!pts.length && !mrfPoints.length) {
        mini.innerHTML =
            `<div class="text-muted" style="padding:6px 0;">${activeLayer === 'road' ? 'Click map to add road vertices · right-click vertex to delete' : 'Click map to drop a stop marker'}</div>`;
        return;
    }

    const rows = pts.map((p, i) => `
                <div class="wp-mini-item">
                    <span class="wp-mini-num ${numClass}">${i + 1}</span>
                    <span class="text-mono">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
                    <span style="font-size:0.6rem;color:var(--text2);margin-left:auto;">${label} ${i + 1}</span>
                </div>`).join('');

    const mrfRows = mrfPoints.map((p, i) => `
                <div class="wp-mini-item">
                    <span class="wp-mini-num mrf-num">🏭</span>
                    <span class="text-mono">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>
                    <span style="font-size:0.6rem;color:#fbbf24;margin-left:auto;">MRF ${i + 1}</span>
                </div>`).join('');

    mini.innerHTML = rows + mrfRows;
}

async function saveRoute() {
    const zone = document.getElementById('rZone').value.trim();
    const desc = document.getElementById('rDesc').value.trim();
    if (!zone) { showToast('Zone name is required', 'error'); return; }

    const waypointsObj = { road: roadPoints, pins: pinPoints, mrf: mrfPoints };
    const body = {
        zone_name: zone,
        description: desc,
        waypoints_json: JSON.stringify(waypointsObj),
        path_mode: 'combined'
    };

    try {
        let res;
        if (isEditingId) {
            res = await API.put(`/admin/routes/${isEditingId}`, body);
        } else {
            res = await API.post('/admin/routes', body);
        }
        if (!res.ok) throw new Error();
        const total = roadPoints.length + pinPoints.length + mrfPoints.length;
        showToast(`Route "${zone}" ${isEditingId ? 'updated' : 'saved'} (${total} total points)`, 'success');
        closeModal('addRouteModal');
        await loadRoutes();
        const fresh = allRoutes.find(r => r.zone_name === zone);
        if (fresh) selectRoute(fresh.id);
    } catch (err) {
        console.error('Save error:', err);
        showToast(err.message || 'Failed to save route', 'error');
    }
}

function openDeleteModal(id, name) {
    document.getElementById('deleteRouteId').value = id;
    document.getElementById('deleteRouteName').textContent = name;
    openModal('deleteRouteModal');
}

async function confirmDeleteRoute() {
    const id = document.getElementById('deleteRouteId').value;
    try {
        const res = await API.del(`/admin/routes/${id}`);
        if (!res.ok) throw new Error();
        showToast('Route deleted', 'success');
        closeModal('deleteRouteModal');
        selectedRoute = null;
        document.getElementById('routeDetailBody').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></div>
                        <div class="empty-state-text">Select a route</div>
                    </div>`;
        document.getElementById('detailActions').innerHTML = '';
        await loadRoutes();
    } catch { showToast('Delete failed', 'error'); }
}

async function loadAdminProfile() {
    try {
        const res = await API.get('/admin/profile');
        if (res.ok) {
            const d = await res.json();
            document.getElementById('adminName').textContent = d.name || 'Admin';
        }
    } catch { }
}


async function loadMRFLocations() {
    try {
        const res = await API.get('/admin/mrf-locations');
        if (!res.ok) throw new Error();
        globalMRFLocations = await res.json();
        console.log('Loaded MRF locations:', globalMRFLocations.length);
    } catch (err) {
        console.error('Failed to load MRF locations:', err);
        globalMRFLocations = [];
    }
}

function renderFacilityReferenceLayer(map, layerKey, opts = {}) {
    if (!map) return;
    (facilityMarkerLayers[layerKey] || []).forEach(m => map.removeLayer(m));
    facilityMarkerLayers[layerKey] = [];

    globalMRFLocations.forEach(f => {
        const icon = getMRFIcon();
        const marker = L.marker([f.latitude, f.longitude], {
            icon: icon,
            zIndexOffset: 60,
            opacity: 0.9
        }).addTo(map);

        let popupHtml = `<strong style="color:#14b8a6;">🏭 ${escHtml(f.name)}</strong>`;
        if (f.address) popupHtml +=
            `<br><span style="color:var(--text2);font-size:.72rem;">${escHtml(f.address)}</span>`;
        popupHtml +=
            `<br><span class="text-mono" style="font-size:.65rem;color:var(--text3);">${Number(f.latitude).toFixed(5)}, ${Number(f.longitude).toFixed(5)}</span>`;
        if (opts.allowUse) {
            popupHtml += `<br><button onclick="addMRFMarker(${f.latitude},${f.longitude}); markingMap.closePopup();"
                        style="margin-top:6px;width:100%;padding:6px;border-radius:6px;border:1px solid #14b8a6;background:rgba(20,184,166,.14);color:#14b8a6;font-weight:700;font-size:.65rem;cursor:pointer;">
                        Use as MRF Stop Here
                    </button>`;
        }
        marker.bindPopup(popupHtml, { maxWidth: 240 });
        facilityMarkerLayers[layerKey].push(marker);
    });
}

function initMRFPickMap() {
    if (mrfPickMap) {
        mrfPickMap.remove();
        mrfPickMap = null;
    }
    isMRFPickSatellite = false;
    facilityMarkerLayers.pick = [];
    mrfUserLocationMarker = null;

    mrfPickMap = L.map('mrfPickMap', { zoomControl: true }).setView([8.2317, 123.4018], 14);
    mrfPickTiles = makeTiles();
    applyTile(mrfPickMap, mrfPickTiles, false);
    mrfPickMap.invalidateSize();

    renderFacilityReferenceLayer(mrfPickMap, 'pick');

    mrfPickMap.on('click', e => {
        placeMRFPendingPin(e.latlng);
    });

    L.control.zoom({ position: 'bottomright' }).addTo(mrfPickMap);
}

function placeMRFPendingPin(latlng) {
    mrfPendingLatLng = latlng;

    if (mrfPendingMarker) {
        mrfPickMap.removeLayer(mrfPendingMarker);
    }

    const icon = L.divIcon({
        className: "",
        html: `<div class="mrf-pending-pin"></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    mrfPendingMarker = L.marker([latlng.lat, latlng.lng], {
        icon: icon,
        draggable: true,
        zIndexOffset: 500
    }).addTo(mrfPickMap);

    mrfPendingMarker.on('dragend', () => {
        mrfPendingLatLng = mrfPendingMarker.getLatLng();
        updateMRFPickHint();
    });

    updateMRFPickHint();
}

function updateMRFPickHint() {
    const hint = document.getElementById('mrfPickHint');
    if (!hint) return;
    if (mrfPendingLatLng) {
        hint.innerHTML =
            `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Pin at <span class="text-mono" style="color:var(--gold);">${mrfPendingLatLng.lat.toFixed(5)}, ${mrfPendingLatLng.lng.toFixed(5)}</span> — drag to fine-tune, then Save`;
        hint.style.borderColor = 'var(--gold)';
        hint.style.background = 'rgba(201,146,30,0.06)';
    } else {
        hint.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> No pin placed yet. Tap "My Location" or click the map.`;
        hint.style.borderColor = 'var(--border2)';
        hint.style.background = 'var(--bg3)';
    }
}

function clearMRFPick() {
    if (mrfPendingMarker && mrfPickMap) {
        mrfPickMap.removeLayer(mrfPendingMarker);
        mrfPendingMarker = null;
    }
    mrfPendingLatLng = null;
    updateMRFPickHint();
}

function toggleMRFPickSatellite() {
    if (!mrfPickMap || !mrfPickTiles) return;
    isMRFPickSatellite = !isMRFPickSatellite;
    applyTile(mrfPickMap, mrfPickTiles, isMRFPickSatellite);
    const btn = document.getElementById('mrfPickSatBtn');
    btn.innerHTML = isMRFPickSatellite ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Map` : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg> Satellite`;
    btn.classList.toggle('active', isMRFPickSatellite);
}

function mrfGotoMyLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'error');
        return;
    }

    const btn = document.getElementById('mrfMyLocationBtn');
    if (btn) {
        btn.textContent = 'Getting…';
        btn.disabled = true;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;

            if (mrfPickMap) {
                mrfPickMap.setView([latitude, longitude], 16, { animate: true });
            }

            if (mrfPickMap) {
                if (mrfUserLocationMarker) {
                    mrfPickMap.removeLayer(mrfUserLocationMarker);
                }
                const userIcon = L.divIcon({
                    className: "",
                    html: `<div class="user-marker-pulse"></div>`,
                    iconSize: [14, 14],
                    iconAnchor: [7, 7]
                });
                mrfUserLocationMarker = L.marker([latitude, longitude], {
                    icon: userIcon,
                    zIndexOffset: 600
                }).addTo(mrfPickMap);

                if (mrfPendingCircle) {
                    mrfPickMap.removeLayer(mrfPendingCircle);
                }
                mrfPendingCircle = L.circle([latitude, longitude], {
                    radius: accuracy || 30,
                    color: '#3b82f6',
                    weight: 1,
                    fillColor: '#3b82f6',
                    fillOpacity: 0.06
                }).addTo(mrfPickMap);
            }

            placeMRFPendingPin({ lat: latitude, lng: longitude });

            showToast(`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Location captured ±${Math.round(accuracy || 30)}m`, 'success');

            if (btn) {
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> My Location`;
                btn.disabled = false;
                btn.classList.add('active');
            }
        },
        err => {
            console.warn('Geolocation error:', err);
            showToast('Could not get location. Click the map manually.', 'error');
            if (btn) {
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> My Location`;
                btn.disabled = false;
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
}

async function saveMRFLocation() {
    const name = document.getElementById('mrfName').value.trim();
    const address = document.getElementById('mrfAddress').value.trim();

    if (!name) {
        showToast('Facility name is required', 'error');
        document.getElementById('mrfName').focus();
        return;
    }

    if (!mrfPendingLatLng) {
        showToast('Click the map or use "My Location" to place a pin first', 'error');
        return;
    }

    const btn = document.querySelector('#mrfManageModal .btn-gold');
    if (btn) {
        btn.textContent = 'Saving…';
        btn.disabled = true;
    }

    try {
        const res = await API.post('/admin/mrf-locations', {
            name: name,
            address: address || null,
            latitude: mrfPendingLatLng.lat,
            longitude: mrfPendingLatLng.lng
        });

        if (!res.ok) throw new Error();

        showToast(`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Facility "${name}" saved!`, 'success');

        document.getElementById('mrfName').value = '';
        document.getElementById('mrfAddress').value = '';
        clearMRFPick();

        if (mrfUserLocationMarker && mrfPickMap) {
            mrfPickMap.removeLayer(mrfUserLocationMarker);
            mrfUserLocationMarker = null;
        }
        if (mrfPendingCircle && mrfPickMap) {
            mrfPickMap.removeLayer(mrfPendingCircle);
            mrfPendingCircle = null;
        }

        await loadMRFLocations();
        renderMRFList();
        if (mrfPickMap) renderFacilityReferenceLayer(mrfPickMap, 'pick');
        if (markingMap) renderFacilityReferenceLayer(markingMap, 'marking', { allowUse: true });
        if (detailMap) renderFacilityReferenceLayer(detailMap, 'detail');

        if (btn) {
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Facility Location`;
            btn.disabled = false;
        }

        document.getElementById('mrfName').focus();

    } catch (err) {
        console.error('Save MRF error:', err);
        showToast('Failed to save facility', 'error');
        if (btn) {
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save Facility Location`;
            btn.disabled = false;
        }
    }
}

function renderMRFList() {
    const el = document.getElementById('mrfList');
    const countEl = document.getElementById('mrfCount');
    if (countEl) countEl.textContent = globalMRFLocations.length;
    if (!el) return;

    if (!globalMRFLocations.length) {
        el.innerHTML = `<div style="color:var(--text3);font-size:.75rem;padding:16px 0;text-align:center;">
                    🏭 No facilities marked yet.<br>
                    <span style="font-size:.65rem;">Go to an MRF location, tap "My Location", add a name, and save.</span>
                </div>`;
        return;
    }

    el.innerHTML = globalMRFLocations.map(f => `
                <div class="mrf-list-item">
                    <div style="flex:1;min-width:0;">
                        <div class="mrf-name">🏭 ${escHtml(f.name)}</div>
                        ${f.address ? `<div class="mrf-addr"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${escHtml(f.address)}</div>` : ''}
                        <div class="mrf-coords">${Number(f.latitude).toFixed(5)}, ${Number(f.longitude).toFixed(5)}</div>
                        <div class="mrf-created"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${fmtDate(f.created_at)}</div>
                    </div>
                    <button class="mrf-del-btn" onclick="deleteMRFLocation(${f.id}, this)" title="Delete facility"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                </div>
            `).join('');
}

function deleteMRFLocation(id, btn) {
    if (btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        btn.classList.add('confirming');
        btn.title = 'Click again to confirm delete';
        clearTimeout(btn._resetTimer);
        btn._resetTimer = setTimeout(() => {
            if (btn.dataset.confirm === '1') {
                btn.dataset.confirm = '0';
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
                btn.classList.remove('confirming');
            }
        }, 3000);
        return;
    }

    clearTimeout(btn._resetTimer);
    (async () => {
        try {
            const res = await API.del(`/admin/mrf-locations/${id}`);
            if (!res.ok) throw new Error();
            showToast('Facility deleted', 'success');
            await loadMRFLocations();
            renderMRFList();
            if (mrfPickMap) renderFacilityReferenceLayer(mrfPickMap, 'pick');
            if (markingMap) renderFacilityReferenceLayer(markingMap, 'marking', { allowUse: true });
            if (detailMap) renderFacilityReferenceLayer(detailMap, 'detail');
        } catch (err) {
            showToast('Failed to delete facility', 'error');
        }
    })();
}
function clearMRFStopsOnly() {
    mrfPoints = [];
    mrfMarkers.forEach(m => markingMap?.removeLayer(m));
    mrfMarkers = [];
    mrfMarkerById.clear();
    updateUI();
}
window.clearMRFStopsOnly = clearMRFStopsOnly;

function openMRFModal() {
    openModal('mrfManageModal');
    document.getElementById('mrfName').value = '';
    document.getElementById('mrfAddress').value = '';

    scheduleMapInit(() => {
        initMRFPickMap();
        renderMRFList();
        updateMRFPickHint();
        mrfGotoMyLocation();
    });
}

Object.assign(window, {
    openAddModal, openEditModal, selectRoute, filterRoutes, openDeleteModal,
    confirmDeleteRoute, closeModal, saveRoute, setActiveLayer, undoLast,
    clearActiveLayer, clearAll, gotoMyLocation, toggleMarkingMapSatellite,
    toggleDetailMapSatellite, markMRFManual, openModal,
    openMRFModal, saveMRFLocation, clearMRFPick, toggleMRFPickSatellite,
    mrfGotoMyLocation, deleteMRFLocation, addMRFMarker
});

loadAdminProfile();
loadMRFLocations().then(loadRoutes);