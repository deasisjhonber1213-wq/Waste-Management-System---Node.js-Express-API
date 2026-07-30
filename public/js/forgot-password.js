const API_URL = window.location.origin + "/api";
let currentEmail = "";

function showStep(n) {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    document.getElementById("step" + n).classList.add("active");
}

function setLoading(btn, loading) {
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".btn-loader");
    btn.disabled = loading;
    if (text) text.hidden = loading;
    if (loader) loader.hidden = !loading;
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

function togglePw(btn) {
    const input = document.getElementById("newPassword");
    if (input.type === "password") {
        input.type = "text";
        btn.textContent = "Hide";
    } else {
        input.type = "password";
        btn.textContent = "Show";
    }
}

async function sendPin() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const btn = document.getElementById("sendPinBtn");

    clearAlert();
    if (!email) {
        showAlert("Please enter your email.", "error");
        return;
    }

    setLoading(btn, true);

    try {
        const res = await fetch(API_URL + "/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (res.ok) {
            currentEmail = email;
            showAlert(data.message || "PIN sent. Check your inbox.", "success");
            setTimeout(() => {
                clearAlert();
                showStep(2);
            }, 1200);
        } else {
            showAlert(data.error || "Something went wrong.", "error");
        }
    } catch (err) {
        showAlert("Connection error. Please try again.", "error");
    } finally {
        setLoading(btn, false);
    }
}

async function resetPassword() {
    const pin = document.getElementById("pin").value.trim();
    const newPassword = document.getElementById("newPassword").value;
    const btn = document.getElementById("resetBtn");

    clearAlert();

    if (!pin || pin.length !== 6) {
        showAlert("Enter the 6-digit PIN from your email.", "error");
        return;
    }
    if (!newPassword || newPassword.length < 8) {
        showAlert("Password must be at least 8 characters.", "error");
        return;
    }

    setLoading(btn, true);

    try {
        const res = await fetch(API_URL + "/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: currentEmail,
                pin,
                newPassword
            })
        });
        const data = await res.json();

        if (res.ok) {
            showAlert(data.message || "Password updated!", "success");
            setTimeout(() => window.location = "/login", 1800);
        } else {
            showAlert(data.error || "Failed to reset password.", "error");
            setLoading(btn, false);
        }
    } catch (err) {
        showAlert("Connection error. Please try again.", "error");
        setLoading(btn, false);
    }
}

document.getElementById("sendPinBtn")?.addEventListener("click", sendPin);
document.getElementById("resetBtn")?.addEventListener("click", resetPassword);
document.getElementById("resendBtn")?.addEventListener("click", () => {
    showStep(1);
    clearAlert();
});

document.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        if (document.getElementById("step1").classList.contains("active")) sendPin();
        else resetPassword();
    }
});