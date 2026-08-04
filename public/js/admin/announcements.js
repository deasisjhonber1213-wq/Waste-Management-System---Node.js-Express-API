
function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', error: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>', info: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' };

    const toast = document.createElement('div');
    toast.className = `toast ${type || 'info'}`;
    toast.innerHTML = `
                <span class="toast-icon">${icons[type] || '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'}</span>
                <span>${message}</span>
                <button class="toast-close" onclick="this.parentElement.remove()"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            `;

    container.appendChild(toast);

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
        document.getElementById('fileNameDisplay').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> ${file.name}`;

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

const API_URL = window.location.origin + '/api';
console.log('API URL:', API_URL);

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
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></div><div class="empty-state-text">No announcements yet. Create one above!</div></div>';
            return;
        }
        grid.innerHTML = data.map(a => `
                    <div class="ann-card">
                        ${a.image_url ? `<img class="ann-card-img" src="${a.image_url}" alt="" onerror="this.style.display='none'">` : `<div class="ann-card-img-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></div>`}
                        <div class="ann-card-body">
                            <div class="ann-card-meta">
                                <span class="ann-card-date">${fmtDate(a.created_at)}</span>
                                <span class="ann-card-author">· ${escHtml(a.admin_name || "Admin")}</span>
                            </div>
                            <div class="ann-card-title">${escHtml(a.title)}</div>
                            <div class="ann-card-msg">${escHtml(a.message)}</div>
                            ${a.pickup_date ? `<div class="ann-card-pickup">Pickup: ${fmtDate(a.pickup_date)}</div>` : ""}
                        </div>
                        <div class="ann-card-footer">
                            <span class="badge badge-gold">Published</span>
                            <button class="btn btn-danger btn-sm" onclick="confirmDelete(${a.id}, '${escHtml(a.title)}')"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete</button>
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

document.addEventListener('DOMContentLoaded', function () {

    const themeToggle = document.getElementById('themeToggleBtn');
    if (themeToggle) {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        updateThemeUI(themeToggle, currentTheme);
    }
});

function updateThemeUI(toggle, theme) {
    const icon = toggle.querySelector('.theme-icon');
    const label = toggle.querySelector('.theme-label');
    const knob = toggle.querySelector('.theme-knob');

    if (theme === 'dark') {
        if (icon) icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        if (label) label.textContent = 'Light Mode';
        if (knob) knob.style.transform = 'translateX(16px)';
    } else {
        if (icon) icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        if (label) label.textContent = 'Dark Mode';
        if (knob) knob.style.transform = 'translateX(0)';
    }
}


loadAdminProfile();
loadAnnouncements();