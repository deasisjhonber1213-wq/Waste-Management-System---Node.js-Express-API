async function loadProfile() {
    const res = await fetch("/api/admin/profile", { headers: { Authorization: token } });
    const data = await res.json();
    document.getElementById("name").value = data.name;
    document.getElementById("email").value = data.email;
}

async function updateProfile() {
    const name = document.getElementById("name").value;
    const email = document.getElementById("email").value;

    await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ name, email })
    });
    alert("Profile updated!");
}

loadProfile();