

const token = localStorage.getItem("token");
if (!token) window.location.href = "/login.html";

const SERVER_URL = window.location.origin;
const WS_URL = SERVER_URL.replace('http', 'ws');
const BASE = "/driver/api";

const hdrs = () => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
});

async function api(method, path, body) {
    const opts = { method, headers: hdrs() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    if (res.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/login.html";
    }
    if (!res.ok) {
        let errBody = {};
        try { errBody = await res.json(); } catch (_) { }
        console.error(`[API ${res.status}] ${method} ${BASE + path}`, errBody);
        throw new Error(errBody.error || `Request failed (${res.status})`);
    }
    return res.json();
}

async function apiRaw(url, options = {}) {
    const opts = { ...options, headers: { ...hdrs(), ...(options.headers || {}) } };
    const res = await fetch(url, opts);
    if (!res.ok) {
        let bodyText = '';
        try { bodyText = await res.text(); } catch (_) { }
        console.error(`[API ${res.status}] ${url}`, bodyText);
        throw new Error(`${res.status} ${res.statusText} on ${url}`);
    }
    return res.json();
}

function toast(msg, type = "info") {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = "", 3200);
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}
window.toggleTheme = toggleTheme;

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggleBtn');
    const icon = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (!btn) return;
    if (theme === 'dark') {
        icon.textContent = '☀️';
        label.textContent = 'Light Mode';
        btn.classList.add('dark');
    } else {
        icon.textContent = '🌙';
        label.textContent = 'Dark Mode';
        btn.classList.remove('dark');
    }
}

window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
        const theme = e.newValue || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeIcon(theme);
    }
});

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}
window.openModal = openModal;
window.closeModal = closeModal;

function doLogout() {
    closeModal('logoutConfirmModal');
    stopGPS();
    if (socket && socket.connected) socket.disconnect();
    localStorage.removeItem("token");
    toast("Signed out", "success");
    setTimeout(() => { window.location.href = "/login.html"; }, 400);
}
window.doLogout = doLogout;

const fmtDate = d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtShort = d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtTime = d => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

document.getElementById("topbarDate").textContent =
    new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function getDriverId() {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.id;
    } catch (e) {
        console.error('Failed to parse token:', e);
        return null;
    }
}
const driverId = getDriverId();


function saveProgressState() {
    const assignmentId = currentAssignmentId || document.querySelector('.today-card')?.dataset?.assignmentId;
    if (!assignmentId) return;

    if (routeStatus === 'completed' || routeStatus === 'cancelled') {
        localStorage.removeItem(`driver_progress_${assignmentId}`);
        return;
    }

    const state = {
        assignmentId: assignmentId,
        progressIndex: progressIndex,
        mrfPassed: Array.from(reachedMrfKeys),
        stopDone: Array.from(reachedStopKeys),
        truckLat: lastPos?.lat || null,
        truckLng: lastPos?.lng || null,
        lastUpdated: Date.now()
    };
    try {
        localStorage.setItem(`driver_progress_${assignmentId}`, JSON.stringify(state));
    } catch (e) { }
}

function loadProgressState(assignmentId) {
    if (!assignmentId) return null;

    if (routeStatus === 'completed' || routeStatus === 'cancelled') {
        localStorage.removeItem(`driver_progress_${assignmentId}`);
        return null;
    }

    try {
        const raw = localStorage.getItem(`driver_progress_${assignmentId}`);
        if (!raw) return null;
        const state = JSON.parse(raw);

        if (state.assignmentId !== assignmentId) {
            localStorage.removeItem(`driver_progress_${assignmentId}`);
            return null;
        }

        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        if (Date.now() - state.lastUpdated > ONE_DAY_MS) {
            localStorage.removeItem(`driver_progress_${assignmentId}`);
            return null;
        }

        return state;
    } catch (e) {
        console.warn('Failed to load progress state:', e);
        return null;
    }
}

function restoreProgressState(assignmentId) {
    const state = loadProgressState(assignmentId);
    if (!state) return false;

    if (state.stopDone) {
        state.stopDone.forEach(key => reachedStopKeys.add(key));
    }

    if (state.mrfPassed) {
        state.mrfPassed.forEach(key => reachedMrfKeys.add(key));
    }

    if (state.progressIndex > 0 && progressPolyline && trailPolyline && drawnCoords.length) {
        progressIndex = Math.min(state.progressIndex, drawnCoords.length - 1);
        trailPolyline.setLatLngs(drawnCoords.slice(0, progressIndex + 1));
        progressPolyline.setLatLngs(drawnCoords.slice(progressIndex));
        markMRFPassed(progressIndex);
    }

    if (state.truckLat && state.truckLng && dMarker) {
        dMarker.setLatLng([state.truckLat, state.truckLng]);
        lastPos = { lat: state.truckLat, lng: state.truckLng };
        updateRouteProgress(state.truckLat, state.truckLng);
    }

    mrfStops.forEach((m, i) => {
        if (reachedMrfKeys.has(m._key)) {
            const wrap = document.getElementById(`mrfWrap${i}`);
            const pin = document.getElementById(`mrfPin${i}`);
            if (wrap) wrap.classList.add('passed');
            if (pin) { pin.classList.add('passed'); pin.innerHTML = '<span style="font-size:16px">✓</span>'; }
        }
    });

    pinStops.forEach((p, i) => {
        if (reachedStopKeys.has(p._key)) {
            const wpNum = document.getElementById(`wpNum${i}`);
            const wpItem = document.getElementById(`wpItem${i}`);
            const mapPin = document.getElementById(`mapPin${i}`);
            if (wpNum) { wpNum.classList.add('done'); wpNum.textContent = '✓'; }
            if (wpItem) wpItem.classList.add('reached');
            if (mapPin) { mapPin.classList.add('done'); mapPin.textContent = '✓'; }
        }
    });

    mrfStops.forEach((m, i) => {
        if (reachedMrfKeys.has(m._key)) {
            const wpNum = document.getElementById(`mrfWpNum${i}`);
            if (wpNum) wpNum.classList.add('passed');
        }
    });

    return true;
}

let socket = null;
let socketConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

let currentAssignmentId = null;
let routeStatus = null;

