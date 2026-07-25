
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);

    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
}

window.toggleTheme = toggleTheme;

function updateThemeIcon(theme) {
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) {
        const icon = toggle.querySelector('.theme-icon');
        const label = toggle.querySelector('.theme-label');

        if (theme === 'dark') {
            if (icon) icon.textContent = '☀️';
            if (label) label.textContent = 'Light Mode';
            toggle.classList.add('dark');
        } else {
            if (icon) icon.textContent = '🌙';
            if (label) label.textContent = 'Dark Mode';
            toggle.classList.remove('dark');
        }
    }
}

(function () {
    const theme = localStorage.getItem('theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
})();

document.addEventListener('DOMContentLoaded', () => {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    updateThemeIcon(theme);
});

window.addEventListener('storage', (e) => {
    if (e.key === 'theme') {
        const theme = e.newValue || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        updateThemeIcon(theme);
    }
});

window.addEventListener('themeChanged', (e) => {
    const theme = e.detail.theme;
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
});

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

window.showToast = showToast;

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
    document.body.style.overflow = "";
}

window.openModal = openModal;
window.closeModal = closeModal;

if (!window.__smartwasteSidebarInit) {
    window.__smartwasteSidebarInit = true;

    document.addEventListener("DOMContentLoaded", () => {
        const hamburger = document.getElementById("hamburger");
        const sidebar = document.querySelector(".sidebar");
        const overlay = document.getElementById("sidebarOverlay");

        function openSidebar() {
            if (sidebar) sidebar.classList.add("open");
            if (overlay) overlay.classList.add("active");
        }

        function closeSidebar() {
            if (sidebar) sidebar.classList.remove("open");
            if (overlay) overlay.classList.remove("active");
        }

        if (hamburger && sidebar) {
            hamburger.addEventListener("click", (e) => {
                e.stopPropagation();
                if (sidebar.classList.contains("open")) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            });
            if (overlay) {
                overlay.addEventListener("click", closeSidebar);
            }
        }

        document.querySelectorAll(".sidebar-nav .nav-item").forEach(link => {
            link.addEventListener("click", () => {
                if (window.innerWidth <= 820) {
                    closeSidebar();
                }
            });
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
                closeSidebar();
            }
        });

        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    e.target.classList.add("visible");
                    obs.unobserve(e.target);
                }
            });
        }, { threshold: 0.08 });
        document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
        const currentPath = window.location.pathname.split("/").pop() || "dashboard";
        document.querySelectorAll(".nav-item").forEach(a => {
            const href = a.getAttribute("href");
            if (href === currentPath || (currentPath === "" && href === "dashboard")) {
                a.classList.add("active");
            }
        });

        const themeToggleBtn = document.getElementById("themeToggleBtn");
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener("click", toggleTheme);
        }
    });
}

function confirmDelete(message, onConfirm) {
    if (confirm(message)) onConfirm();
}

window.confirmDelete = confirmDelete;
function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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

function fmtDateTime(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
}

window.fmtDate = fmtDate;
window.statusBadge = statusBadge;
window.fmtDateTime = fmtDateTime;
window.escHtml = escHtml;