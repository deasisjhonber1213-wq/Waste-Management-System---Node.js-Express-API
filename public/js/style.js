/* ============================================================
   SMARTWASTE ADMIN — SHARED JS UTILITIES
   Includes: Theme toggle, toast, modals, sidebar, reveal, etc.
============================================================ */

/* ── THEME TOGGLE ── */
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    // Dispatch event so other pages can sync
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
}

// Make toggleTheme globally available for inline onclick handlers
window.toggleTheme = toggleTheme;

function updateThemeIcon(theme) {
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
        const icon = toggle.querySelector('.icon');
        const label = toggle.querySelector('.label');
        if (theme === 'dark') {
            if (icon) icon.textContent = '☀️';
            if (label) label.textContent = 'Light';
        } else {
            if (icon) icon.textContent = '🌙';
            if (label) label.textContent = 'Dark';
        }
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

// Load theme immediately to prevent flicker
loadTheme();

// Listen for theme changes from other tabs/windows
window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
        const theme = e.newValue || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeIcon(theme);
    }
});

// Listen for theme changes within the same page
window.addEventListener('themeChanged', (e) => {
    const theme = e.detail.theme;
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
});

/* ── TOAST ── */
function showToast(msg, type = "info") {
    const icons = { success: "✓", error: "✕", info: "●" };
    const container = document.getElementById("toastContainer") || (() => {
        const el = document.createElement("div");
        el.id = "toastContainer";
        el.className = "toast-container";
        document.body.appendChild(el);
        return el;
    })();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || "●"}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

/* ── MODAL ── */
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
}

/* ── SIDEBAR MOBILE + REVEAL + ACTIVE NAV ── */
document.addEventListener("DOMContentLoaded", () => {
    const hamburger = document.getElementById("hamburger");
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    // Mobile sidebar toggle
    if (hamburger && sidebar) {
        hamburger.addEventListener("click", () => {
            sidebar.classList.toggle("open");
            if (overlay) overlay.classList.toggle("active");
        });
        if (overlay) {
            overlay.addEventListener("click", () => {
                sidebar.classList.remove("open");
                overlay.classList.remove("active");
            });
        }
    }

    // Close sidebar on nav item click (mobile)
    document.querySelectorAll(".sidebar-nav .nav-item").forEach(link => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 820) {
                if (sidebar) sidebar.classList.remove("open");
                if (overlay) overlay.classList.remove("active");
            }
        });
    });

    // Reveal animations
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add("visible");
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));

    // Active nav state (optional - relies on href matching current path)
    const currentPath = window.location.pathname.split("/").pop() || "dashboard";
    document.querySelectorAll(".nav-item").forEach(a => {
        const href = a.getAttribute("href");
        if (href === currentPath || (currentPath === "" && href === "dashboard")) {
            a.classList.add("active");
        }
    });

    // Theme toggle button event listener (as backup for onclick)
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", toggleTheme);
    }
});

/* ── CONFIRM DELETE ── */
function confirmDelete(message, onConfirm) {
    if (confirm(message)) onConfirm();
}

/* ── FORMAT DATE ── */
function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── RENDER STATUS BADGE ── */
function statusBadge(status) {
    const map = {
        pending: "badge-warning",
        in_progress: "badge-info",
        completed: "badge-success",
        cancelled: "badge-danger",
        active: "badge-success",
        inactive: "badge-gray",
        missed: "badge-danger",
        driver: "badge-blue",
        admin: "badge-gold",
        resident: "badge-gray",
    };
    return `<span class="badge ${map[status] || "badge-gray"}">${String(status).replace('_', ' ').toUpperCase()}</span>`;
}

/* ── FORMAT DATETIME ── */
function fmtDateTime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

/* ── ESCAPE HTML ── */
function escHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

// Make functions globally available for inline handlers
window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.confirmDelete = confirmDelete;
window.fmtDate = fmtDate;
window.statusBadge = statusBadge;
window.fmtDateTime = fmtDateTime;
window.escHtml = escHtml;