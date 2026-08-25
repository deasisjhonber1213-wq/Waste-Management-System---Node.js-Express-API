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

async function register(e) {
    if (e) e.preventDefault();

    const fullName = document.getElementById("fullName")?.value.trim();
    const phone = document.getElementById("phone")?.value.trim();
    const email = document.getElementById("email")?.value.trim().toLowerCase();
    const password = document.getElementById("password")?.value;
    const homeAddress = document.getElementById("homeAddress")?.value.trim();
    const btn = document.getElementById("registerBtn");

    clearAlert();

    // Comprehensive structural parameters audit
    if (!fullName || !phone || !email || !password) {
        showAlert("All required parameters (including phone number) must be supplied.", "error");
        return;
    }

    // Precise validation to catch faulty phone entries early
    if (phone.length !== 11 || !phone.startsWith("09")) {
        showAlert("Invalid format. Phone number must be exactly 11 digits and start with '09'.", "error");
        return;
    }

    if (password.length < 8) {
        showAlert("Security standard: Password must contain at least 8 characters.", "error");
        return;
    }

    setLoading(btn, true);

    try {
        const res = await fetch(API_URL + "/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fullName,
                phone,
                email,
                password,
                homeAddress,
                role: "resident"
            })
        });

        const data = await res.json();

        if (res.ok) {
            showAlert("Account registered successfully! Loading workspace profile...", "success");

            if (data.token) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user || { fullName, email }));
                localStorage.setItem("role", "resident");

                setTimeout(() => {
                    window.location = "/resident/dashboard";
                }, 1000);
            } else {
                setTimeout(() => {
                    window.location = "/login";
                }, 1500);
            }
        } else {
            showAlert(data.error || data.message || "Registration parameter conflict occurred.", "error");
            setLoading(btn, false);
        }
    } catch (err) {
        console.error("Critical Registry Trace Exception:", err);
        showAlert("Gateway transmission failure. Check platform parameters.", "error");
        setLoading(btn, false);
    }
}

document.getElementById("registerForm")?.addEventListener("submit", register);