function connectWebSocket() {
    if (socket && socket.connected) return;

    console.log('🔌 Connecting WebSocket...');
    socket = io(WS_URL, {
        transports: ['websocket', 'polling'],
        auth: { token: token },
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000
    });

    socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        socketConnected = true;
        reconnectAttempts = 0;
        updateConnectionStatus(true);
        toast('Real-time connection established', 'success');
        socket.emit('driver-auth', { driverId, token });
    });

    socket.on('connect_error', (error) => {
        console.error('❌ WebSocket connection error:', error);
        socketConnected = false;
        updateConnectionStatus(false);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => {
                if (!socketConnected) connectWebSocket();
            }, 2000 * reconnectAttempts);
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('🔌 WebSocket disconnected:', reason);
        socketConnected = false;
        updateConnectionStatus(false);
        if (reason === 'io server disconnect') {
            setTimeout(connectWebSocket, 3000);
        }
    });

    socket.on('auth-success', (data) => {
        console.log('✅ Authenticated:', data.message);
        toast(`Welcome ${data.driver.name}!`, 'success');
    });

    socket.on('auth-error', (data) => {
        console.error('❌ Auth error:', data.message);
        toast('Authentication failed: ' + data.message, 'error');
    });

    socket.on('assignment-update', (assignment) => {
        console.log('📋 Assignment update received:', assignment);
        currentAssignmentId = assignment?.id || null;
        routeStatus = assignment?.status || null;
        renderAssignment(assignment);
        if (assignment && assignment.route_id) {
            loadRouteWaypoints(assignment.route_id);
        }
    });

    socket.on('route-waypoints', (data) => {
        console.log('🗺️ Route waypoints received:', data);
        if (data.waypoints) {
            const parsed = parseWaypointsJson(data.waypoints);
            if (parsed.road.length || parsed.pins.length || parsed.mrfs.length) {
                showRouteFromData(parsed);
            }
        }
    });

    socket.on('stats-update', (stats) => {
        console.log('📊 Stats update:', stats);
        if (stats) {
            document.getElementById('statCompleted').textContent = stats.completed || 0;
            document.getElementById('statTotal').textContent = stats.total || 0;
            document.getElementById('statPending').textContent = stats.pending || 0;
        }
    });

    socket.on('assignment-status-changed', (data) => {
        console.log('🔄 Status changed:', data);
        routeStatus = data.status;
        toast(`Route status: ${data.status}`, 'info');
        loadToday();

        if (data.status === 'completed' || data.status === 'cancelled') {
            if (currentAssignmentId) {
                localStorage.removeItem(`driver_progress_${currentAssignmentId}`);
            }
        }
    });

    socket.on('new-announcement', (data) => {
        console.log('📢 New announcement:', data);
        toast(`📢 ${data.title || 'New announcement'}`, 'info');
        loadAnnouncements();
        const badge = document.getElementById('annBadge');
        if (badge) {
            const current = parseInt(badge.textContent) || 0;
            badge.textContent = current + 1;
            badge.style.display = 'flex';
        }
    });

    socket.on('report-submitted', (data) => {
        console.log('✅ Report submitted:', data);
        toast('Report submitted successfully!', 'success');
    });

    socket.on('profile-updated', (data) => {
        console.log('✅ Profile updated:', data);
        toast('Profile saved successfully!', 'success');
        loadProfile();
    });

    socket.on('status-updated', (data) => {
        console.log('✅ Status updated:', data);
        toast(data.message, 'success');
        loadToday();
        loadStats();
    });

    socket.on('error', (data) => {
        console.error('❌ Socket error:', data);
        toast(data.message || 'An error occurred', 'error');
    });

    socket.on('driver-moved', (data) => {
        if (data.driverId !== driverId) {
        }
    });

    socket.on('driver-disconnected', (data) => {
        console.log('👋 Driver disconnected:', data.driverId);
    });

    socket.on('report-status-changed', (data) => {
        if (!data || !data.reportId) return;
        if (data.status && data.status !== 'pending' && data.status !== 'in_progress') {
            allIssues = allIssues.filter(r => r.id !== data.reportId);
            renderIssueMarkers();
            renderIssuesListPanel();
            updateIssuesBadge();
        }
    });
}

function updateConnectionStatus(connected) {
    const el = document.getElementById('connStatus');
    const label = document.getElementById('connLabel');
    if (connected) {
        el.className = 'connection-status online';
        label.textContent = 'Connected';
    } else {
        el.className = 'connection-status offline';
        label.textContent = 'Reconnecting...';
    }
}

function emitLocation(lat, lng, accuracy) {
    if (socket && socketConnected) {
        socket.emit('driver-location', { latitude: lat, longitude: lng, accuracy: accuracy || 0, timestamp: Date.now() });
    } else {
        console.warn('WebSocket not connected, using REST fallback');
        api('POST', '/location', { latitude: lat, longitude: lng, accuracy: accuracy || 0 })
            .catch(err => console.warn('REST location fallback failed:', err));
    }
}

function emitStatusUpdate(assignmentId, status) {
    if (socket && socketConnected) {
        socket.emit('update-status', { assignmentId, status });
    } else {
        api('PATCH', `/assignment/${assignmentId}/status`, { status })
            .then(() => { toast(`Route ${status}`, 'success'); loadToday(); loadStats(); })
            .catch(err => toast(err.message, 'error'));
    }
}

function emitReport(type, description, location_note) {
    if (socket && socketConnected) {
        socket.emit('submit-report', { type, description, location_note });
    } else {
        api('POST', '/reports', { type, description, location_note })
            .then(() => toast('Report submitted', 'success'))
            .catch(err => toast(err.message, 'error'));
    }
}

function emitProfileUpdate(name, phone, address) {
    if (socket && socketConnected) {
        socket.emit('update-profile', { name, phone, address });
    } else {
        api('PUT', '/profile', { name, phone, address })
            .then(() => toast('Profile saved', 'success'))
            .catch(err => toast(err.message, 'error'));
    }
}

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sbOverlay").classList.toggle("visible");
}
function closeSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sbOverlay").classList.remove("visible");
}

let loadFlags = { schedule: false, report: false, announcements: false, trips: false, profile: false };
const tabTitles = {
    today: "Today's Route", schedule: "My Schedule", report: "File Report",
    issues: "Nearby Issues", announcements: "Notices", trips: "Trip History", profile: "My Profile"
};

function switchTab(id, btn) {
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.getElementById("tab-" + id).classList.add("active");
    btn.classList.add("active");
    document.getElementById("topbarTitle").textContent = tabTitles[id] || id;
    if (window.innerWidth <= 968) closeSidebar();

    switch (id) {
        case 'schedule': if (!loadFlags.schedule) loadSchedule(); break;
        case 'report': if (!loadFlags.report) loadMyReports(); break;
        case 'issues': renderIssuesListPanel(); break;
        case 'announcements': if (!loadFlags.announcements) loadAnnouncements(); break;
        case 'trips': if (!loadFlags.trips) loadTrips(); break;
        case 'profile': if (!loadFlags.profile) loadProfile(); break;
    }
}

let dMap, dMarker, accCircle;
let mrfMarkers = [];
let fallbackMRF = null;
let residentMarkers = {};
let pinMarkers = [];
let roadPolyline = null;
let progressPolyline = null;
let trailPolyline = null;
let drawnCoords = [];
let progressIndex = 0;
let pinStops = [];
let mrfStops = [];
let reachedStopKeys = new Set();
let reachedMrfKeys = new Set();
let lastLoadedRouteId = null;
let locked = false, currentMapStyle = "light";
let lastPos = null;
let mapView = { lat: 8.2380, lng: 123.0, zoom: 14 };
let animationFrame = null;
let animating = false;
let animStart = null;
let animFrom = null;
let animTo = null;
let animDuration = 1000;

