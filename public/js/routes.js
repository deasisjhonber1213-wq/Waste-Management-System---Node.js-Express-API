const routesTbody = document.querySelector("#routesTable tbody");

async function loadRoutes() {
    const res = await fetch("/api/admin/routes", { headers: { Authorization: token } });
    const routes = await res.json();
    routesTbody.innerHTML = routes.map(r => `
        <tr>
            <td>${r.zone_name}</td>
            <td>${r.description}</td>
        </tr>
    `).join("");
}

async function addRoute() {
    const zone_name = document.getElementById("zone_name").value;
    const description = document.getElementById("description").value;

    await fetch("/api/admin/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ zone_name, description })
    });
    loadRoutes();
}

loadRoutes();