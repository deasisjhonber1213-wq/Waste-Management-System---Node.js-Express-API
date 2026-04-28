const reportsTbody = document.querySelector("#reportsTable tbody");

async function loadReports() {
    const res = await fetch("/api/admin/reports", {
        headers: { "Authorization": "Bearer " + token }
    });
    const reports = await res.json();
    reportsTbody.innerHTML = reports.map(r => `
        <tr>
            <td>${r.resident_id}</td>
            <td>${r.type}</td>
            <td>${r.description}</td>
            <td>${r.status}</td>
        </tr>
    `).join("");
}

loadReports();