let issueMarkers = [];
let allIssues = [];
let issuesVisible = true;

const ISSUE_COLORS = { missed_pickup: '#ffc13c', overflowing_bin: '#4ade80', illegal_dumping: '#f87171', road_blocked: '#f87171', equipment_fault: '#a78bfa', other: '#a78bfa' };
const ISSUE_LABELS = { missed_pickup: 'Missed Pickup', overflowing_bin: 'Overflowing Bin', illegal_dumping: 'Illegal Dumping', road_blocked: 'Road Blocked', equipment_fault: 'Equipment Fault', other: 'Other Issue' };
const ISSUE_ICON = { missed_pickup: '🗑️', overflowing_bin: '♻️', illegal_dumping: '🚯', road_blocked: '🚧', equipment_fault: '🔧', other: '⚠️' };

const MRF_FALLBACK = { name: "Jose Dalman MRF", latitude: 8.2317, longitude: 123.4018 };

function initMap(lat = 8.2380, lng = 123.0, zoom = 14) {
    if (dMap) { dMap.setView([lat, lng], zoom); return; }
    mapView = { lat, lng, zoom };
    dMap = L.map("driverMap", { zoomControl: true }).setView([lat, lng], zoom);
    addTileLayer("light");
    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(dMap);
    dMap.on("moveend zoomend", () => {
        if (!locked) {
            const c = dMap.getCenter();
            mapView = { lat: c.lat, lng: c.lng, zoom: dMap.getZoom() };
        }
    });
    loadFallbackMRF();
    loadResidents();
    setInterval(loadResidents, 30000);
    renderIssueMarkers();
    loadOpenReports();
    setInterval(loadOpenReports, 30000);
}

function addTileLayer(style) {
    if (!dMap) return;
    dMap.eachLayer(l => { if (l._url) dMap.removeLayer(l); });
    if (style === "satellite") {
        L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: "Esri",
            maxZoom: 19
        }).addTo(dMap);
    } else {
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            attribution: "© OSM © CARTO",
            subdomains: "abcd",
            maxZoom: 20
        }).addTo(dMap);
    }
}

function toggleSat() {
    currentMapStyle = currentMapStyle === "light" ? "satellite" : "light";
    addTileLayer(currentMapStyle);
    document.getElementById("satBtn").classList.toggle("active", currentMapStyle === "satellite");
    toast(currentMapStyle === "satellite" ? "Satellite view" : "Dark map", "info");
}

function toggleLock() {
    locked = !locked;
    const btn = document.getElementById("lockBtn");
    btn.classList.toggle("active", locked);
    btn.textContent = locked ? "🔓 Unlock" : "🔒 Lock";
    toast(locked ? "View locked" : "View unlocked", "info");
}

function toggleRoutePanel() {
    document.getElementById("routePanel").classList.toggle("show");
}

function centerMe() {
    if (!lastPos) { toast("Waiting for GPS…", "info"); return; }
    dMap.setView([lastPos.lat, lastPos.lng], 17);
    toast("Centered on your location", "success");
}

function fitAllStops() {
    if (!dMap) return;
    const pts = [...pinStops.map(p => [p.lat, p.lng]), ...drawnCoords.map(c => [c.lat, c.lng])];
    if (pts.length) dMap.fitBounds(L.latLngBounds(pts).pad(0.15));
}

function goToMRF() {
    if (!dMap) return;
    const m = mrfMarkers[0] || fallbackMRF;
    if (m) { dMap.setView(m.getLatLng(), 17); m.openPopup(); }
}

function optimizeRoute() { toast("Route optimization coming soon", "info"); }
function useCurrentLoc() {
    if (!lastPos) { toast("GPS not active", "info"); return; }
    document.getElementById("repLocation").value = `${lastPos.lat.toFixed(5)}, ${lastPos.lng.toFixed(5)}`;
    toast("Location added", "success");
}

