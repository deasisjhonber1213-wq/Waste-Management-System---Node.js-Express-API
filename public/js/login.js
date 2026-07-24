
const API_URL = window.location.origin + '/api';
console.log('📡 API URL:', API_URL);

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const alertBox = document.getElementById('alertBox');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');

togglePasswordBtn.addEventListener('click', function () {
    const input = passwordInput;
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '🙈';
    } else {
        input.type = 'password';
        this.textContent = '👁️';
    }
});

function showAlert(msg, type) {
    alertBox.textContent = '';
    alertBox.textContent = msg;
    alertBox.className = 'alert ' + type;
}

async function login() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    alertBox.className = 'alert';
    alertBox.textContent = '';

    if (!email || !password) {
        showAlert('Please enter your email and password.', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAlert('Please enter a valid email address.', 'error');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';

    try {
        console.log('📤 Sending login request to:', API_URL + '/auth/login');

        const response = await fetch(API_URL + '/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role);
            showAlert('Login successful! Redirecting…', 'success');

            setTimeout(() => {
                const redirectMap = {
                    'admin': '/admin/dashboard',
                    'resident': '/resident/dashboard',
                    'driver': '/driver/dashboard'
                };
                const redirectPath = redirectMap[data.role] || '/';
                window.location.href = redirectPath;
            }, 900);
        } else {
            showAlert(data.message || 'Invalid credentials. Please try again.', 'error');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
            passwordInput.value = '';
            passwordInput.focus();
        }

    } catch (err) {
        console.error('❌ Login error:', err);
        showAlert('Connection error. Please check your internet connection and try again.', 'error');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
}

loginBtn.addEventListener('click', login);

document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        login();
    }
});

async function testConnection() {
    try {
        const response = await fetch(API_URL + '/health', {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (response.ok) {
            console.log('✅ API is reachable');
        } else {
            console.warn('⚠️ API returned:', response.status);
        }
    } catch (error) {
        console.warn('⚠️ API not reachable:', error);
    }
}

document.addEventListener('DOMContentLoaded', testConnection);