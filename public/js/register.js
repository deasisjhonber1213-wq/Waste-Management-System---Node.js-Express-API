const API_URL = window.location.origin + "/api";
const selectedRole = "resident";

const EMAIL_REGEX =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function isValidEmail(email) {
    if (!email || email.length > 254) return false;
    if (!EMAIL_REGEX.test(email)) return false;
    const [local, domain] = email.split("@");
    if (!local || !domain || local.length > 64) return false;
    if (domain.includes("..") || !domain.includes(".")) return false;
    const tld = domain.split(".").pop();
    return tld && tld.length >= 2;
}

function setLoading(loading) {
    const btn = document.getElementById("regBtn");
    if (!btn) return;
    const btnText = btn.querySelector(".btn-text");
    const btnLoader = btn.querySelector(".btn-loader");
    btn.disabled = loading;
    if (btnText) btnText.hidden = loading;
    if (btnLoader) btnLoader.hidden = !loading;
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

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") register();
});

document.getElementById("regBtn")?.addEventListener("click", register);

async function register() {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();

    clearAlert();

    if (!name) return showAlert("Full name is required.", "error");
    if (!email) return showAlert("Email address is required.", "error");
    if (!isValidEmail(email)) return showAlert("Please enter a valid email address (e.g. you@example.com).", "error");
    if (!password) return showAlert("Password is required.", "error");
    if (password.length < 8) return showAlert("Password must be at least 8 characters.", "error");

    setLoading(true);

    try {
        const res = await fetch(API_URL + "/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                email,
                password,
                phone,
                address,
                role: selectedRole
            })
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
            showAlert(data.message || "Account created! Check your email for a verification code.", "success");
            setTimeout(() => {
                window.location.href = `/verify-email?email=${encodeURIComponent(email)}`;
            }, 1400);
        } else {
            showAlert(data.error || data.message || "Registration failed. Please try again.", "error");
            setLoading(false);
        }
    } catch (err) {
        console.error("Registration error:", err);
        showAlert("Connection error. Please try again.", "error");
        setLoading(false);
    }
}