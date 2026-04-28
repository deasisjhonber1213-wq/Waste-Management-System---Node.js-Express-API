/* ============================================================
   SMARTWASTE ADMIN — SHARED JS UTILITIES
============================================================ */

const token = localStorage.getItem("token");
if (!token) window.location.href = "/login.html";

const API = {
    get: (url) => fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
    post: (url, data) => fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    put: (url, data) => fetch(url, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    del: (url) => fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }),
};

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
function openModal(id) { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

/* ── SIDEBAR MOBILE ── */
document.addEventListener("DOMContentLoaded", () => {
    const hamburger = document.getElementById("hamburger");
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if (hamburger && sidebar) {
        hamburger.addEventListener("click", () => {
            sidebar.classList.toggle("mobile-open");
            overlay?.classList.toggle("mobile-open");
        });
        overlay?.addEventListener("click", () => {
            sidebar.classList.remove("mobile-open");
            overlay.classList.remove("mobile-open");
        });
    }

    /* reveal animation */
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } });
    }, { threshold: 0.08 });
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));

    /* active nav */
    const path = window.location.pathname.split("/").pop();
    document.querySelectorAll(".nav-item").forEach(a => {
        if (a.getAttribute("href") === path) a.classList.add("active");
    });
});

/* ── CONFIRM DELETE ── */
function confirmDelete(message, onConfirm) {
    if (confirm(message)) onConfirm();
}

/* ── FORMAT DATE ── */
function fmtDate(d) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ── RENDER STATUS BADGE ── */
function statusBadge(status) {
    const map = {
        pending: "badge-gold",
        completed: "badge-green",
        active: "badge-green",
        inactive: "badge-gray",
        missed: "badge-red",
        driver: "badge-blue",
        admin: "badge-gold",
        resident: "badge-gray",
    };
    return `<span class="badge ${map[status] || "badge-gray"}">${status}</span>`;
}