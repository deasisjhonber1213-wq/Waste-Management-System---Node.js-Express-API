const token = localStorage.getItem('token');
if (!token) window.location.href = '/login.html';

async function apiFetch(url, options = {}) {
    const opts = { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } };
    const res = await fetch(url, opts);
    if (!res.ok) {
        let bodyText = '';
        try { bodyText = await res.text(); } catch (_) { }
        console.error(`[API ${res.status}] ${url}`, bodyText);
        throw new Error(`${res.status} ${res.statusText} on ${url}${bodyText ? ' — ' + bodyText : ''}`);
    }
    return res.json();
}

/* ══════════════ Small inline SVG icons (used for dynamically built strings) ══════════════
   NOTE: the 🚛 (truck), 🏭 (MRF), and 🏠 (house) emoji used for map markers/popups are
   intentionally left as emoji everywhere in this file, per design requirements. */
const ICON_PIN = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>';
const ICON_RECYCLE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
const ICON_ZONE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:3px"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>';

const TOAST_ICONS = {
    success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-opacity=".4"/><polyline points="8 12 11 15 16 9"/></svg>',
    info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-opacity=".4"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.7" fill="var(--blue)" stroke="none"/></svg>',
    error: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-opacity=".4"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
};

const TYPE_LABELS = { missed_pickup: 'Missed Pickup', illegal_dumping: 'Illegal Dumping', overflowing_bin: 'Overflowing Bin', other: 'Other Issue' };
const TYPE_COLORS = { missed_pickup: 'var(--amber)', illegal_dumping: 'var(--red)', overflowing_bin: 'var(--success)', other: 'var(--blue)' };
const TYPE_ICONS = {
    missed_pickup: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>',
    illegal_dumping: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.7 18-8-14.3a2 2 0 0 0-3.4 0l-8 14.3A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    overflowing_bin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
    other: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.6" fill="var(--blue)" stroke="none"/></svg>'
};

const SUN_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="4.2" y1="4.2" x2="6" y2="6"/><line x1="18" y1="18" x2="19.8" y2="19.8"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.2" y1="19.8" x2="6" y2="18"/><line x1="18" y1="6" x2="19.8" y2="4.2"/></svg>';
const MOON_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    localStorage.setItem('resident_theme', next);
    syncThemeButtons(next);
}

function syncThemeButtons(theme) {
    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (icon) icon.innerHTML = theme === 'light' ? SUN_ICON : MOON_ICON;
    if (label) label.textContent = theme === 'light' ? 'Light Mode' : 'Dark Mode';
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

function switchProfileTab(tab, btn) {
    document.querySelectorAll('#profileModal .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#profileModal .tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tab === 'info' ? 'tabInfo' : 'tabPassword').classList.add('active');
}

function switchTermsTab(tab, btn) {
    document.querySelectorAll('#termsModal .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#termsModal .tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tab === 'tos' ? 'tabTos' : 'tabPrivacy').classList.add('active');
}

/* ══════════════ Sidebar (mobile) ══════════════ */
const hamburger = document.getElementById('hamburger');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function openSidebar() {
    sidebar?.classList.add('open');
    sidebarOverlay?.classList.add('open');
    hamburger?.classList.add('open');
    hamburger?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('open');
    hamburger?.classList.remove('open');
    hamburger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}

function toggleSidebar() {
    if (sidebar?.classList.contains('open')) closeSidebar();
    else openSidebar();
}

hamburger?.addEventListener('click', toggleSidebar);
sidebarOverlay?.addEventListener('click', closeSidebar);

sidebar?.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', closeSidebar);
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeSidebar();
});

let touchStartX = 0;
sidebar?.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
sidebar?.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (delta < -60) closeSidebar();
}, { passive: true });

document.addEventListener('DOMContentLoaded', () => {
    syncThemeButtons(document.documentElement.getAttribute('data-theme') || 'dark');
});

/* ══════════════ Reveal-on-scroll + nav scroll-spy ══════════════ */
const io = new IntersectionObserver(
    entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('in')),
    { threshold: 0.1 }
);
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

const navItems = document.querySelectorAll('.nav-item[data-nav]');
const navSections = Array.from(navItems).map(a => document.querySelector(a.getAttribute('href')));
const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = '#' + entry.target.id;
        navItems.forEach(a => a.classList.toggle('active', a.getAttribute('href') === id));
    });
}, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
navSections.forEach(s => s && spy.observe(s));

let map, markerLayer, tileStreet, tileSat, tileRoadOverlay;
let currentTruckId, truckMarker, userMarker;
let mrfMarkers = [];
let fallbackMRF = null;
let pinMarkers = [];
let residentMarkers = {};
let activeTile = 'street';
let sharingLocation = false,
    shareInterval = null;
let userLat = null,
    userLng = null;
let truckLat = null,
    truckLng = null;
let lastKnownLocation = null;
let locationWatchId = null;

let routeStarted = false;
let hasLiveTruckLocation = false;

let currentAssignmentId = null;
let routeStatus = null;

let animFrame = null;
let animating = false;
let animStart = null;
let animFrom = null;
let animTo = null;

let progressPolyline = null;
let trailPolyline = null;
let drawnCoords = [];
let progressIndex = 0;
let pinStops = [];

let mrfStops = [];
const DEFAULT_CENTER = { lat: 8.2317, lng: 123.4018 };

tileStreet = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OSM &amp; CARTO', subdomains: 'abcd', maxZoom: 20 }
);
tileSat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '&copy; Esri', maxZoom: 19 }
);
tileRoadOverlay = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20, opacity: 0.8, pane: 'overlayPane' }
);

