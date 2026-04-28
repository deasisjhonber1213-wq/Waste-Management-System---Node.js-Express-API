const token = localStorage.getItem("token");
const tbody = document.querySelector("#trucksTable tbody");

async function loadTrucks() {
    const res = await fetch("/api/admin/trucks", {
        headers: { "Authorization": "Bearer " + token }
    });
    const trucks = await res.json();
    tbody.innerHTML = trucks.map(t => `
        <tr>
            <td>${t.plate_number}</td>
            <td>${t.model}</td>
            <td>${t.status}</td>
        </tr>
    `).join("");
}

async function addTruck() {
    const plate_number = document.getElementById("plate_number").value;
    const model = document.getElementById("model").value;

    await fetch("/api/admin/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ plate_number, model })
    });
    loadTrucks();
}

loadTrucks();