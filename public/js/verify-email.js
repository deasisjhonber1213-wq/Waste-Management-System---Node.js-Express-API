const API_URL = window.location.origin + "/api";

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

function setLoading(btn, loading) {
    const text = btn.querySelector(".btn-text");
    const loader = btn.querySelector(".btn-loader");
    btn.disabled = loading;
    if (text) text.hidden = loading;
    if (loader) loader.hidden = !loading;
}

function showStep(id) {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

document.getElementById("pin")?.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 6);
});

async function verifyPin() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const pin = document.getElementById("pin").value.trim();
    const btn = document.getElementById("verifyBtn");

    clearAlert();

    if (!email) return showAlert("Enter the email you registered with.", "error");
    if (!pin || pin.length !== 6) return showAlert("Enter the 6-digit code from your email.", "error");

    setLoading(btn, true);

    try {
        const res = await fetch(API_URL + "/auth/verify-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, pin })
        });
        const data = await res.json();

        if (res.ok) {
            showStep("stepSuccess");
        } else {
            showAlert(data.error || "Verification failed.", "error");
            setLoading(btn, false);
        }
    } catch (err) {
        showAlert("Connection error. Please try again.", "error");
        setLoading(btn, false);
    }
}

async function resendCode() {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const btn = document.getElementById("resendBtn");

    clearAlert();
    if (!email) return showAlert("Enter your email first.", "error");

    setLoading(btn, true);

    try {
        const res = await fetch(API_URL + "/auth/resend-verification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        showAlert(data.message || "If that account exists, a new code was sent.", "success");
    } catch (err) {
        showAlert("Connection error. Please try again.", "error");
    } finally {
        setLoading(btn, false);
    }
}

document.getElementById("verifyBtn")?.addEventListener("click", verifyPin);
document.getElementById("resendBtn")?.addEventListener("click", resendCode);

document.addEventListener("keydown", e => {
    if (e.key === "Enter" && document.getElementById("stepPin").classList.contains("active")) verifyPin();
});

// Pre-fill from ?email= and react to link-click redirects (?verified=1 / ?error=...)
(function init() {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email");
    if (email) document.getElementById("email").value = email;

    if (params.get("verified") === "1") {
        showStep("stepSuccess");
        return;
    }

    const error = params.get("error");
    if (error === "expired") {
        showAlert("That verification link expired. Enter your email and request a new code.", "error");
    } else if (error === "invalid") {
        showAlert("That verification link is invalid or was already used.", "error");
    } else if (error) {
        showAlert("Something went wrong verifying that link. Try the code instead.", "error");
    }
})();
