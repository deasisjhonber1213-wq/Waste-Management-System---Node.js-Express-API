const CACHE_NAME = "smartwaste-shell-v7";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
    OFFLINE_URL,
    "/images/jose-dalman-logo.png",
    "/images/app-icon-192.png",
    "/images/app-icon-512.png",
    "/images/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request).catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    const isStaticAsset = ["/css/", "/js/", "/images/"].some((prefix) => url.pathname.startsWith(prefix));
    if (!isStaticAsset || !["style", "script", "image", "font"].includes(request.destination)) {
        return;
    }

    event.respondWith(
        fetch(request).then((response) => {
            if (!response.ok || response.type !== "basic") {
                return response;
            }

            return caches.open(CACHE_NAME)
                .then((cache) => cache.put(request, response.clone()))
                .catch((error) => console.error("Static asset cache update failed:", error))
                .then(() => response);
        }).catch(async (error) => {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) {
                return cachedResponse;
            }
            throw error;
        })
    );
});
