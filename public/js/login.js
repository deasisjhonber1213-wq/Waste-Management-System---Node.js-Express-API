const API_URL = window.location.origin + "/api";

document.getElementById("togglePasswordBtn")?.addEventListener("click", function () {
    const input = document.getElementById("password");
    const eye = this.querySelector(".icon-eye");
    const eyeOff = this.querySelector(".icon-eye-off");
    const showing = input.type === "text";

    // Clean toggle — no blink animation
    input.type = showing ? "password" : "text";
    if (eye) eye.hidden = !showing;
    if (eyeOff) eyeOff.hidden = showing;
    this.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

function showAlert(html, type) {
    const el = document.getElementById("alertBox");
    el.innerHTML = html;
    el.className = "alert " + type;
}

function clearAlert() {
    const el = document.getElementById("alertBox");
    el.className = "alert";
    el.textContent = "";
}

function resetButton(btn, btnText, btnLoader) {
    btn.disabled = false;
    btnText.hidden = false;
    btnLoader.hidden = true;
}

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
        } else if (res.status === 403 && data.requiresVerification) {
            showAlert(data.message || "Please verify your email before signing in.", "error");
            setTimeout(() => {
                window.location = `/verify-email?email=${encodeURIComponent(data.email || email)}`;
            }, 1500);
        } else {
            showAlert(data.error || data.message || "Invalid credentials", "error");
            resetButton(btn, btnText, btnLoader);
        }
    } catch (err) {
        console.error(err);
        showAlert("Connection error. Please try again.", "error");
        resetButton(btn, btnText, btnLoader);
    }
}

document.addEventListener("keydown", e => {
    if (e.key === "Enter") login();
});

document.getElementById("loginBtn")?.addEventListener("click", login);