// ── MRF ──
async function loadFallbackMRF() {
    let mrf = MRF_FALLBACK;
    try {
        const data = await apiRaw("/api/resident/mrf-location");
        if (data && data.latitude && data.longitude) mrf = data;
    } catch (e) {
        console.warn("MRF lookup failed, using fallback coordinates:", e);
    }

    const icon = L.divIcon({
        className: "",
        html: `<div class="mrf-wrap"><div class="mrf-pulse-ring"></div><div class="mrf-pin"><span style="font-size:18px">🏭</span></div></div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21]
    });
    fallbackMRF = L.marker([mrf.latitude, mrf.longitude], { icon, zIndexOffset: 500, opacity: 0.5 })
        .addTo(dMap)
        .bindPopup(`<strong style="color:#2dd4a0">🏭 ${mrf.name}</strong><br><span style="color:#7a8499">Fallback MRF location</span>`);
}

function parseWaypointsJson(raw) {
    if (!raw) return { road: [], pins: [], mrfs: [] };
    try {
        let data = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(data)) {
            return {
                road: [],
                pins: data.map((wp, i) => ({
                    lat: parseFloat(wp.lat),
                    lng: parseFloat(wp.lng),
                    name: wp.name || `Stop ${i + 1}`,
                    num: wp.stopNumber || (i + 1)
                })),
                mrfs: []
            };
        }
        const road = (data.road_path || data.road || []).map(v => ({
            lat: parseFloat(v.lat),
            lng: parseFloat(v.lng)
        }));
        const pins = (data.pin_stops || data.pins || []).map((p, i) => ({
            lat: parseFloat(p.lat),
            lng: parseFloat(p.lng),
            name: p.name || `Stop ${i + 1}`,
            num: p.stopNumber || (i + 1)
        }));
        const mrfs = (data.mrf_stops || data.mrf || []).map((m, i) => ({
            lat: parseFloat(m.lat),
            lng: parseFloat(m.lng),
            name: m.name || "MRF Stop",
            _key: `mrf_${i}_${m.name || 'MRF'}`
        }));
        return { road, pins, mrfs };
    } catch (e) {
        console.error("parseWaypointsJson error:", e);
        return { road: [], pins: [], mrfs: [] };
    }
}

function nearestRoadIndex(lat, lng) {
    if (!drawnCoords.length) return -1;
    const pt = L.latLng(lat, lng);
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < drawnCoords.length; i++) {
        const d = pt.distanceTo(drawnCoords[i]);
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
}

function markStopsReachedUpTo(pt, idxLimit) {
    pinStops.forEach((p, i) => {
        const key = p._key;
        const alreadyDone = reachedStopKeys.has(key);
        const withinRouteOrder = p._routeIdx == null || drawnCoords.length === 0 || p._routeIdx <= idxLimit + 2;
        const nearEnough = pt && pt.distanceTo(L.latLng(p.lat, p.lng)) < 80;

        if (!alreadyDone && !(withinRouteOrder && nearEnough)) return;

        if (!alreadyDone) {
            reachedStopKeys.add(key);
            if (nearEnough) toast(`Stop ${p.num} reached! ✓`, "success");
            saveProgressState();
        }

        const el = document.getElementById(`wpNum${i}`);
        const row = document.getElementById(`wpItem${i}`);
        const pin = document.getElementById(`mapPin${i}`);
        if (el) { el.classList.add("done"); el.textContent = "✓"; }
        if (pin) { pin.classList.add("done"); pin.textContent = "✓"; }
        if (row) row.classList.add("reached");
    });
}

function markMRFPassed(idxLimit) {
    mrfStops.forEach((m, i) => {
        const key = m._key;
        if (reachedMrfKeys.has(key)) return;
        if (m._routeIdx == null || drawnCoords.length === 0) return;
        if (m._routeIdx > idxLimit + 2) return;

        reachedMrfKeys.add(key);
        toast(`Passed MRF: ${m.name} ✓`, "success");
        saveProgressState();

        const wrap = document.getElementById(`mrfWrap${i}`);
        const pin = document.getElementById(`mrfPin${i}`);
        const wpNum = document.getElementById(`mrfWpNum${i}`);
        if (wrap) wrap.classList.add("passed");
        if (pin) { pin.classList.add("passed"); pin.innerHTML = '<span style="font-size:16px">✓</span>'; }
        if (wpNum) wpNum.classList.add("passed");
        const marker = mrfMarkers[i];
        if (marker) marker.setPopupContent(`<strong style="color:#94a3b8">🏭 ${m.name}</strong><br><span style="color:#2dd4a0">✓ Already passed</span>`);
    });
}

function resyncRouteProgress(lat, lng) {
    if (!drawnCoords.length || !progressPolyline || !trailPolyline) return;
    const pt = L.latLng(lat, lng);
    let nearest = 0, minDist = Infinity;
    for (let i = 0; i < drawnCoords.length; i++) {
        const d = pt.distanceTo(drawnCoords[i]);
        if (d < minDist) { minDist = d; nearest = i; }
    }
    progressIndex = nearest;
    trailPolyline.setLatLngs(drawnCoords.slice(0, progressIndex + 1));
    progressPolyline.setLatLngs(drawnCoords.slice(progressIndex));
    markStopsReachedUpTo(pt, progressIndex);
    markMRFPassed(progressIndex);
}

function showRouteFromData(routeData) {
    if (!dMap) return;

    pinMarkers.forEach(m => dMap.removeLayer(m)); pinMarkers = [];
    mrfMarkers.forEach(m => dMap.removeLayer(m)); mrfMarkers = [];
    if (roadPolyline) { dMap.removeLayer(roadPolyline); roadPolyline = null; }
    if (progressPolyline) { dMap.removeLayer(progressPolyline); progressPolyline = null; }
    if (trailPolyline) { dMap.removeLayer(trailPolyline); trailPolyline = null; }
    drawnCoords = []; progressIndex = 0; pinStops = []; mrfStops = [];

    const { road, pins, mrfs } = routeData;

    if (road.length >= 2) {
        drawnCoords = road.map(v => L.latLng(v.lat, v.lng));
        progressPolyline = L.polyline(drawnCoords, {
            color: "#f5a623",
            weight: 5,
            opacity: .9,
            dashArray: "10 6"
        }).addTo(dMap);
        trailPolyline = L.polyline([], {
            color: "#3d4558",
            weight: 4,
            opacity: .55
        }).addTo(dMap);

        let totalM = 0;
        for (let i = 1; i < drawnCoords.length; i++)
            totalM += drawnCoords[i - 1].distanceTo(drawnCoords[i]);
        document.getElementById("routeDist").textContent = totalM > 1000 ? (totalM / 1000).toFixed(2) + " km" : Math.round(totalM) + " m";
        document.getElementById("statDist").textContent = totalM > 1000 ? (totalM / 1000).toFixed(1) : "<1";
        document.getElementById("routeWpCount").textContent = road.length;
    } else {
        document.getElementById("routeDist").textContent = "—";
        document.getElementById("routeWpCount").textContent = "0";
    }

    pinStops = pins.map(p => ({
        ...p,
        _key: `stop_${p.num}`,
        _routeIdx: drawnCoords.length ? nearestRoadIndex(p.lat, p.lng) : null
    }));

    pinStops.forEach((p, i) => {
        const isDone = reachedStopKeys.has(p._key);
        const icon = L.divIcon({
            className: "",
            html: `<div class="stop-pin ${isDone ? 'done' : ''}" id="mapPin${i}">${isDone ? '✓' : p.num}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        const m = L.marker([p.lat, p.lng], { icon, zIndexOffset: 300 })
            .addTo(dMap)
            .bindPopup(`<strong>Stop ${p.num}</strong><br>${p.name}`);
        pinMarkers.push(m);
    });
    document.getElementById("routeStops").textContent = pinStops.length;

    mrfStops = mrfs.map((m, i) => ({
        ...m,
        _routeIdx: drawnCoords.length ? nearestRoadIndex(m.lat, m.lng) : null
    }));

    mrfStops.forEach((m, i) => {
        const isPassed = reachedMrfKeys.has(m._key);
        const icon = L.divIcon({
            className: "",
            html: `<div class="mrf-wrap ${isPassed ? 'passed' : ''}" id="mrfWrap${i}"><div class="mrf-pulse-ring"></div><div class="mrf-pin ${isPassed ? 'passed' : ''}" id="mrfPin${i}"><span style="font-size:${isPassed ? '16px' : '18px'}">${isPassed ? '✓' : '🏭'}</span></div></div>`,
            iconSize: [42, 42],
            iconAnchor: [21, 21]
        });
        const marker = L.marker([m.lat, m.lng], { icon, zIndexOffset: 600 })
            .addTo(dMap)
            .bindPopup(isPassed
                ? `<strong style="color:#94a3b8">🏭 ${m.name}</strong><br><span style="color:#2dd4a0">✓ Already passed</span>`
                : `<strong style="color:#2dd4a0">🏭 ${m.name}</strong><br><span style="color:#7a8499">MRF Collection Point</span>`);
        mrfMarkers.push(marker);
        if (fallbackMRF) fallbackMRF.setOpacity(0);
    });

    const items = [
        ...pinStops.map((p, i) => {
            const isDone = reachedStopKeys.has(p._key);
            return `
                    <div class="wp-item ${isDone ? 'reached' : ''}" id="wpItem${i}">
                        <div class="wp-num ${isDone ? 'done' : ''}" id="wpNum${i}">${isDone ? '✓' : p.num}</div>
                        <span class="wp-name">${p.name || `Stop ${p.num}`}</span>
                    </div>`;
        }),
        ...mrfStops.map((m, i) => {
            const isPassed = reachedMrfKeys.has(m._key);
            return `
                    <div class="wp-item ${isPassed ? 'reached' : ''}">
                        <div class="wp-num mrf-stop ${isPassed ? 'passed' : ''}" id="mrfWpNum${i}">${isPassed ? '✓' : '🏭'}</div>
                        <span class="wp-name" style="color:${isPassed ? 'var(--text3)' : 'var(--green)'}">${m.name}${isPassed ? ' · passed' : ''}</span>
                    </div>`;
        })
    ];
    document.getElementById("wpList").innerHTML = items.length ? items.join("") :
        `<div class="empty" style="padding:20px"><div class="empty-title">No stops defined</div></div>`;

    const allPts = [
        ...road.map(v => [v.lat, v.lng]),
        ...pinStops.map(p => [p.lat, p.lng]),
        ...mrfStops.map(m => [m.lat, m.lng])
    ];
    if (allPts.length) {
        dMap.fitBounds(L.latLngBounds(allPts).pad(0.15));
    }

    if (currentAssignmentId) {
        restoreProgressState(currentAssignmentId);
    }

    if (lastPos) {
        resyncRouteProgress(lastPos.lat, lastPos.lng);
    }
}