function saveProgressState() {
    if (!currentAssignmentId) return;
    const state = {
        assignmentId: currentAssignmentId,
        progressIndex: progressIndex,
        mrfPassed: mrfStops.map(m => m._passed || false),
        stopDone: pinStops.map((_, i) => {
            const el = document.getElementById(`resStop${i}`);
            return el ? el.classList.contains('done') : false;
        }),
        truckLat: truckLat,
        truckLng: truckLng,
        lastUpdated: Date.now()
    };
    try {
        localStorage.setItem(`resident_progress_${currentAssignmentId}`, JSON.stringify(state));
    } catch (e) { }
}

function loadProgressState() {
    if (!currentAssignmentId) return null;
    try {
        const raw = localStorage.getItem(`resident_progress_${currentAssignmentId}`);
        if (!raw) return null;
        const state = JSON.parse(raw);
        if (Date.now() - state.lastUpdated > 2 * 60 * 60 * 1000) {
            localStorage.removeItem(`resident_progress_${currentAssignmentId}`);
            return null;
        }
        return state;
    } catch (e) { return null; }
}

function restoreProgressState() {
    const state = loadProgressState();
    if (!state) return false;

    if (state.progressIndex > 0 && progressPolyline && trailPolyline && drawnCoords.length) {
        progressIndex = Math.min(state.progressIndex, drawnCoords.length - 1);
        trailPolyline.setLatLngs(drawnCoords.slice(0, progressIndex + 1));
        progressPolyline.setLatLngs(drawnCoords.slice(progressIndex));
        // Do NOT call markMRFPassed here — MRFs are only marked by real
        // truck proximity (or already restored from state.mrfPassed below).
    }

    state.mrfPassed.forEach((passed, i) => {
        if (passed && mrfStops[i]) {
            mrfStops[i]._passed = true;
            const wrap = document.getElementById(`mrfWrap${i}`);
            const pin = document.getElementById(`mrfPin${i}`);
            if (wrap) wrap.classList.add('passed');
            if (pin) { pin.classList.add('passed'); pin.innerHTML = '<span style="font-size:14px">✓</span>'; }
        }
    });

    state.stopDone.forEach((done, i) => {
        if (done) {
            const pin = document.getElementById(`resStop${i}`);
            if (pin && !pin.classList.contains('done')) {
                pin.classList.add('done');
                pin.textContent = '✓';
            }
        }
    });

    if (state.truckLat && state.truckLng && truckMarker) {
        truckMarker.setLatLng([state.truckLat, state.truckLng]);
        truckLat = state.truckLat;
        truckLng = state.truckLng;
        updateRouteProgress(state.truckLat, state.truckLng);
    }

    return true;
}

function initMap(lat = DEFAULT_CENTER.lat, lng = DEFAULT_CENTER.lng) {
    if (map) return;
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([lat, lng], 13);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 80 }).addTo(map);

    tileStreet.addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    loadFallbackMRF();
    loadResidentLocations();
    setInterval(loadResidentLocations, 30000);
}

