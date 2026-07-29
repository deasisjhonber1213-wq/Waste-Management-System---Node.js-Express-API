
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

let allTrucks = [];
let selectedTruck = null;
let fleetMap = null;
let mapMarkers = [];
let isFleetMapSatellite = false;
let detailMapInstance = null;

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

let fleetTiles = null;

function applyTile(map, tiles, isSat) {
    Object.values(tiles).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
    if (isSat) {
        tiles.sat.addTo(map);
        tiles.label.addTo(map);
    } else { tiles.dark.addTo(map); }
}

function toggleFleetMapSatellite() {
    if (!fleetMap || !fleetTiles) return;
    isFleetMapSatellite = !isFleetMapSatellite;
    applyTile(fleetMap, fleetTiles, isFleetMapSatellite);
    const btn = document.getElementById('fleetSatBtn');
    btn.innerHTML = isFleetMapSatellite ? '🌍 Map' : '🛰️ Satellite';
    btn.classList.toggle('active', isFleetMapSatellite);
    showToast(isFleetMapSatellite ? "Satellite view" : "Dark map view", "info");
}

function centerMapOnTrucks() {
    if (!fleetMap) return;
    const positioned = allTrucks.filter(t => t.latitude != null && t.longitude != null);
    if (positioned.length === 0) {
        showToast("No trucks with location data to center on", "info");
        return;
    }
    if (positioned.length === 1) {
        fleetMap.setView([positioned[0].latitude, positioned[0].longitude], 13);
    } else {
        const bounds = L.latLngBounds(positioned.map(t => [t.latitude, t.longitude]));
        fleetMap.fitBounds(bounds.pad(0.2));
    }
    showToast(`Centered on ${positioned.length} truck${positioned.length !== 1 ? 's' : ''}`, "success");
}

function escHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDateTime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
}

function hoursAgo(d) {
    if (!d) return null;
    return (Date.now() - new Date(d).getTime()) / 36e5;
}

function freshnessClass(d) {
    const h = hoursAgo(d);
    if (h === null) return "";
    if (h < 1) return "fresh";
    if (h < 12) return "stale";
    return "old";
}

function freshnessLabel(d) {
    const h = hoursAgo(d);
    if (h === null) return "No position recorded";
    if (h < 1) return `Updated ${Math.round(h * 60)}m ago`;
    if (h < 24) return `Updated ${Math.round(h)}h ago`;
    return `Updated ${Math.round(h / 24)}d ago — likely stale`;
}

function dotColor(d) {
    const h = hoursAgo(d);
    if (h === null) return "#555";
    if (h < 1) return "#4ade80";
    if (h < 12) return "#fbb034";
    return "#f87171";
}

async function loadTrucks() {
    try {
        const res = await API.get("/admin/trucks");
        if (!res.ok) throw new Error();
        allTrucks = await res.json();
        document.getElementById("truckCount").textContent =
            `${allTrucks.length} truck${allTrucks.length !== 1 ? "s" : ""}`;
        document.getElementById("mapTruckCount").textContent =
            `📍 ${allTrucks.filter(t => t.latitude != null && t.longitude != null).length} trucks on map`;
        renderTruckList(allTrucks);
        renderFleetMap(allTrucks);
        if (selectedTruck) {
            const fresh = allTrucks.find(t => t.id === selectedTruck.id);
            if (fresh) selectedTruck = fresh;
            renderDetail(selectedTruck);
        }
    } catch (e) {
        console.error('Load trucks error:', e);
        showToast("Failed to load trucks", "error");
    }
}

