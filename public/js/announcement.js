const token = localStorage.getItem("token");
const list = document.getElementById("announcementList");

// Load announcements
async function loadAnnouncements() {
    const res = await fetch("/api/admin/announcements", {
        headers: { Authorization: token }
    });
    const data = await res.json();

    list.innerHTML = data.map(a => `
        <div class="card">
            <h3>${a.title}</h3>
            <p>${a.message}</p>
            <p><b>Pickup Date:</b> ${a.pickup_date || "-"}</p>
            <p><b>By Admin:</b> ${a.admin_name}</p>
            <button class="danger" onclick="deleteAnnouncement(${a.id})">Delete</button>
        </div>
    `).join("");
}

// Create a new announcement
async function createAnnouncement() {
    const title = document.getElementById("title").value;
    const message = document.getElementById("message").value;
    const pickup_date = document.getElementById("pickup_date").value;

    if (!title || !message) {
        alert("Title and Message are required!");
        return;
    }

    await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ title, message, pickup_date })
    });

    // Clear input fields
    document.getElementById("title").value = "";
    document.getElementById("message").value = "";
    document.getElementById("pickup_date").value = "";

    // Refresh the list
    loadAnnouncements();
}

// Delete announcement
async function deleteAnnouncement(id) {
    if (!confirm("Are you sure you want to delete this announcement?")) return;

    await fetch(`/api/admin/announcements/${id}`, {
        method: "DELETE",
        headers: { Authorization: token }
    });

    loadAnnouncements();
}

// Initial load
loadAnnouncements();