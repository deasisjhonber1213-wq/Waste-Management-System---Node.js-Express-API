const map = L.map('map').setView([14.5995, 120.9842], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
    .addTo(map);

async function loadTrucks() {
    const res = await fetch('/api/admin/trucks');
    const trucks = await res.json();

    trucks.forEach(t => {
        if (t.latitude) {
            L.marker([t.latitude, t.longitude])
                .addTo(map)
                .bindPopup(t.plate_number);
        }
    });
}
loadTrucks();