function renderTruckList(data) {
    const c = document.getElementById('truckList');
    if (!data.length) {
        c.innerHTML = `<div class="empty-state">
                    <div class="empty-state-icon">🚛</div>
                    <div class="empty-state-text">No trucks added yet</div>
                    <button class="btn btn-gold btn-sm" onclick="openModal('addTruckModal')" style="margin-top:12px;">+ Add First Truck</button>
                </div>`;
        return;
    }
    c.innerHTML = data.map(t => {
        const isActive = selectedTruck?.id === t.id;
        return `<div class="truck-card ${isActive ? 'active' : ''}" onclick="selectTruck(${t.id})">
                    <div class="truck-plate">🚛 ${escHtml(t.plate_number)}</div>
                    <div class="truck-model">${escHtml(t.model || "Unknown model")}</div>
                    <div class="truck-coords">
                        <div class="truck-coords-row">
                            <span>LAT: ${t.latitude != null ? Number(t.latitude).toFixed(5) : "—"}</span>
                            <span>LNG: ${t.longitude != null ? Number(t.longitude).toFixed(5) : "—"}</span>
                        </div>
                        <div class="location-time ${freshnessClass(t.location_updated_at)}">
                            <div class="location-time-dot"></div>
                            ${freshnessLabel(t.location_updated_at)}
                        </div>
                    </div>
                    <div class="truck-meta">
                        <span class="badge badge-gray">📅 ${fmtDate(t.created_at)}</span>
                        <span class="badge badge-gold">🆔 #${t.id}</span>
                    </div>
                </div>`;
    }).join('');
}

function filterTrucks() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    renderTruckList(allTrucks.filter(t => t.plate_number.toLowerCase().includes(q) ||
        (t.model && t.model.toLowerCase().includes(q))));
}

function selectTruck(id) {
    selectedTruck = allTrucks.find(t => t.id === id);
    if (!selectedTruck) return;
    renderTruckList(allTrucks);
    renderDetail(selectedTruck);
    if (fleetMap && selectedTruck.latitude != null && selectedTruck.longitude != null) {
        fleetMap.setView([selectedTruck.latitude, selectedTruck.longitude], 15);
    }
}

function renderDetail(truck) {
    document.getElementById('detailActions').innerHTML = `
                <button class="btn btn-outline btn-sm" onclick="openEditModal(${truck.id})">✏️ Edit</button>
                <button class="btn btn-outline btn-sm" onclick="openLocModal(${truck.id})">📍 Location</button>
                <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${truck.id},'${escHtml(truck.plate_number)}')">🗑️ Delete</button>
            `;

    const freshness = freshnessClass(truck.location_updated_at);
    const detailMapHtml = (truck.latitude != null && truck.longitude != null) ? `
                <div style="margin-top:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span class="text-muted text-mono" style="font-size:0.65rem;">📍 TRUCK LOCATION</span>
                        <button class="btn btn-outline btn-sm" onclick="centerTruckOnMap(${truck.id})" style="padding:3px 10px;font-size:0.65rem;">🎯 Center on Map</button>
                    </div>
                    <div id="truckDetailMap"></div>
                </div>
            ` : `<div style="margin-top:12px;color:var(--text2);font-size:0.8rem;padding:12px;background:var(--bg3);border-radius:8px;text-align:center;">📍 No location data for this truck</div>`;

    document.getElementById('truckDetailBody').innerHTML = `
                <div>
                    <div class="detail-zone-name">🚛 ${escHtml(truck.plate_number)}</div>
                    <div class="detail-desc">${escHtml(truck.model || "No model specified.")}</div>
                    <div class="detail-stats">
                        <div class="detail-stat">📍 <span class="num">${truck.latitude != null ? Number(truck.latitude).toFixed(6) : "—"}</span></div>
                        <div class="detail-stat">📍 <span class="num">${truck.longitude != null ? Number(truck.longitude).toFixed(6) : "—"}</span></div>
                        <div class="detail-stat">🕒 <span class="num ${freshness}">${fmtDateTime(truck.location_updated_at)}</span></div>
                        <div class="detail-stat">📅 <span class="num">${fmtDate(truck.created_at)}</span></div>
                    </div>
                    ${detailMapHtml}
                </div>
            `;

    if (truck.latitude != null && truck.longitude != null) {
        setTimeout(() => initTruckDetailMap(truck), 100);
    }
}

