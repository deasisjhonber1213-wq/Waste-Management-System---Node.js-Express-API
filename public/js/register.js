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

// Ensure phone numbers only contain digits
document.getElementById("phone")?.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "");
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

    // Required fields check
    if (!fullName || !email || !password) {
        showAlert("Full name, email address, and security password are required fields.", "error");
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
                role: "resident" // Enforce default user context tier safely
            })
        });

        const data = await res.json();

        if (res.ok) {
            showAlert("Account registered successfully! Transferring to your profile...", "success");

            // Auto-authenticate user using incoming response parameters
            if (data.token) {
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user || { fullName, email }));
                localStorage.setItem("role", "resident");

                setTimeout(() => {
                    window.location = "/resident/dashboard";
                }, 1000);
            } else {
                // Fallback destination if the API does not auto-login
                setTimeout(() => {
                    window.location = "/login";
                }, 1500);
            }
        } else {
            showAlert(data.error || data.message || "Registration failed. Please check your inputs.", "error");
            setLoading(btn, false);
        }
    } catch (err) {
        console.error("Registration Network Error:", err);
        showAlert("Gateway transmission failure. Check platform parameters.", "error");
        setLoading(btn, false);
    }
}

document.getElementById("registerBtn")?.addEventListener("click", register);

// Support quick entry submission across standard form flows
document.querySelectorAll(".form-input").forEach(input => {
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") register(e);
    });
});
