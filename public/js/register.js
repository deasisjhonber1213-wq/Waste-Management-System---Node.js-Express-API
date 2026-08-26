const API_URL = window.location.origin + "/api";

function setLoading(btn, loading) {
    if (!btn) return;
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".btn-loader");
    btn.disabled = loading;
    if (text) text.hidden = loading;
    if (loader) loader.hidden = !loading;
}

function showAlert(msg, type) {
    const el = document.getElementById("alertBox");
    if (!el) return;
    el.textContent = msg;
    el.className = "alert " + type;
}

function clearAlert() {
    const el = document.getElementById("alertBox");
    if (el) {
        el.className = "alert";
        el.textContent = "";
    }
}

// Interactive Password Clear Text Toggle Handler
document.getElementById("toggleRegisterPasswordBtn")?.addEventListener("click", function () {
    const input = document.getElementById("password");
    if (!input) return;
    const isShowing = input.type === "text";
    input.type = isShowing ? "password" : "text";
    this.style.color = isShowing ? "var(--text-2)" : "var(--gold)";
});

// Enforce numbers-only filtration logic on entry fields
document.getElementById("phone")?.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 11);
});

function extractError(data) {
    if (!data) return "Registration failed. Please try again.";
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
    // express-validator / Joi style
    if (Array.isArray(data.errors) && data.errors.length) {
        return data.errors.map(e => e.msg || e.message || e).join(" · ");
    }
    if (Array.isArray(data.details) && data.details.length) {
        return data.details.map(d => d.message || d).join(" · ");
    }
    if (data.errors && typeof data.errors === "object") {
        return Object.values(data.errors).flat().join(" · ");
    }
    return "Registration parameter conflict occurred.";
}

async function register(e) {
    if (e) e.preventDefault();

    const fullName = document.getElementById("fullName")?.value.trim();
    const phone = document.getElementById("phone")?.value.trim();
    const email = document.getElementById("email")?.value.trim().toLowerCase();
    const password = document.getElementById("password")?.value;
    const homeAddress = document.getElementById("homeAddress")?.value.trim() || undefined;
    const btn = document.getElementById("registerBtn");

    clearAlert();

    if (!fullName || !phone || !email || !password) {
        showAlert("All required fields (name, phone, email, password) must be filled.", "error");
        return;
    }

    if (phone.length !== 11 || !phone.startsWith("09")) {
        showAlert("Phone number must be exactly 11 digits and start with 09.", "error");
        return;
    }

    if (password.length < 8) {
        showAlert("Password must be at least 8 characters.", "error");
        return;
    }

    setLoading(btn, true);

    // Do NOT send role — public register must let the server assign "resident".
    // Sending role often triggers 400 under strict body validation.
    const payload = { fullName, phone, email, password };
    if (homeAddress) payload.homeAddress = homeAddress;

    try {
        const res = await fetch(API_URL + "/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        let data = {};
        try {
            data = await res.json();
        } catch (_) {
            // non-JSON error body
        }

        if (res.ok) {
            showAlert(data.message || "Account registered successfully!", "success");

            if (data.token) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user || { fullName, email }));
                localStorage.setItem("role", data.role || "resident");

                setTimeout(() => {
                    window.location = "/resident/dashboard";
                }, 1000);
            } else if (data.requiresVerification || data.emailVerificationRequired) {
                // Backend wants email verification before login
                setTimeout(() => {
                    window.location = "/verify-email?email=" + encodeURIComponent(email);
                }, 1200);
            } else {
                setTimeout(() => {
                    window.location = "/login";
                }, 1500);
            }
        } else {
            console.warn("Register 400/4xx response:", res.status, data);
            showAlert(extractError(data), "error");
            setLoading(btn, false);
        }
    } catch (err) {
        console.error("Register network error:", err);
        showAlert("Network error. Check your connection and try again.", "error");
        setLoading(btn, false);
    }
}

document.getElementById("registerForm")?.addEventListener("submit", register);