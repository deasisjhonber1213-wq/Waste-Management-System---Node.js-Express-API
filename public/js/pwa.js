let installPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
});

window.addEventListener("appinstalled", () => {
    installPrompt = null;
    document.getElementById("installAppButton")?.remove();
});

function isAppInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isAppleMobileDevice() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function addInstallButton() {
    if (isAppInstalled() || document.getElementById("installAppButton")) return;

    const button = document.createElement("button");
    button.id = "installAppButton";
    button.type = "button";
    button.textContent = "Install app";
    button.setAttribute("aria-label", "Install Jose Dalman Waste Management app");
    Object.assign(button.style, {
        position: "fixed",
        right: "max(16px, env(safe-area-inset-right))",
        bottom: "max(16px, env(safe-area-inset-bottom))",
        zIndex: "999999",
        border: "0",
        borderRadius: "999px",
        padding: "12px 18px",
        background: "#2f855a",
        color: "#fff",
        font: "600 14px system-ui, sans-serif",
        boxShadow: "0 4px 16px rgba(0, 0, 0, .24)",
        cursor: "pointer"
    });

    button.addEventListener("click", async () => {
        if (!window.isSecureContext) {
            window.alert("App installation requires a secure HTTPS connection. Open the app using its HTTPS website address.");
            return;
        }

        if (installPrompt) {
            const prompt = installPrompt;
            installPrompt = null;
            await prompt.prompt();
            const choice = await prompt.userChoice;
            if (choice.outcome === "accepted") button.remove();
            return;
        }

        if (isAppleMobileDevice()) {
            window.alert('To install on iPhone or iPad, tap Share in Safari, then choose "Add to Home Screen".');
            return;
        }

        window.alert('To install, open this page in Chrome or Edge, tap the browser menu, then choose "Install app" or "Add to Home screen".');
    });

    document.body.append(button);
}

if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" }).catch((error) => {
            console.error("Service worker registration failed:", error);
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addInstallButton, { once: true });
} else {
    addInstallButton();
}
