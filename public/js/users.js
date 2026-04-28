const token = localStorage.getItem("token");
const tbody = document.querySelector("#usersTable tbody");

async function loadUsers() {
    const res = await fetch("/api/admin/users", {
        headers: { "Authorization": "Bearer " + token }
    });
    const users = await res.json();

    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${u.role}</td>
            <td>
                <button class="danger" onclick="deleteUser(${u.id})">Delete</button>
            </td>
        </tr>
    `).join("");
}

async function deleteUser(id) {
    await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: token }
    });
    loadUsers();
}

loadUsers();