
const API_URL = window.location.origin + '/api';
console.log('📡 API URL:', API_URL);

const selectedRole = 'resident';

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

document.addEventListener('keydown', e => { if (e.key === 'Enter') register(); });

async function register() {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const phone = document.getElementById("phone").value.trim();
    const address = document.getElementById("address").value.trim();
    const btn = document.getElementById("regBtn");

    clearAlert();

    if (!name) { showAlert("Full name is required.", "error"); return; }
    if (!email) { showAlert("Email address is required.", "error"); return; }
    if (!password) { showAlert("Password is required.", "error"); return; }
    if (password.length < 8) { showAlert("Password must be at least 8 characters.", "error"); return; }

    btn.disabled = true;
    btn.textContent = "Creating account…";

    try {
        console.log('📤 Sending registration request to:', API_URL + '/auth/register');

        const res = await fetch(API_URL + "/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, phone, address, role: selectedRole })
        });

        const data = await res.json();
        console.log('📥 Response:', data);

        if (res.ok) {
            showAlert("✓ Resident account created! Redirecting to login…", "success");
            setTimeout(() => window.location = "login.html", 1800);
        } else {
            showAlert(data.message || "Registration failed. Please try again.", "error");
            btn.disabled = false;
            btn.textContent = "Create Account →";
        }
    } catch (err) {
        console.error('❌ Registration error:', err);
        showAlert("Connection error. Please try again.", "error");
        btn.disabled = false;
        btn.textContent = "Create Account →";
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

async function testConnection() {
    try {
        const response = await fetch(API_URL + '/health');
        if (response.ok) {
            console.log('✅ API is reachable');
        } else {
            console.warn('⚠️ API returned:', response.status);
        }
    } catch (error) {
        console.warn('⚠️ API not reachable:', error);
    }
}
testConnection();
