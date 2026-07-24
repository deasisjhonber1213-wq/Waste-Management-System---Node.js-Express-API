
document.addEventListener('DOMContentLoaded', function () {
    const hamburger = document.getElementById('hamburger');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (hamburger && sidebar) {
        // Toggle sidebar on hamburger click
        hamburger.addEventListener('click', function (e) {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            if (overlay) {
                overlay.classList.toggle('active');
            }
            // Toggle hamburger active state
            hamburger.classList.toggle('active');
        });
    }

    // Close sidebar when clicking overlay
    if (overlay) {
        overlay.addEventListener('click', function () {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
        });
    }

    // Close sidebar when clicking a nav link (on mobile)
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', function () {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                if (hamburger) hamburger.classList.remove('active');
            }
        });
    });

    // Close sidebar with Escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
        }
    });
});

// ── TOAST SYSTEM ──
function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type || 'info'}`;
    toast.innerHTML = `
                <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
                <span>${message}</span>
                <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
            `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300);
        }
    }, 4000);
}

// ── MODAL HELPERS ──
function openModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('open');
        document.body.style.overflow = '';
    }
}

window.openModal = openModal;
window.closeModal = closeModal;

// ── IMAGE UPLOAD ──
let uploadedImageData = null;

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        showToast("Image too large. Max 5MB.", "error");
        event.target.value = '';
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast("Please select an image file.", "error");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const imageData = e.target.result;
        uploadedImageData = imageData;

        const preview = document.getElementById('imagePreview');
        preview.src = imageData;
        preview.classList.add('visible');

        document.getElementById('annImg').value = imageData;
        document.getElementById('removeImageBtn').style.display = 'inline-flex';
        document.getElementById('fileNameDisplay').textContent = `📎 ${file.name}`;

        showToast("Image uploaded successfully", "success");
    };
    reader.readAsDataURL(file);
}

function removeImage() {
    uploadedImageData = null;
    document.getElementById('imagePreview').src = '';
    document.getElementById('imagePreview').classList.remove('visible');
    document.getElementById('annImg').value = '';
    document.getElementById('imageInput').value = '';
    document.getElementById('removeImageBtn').style.display = 'none';
    document.getElementById('fileNameDisplay').textContent = '';
    showToast("Image removed", "info");
}

// ── DELETE WITH CONFIRMATION ──
let pendingDeleteId = null;

function confirmDelete(id, name) {
    pendingDeleteId = id;
    const msg = document.getElementById('deleteModalMessage');
    if (msg) {
        msg.textContent = `Are you sure you want to delete "${name || 'this announcement'}"? This action cannot be undone.`;
    }
    document.getElementById('deleteConfirmBtn').onclick = function () {
        executeDelete(pendingDeleteId);
    };
    openModal('deleteConfirmModal');
}

async function executeDelete(id) {
    try {
        const res = await API.del(`/admin/announcements/${id}`);
        if (!res.ok) throw new Error();
        closeModal('deleteConfirmModal');
        showToast("Announcement deleted successfully", "success");
        loadAnnouncements();
    } catch (err) {
        closeModal('deleteConfirmModal');
        showToast("Delete failed", "error");
    }
    pendingDeleteId = null;
}

// ── API ──
const API_URL = window.location.origin + '/api';
console.log('📡 API URL:', API_URL);

function getToken() {
    return localStorage.getItem('token');
}

const API = {
    get: async (endpoint) => {
        return fetch(API_URL + endpoint, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
    },
    post: async (endpoint, data) => {
        return fetch(API_URL + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
    },
    del: async (endpoint) => {
        return fetch(API_URL + endpoint, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
    }
};

function fmtDate(date) {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function checkAuth() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
    }
}
checkAuth();

function doLogout() {
    localStorage.removeItem('token');
    closeModal('logoutConfirmModal');
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 500);
}
window.doLogout = doLogout;

function escHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadAnnouncements() {
    try {
        const res = await API.get("/admin/announcements");
        if (!res.ok) throw new Error();
        const data = await res.json();
        document.getElementById("annCount").textContent = data.length;
        const grid = document.getElementById("annGrid");
        if (!data.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📢</div><div class="empty-state-text">No announcements yet. Create one above!</div></div>';
            return;
        }
        grid.innerHTML = data.map(a => `
                    <div class="ann-card">
                        ${a.image_url ? `<img class="ann-card-img" src="${a.image_url}" alt="" onerror="this.style.display='none'">` : `<div class="ann-card-img-placeholder">📢</div>`}
                        <div class="ann-card-body">
                            <div class="ann-card-meta">
                                <span class="ann-card-date">${fmtDate(a.created_at)}</span>
                                <span class="ann-card-author">· ${escHtml(a.admin_name || "Admin")}</span>
                            </div>
                            <div class="ann-card-title">${escHtml(a.title)}</div>
                            <div class="ann-card-msg">${escHtml(a.message)}</div>
                            ${a.pickup_date ? `<div class="ann-card-pickup">📅 Pickup: ${fmtDate(a.pickup_date)}</div>` : ""}
                        </div>
                        <div class="ann-card-footer">
                            <span class="badge badge-gold">Published</span>
                            <button class="btn btn-danger btn-sm" onclick="confirmDelete(${a.id}, '${escHtml(a.title)}')">🗑 Delete</button>
                        </div>
                    </div>`).join("");
    } catch {
        showToast("Failed to load announcements", "error");
    }
}

async function createAnnouncement() {
    const title = document.getElementById("annTitle").value.trim();
    const msg = document.getElementById("annMsg").value.trim();
    const date = document.getElementById("annDate").value;
    const imgData = document.getElementById("annImg").value;

    if (!title || !msg) {
        showToast("Title and message required", "error");
        return;
    }

    try {
        const res = await API.post("/admin/announcements", {
            title,
            message: msg,
            pickup_date: date || null,
            image_url: imgData || null
        });

        if (!res.ok) throw new Error();

        // Reset form
        document.getElementById("annTitle").value = "";
        document.getElementById("annMsg").value = "";
        document.getElementById("annDate").value = "";
        removeImage();

        showToast("Announcement published!", "success");
        loadAnnouncements();
    } catch {
        showToast("Failed to create announcement", "error");
    }
}

async function loadAdminProfile() {
    try {
        const res = await API.get("/admin/profile");
        if (res.ok) {
            const data = await res.json();
            document.getElementById("adminName").textContent = data.name || "Admin";
        }
    } catch { }
}

// ── THEME TOGGLE (Self-contained) ──
document.addEventListener('DOMContentLoaded', function () {
    const themeToggle = document.getElementById('themeToggleBtn');
    if (themeToggle) {
        // Check saved theme
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeUI(themeToggle, savedTheme);

        themeToggle.addEventListener('click', function () {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeUI(themeToggle, newTheme);
        });
    }
});

function updateThemeUI(toggle, theme) {
    const icon = toggle.querySelector('.theme-icon');
    const label = toggle.querySelector('.theme-label');
    const knob = toggle.querySelector('.theme-knob');

    if (theme === 'dark') {
        if (icon) icon.textContent = '☀️';
        if (label) label.textContent = 'Light Mode';
        if (knob) knob.style.transform = 'translateX(16px)';
    } else {
        if (icon) icon.textContent = '🌙';
        if (label) label.textContent = 'Dark Mode';
        if (knob) knob.style.transform = 'translateX(0)';
    }
}

// ── INIT ──
loadAdminProfile();
loadAnnouncements();