function animateMarker(from, to, duration = 1000) {
    if (animating) {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        from = { lat: dMarker.getLatLng().lat, lng: dMarker.getLatLng().lng };
    }

    animating = true;
    animStart = Date.now();
    animFrom = from;
    animTo = to;
    animDuration = duration;

    function step() {
        const elapsed = Date.now() - animStart;
        const progress = Math.min(elapsed / animDuration, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
        const lat = animFrom.lat + (animTo.lat - animFrom.lat) * ease;
        const lng = animFrom.lng + (animTo.lng - animFrom.lng) * ease;

        if (dMarker) {
            dMarker.setLatLng([lat, lng]);
        }

        if (progress < 1) {
            animationFrame = requestAnimationFrame(step);
        } else {
            animating = false;
            animationFrame = null;
            if (dMarker) {
                dMarker.setLatLng([animTo.lat, animTo.lng]);
            }
        }
    }
    step();
}

function setMarker(lat, lng, accuracy) {
    if (!dMap) initMap(lat, lng);

    if (accCircle) { dMap.removeLayer(accCircle); accCircle = null; }
    if (accuracy && accuracy < 150) {
        const color = accuracy < 20 ? "#2dd4a0" : accuracy < 60 ? "#f5a623" : "#ff5e5e";
        accCircle = L.circle([lat, lng], { radius: accuracy, color, weight: 1.5, fillOpacity: .07 }).addTo(dMap);
    }

    const icon = L.divIcon({
        className: "",
        html: `<div class="truck-marker"><span style="font-size:16px">🚛</span></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });

    if (dMarker) {
        const currentPos = dMarker.getLatLng();
        animateMarker(
            { lat: currentPos.lat, lng: currentPos.lng },
            { lat, lng },
            Math.min(1000, 500 + (accuracy || 0) / 2)
        );
        dMarker.setIcon(icon);
    } else {
        dMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
            .addTo(dMap)
            .bindPopup(`<strong>Your Truck</strong><br>${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }

    document.getElementById("coordsText").textContent = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
    document.getElementById("accText").textContent = accuracy ? `±${Math.round(accuracy)}m` : "";
    document.getElementById("locTime").textContent = new Date().toLocaleTimeString();
    if (!locked) {
        dMap.setView([lat, lng], mapView.zoom || 15);
    }
    lastPos = { lat, lng, accuracy };
    updateRouteProgress(lat, lng);
}

function updateRouteProgress(lat, lng) {
    if (!drawnCoords.length || !progressPolyline || !trailPolyline) return;
    const dPt = L.latLng(lat, lng);
    let nearest = progressIndex, minDist = Infinity;
    const start = Math.max(0, progressIndex - 5);
    for (let i = start; i < drawnCoords.length; i++) {
        const d = dPt.distanceTo(drawnCoords[i]);
        if (d < minDist) { minDist = d; nearest = i; }
        if (d > minDist + 200 && i > progressIndex + 10) break;
    }
    if (nearest > progressIndex) {
        progressIndex = nearest;
        trailPolyline.setLatLngs(drawnCoords.slice(0, progressIndex + 1));
        progressPolyline.setLatLngs(drawnCoords.slice(progressIndex));
        saveProgressState();
    }
    markStopsReachedUpTo(dPt, progressIndex);
    markMRFPassed(progressIndex);
}

async function loadResidents() {
    if (!dMap) return;
    try {
        const residents = await apiRaw("/api/resident/resident-locations");
        const seen = new Set();
        residents.forEach(r => {
            if (!r.latitude || !r.longitude) return;
            seen.add(r.id);
            const fresh = (Date.now() - new Date(r.location_updated_at || 0).getTime()) < 5 * 60 * 1000;
            const icon = L.divIcon({
                className: "",
                html: `<div class="resident-marker ${fresh ? 'fresh' : 'stale'}"><span style="font-size:13px">🏠</span></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            });
            if (residentMarkers[r.id]) {
                residentMarkers[r.id].setLatLng([r.latitude, r.longitude]).setIcon(icon);
            } else {
                residentMarkers[r.id] = L.marker([r.latitude, r.longitude], { icon })
                    .addTo(dMap)
                    .bindPopup(`<strong style="color:#5b9cf6">🏠 ${r.name || "Resident"}</strong><br><span style="color:${fresh ? '#2dd4a0' : '#7a8499'}">${fresh ? "Active now" : "Last seen >5m ago"}</span>`);
            }
        });
        Object.keys(residentMarkers).forEach(id => {
            if (!seen.has(Number(id))) {
                dMap.removeLayer(residentMarkers[id]);
                delete residentMarkers[id];
            }
        });
        const hud = document.getElementById("residentCountHUD");
        if (hud) hud.textContent = seen.size;
    } catch (e) { console.warn("loadResidents:", e); }
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371,
        dLat = (lat2 - lat1) * Math.PI / 180,
        dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateIssuesBadge() {
    const badge = document.getElementById('issuesBadge');
    if (!badge) return;
    if (allIssues.length) { badge.textContent = allIssues.length; badge.style.display = 'flex'; }
    else badge.style.display = 'none';
}

async function loadOpenReports() {
    try {
        const data = await api('GET', '/reports/open');
        allIssues = Array.isArray(data) ? data : [];
        renderIssueMarkers();
        renderIssuesListPanel();
        updateIssuesBadge();
    } catch (e) {
        console.warn('loadOpenReports failed:', e);
    }
}

function buildIssuePopup(r) {
    const color = ISSUE_COLORS[r.type] || '#a78bfa';
    const label = ISSUE_LABELS[r.type] || (r.type || '').replace(/_/g, ' ');
    const desc = r.description ? (r.description.length > 100 ? r.description.slice(0, 100) + '…' : r.description) : 'No description';
    const img = r.image_url
        ? `<img src="${r.image_url}" style="width:100%;max-height:110px;object-fit:cover;border-radius:8px;margin:6px 0" onerror="this.style.display='none'">`
        : '';
    return `<div style="min-width:210px">
                <strong style="color:${color};font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;">${ISSUE_ICON[r.type] || '⚠️'} ${label}</strong>
                ${img}
                <div style="font-size:.75rem;color:#c7d0da;margin:6px 0;line-height:1.5;">${desc}</div>
                <div style="font-size:.62rem;color:#7a8499;margin-bottom:8px;">${r.created_at ? fmtDate(r.created_at) : ''}</div>
                <button onclick="markIssueResolved(${r.id})"
                    style="width:100%;padding:7px;border-radius:8px;border:1px solid rgba(45,212,160,.4);background:rgba(45,212,160,.12);color:#2dd4a0;font-weight:700;font-size:.68rem;cursor:pointer;font-family:var(--mono);letter-spacing:.04em;">
                    ✓ MARK RESOLVED
                </button>
            </div>`;
}

function renderIssueMarkers() {
    if (!dMap) return;
    issueMarkers.forEach(m => dMap.removeLayer(m));
    issueMarkers = [];
    if (!issuesVisible) return;

    allIssues.forEach(r => {
        const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        const color = ISSUE_COLORS[r.type] || '#a78bfa';
        const icon = L.divIcon({
            className: "",
            html: `<div class="issue-marker" style="background:${color}"><span>${ISSUE_ICON[r.type] || '⚠️'}</span></div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        const marker = L.marker([lat, lng], { icon, zIndexOffset: 800, reportId: r.id })
            .addTo(dMap)
            .bindPopup(buildIssuePopup(r), { maxWidth: 260 });
        issueMarkers.push(marker);
    });
}

function toggleIssueMarkers() {
    issuesVisible = !issuesVisible;
    const btn = document.getElementById('issuesToggleBtn');
    if (btn) btn.classList.toggle('active', issuesVisible);
    renderIssueMarkers();
    toast(issuesVisible ? 'Showing reported issues' : 'Issues hidden', 'info');
}

function locateIssue(id) {
    const issue = allIssues.find(r => r.id === id);
    if (!issue) return;
    const todayBtn = document.querySelector('.nav-item[data-tab="today"]');
    if (todayBtn) switchTab('today', todayBtn);
    if (!issuesVisible) toggleIssueMarkers();
    setTimeout(() => {
        if (!dMap) return;
        const lat = parseFloat(issue.latitude), lng = parseFloat(issue.longitude);
        if (isNaN(lat) || isNaN(lng)) { toast('No location on this report', 'error'); return; }
        dMap.flyTo([lat, lng], 17, { duration: 0.8 });
        const marker = issueMarkers.find(m => m.options.reportId === id);
        if (marker) setTimeout(() => marker.openPopup(), 850);
    }, 150);
}

async function markIssueResolved(id) {
    try {
        await api('PATCH', `/reports/${id}/status`, { status: 'resolved' });
        toast('Issue marked as resolved ✓', 'success');
        allIssues = allIssues.filter(r => r.id !== id);
        renderIssueMarkers();
        renderIssuesListPanel();
        updateIssuesBadge();
        if (dMap) dMap.closePopup();
    } catch (e) {
        toast(e.message || 'Failed to update report', 'error');
    }
}

function renderIssuesListPanel() {
    const el = document.getElementById('issuesListPanel');
    if (!el) return;
    if (!allIssues.length) {
        el.innerHTML = `<div class="empty"><div class="empty-icon">🚨</div><div class="empty-title">No Open Issues</div><div class="empty-sub">All reported problems are resolved</div></div>`;
        return;
    }

    const withDist = allIssues.map(r => {
        let dist = null;
        const lat = parseFloat(r.latitude), lng = parseFloat(r.longitude);
        if (lastPos && !isNaN(lat) && !isNaN(lng)) {
            dist = haversineKm(lastPos.lat, lastPos.lng, lat, lng);
        }
        return { ...r, _dist: dist };
    }).sort((a, b) => {
        if (a._dist == null && b._dist == null) return new Date(b.created_at) - new Date(a.created_at);
        if (a._dist == null) return 1;
        if (b._dist == null) return -1;
        return a._dist - b._dist;
    });

    el.innerHTML = withDist.map(r => {
        const color = ISSUE_COLORS[r.type] || '#a78bfa';
        const label = ISSUE_LABELS[r.type] || (r.type || '').replace(/_/g, ' ');
        const distText = r._dist != null
            ? (r._dist < 1 ? `~${Math.round(r._dist * 1000)}m away` : `~${r._dist.toFixed(1)}km away`)
            : '';
        const isNew = r._isNew ? ' is-new' : '';
        return `<div class="report-card${isNew}" id="reportCard${r.id}">
                    <div class="report-icon" style="background:${color}22;color:${color}">${ISSUE_ICON[r.type] || '⚠️'}</div>
                    <div class="report-body">
                        <span class="badge" style="background:${color}22;border:1px solid ${color}66;color:${color}">${label.toUpperCase()}</span>
                        <div class="report-desc">${r.description || 'No description'}</div>
                        ${r.image_url ? `<img class="report-photo-thumb" src="${r.image_url}" onerror="this.style.display='none'">` : ''}
                        <div class="report-note">
                            ${r.latitude ? `📍 ${parseFloat(r.latitude).toFixed(5)}, ${parseFloat(r.longitude).toFixed(5)}` : 'No location'}
                            ${distText ? ` · ${distText}` : ''}
                            ${r.resident_name ? ` · reported by ${r.resident_name}` : ''}
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;align-items:stretch;">
                        <button class="btn btn-ghost" style="padding:8px 14px;font-size:.65rem" onclick="locateIssue(${r.id})">🧭 Go</button>
                        <button class="btn btn-success" style="padding:8px 14px;font-size:.65rem" onclick="markIssueResolved(${r.id})">✓ Done</button>
                    </div>
                    <div class="report-ts" style="width:100%;text-align:left;margin-top:-6px;">${r.created_at ? fmtDate(r.created_at) : ''}</div>
                 </div>`;
    }).join('');
}

// ── GPS ──
let gpsActive = false;
let gpsWatchId = null;
let gpsInterval = null;

function toggleGPS() {
    gpsActive ? stopGPS() : startGPS();
}

function startGPS() {
    if (!navigator.geolocation) {
        toast("GPS not supported", "error");
        return;
    }
    gpsActive = true;
    document.getElementById("gpsToggle").classList.add("on");
    document.getElementById("gpsLabel").textContent = "GPS ON";

    gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            let { latitude: lat, longitude: lng, accuracy } = pos.coords;
            if (accuracy > 60 && lastPos) {
                lat = lastPos.lat * 0.7 + lat * 0.3;
                lng = lastPos.lng * 0.7 + lng * 0.3;
            }
            document.getElementById("gpsAccBadge").textContent = `±${Math.round(accuracy)}m`;
            setMarker(lat, lng, accuracy);
            emitLocation(lat, lng, accuracy);
        },
        (err) => {
            if (err.code === 1) {
                toast("Enable GPS permissions", "error");
                stopGPS();
            }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    if (gpsInterval) clearInterval(gpsInterval);
    gpsInterval = setInterval(() => {
        if (navigator.geolocation && gpsActive) {
            navigator.geolocation.getCurrentPosition(
                (pos) => emitLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
                () => { },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }, 30000);

    toast("GPS tracking started (real-time)", "success");
}

function stopGPS() {
    gpsActive = false;
    if (gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    if (gpsInterval) {
        clearInterval(gpsInterval);
        gpsInterval = null;
    }
    document.getElementById("gpsToggle").classList.remove("on");
    document.getElementById("gpsLabel").textContent = "GPS OFF";
    document.getElementById("gpsAccBadge").textContent = "—";
    toast("GPS stopped", "info");
}

async function loadToday() {
    try {
        const assignment = await api("GET", "/today");
        currentAssignmentId = assignment?.id || null;
        routeStatus = assignment?.status || null;
        renderAssignment(assignment);
        loadStats();
        if (assignment && assignment.route_id) {
            await loadRouteWaypoints(assignment.route_id);
        } else {
            initMap(8.2380, 123.0, 14);
        }
    } catch (e) {
        console.error("loadToday:", e);
        document.getElementById("assignmentCard").innerHTML =
            `<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No Assignment Today</div><div class="empty-sub">Check your schedule for upcoming routes</div></div>`;
        initMap(8.2380, 123.0, 14);
        loadStats();
    }
}

async function loadRouteWaypoints(routeId) {
    if (routeId !== lastLoadedRouteId) {
        reachedStopKeys.clear();
        reachedMrfKeys.clear();
        lastLoadedRouteId = routeId;
    }
    try {
        const routeData = await api("GET", `/route-waypoints?route_id=${routeId}`);
        const parsed = parseWaypointsJson(routeData.raw_waypoints || routeData.waypoints_json || routeData.waypoints);

        if (!parsed.road.length && parsed.pins.length === 0 && routeData.waypoints && routeData.waypoints.length) {
            parsed.pins = routeData.waypoints.map((w, i) => ({
                lat: parseFloat(w.lat),
                lng: parseFloat(w.lng),
                name: w.name || `Stop ${i + 1}`,
                num: i + 1
            }));
        }

        const hasAnything = parsed.road.length || parsed.pins.length || parsed.mrfs.length;
        if (hasAnything) {
            const first = parsed.road[0] || parsed.pins[0];
            initMap(first.lat, first.lng, 15);
            showRouteFromData(parsed);
            document.getElementById("routePanel").classList.add("show");
        } else {
            initMap(8.2380, 123.0, 14);
        }
    } catch (e) {
        console.error("loadRouteWaypoints:", e);
        initMap(8.2380, 123.0, 14);
    }
}

function renderAssignment(data) {
    if (!data) {
        document.getElementById("assignmentCard").innerHTML =
            `<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No Assignment Today</div><div class="empty-sub">You have no scheduled route for today</div></div>`;
        return;
    }

    const isCompleted = data.status === "completed";
    const isCancelled = data.status === "cancelled";

    let footer;
    if (isCompleted) {
        footer = `<div class="completed-banner">
                        <div class="check-circle">✓</div>
                        <div>
                            <div class="completed-title">Route Completed</div>
                            <div class="completed-sub">Nice work — all done for today 🎉</div>
                        </div>
                   </div>`;
    } else if (isCancelled) {
        footer = `<div class="completed-banner cancelled">
                        <div class="check-circle">✕</div>
                        <div>
                            <div class="completed-title">Route Cancelled</div>
                            <div class="completed-sub">This assignment was marked as cancelled</div>
                        </div>
                   </div>`;
    } else {
        footer = `<div class="today-footer">
                        ${data.status === "in_progress"
                ? `<button class="btn btn-success" onclick="updateStatus(${data.id},'completed')">✓ Mark Complete</button>`
                : `<button class="btn btn-primary" onclick="updateStatus(${data.id},'in_progress')">▶ Start Route</button>`}
                        <span class="status-badge status-${data.status}">${(data.status || "pending").replace("_", " ").toUpperCase()}</span>
                   </div>`;
    }

    document.getElementById("assignmentCard").innerHTML = `
                <div class="today-card ${isCompleted ? 'completed' : ''} ${isCancelled ? 'cancelled' : ''}" data-assignment-id="${data.id}">
                    <div class="today-inner">
                        <div class="today-route">📍 ${data.zone_name || "Unknown Zone"}</div>
                        ${data.zone_description ? `<div style="font-size:.78rem;color:var(--text2);margin-top:8px;font-weight:400">${data.zone_description}</div>` : ""}
                        <div class="today-meta">
                            <span class="chip amber">🚛 ${data.plate_number || "Truck"}</span>
                            <span class="chip">${data.model || "Vehicle"}</span>
                            <span class="chip">${(data.pickup_type || "REGULAR").replace(/_/g, " ").toUpperCase()}</span>
                            <span class="chip">${data.assigned_date ? fmtDate(data.assigned_date) : "Today"}</span>
                        </div>
                    </div>
                    ${footer}
                </div>`;
}

async function updateStatus(id, status) {
    emitStatusUpdate(id, status);
}

async function loadStats() {
    try {
        const data = await api("GET", "/schedule");
        document.getElementById("statCompleted").textContent = data.filter(r => r.status === "completed").length;
        document.getElementById("statTotal").textContent = data.length;
        document.getElementById("statPending").textContent = data.filter(r => r.status === "pending").length;
    } catch (e) { console.warn("loadStats failed:", e); }
}

function scheduleBadgeClass(status) {
    if (status === 'pending') return 'badge-amber';
    if (status === 'completed') return 'badge-green';
    if (status === 'cancelled') return 'badge-gray';
    return 'badge-blue';
}

async function loadSchedule() {
    loadFlags.schedule = true;
    const today = new Date().toISOString().slice(0, 10);
    try {
        const data = await api("GET", "/schedule");
        const el = document.getElementById("scheduleList");
        if (!data.length) {
            el.innerHTML = `<div class="empty"><div class="empty-icon">📅</div><div class="empty-title">No Schedules</div></div>`;
            return;
        }
        el.innerHTML = data.map(s => {
            const isToday = s.assigned_date.slice(0, 10) === today;
            return `<div class="sched-card ${isToday ? 'today-row' : ''}">
                        <div>
                            <div class="sched-date">${fmtShort(s.assigned_date)}${isToday ? ` <span style="color:var(--amber);font-size:.6rem;font-weight:600">TODAY</span>` : ""}</div>
                            <div class="sched-date-sub">${new Date(s.assigned_date).toLocaleDateString("en-US", { weekday: "short" })}</div>
                        </div>
                        <div>
                            <div class="sched-zone">📍 ${s.zone_name}</div>
                            <div class="sched-meta">🚛 ${s.plate_number} · ${(s.pickup_type || "REGULAR").replace(/_/g, " ")}</div>
                        </div>
                        <span class="badge ${scheduleBadgeClass(s.status)}">${s.status === 'in_progress' ? 'IN PROGRESS' : s.status.toUpperCase()}</span>
                    </div>`;
        }).join("");
    } catch (e) { console.error("loadSchedule failed:", e); }
}

document.getElementById("reportForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.textContent = "⏳ Submitting…";
    try {
        const type = document.getElementById("repType").value;
        const description = document.getElementById("repDesc").value;
        const location_note = document.getElementById("repLocation").value;
        emitReport(type, description, location_note);
        loadFlags.report = false;
        setTimeout(loadMyReports, 500);
    } catch (err) { toast(err.message, "error"); }
    finally { btn.textContent = "⚠️ Submit Report"; }
});

async function loadMyReports() {
    loadFlags.report = true;
    try {
        const data = await api("GET", "/reports");
        const el = document.getElementById("myReportsList");
        if (!data.length) {
            el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No Reports Filed</div></div>`;
            return;
        }
        el.innerHTML = data.map(r => `
                    <div class="report-card">
                        <div class="report-icon">⚠️</div>
                        <div class="report-body">
                            <span class="badge badge-amber">${(r.type || "").replace(/_/g, " ").toUpperCase()}</span>
                            <div class="report-desc">${r.description}</div>
                            ${r.location_note ? `<div class="report-note">📍 ${r.location_note}</div>` : ""}
                        </div>
                        <div class="report-ts">${fmtShort(r.created_at)}<br>${fmtTime(r.created_at)}</div>
                    </div>`).join("");
    } catch (e) { console.error("loadMyReports failed:", e); }
}

async function loadAnnouncements() {
    loadFlags.announcements = true;
    try {
        const data = await api("GET", "/announcements");
        const badge = document.getElementById("annBadge");
        if (data.length) {
            badge.textContent = data.length;
            badge.style.display = "flex";
        }
        const el = document.getElementById("annList");
        if (!data.length) {
            el.innerHTML = `<div class="empty"><div class="empty-icon">📢</div><div class="empty-title">No Announcements</div></div>`;
            return;
        }
        el.innerHTML = data.map(a => `
                    <div class="ann-card">
                        <div class="ann-body">
                            <div class="ann-meta">${a.created_at ? fmtDate(a.created_at) : "—"} · ${a.admin_name || "Admin"}</div>
                            <div class="ann-title">${a.title}</div>
                            <div class="ann-msg">${a.message}</div>
                        </div>
                    </div>`).join("");
    } catch (e) { console.error("loadAnnouncements failed:", e); }
}

async function loadTrips() {
    loadFlags.trips = true;
    try {
        const data = await api("GET", "/trips");
        const el = document.getElementById("tripList");
        if (!data.length) {
            el.innerHTML = `<div class="empty"><div class="empty-icon">🗺️</div><div class="empty-title">No Completed Trips</div></div>`;
            return;
        }
        el.innerHTML = data.map(t => `
                    <div class="trip-card">
                        <div>
                            <div class="trip-date">${fmtShort(t.assigned_date)}</div>
                            <div class="trip-sub">${t.completed_at ? fmtTime(t.completed_at) : "Completed"}</div>
                        </div>
                        <div>
                            <div class="sched-zone">📍 ${t.zone_name}</div>
                            <div class="sched-meta">🚛 ${t.plate_number}</div>
                        </div>
                        <span class="badge ${t.status === 'cancelled' ? 'badge-gray' : 'badge-green'}">${t.status === 'cancelled' ? 'CANCELLED' : 'DONE'}</span>
                    </div>`).join("");
    } catch (e) { console.error("loadTrips failed:", e); }
}

async function loadProfile() {
    loadFlags.profile = true;
    try {
        const data = await api("GET", "/profile");
        const initial = (data.name || "D").charAt(0).toUpperCase();
        document.getElementById("sidebarName").textContent = data.name || "Driver";
        document.getElementById("sidebarAvatar").textContent = initial;
        document.getElementById("profAvatarLarge").textContent = initial;
        document.getElementById("profNameDisplay").textContent = data.name || "—";
        document.getElementById("profEmailDisplay").textContent = data.email || "—";
        document.getElementById("profName").value = data.name || "";
        document.getElementById("profPhone").value = data.phone || "";
        document.getElementById("profAddress").value = data.address || "";
    } catch (e) { console.error("loadProfile failed:", e); toast("Failed to load profile", "error"); }
}

document.getElementById("profileForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    btn.textContent = "⏳ Saving…";
    try {
        const name = document.getElementById("profName").value;
        const phone = document.getElementById("profPhone").value;
        const address = document.getElementById("profAddress").value;
        emitProfileUpdate(name, phone, address);
        setTimeout(loadProfile, 500);
    } catch (err) { toast(err.message, "error"); }
    finally { btn.textContent = "💾 Save Changes"; }
});


updateThemeIcon(document.documentElement.getAttribute('data-theme') || 'light');
document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

connectWebSocket();
loadToday();
loadProfile();

setInterval(() => {
    if (!socketConnected) {
        console.log('🔄 REST fallback refresh');
        loadToday();
        loadStats();
    }
}, 60000);

window.updateStatus = updateStatus;
window.useCurrentLoc = useCurrentLoc;
window.optimizeRoute = optimizeRoute;
window.toggleLock = toggleLock;
window.toggleSat = toggleSat;
window.toggleRoutePanel = toggleRoutePanel;
window.centerMe = centerMe;
window.fitAllStops = fitAllStops;
window.goToMRF = goToMRF;
window.toggleGPS = toggleGPS;
window.loadResidents = loadResidents;
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.toast = toast;
window.toggleIssueMarkers = toggleIssueMarkers;
window.locateIssue = locateIssue;
window.markIssueResolved = markIssueResolved;

(function attachNewReportListener() {
    const tryAttach = () => {
        if (!socket) { setTimeout(tryAttach, 300); return; }
        socket.on('new-resident-report', (report) => {
            if (!report || !report.id) return;
            if (allIssues.some(r => r.id === report.id)) return;
            report._isNew = true;
            allIssues.unshift(report);
            renderIssueMarkers();
            renderIssuesListPanel();
            updateIssuesBadge();
            const badge = document.getElementById('issuesBadge');
            if (badge) {
                badge.classList.add('pulse');
                setTimeout(() => badge.classList.remove('pulse'), 4000);
            }
            toast(`🚨 New report: ${ISSUE_LABELS[report.type] || 'Issue'}`, 'info');
            setTimeout(() => { report._isNew = false; }, 3000);
        });
    };
    tryAttach();
})();

console.log('🚀 Hybrid Driver Portal initialized');
console.log(`📡 WebSocket: ${WS_URL}`);
console.log(`👤 Driver ID: ${driverId}`);
console.log(`🔌 Socket connected: ${socketConnected}`);