async function loadFallbackMRF() {
    try {
        const mrf = await apiFetch('/api/resident/mrf-location');
        if (!mrf || !mrf.latitude || !mrf.longitude) return;
        // MRF marker: emoji left as-is by design
        const icon = L.divIcon({
            className: "",
            html: `<div class="mrf-wrap"><div class="mrf-pulse-ring"></div><div class="mrf-pin"><span style="font-size:15px">🏭</span></div></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        fallbackMRF = L.marker([mrf.latitude, mrf.longitude], { icon, zIndexOffset: 400, opacity: 0.55 })
            .addTo(map)
            .bindPopup(`<b style="color:#2dd4a0">🏭 ${mrf.name || 'MRF'}</b>`);
    } catch (e) {
        console.warn('MRF lookup failed:', e);
    }
}

function setTile(mode) {
    if (!map) return;
    activeTile = mode;
    if (mode === 'satellite') {
        map.removeLayer(tileStreet);
        tileSat.addTo(map);
        tileRoadOverlay.addTo(map);
        document.getElementById('btnStreet')?.classList.remove('active');
        document.getElementById('btnSat')?.classList.add('active');
    } else {
        if (map.hasLayer(tileSat)) map.removeLayer(tileSat);
        if (map.hasLayer(tileRoadOverlay)) map.removeLayer(tileRoadOverlay);
        tileStreet.addTo(map);
        document.getElementById('btnSat')?.classList.remove('active');
        document.getElementById('btnStreet')?.classList.add('active');
    }
}

function parseWaypointsJson(raw) {
    if (!raw) return { road: [], pins: [], mrfs: [] };
    try {
        let data = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(data)) {
            return {
                road: [],
                pins: data.map((wp, i) => ({ lat: parseFloat(wp.lat), lng: parseFloat(wp.lng), name: wp.name || `Stop ${i + 1}`, num: wp.stopNumber || (i + 1) })),
                mrfs: []
            };
        }
        const road = (data.road_path || data.road || []).map(v => ({ lat: parseFloat(v.lat), lng: parseFloat(v.lng) }));
        const pins = (data.pin_stops || data.pins || []).map((p, i) => ({ lat: parseFloat(p.lat), lng: parseFloat(p.lng), name: p.name || `Stop ${i + 1}`, num: p.stopNumber || (i + 1) }));
        const mrfs = (data.mrf_stops || data.mrf || []).map(m => ({ lat: parseFloat(m.lat), lng: parseFloat(m.lng), name: m.name || "MRF Stop" }));
        return { road, pins, mrfs };
    } catch (e) { console.error("parseWaypointsJson error:", e); return { road: [], pins: [], mrfs: [] }; }
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

function showRouteWithTrail(routeData) {
    if (!map) return;

    if (progressPolyline) { map.removeLayer(progressPolyline); progressPolyline = null; }
    if (trailPolyline) { map.removeLayer(trailPolyline); trailPolyline = null; }
    pinMarkers.forEach(m => map.removeLayer(m));
    pinMarkers = [];
    mrfMarkers.forEach(m => map.removeLayer(m));
    mrfMarkers = [];
    drawnCoords = [];
    progressIndex = 0;
    pinStops = [];
    mrfStops = [];

    const { road, pins, mrfs } = routeData;

    if (road.length >= 2) {
        drawnCoords = road.map(v => L.latLng(v.lat, v.lng));

        progressPolyline = L.polyline(drawnCoords, {
            color: "#f5a623",
            weight: 5,
            opacity: .9,
            dashArray: "10 6"
        }).addTo(map);

        trailPolyline = L.polyline([], {
            color: "#d4a853",
            weight: 5,
            opacity: .85
        }).addTo(map);

        let totalM = 0;
        for (let i = 1; i < drawnCoords.length; i++) {
            totalM += drawnCoords[i - 1].distanceTo(drawnCoords[i]);
        }
        const distEl = document.getElementById('routeDist');
        if (distEl) {
            distEl.textContent = totalM > 1000 ? (totalM / 1000).toFixed(2) + " km" : Math.round(totalM) + " m";
        }
    }

    pinStops = pins;
    pins.forEach((p, i) => {
        const icon = L.divIcon({
            className: "",
            html: `<div class="stop-pin" id="resStop${i}">${p.num}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        pinMarkers.push(
            L.marker([p.lat, p.lng], { icon, zIndexOffset: 300 })
                .bindPopup(`<b>${ICON_PIN}Stop ${p.num}</b><br>${p.name}`)
                .addTo(map)
        );
    });

    mrfStops = mrfs.map(m => ({
        ...m,
        _routeIdx: drawnCoords.length ? nearestRoadIndex(m.lat, m.lng) : null,
        _passed: false
    }));

    mrfStops.forEach((m, i) => {
        // MRF marker: emoji left as-is by design
        const icon = L.divIcon({
            className: "",
            html: `<div class="mrf-wrap" id="mrfWrap${i}"><div class="mrf-pulse-ring"></div><div class="mrf-pin" id="mrfPin${i}"><span style="font-size:15px">🏭</span></div></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });
        mrfMarkers.push(
            L.marker([m.lat, m.lng], { icon, zIndexOffset: 600 })
                .bindPopup(`<b style="color:#2dd4a0">🏭 ${m.name}</b>`)
                .addTo(map)
        );
    });
    if (mrfs.length && fallbackMRF) fallbackMRF.setOpacity(0);

    const allPoints = [
        ...road.map(v => [v.lat, v.lng]),
        ...pins.map(p => [p.lat, p.lng]),
        ...mrfs.map(m => [m.lat, m.lng])
    ];
    if (allPoints.length) {
        map.fitBounds(L.latLngBounds(allPoints).pad(0.12));
    }

    if (currentAssignmentId) {
        restoreProgressState();
    }

    if (truckLat !== null && truckLng !== null) {
        updateRouteProgress(truckLat, truckLng);
    }
}

// Proximity thresholds (meters). MRFs require a tighter check so the
// truck must physically visit them — path progress alone is not enough.
const STOP_REACH_RADIUS_M = 80;
const MRF_REACH_RADIUS_M = 45;
// How close the truck must be to the road path before we advance the trail.
const PATH_SNAP_MAX_M = 120;

function markMRFPassed(pt) {
    // MRFs are ONLY marked when the truck is physically near the facility.
    // Road-path progress alone must never auto-complete an MRF.
    if (!pt) return;

    mrfStops.forEach((m, i) => {
        if (m._passed) return;

        const dist = pt.distanceTo(L.latLng(m.lat, m.lng));
        if (dist >= MRF_REACH_RADIUS_M) return;

        m._passed = true;
        const wrap = document.getElementById(`mrfWrap${i}`);
        const pin = document.getElementById(`mrfPin${i}`);
        if (wrap) wrap.classList.add('passed');
        if (pin) { pin.classList.add('passed'); pin.innerHTML = '<span style="font-size:14px">✓</span>'; }
        const marker = mrfMarkers[i];
        if (marker) marker.setPopupContent(`<b style="color:#94a3b8">🏭 ${m.name}</b><br><span style="color:#34d399">✓ Truck already passed</span>`);
    });
}

function updateRouteProgress(lat, lng) {
    if (!drawnCoords.length || !progressPolyline || !trailPolyline) return;
    const current = L.latLng(lat, lng);
    let nearest = progressIndex;
    let minDist = Infinity;
    const start = Math.max(0, progressIndex - 5);
    for (let i = start; i < drawnCoords.length; i++) {
        const d = current.distanceTo(drawnCoords[i]);
        if (d < minDist) { minDist = d; nearest = i; }
        if (d > minDist + 200 && i > progressIndex + 10) break;
    }

    // Only advance the driven trail when the truck is close to the path.
    // Prevents a truck near the end of the path from auto-completing
    // the whole route and every MRF along it.
    if (nearest > progressIndex && minDist <= PATH_SNAP_MAX_M) {
        progressIndex = nearest;
        trailPolyline.setLatLngs(drawnCoords.slice(0, progressIndex + 1));
        progressPolyline.setLatLngs(drawnCoords.slice(progressIndex));
    }

    pinStops.forEach((p, i) => {
        if (current.distanceTo(L.latLng(p.lat, p.lng)) < STOP_REACH_RADIUS_M) {
            const pin = document.getElementById(`resStop${i}`);
            if (pin && !pin.classList.contains('done')) {
                pin.classList.add('done');
                pin.textContent = '✓';
                saveProgressState();
            }
        }
    });

    markMRFPassed(current);

    if (currentAssignmentId) {
        saveProgressState();
    }
}

function animateTruck(from, to, duration = 3000) {
    if (animating && animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
        from = { lat: truckMarker.getLatLng().lat, lng: truckMarker.getLatLng().lng };
    }

    animating = true;
    animStart = Date.now();
    animFrom = from;
    animTo = to;

    function step() {
        const elapsed = Date.now() - animStart;
        const progress = Math.min(elapsed / duration, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

        const lat = animFrom.lat + (animTo.lat - animFrom.lat) * ease;
        const lng = animFrom.lng + (animTo.lng - animFrom.lng) * ease;

        if (truckMarker) {
            truckMarker.setLatLng([lat, lng]);
        }
        updateRouteProgress(lat, lng);

        if (progress < 1) {
            animFrame = requestAnimationFrame(step);
        } else {
            animating = false;
            animFrame = null;
            if (truckMarker) {
                truckMarker.setLatLng([animTo.lat, animTo.lng]);
            }
            updateRouteProgress(animTo.lat, animTo.lng);
        }
    }
    step();
}

function placeTruckMarker(lat, lng, animate = true) {
    truckLat = lat;
    truckLng = lng;

    if (!map) initMap(lat, lng);

    if (truckMarker) {
        const currentPos = truckMarker.getLatLng();
        if (animate && currentPos) {
            animateTruck({ lat: currentPos.lat, lng: currentPos.lng }, { lat, lng });
        } else {
            truckMarker.setLatLng([lat, lng]);
            updateRouteProgress(lat, lng);
        }
    } else {
        // Truck marker: emoji left as-is by design
        const icon = L.divIcon({
            className: "",
            html: `<div class="truck-marker"><span style="font-size:14px">🚛</span></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        truckMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
            .bindPopup('<b>🚛 Garbage Truck</b>')
            .addTo(map);
        updateRouteProgress(lat, lng);
    }
    updateDistanceHUD();

    if (currentAssignmentId) {
        saveProgressState();
    }
}

async function loadResidentLocations() {
    if (!map) return;
    try {
        const list = await apiFetch('/api/resident/resident-locations');
        const freshIds = new Set(list.map(r => r.id));
        Object.keys(residentMarkers).forEach(id => {
            if (!freshIds.has(parseInt(id))) {
                map.removeLayer(residentMarkers[id]);
                delete residentMarkers[id];
            }
        });
        list.forEach(r => {
            const fresh = (Date.now() - new Date(r.location_updated_at || 0).getTime()) < 5 * 60 * 1000;
            // Resident (house) marker: emoji left as-is by design
            const icon = L.divIcon({
                className: "",
                html: `<div class="resident-pin ${fresh ? 'fresh' : 'stale'}"><span style="font-size:11px">🏠</span></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            if (residentMarkers[r.id]) {
                residentMarkers[r.id].setLatLng([r.latitude, r.longitude]).setIcon(icon);
            } else {
                residentMarkers[r.id] = L.marker([r.latitude, r.longitude], { icon })
                    .bindPopup(`<b style="color:#5b9cf6">🏠 ${r.name}</b><br><span style="color:${fresh ? '#34d399' : '#7a8499'}">${fresh ? "Active now" : "Last seen >5m ago"}</span>`)
                    .addTo(map);
            }
        });
    } catch (e) { console.warn('Resident locations failed', e); }
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371,
        dLat = (lat2 - lat1) * Math.PI / 180,
        dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateDistanceHUD() {
    if (userLat === null || truckLat === null) return;
    const km = haversineKm(userLat, userLng, truckLat, truckLng);
    // Truck emoji left as-is by design
    const distanceText = km < 1 ? `🚛 Truck is ~${Math.round(km * 1000)} m away` : `🚛 Truck is ~${km.toFixed(2)} km away`;
    const distanceEl = document.getElementById('distanceText');
    if (distanceEl) distanceEl.textContent = distanceText;
    const hudEl = document.getElementById('distanceHUD');
    if (hudEl) hudEl.style.display = 'flex';
}

function centerOnUser() {
    if (!map) { showToast('Map not ready', 'error'); return; }
    const lat = userLat || lastKnownLocation?.lat || DEFAULT_CENTER.lat;
    const lng = userLng || lastKnownLocation?.lng || DEFAULT_CENTER.lng;
    map.setView([lat, lng], 16, { animate: true });
    showToast('Centered on your location');
}

function placeUserMarker(lat, lng, accuracy) {
    if (!map) initMap(lat, lng);

    lastKnownLocation = { lat, lng, accuracy };
    userLat = lat;
    userLng = lng;

    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        const icon = L.divIcon({
            className: "",
            html: `<div class="user-marker"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        userMarker = L.marker([lat, lng], { icon, zIndexOffset: 500 })
            .bindPopup(`<b>${ICON_PIN}You</b>`)
            .addTo(map);
    }

    const locInfo = document.getElementById('locationInfo');
    if (locInfo) {
        locInfo.innerHTML = `<span>${ICON_PIN}${lat.toFixed(5)}, ${lng.toFixed(5)}</span><span id="locAccuracy">±${Math.round(accuracy || 30)}m</span>`;
    }
    updateDistanceHUD();
}

function startUserTracking() {
    navigator.geolocation?.getCurrentPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;
            placeUserMarker(latitude, longitude, accuracy);
            if (!map) initMap(latitude, longitude);
            else map.setView([latitude, longitude], 14, { animate: true });
        },
        (err) => {
            console.warn('Geolocation error:', err);
            if (lastKnownLocation) {
                placeUserMarker(lastKnownLocation.lat, lastKnownLocation.lng, lastKnownLocation.accuracy);
            }
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    if (locationWatchId) {
        navigator.geolocation?.clearWatch(locationWatchId);
    }

    locationWatchId = navigator.geolocation?.watchPosition(
        pos => {
            const { latitude, longitude, accuracy } = pos.coords;
            placeUserMarker(latitude, longitude, accuracy);
        },
        (err) => { console.warn('Watch position error:', err); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
}

function toggleShareLocation() {
    const btn = document.getElementById('btnShare');
    const status = document.getElementById('shareStatus');
    sharingLocation = !sharingLocation;

    if (sharingLocation) {
        if (btn) {
            btn.classList.add('active');
        }
        if (status) {
            status.textContent = 'Sharing: ON';
            status.style.color = 'var(--gold)';
        }

        if (lastKnownLocation) {
            pushMyLocation(lastKnownLocation.lat, lastKnownLocation.lng);
        } else {
            navigator.geolocation?.getCurrentPosition(
                pos => {
                    const { latitude, longitude, accuracy } = pos.coords;
                    placeUserMarker(latitude, longitude, accuracy);
                    pushMyLocation(latitude, longitude);
                },
                () => {
                    showToast('Could not get location. Using last known.', 'error');
                    if (lastKnownLocation) {
                        pushMyLocation(lastKnownLocation.lat, lastKnownLocation.lng);
                    }
                }, { enableHighAccuracy: true, timeout: 10000 }
            );
        }
        shareInterval = setInterval(() => {
            navigator.geolocation?.getCurrentPosition(
                pos => {
                    const { latitude, longitude, accuracy } = pos.coords;
                    placeUserMarker(latitude, longitude, accuracy);
                    pushMyLocation(latitude, longitude);
                },
                () => {
                    if (lastKnownLocation) {
                        pushMyLocation(lastKnownLocation.lat, lastKnownLocation.lng);
                    }
                }, { enableHighAccuracy: true, timeout: 8000 }
            );
        }, 15000);
        showToast('Location sharing ON');
    } else {
        clearInterval(shareInterval);
        shareInterval = null;
        if (btn) {
            btn.classList.remove('active');
        }
        if (status) {
            status.textContent = 'Sharing: OFF';
            status.style.color = 'var(--text-3)';
        }
        showToast('Location sharing OFF');
    }
}

async function pushMyLocation(lat, lng) {
    if (!lat || !lng) return;
    try {
        await apiFetch('/api/resident/share-location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ latitude: lat, longitude: lng })
        });
    } catch (e) {
        console.warn('Share push failed', e);
        showToast('Failed to share location', 'error');
    }
}

let scheduleShowAll = false;
const SCHEDULE_LIMIT = 3;

async function loadSchedule() {
    const el = document.getElementById('scheduleCards');
    if (!el) return;
    try {
        const data = await apiFetch('/api/resident/pickup-schedule');
        if (!data.length) { el.innerHTML = '<p style="color:var(--text-2);">No schedule available.</p>'; return; }
        window._scheduleData = data;
        renderSchedule();
    } catch (err) {
        console.error('loadSchedule failed:', err);
        el.innerHTML = '<p style="color:var(--text-2);">Failed to load schedule.</p>';
    }
}

function renderSchedule() {
    const el = document.getElementById('scheduleCards');
    const data = window._scheduleData || [];
    const today = new Date().toDateString();
    const visible = scheduleShowAll ? data : data.slice(0, SCHEDULE_LIMIT);
    el.innerHTML = visible.map((s, i) => {
        const d = new Date(s.assigned_date);
        const isToday = d.toDateString() === today;
        const isDone = s.status !== 'pending';
        const cls = isToday ? 'today' : isDone ? 'done' : 'upcoming';
        const badge = isToday ? `<span class="badge" style="background:rgba(245,166,35,.15);color:var(--amber);border:1px solid rgba(245,166,35,.3);">Today</span>` :
            isDone ? `<span class="badge badge-done">${s.status}</span>` :
                `<span class="badge badge-upcoming">Upcoming</span>`;
        const isLast = i === visible.length - 1;
        return `<div class="timeline-item" style="animation-delay:${i * 0.05}s">
                <div class="tl-left">
                    <div class="tl-dot ${cls}"></div>
                    ${!isLast ? `<div class="tl-line"></div>` : ''}
                </div>
                <div class="tl-card ${cls}">
                    <div class="tl-top">
                        <div>
                            <div class="tl-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            <div class="tl-day">${d.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                        </div>
                        ${badge}
                    </div>
                    <div class="tl-meta">
                        <span class="tl-meta-item">🚛 ${s.plate_number}</span>
                        <span class="tl-meta-item">${ICON_ZONE}${s.zone_name}</span>
                        <span class="tl-meta-item">${ICON_RECYCLE}${s.pickup_type}</span>
                    </div>
                </div>
            </div>`;
    }).join('');
    const btn = document.querySelector('.see-all-btn');
    if (btn) btn.textContent = scheduleShowAll ? 'Show less' : `See all (${data.length})`;
}

function toggleScheduleAll() {
    scheduleShowAll = !scheduleShowAll;
    renderSchedule();
}

let annShowAll = false;
const ANN_LIMIT = 2;

async function loadAnnouncements() {
    const el = document.getElementById('announcementCards');
    if (!el) return;
    try {
        const data = await apiFetch('/api/resident/announcements');
        window._annData = data;
        renderAnnouncements();
    } catch (err) {
        console.error('loadAnnouncements failed:', err);
        el.innerHTML = '<p style="color:var(--text-2);">Failed to load announcements.</p>';
    }
}

function renderAnnouncements() {
    const el = document.getElementById('announcementCards');
    const data = window._annData || [];
    const visible = annShowAll ? data : data.slice(0, ANN_LIMIT);
    el.innerHTML = data.length ? visible.map((a, i) => `
            <div class="ann-card" style="animation-delay:${i * 0.06}s">
                ${a.image_url ? `<img class="ann-card-img" src="${a.image_url}" onerror="this.style.display='none'">` : ''}
                <div class="ann-card-body">
                    <div class="ann-date">${a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                    <div class="ann-title">${a.title}</div>
                    <div class="ann-msg" style="-webkit-line-clamp:3;display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden">${a.message}</div>
                    <button onclick="expandAnn(this)" style="background:none;border:none;color:var(--gold);font-size:0.75rem;padding:4px 0;cursor:pointer;font-family:var(--ff-display)">Read more ›</button>
                </div>
            </div>`).join('') : '<p style="color:var(--text-2);">No announcements yet.</p>';
    const btn = document.getElementById('annSeeAll');
    if (btn) btn.textContent = annShowAll ? 'Show less' : `See all (${data.length})`;
}

function expandAnn(btn) {
    const msg = btn.previousElementSibling;
    msg.style.webkitLineClamp = msg.style.webkitLineClamp ? '' : '999';
    btn.textContent = msg.style.webkitLineClamp ? 'Read more ›' : 'Show less ‹';
}

function toggleAnnAll() {
    annShowAll = !annShowAll;
    renderAnnouncements();
}

function resetCollectionBanner() {
    const banner = document.getElementById('collectionBanner');
    const box = document.getElementById('truckStatusBox');
    if (banner) banner.classList.remove('show', 'cancelled');
    if (box) box.classList.remove('completed', 'cancelled');
}

function showCompletionBanner(cancelled) {
    const banner = document.getElementById('collectionBanner');
    const icon = document.getElementById('cbIcon');
    const title = document.getElementById('cbTitle');
    const sub = document.getElementById('cbSub');
    const box = document.getElementById('truckStatusBox');
    if (!banner) return;
    banner.classList.add('show');
    banner.classList.toggle('cancelled', !!cancelled);
    if (box) {
        box.classList.toggle('completed', !cancelled);
        box.classList.toggle('cancelled', !!cancelled);
    }
    if (icon) {
        icon.innerHTML = cancelled
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    }
    title.textContent = cancelled ? 'Route Cancelled Today' : "Today's Collection Complete";
    sub.textContent = cancelled
        ? 'No pickup was completed for your zone today.'
        : 'Thanks for keeping Jose Dalman clean';
}

function applyStatusToUI(status) {
    routeStatus = status;
    const statusEl = document.getElementById('todayTruck');
    if (status === 'completed') {
        showCompletionBanner(false);
    } else if (status === 'cancelled') {
        showCompletionBanner(true);
    } else {
        resetCollectionBanner();
    }
}

async function loadTodayTruck() {
    const statusEl = document.getElementById('todayTruck');
    resetCollectionBanner();
    try {
        const data = await apiFetch('/api/resident/today-truck');
        if (!data) {
            statusEl.textContent = 'No truck assigned today.';
            currentAssignmentId = null;
            routeStatus = null;
            initMap();
            startUserTracking();
            return;
        }
        currentTruckId = data.truck_id;
        currentAssignmentId = data.id || null;
        routeStarted = !!data.route_started;
        hasLiveTruckLocation = !!data.has_live_location;
        routeStatus = data.status || (routeStarted ? 'in_progress' : 'pending');

        if (routeStatus === 'completed') {
            statusEl.innerHTML = `<strong>${data.plate_number}</strong> — ${data.zone_name} <span style="color:var(--success)">· Collection complete ✓</span>`;
            showCompletionBanner(false);
        } else if (routeStatus === 'cancelled') {
            statusEl.innerHTML = `<strong>${data.plate_number}</strong> — ${data.zone_name} <span style="color:var(--text-3)">· Route cancelled</span>`;
            showCompletionBanner(true);
        } else if (!routeStarted) {
            statusEl.innerHTML = `<strong>${data.plate_number}</strong> — ${data.zone_name} <span style="color:var(--amber)">· Not on route yet</span>`;
        } else if (!hasLiveTruckLocation) {
            statusEl.innerHTML = `<strong>${data.plate_number}</strong> — ${data.zone_name} <span style="color:var(--amber)">· Waiting for GPS…</span>`;
        } else {
            statusEl.innerHTML = `<strong>${data.plate_number}</strong> — ${data.zone_name}`;
        }

        if (data.route_id) {
            try {
                const routeData = await apiFetch(`/api/resident/route-waypoints?route_id=${data.route_id}`);
                const parsed = parseWaypointsJson(routeData.raw_waypoints || routeData.waypoints_json);
                if (parsed.road.length || parsed.pins.length || parsed.mrfs.length) {
                    initMap(parsed.road[0]?.lat || DEFAULT_CENTER.lat, parsed.road[0]?.lng || DEFAULT_CENTER.lng);
                    showRouteWithTrail(parsed);
                } else {
                    initMap();
                }
            } catch (e) {
                console.warn('route-waypoints failed', e);
                initMap();
            }
        } else {
            initMap();
        }

        if (routeStarted && hasLiveTruckLocation && data.latitude && data.longitude) {
            placeTruckMarker(data.latitude, data.longitude, false);
        }

        startUserTracking();

        if (routeStarted && routeStatus === 'in_progress') {
            pollTruckLocation();
            setInterval(pollTruckLocation, 10000);
        }
    } catch (err) {
        console.error('loadTodayTruck failed:', err);
        statusEl.textContent = 'Failed to load truck.';
        initMap();
        startUserTracking();
    }
}

async function pollTruckLocation() {
    if (!currentTruckId || routeStatus !== 'in_progress') return;
    try {
        console.log(`Polling truck ${currentTruckId} location...`);
        const logs = await apiFetch(`/api/resident/truck/${currentTruckId}/location`);
        if (logs && logs.length > 0 && logs[0].latitude && logs[0].longitude) {
            hasLiveTruckLocation = true;
            placeTruckMarker(logs[0].latitude, logs[0].longitude, true);
            const statusEl = document.getElementById('todayTruck');
            if (statusEl && statusEl.innerHTML.includes('Waiting for GPS')) {
                loadTodayTruck();
            }
        }
    } catch (e) {
        console.warn('Truck poll failed:', e);
    }
}

let residentSocket = null;

function connectResidentSocket() {
    if (!window.io) {
        console.warn('Socket.IO not loaded, using polling fallback');
        return;
    }

    if (residentSocket && residentSocket.connected) {
        console.log('Socket already connected');
        return;
    }

    console.log('Connecting resident socket...');
    residentSocket = window.io(window.location.origin, {
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000
    });

    residentSocket.on('connect', () => {
        console.log('✅ Resident socket connected successfully');
        showToast('Live updates connected!');
    });

    residentSocket.on('connect_error', (err) => {
        console.warn('Resident socket connection error:', err.message);
    });

    residentSocket.on('truck-location', (data) => {
        console.log('📍 Truck location update received:', data);
        if (!currentTruckId || !data || String(data.truckId) !== String(currentTruckId)) return;
        if (routeStatus !== 'in_progress') return;

        hasLiveTruckLocation = true;
        placeTruckMarker(data.latitude, data.longitude, true);

        const statusEl = document.getElementById('todayTruck');
        if (statusEl && statusEl.innerHTML.includes('Waiting for GPS')) {
            loadTodayTruck();
        }
    });

    residentSocket.on('assignment-public-status', (data) => {
        console.log('📢 Assignment status update:', data);
        if (!currentAssignmentId || !data || String(data.assignmentId) !== String(currentAssignmentId)) return;

        const prevStatus = routeStatus;
        applyStatusToUI(data.status);

        if (data.status === 'in_progress' && prevStatus !== 'in_progress') {
            routeStarted = true;
            showToast('Your collection truck is on the way!');
            loadTodayTruck();
            pollTruckLocation();
        } else if (data.status === 'completed') {
            showToast('Today\'s pickup is complete!');
        } else if (data.status === 'cancelled') {
            showToast('Route cancelled for today', 'info');
        }
    });
}

async function loadProfile() {
    try {
        const p = await apiFetch('/api/resident/profile');
        window._profile = p;
        const displayName = p.name || 'Resident';
        const initial = displayName.trim().charAt(0).toUpperCase() || 'R';

        ['navUserName', 'navUserNameTop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = displayName;
        });
        ['userInitial', 'userInitialTop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = initial;
        });

        const pName = document.getElementById('profileName');
        const pEmail = document.getElementById('profileEmail');
        const pPhone = document.getElementById('profilePhone');
        if (pName) pName.value = p.name || '';
        if (pEmail) pEmail.value = p.email || '';
        if (pPhone) pPhone.value = p.phone || '';
    } catch (e) {
        console.warn('loadProfile failed', e);
        ['navUserName', 'navUserNameTop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'Resident';
        });
    }
}

async function handleProfileSave(e) {
    e.preventDefault();
    const name = document.getElementById('profileName')?.value.trim();
    const phone = document.getElementById('profilePhone')?.value.trim();
    if (!name) { showToast('Name is required', 'error'); return; }
    try {
        await apiFetch('/api/resident/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone })
        });
        showToast('Profile updated');
        loadProfile();
    } catch (err) {
        console.error(err);
        showToast('Failed to update profile', 'error');
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    const current = document.getElementById('currentPassword')?.value;
    const next = document.getElementById('newPassword')?.value;
    const confirmVal = document.getElementById('confirmPassword')?.value;
    if (!current || !next) { showToast('Fill in all password fields', 'error'); return; }
    if (next.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
    if (next !== confirmVal) { showToast('Passwords do not match', 'error'); return; }
    try {
        await apiFetch('/api/resident/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: current, new_password: next })
        });
        showToast('Password changed successfully');
        ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    } catch (err) {
        console.error(err);
        showToast('Failed to change password. Check your current password.', 'error');
    }
}

let reportPhotoBase64 = null,
    reportLat = null,
    reportLng = null;

function updateCharCount() {
    const len = document.getElementById('rdesc')?.value.length || 0;
    const countEl = document.getElementById('charCount');
    if (countEl) countEl.textContent = `${len} / 500`;
}

function compressImage(file, maxDim = 1600, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Could not read file'));
        reader.onload = ev => {
            const img = new Image();
            img.onerror = () => reject(new Error('Invalid image file'));
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const scale = maxDim / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const dropZone = document.getElementById('photoDrop');
    const originalLabel = dropZone?.querySelector('.photo-drop-label')?.textContent;
    const labelEl = dropZone?.querySelector('.photo-drop-label');
    if (labelEl) labelEl.textContent = 'Processing photo…';

    compressImage(file).then(dataUrl => {
        reportPhotoBase64 = dataUrl;
        const previewImg = document.getElementById('photoPreviewImg');
        const previewWrap = document.getElementById('photoPreviewWrap');
        if (previewImg) previewImg.src = reportPhotoBase64;
        if (previewWrap) previewWrap.style.display = 'block';
        if (dropZone) dropZone.style.display = 'none';
    }).catch(err => {
        console.error('Photo processing failed:', err);
        showToast('Could not process that photo. Try another.', 'error');
        if (labelEl && originalLabel) labelEl.textContent = originalLabel;
        e.target.value = '';
    });
}

function removePhoto() {
    reportPhotoBase64 = null;
    const photoInput = document.getElementById('photoInput');
    const previewWrap = document.getElementById('photoPreviewWrap');
    const dropZone = document.getElementById('photoDrop');
    const labelEl = dropZone?.querySelector('.photo-drop-label');
    if (photoInput) photoInput.value = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (dropZone) dropZone.style.display = 'block';
    if (labelEl) labelEl.textContent = 'Tap to take a photo or choose from gallery';
}

function captureLocation() {
    const row = document.getElementById('locRow');
    const txt = document.getElementById('locText');
    if (txt) txt.textContent = 'Getting location…';
    navigator.geolocation?.getCurrentPosition(
        pos => {
            reportLat = pos.coords.latitude;
            reportLng = pos.coords.longitude;
            if (row) row.className = 'loc-row got';
            if (txt) txt.textContent = `${reportLat.toFixed(5)}, ${reportLng.toFixed(5)}  ±${Math.round(pos.coords.accuracy)}m`;
            showToast('Location captured', 'success');
        },
        () => {
            if (lastKnownLocation) {
                reportLat = lastKnownLocation.lat;
                reportLng = lastKnownLocation.lng;
                if (row) row.className = 'loc-row got';
                if (txt) txt.textContent = `${reportLat.toFixed(5)}, ${reportLng.toFixed(5)} (from last known)`;
                showToast('Using last known location', 'info');
            } else {
                if (row) row.className = 'loc-row err';
                if (txt) txt.textContent = 'Location unavailable';
                showToast('Could not get location', 'error');
            }
        }, { enableHighAccuracy: true, timeout: 10000 }
    );
}

function handleReportSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('rtype')?.value;
    const desc = document.getElementById('rdesc')?.value.trim();

    if (!desc) { showToast('Please describe the issue.', 'error'); return; }
    if (reportLat === null || reportLng === null) { showToast('Please capture your location first.', 'error'); return; }
    if (!reportPhotoBase64) { showToast('Please take a photo of the issue.', 'error'); return; }

    const modalIcon = document.getElementById('modalIcon');
    const modalTitle = document.getElementById('modalTitle');
    const modalMsg = document.getElementById('modalMsg');
    if (modalIcon) modalIcon.innerHTML = TYPE_ICONS[type] || TYPE_ICONS.other;
    if (modalTitle) modalTitle.textContent = `Report: ${TYPE_LABELS[type]}`;
    if (modalMsg) modalMsg.textContent = `"${desc.slice(0, 120)}${desc.length > 120 ? '…' : ''}"`;
    const mpi = document.getElementById('modalPreviewImg');
    if (mpi) {
        if (reportPhotoBase64) {
            mpi.src = reportPhotoBase64;
            mpi.style.display = 'block';
        } else { mpi.style.display = 'none'; }
    }
    const ml = document.getElementById('modalLoc');
    if (ml) {
        if (reportLat !== null) {
            ml.innerHTML = `${ICON_PIN}${reportLat.toFixed(5)}, ${reportLng.toFixed(5)}`;
            ml.style.display = 'flex';
        } else { ml.style.display = 'none'; }
    }
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('open');
    const modalCancel = document.getElementById('modalCancel');
    const modalConfirm = document.getElementById('modalConfirm');
    if (modalCancel) modalCancel.onclick = () => modal.classList.remove('open');
    if (modalConfirm) modalConfirm.onclick = () => {
        modal.classList.remove('open');
        submitReport(type, desc);
    };
}

async function submitReport(type, desc) {
    const btn = document.getElementById('submitBtn');
    if (btn) {
        btn.textContent = 'Submitting…';
        btn.disabled = true;
    }
    const payload = { type, description: desc };
    if (reportLat !== null) payload.latitude = reportLat;
    if (reportLng !== null) payload.longitude = reportLng;
    if (reportPhotoBase64) payload.image_url = reportPhotoBase64;
    try {
        await apiFetch('/api/resident/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const descField = document.getElementById('rdesc');
        if (descField) descField.value = '';
        updateCharCount();
        removePhoto();
        reportLat = null;
        reportLng = null;
        const locRow = document.getElementById('locRow');
        const locText = document.getElementById('locText');
        if (locRow) locRow.className = 'loc-row';
        if (locText) locText.textContent = 'Location not yet captured';
        showToast('Report submitted successfully!');
        if (btn) {
            btn.textContent = '✓ Submitted';
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = 'Submit Report <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
                    btn.disabled = false;
                }
            }, 3000);
        }
    } catch (err) {
        console.error('submitReport failed:', err);
        showToast('Submission failed. Try again.', 'error');
        if (btn) {
            btn.innerHTML = 'Submit Report <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';
            btn.disabled = false;
        }
    }
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerHTML = `<span class="icon">${TOAST_ICONS[type] || TOAST_ICONS.success}</span><span>${msg}</span>`;
    t.className = 'show';
    setTimeout(() => t.classList.remove('show'), 3500);
}

Object.assign(window, {
    setTile,
    centerOnUser,
    toggleShareLocation,
    captureLocation,
    handlePhotoChange,
    removePhoto,
    handleReportSubmit,
    updateCharCount,
    toggleScheduleAll,
    toggleAnnAll,
    expandAnn,
    toggleSidebar,
    closeSidebar,
    toggleTheme,
    openModal,
    closeModal,
    switchProfileTab,
    switchTermsTab,
    handleProfileSave,
    handlePasswordChange
});

loadTodayTruck();
loadSchedule();
loadAnnouncements();
loadProfile();
connectResidentSocket();