const API_URL = window.location.origin + "/api";

document.getElementById("togglePasswordBtn")?.addEventListener("click", function () {
    const input = document.getElementById("password");
    if (!input) return;
    const eye = this.querySelector(".icon-eye");
    const eyeOff = this.querySelector(".icon-eye-off");
    const showing = input.type === "text";

    input.type = showing ? "password" : "text";
    if (eye) eye.hidden = !showing;
    if (eyeOff) eyeOff.hidden = showing;
    this.setAttribute("aria-label", showing ? "Show password configuration" : "Hide password field visibility");
});

function showAlert(html, type) {
    const el = document.getElementById("alertBox");
    if (!el) return;
    el.innerHTML = html;
    el.className = "alert " + type;
}

function clearAlert() {
    const el = document.getElementById("alertBox");
    if (el) {
        el.className = "alert";
        el.textContent = "";
    }
}

function resetButton(btn, btnText, btnLoader) {
    if (!btn) return;
    btn.disabled = false;
    if (btnText) btnText.hidden = false;
    if (btnLoader) btnLoader.hidden = true;
}

async function login() {
    const emailElement = document.getElementById("email");
    const passwordElement = document.getElementById("password");
    if (!emailElement || !passwordElement) return;

    const email = emailElement.value.trim().toLowerCase();
    const password = passwordElement.value;
    const btn = document.getElementById("loginBtn");
    const btnText = btn?.querySelector(".btn-text");
    const btnLoader = btn?.querySelector(".btn-loader");

    clearAlert();

    if (!email || !password) {
        showAlert("Both email identity and portal password are required fields.", "error");
        return;
    }

    if (btn) {
        btn.disabled = true;
        if (btnText) btnText.hidden = true;
        if (btnLoader) btnLoader.hidden = false;
    }

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

            showAlert("Securely authenticated. Launching your environment...", "success");

            setTimeout(() => {
                if (data.role === "admin") window.location = "/admin/dashboard";
                else if (data.role === "driver") window.location = "/driver/dashboard";
                else window.location = "/resident/dashboard";
            }, 800);
        } else {
            showAlert(data.error || data.message || "Invalid account credentials entered.", "error");
            resetButton(btn, btnText, btnLoader);
        }
    } catch (err) {
        console.error("Auth Failure Matrix Trace:", err);
        showAlert("Gateway transmission failure. Check platform parameters.", "error");
        resetButton(btn, btnText, btnLoader);
    }
}

document.addEventListener("keydown", e => {
    if (e.key === "Enter") login();
});

document.getElementById("loginBtn")?.addEventListener("click", login);
