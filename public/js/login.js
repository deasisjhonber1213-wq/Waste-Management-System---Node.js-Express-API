const API_URL = window.location.origin + "/api";

document.getElementById("togglePasswordBtn")?.addEventListener("click", function () {
    const input = document.getElementById("password");
    const eye = this.querySelector(".icon-eye");
    const eyeOff = this.querySelector(".icon-eye-off");
    const showing = input.type === "text";

    input.type = showing ? "password" : "text";
    eye.hidden = !showing;
    eyeOff.hidden = showing;
    this.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

document.addEventListener("keydown", e => {
    if (e.key === "Enter") login();
});

document.getElementById("loginBtn")?.addEventListener("click", login);

async function login() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("loginBtn");
    const btnText = btn.querySelector(".btn-text");
    const btnLoader = btn.querySelector(".btn-loader");

    clearAlert();

    if (!email || !password) {
        showAlert("Email and password are required.", "error");
        return;
    }

    btn.disabled = true;
    btnText.hidden = true;
    btnLoader.hidden = false;

    try {
        const res = await fetch(API_URL + "/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            localStorage.setItem("role", data.role);

            showAlert("Signed in successfully. Redirecting…", "success");

            setTimeout(() => {
                if (data.role === "admin") window.location = "/admin/dashboard";
                else if (data.role === "driver") window.location = "/driver/dashboard";
                else window.location = "/resident/dashboard";
            }, 900);
        } else {
            showAlert(data.error || data.message || "Invalid credentials", "error");
            btn.disabled = false;
            btnText.hidden = false;
            btnLoader.hidden = true;
        }
    } catch (err) {
        console.error(err);
        showAlert("Connection error. Please try again.", "error");
        btn.disabled = false;
        btnText.hidden = false;
        btnLoader.hidden = true;
    }
}

function showAlert(msg, type) {
    const el = document.getElementById("alertBox");
    el.textContent = msg;
    el.className = "alert " + type;
}

function clearAlert() {
    const el = document.getElementById("alertBox");
    el.className = "alert";
    el.textContent = "";
}