function initTruckDetailMap(truck) {
    const container = document.getElementById('truckDetailMap');
    if (!container) return;

    if (detailMapInstance) {
        detailMapInstance.remove();
        detailMapInstance = null;
    }

    detailMapInstance = L.map(container, { zoomControl: true }).setView(
        [truck.latitude, truck.longitude], 14
    );

    const tiles = makeTiles();
    applyTile(detailMapInstance, tiles, false);
    detailMapInstance.invalidateSize();

    if (truck.latitude != null && truck.longitude != null) {
        const color = dotColor(truck.location_updated_at);
        const icon = L.divIcon({
            className: "",
            html: `<div class="truck-marker" style="border-color:#fff;box-shadow:0 0 0 3px ${color}, 0 0 14px ${color};"><span>🚛</span></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        L.marker([truck.latitude, truck.longitude], { icon })
            .addTo(detailMapInstance)
            .bindPopup(`
                        <strong style="font-family:monospace">${escHtml(truck.plate_number)}</strong><br>
                        ${escHtml(truck.model || "")}<br>
                        <span style="font-size:11px;color:#888">
                            Last update: ${fmtDateTime(truck.location_updated_at)}
                        </span>
                    `);
    }
    setTimeout(() => detailMapInstance.invalidateSize(), 200);
}

function centerTruckOnMap(id) {
    const truck = allTrucks.find(t => t.id === id);
    if (!truck || truck.latitude == null || truck.longitude == null) {
        showToast("Truck has no location data", "info");
        return;
    }
    if (fleetMap) {
        fleetMap.setView([truck.latitude, truck.longitude], 15);
        showToast(`Centered on ${truck.plate_number}`, "success");
    }
}

function renderFleetMap(data) {
    if (!fleetMap) {
        fleetMap = L.map("fleetMap", { zoomControl: true }).setView([14.5995, 120.9842], 12);
        fleetTiles = makeTiles();
        applyTile(fleetMap, fleetTiles, false);
        setTimeout(() => fleetMap.invalidateSize(), 100);
    }

    mapMarkers.forEach(m => {
        if (fleetMap.hasLayer(m)) fleetMap.removeLayer(m);
    });
    mapMarkers = [];

    const positioned = data.filter(t => t.latitude != null && t.longitude != null);
    positioned.forEach(t => {
        const color = dotColor(t.location_updated_at);
        const icon = L.divIcon({
            className: "",
            html: `<div class="truck-marker" style="border-color:#fff;box-shadow:0 0 0 3px ${color}, 0 0 14px ${color};"><span>🚛</span></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        const m = L.marker([t.latitude, t.longitude], { icon })
            .addTo(fleetMap)
            .bindPopup(`
                        <strong style="font-family:monospace">${escHtml(t.plate_number)}</strong><br>
                        ${escHtml(t.model || "")}<br>
                        <span style="font-size:11px;color:#888">
                            Last update: ${fmtDateTime(t.location_updated_at)}
                        </span><br>
                        <button class="btn btn-outline btn-sm" onclick="selectTruck(${t.id})" style="margin-top:6px;">View Details</button>
                    `);
        mapMarkers.push(m);
    });

    if (positioned.length > 0 && positioned.length <= 3) {
        const bounds = L.latLngBounds(positioned.map(t => [t.latitude, t.longitude]));
        fleetMap.fitBounds(bounds.pad(0.3));
    } else if (positioned.length > 3) {
        const bounds = L.latLngBounds(positioned.map(t => [t.latitude, t.longitude]));
        fleetMap.fitBounds(bounds.pad(0.15));
    }

    setTimeout(() => fleetMap.invalidateSize(), 200);
}

async function addTruck() {
    const plate = document.getElementById("tPlate").value.trim();
    const model = document.getElementById("tModel").value.trim();
    if (!plate) { showToast("Plate number is required", "error"); return; }
    try {
        const res = await API.post("/admin/trucks", { plate_number: plate, model });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        closeModal("addTruckModal");
        document.getElementById("tPlate").value = "";
        document.getElementById("tModel").value = "";
        showToast("Truck added successfully", "success");
        loadTrucks();
    } catch (e) { showToast(e.message || "Failed to add truck", "error"); }
}

function openEditModal(id) {
    const truck = allTrucks.find(t => t.id === id);
    if (!truck) return;
    document.getElementById("editTruckId").value = id;
    document.getElementById("editPlate").value = truck.plate_number;
    document.getElementById("editModel").value = truck.model || "";
    openModal("editTruckModal");
}

async function saveTruckEdit() {
    const id = document.getElementById("editTruckId").value;
    const plate = document.getElementById("editPlate").value.trim();
    const model = document.getElementById("editModel").value.trim();
    if (!plate) { showToast("Plate number is required", "error"); return; }
    try {
        const res = await API.put(`/admin/trucks/${id}`, { plate_number: plate, model });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        closeModal("editTruckModal");
        showToast("Truck updated successfully", "success");
        loadTrucks();
    } catch (e) { showToast(e.message || "Update failed", "error"); }
}

function openDeleteModal(id, plate) {
    document.getElementById("deleteTruckId").value = id;
    document.getElementById("deleteTruckName").textContent = plate;
    openModal("deleteTruckModal");
}

async function confirmDeleteTruck() {
    const id = document.getElementById("deleteTruckId").value;
    try {
        const res = await API.del(`/admin/trucks/${id}`);
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        closeModal("deleteTruckModal");
        showToast("Truck deleted", "success");
        selectedTruck = null;
        document.getElementById('truckDetailBody').innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🚛</div>
                        <div class="empty-state-text">Select a truck</div>
                    </div>`;
        document.getElementById('detailActions').innerHTML = '';
        loadTrucks();
    } catch (e) { showToast(e.message || "Delete failed", "error"); }
}

function openLocModal(id) {
    document.getElementById("locTruckId").value = id;
    document.getElementById("locLat").value = "";
    document.getElementById("locLng").value = "";
    openModal("updateLocModal");
}

async function updateLocation() {
    const id = document.getElementById("locTruckId").value;
    const lat = parseFloat(document.getElementById("locLat").value);
    const lng = parseFloat(document.getElementById("locLng").value);
    if (isNaN(lat) || isNaN(lng)) { showToast("Both fields are required", "error"); return; }
    if (lat < -90 || lat > 90) { showToast("Latitude must be -90 to 90", "error"); return; }
    if (lng < -180 || lng > 180) { showToast("Longitude must be -180 to 180", "error"); return; }
    try {
        const res = await API.put(`/admin/trucks/${id}/location`, { latitude: lat, longitude: lng });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
        closeModal("updateLocModal");
        showToast("Location updated — timestamp recorded", "success");
        loadTrucks();
    } catch (e) { showToast(e.message || "Update failed", "error"); }
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

window.addTruck = addTruck;
window.openEditModal = openEditModal;
window.saveTruckEdit = saveTruckEdit;
window.openLocModal = openLocModal;
window.updateLocation = updateLocation;
window.openDeleteModal = openDeleteModal;
window.confirmDeleteTruck = confirmDeleteTruck;
window.centerMapOnTrucks = centerMapOnTrucks;
window.toggleFleetMapSatellite = toggleFleetMapSatellite;
window.selectTruck = selectTruck;
window.filterTrucks = filterTrucks;
window.centerTruckOnMap = centerTruckOnMap;

loadAdminProfile();
loadTrucks();

window.addEventListener('resize', () => {
    if (fleetMap) setTimeout(() => fleetMap.invalidateSize(), 100);
    if (detailMapInstance) setTimeout(() => detailMapInstance.invalidateSize(), 100);
});
