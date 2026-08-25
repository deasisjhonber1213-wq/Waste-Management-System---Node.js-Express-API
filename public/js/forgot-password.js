const API_URL = window.location.origin + "/api";
let currentEmail = "";

function showStep(n) {
    const steps = document.querySelectorAll(".step");
    steps.forEach(s => {
        s.style.opacity = "0";
        setTimeout(() => {
            s.classList.remove("active");
            if (s.id === "step" + n) {
                s.classList.add("active");
                s.style.opacity = "1";
            }
        }, 150);
    });
}

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

document.getElementById("toggleNewPasswordBtn")?.addEventListener("click", function () {
    const input = document.getElementById("newPassword");
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    this.textContent = showing ? "Show" : "Hide";
});

document.getElementById("pin")?.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 6);
});

async function sendPin() {
    const emailInput = document.getElementById("email");
    if (!emailInput) return;
    const email = emailInput.value.trim().toLowerCase();
    const btn = document.getElementById("sendPinBtn");

    clearAlert();
    if (!email) {
        showAlert("Please enter your registered email address.", "error");
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
            showAlert(data.message || "A secure 6-digit PIN was dispatched via SMS.", "success");
            setTimeout(() => {
                clearAlert();
                showStep(2);
            }, 1000);
        } else {
            showAlert(data.error || "Verification failed. Check your entry.", "error");
        }
    } catch (err) {
        showAlert("Network connection timeout. Please verify connectivity.", "error");
    } finally {
        setLoading(btn, false);
    }
}

async function resetPassword() {
    const pin = document.getElementById("pin")?.value.trim();
    const newPassword = document.getElementById("newPassword")?.value;
    const btn = document.getElementById("resetBtn");

    clearAlert();

    if (!pin || pin.length !== 6) {
        showAlert("Please enter the complete 6-digit verification code.", "error");
        return;
    }
    if (!newPassword || newPassword.length < 8) {
        showAlert("Security standard: Password must contain at least 8 characters.", "error");
        return;
    }

    setLoading(btn, true);

    try {
        const res = await fetch(API_URL + "/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentEmail, pin, newPassword })
        });
        const data = await res.json();

        if (res.ok) {
            showAlert(data.message || "Credentials updated successfully!", "success");
            setTimeout(() => (window.location = "/login"), 1500);
        } else {
            showAlert(data.error || "Failed to finalize new password.", "error");
            setLoading(btn, false);
        }
    } catch (err) {
        showAlert("Network connection timeout. Please try again.", "error");
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
    if (e.key !== "Enter") return;
    const activeStep = document.getElementById("step1");
    if (activeStep && activeStep.classList.contains("active")) sendPin();
    else resetPassword();
});