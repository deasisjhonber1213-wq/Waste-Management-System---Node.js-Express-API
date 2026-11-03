(() => {
    const DATABASE_NAME = 'smartwaste-offline-queue';
    const STORE_NAME = 'requests';
    const MAX_QUEUE_ITEMS = 20;
    let flushPromise = null;

    function currentUserId() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        try {
            const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(encoded));
            return payload.id === undefined ? null : String(payload.id);
        } catch (err) {
            console.warn('Could not identify offline queue owner:', err);
            return null;
        }
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('Offline storage is unavailable in this browser'));
                return;
            }
            const request = indexedDB.open(DATABASE_NAME, 1);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                store.createIndex('userId', 'userId', { unique: false });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Could not open offline storage'));
        });
    }

    async function readAll() {
        const database = await openDatabase();
        try {
            return await new Promise((resolve, reject) => {
                const transaction = database.transaction(STORE_NAME, 'readonly');
                const request = transaction.objectStore(STORE_NAME).getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Could not read offline queue'));
            });
        } finally {
            database.close();
        }
    }

    async function remove(id) {
        const database = await openDatabase();
        try {
            await new Promise((resolve, reject) => {
                const transaction = database.transaction(STORE_NAME, 'readwrite');
                transaction.objectStore(STORE_NAME).delete(id);
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error || new Error('Could not update offline queue'));
                transaction.onabort = () => reject(transaction.error || new Error('Offline queue update was aborted'));
            });
        } finally {
            database.close();
        }
    }

    function notify(name, detail = {}) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    async function enqueue(item) {
        const userId = currentUserId();
        if (!userId) throw new Error('Sign in before saving an update for offline delivery');
        if (!item || !['POST', 'PATCH', 'DELETE'].includes(item.method) ||
            !/^\/(?:api|driver\/api)\//.test(item.path)) {
            throw new Error('This request cannot be stored for offline delivery');
        }
        if (item.body && JSON.stringify(item.body).length > 7 * 1024 * 1024) {
            throw new Error('This update is too large to save offline');
        }

        const database = await openDatabase();
        try {
            await new Promise((resolve, reject) => {
                const transaction = database.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();
                request.onsuccess = () => {
                    const records = request.result;
                    const replacements = item.key ? records.filter(record =>
                            record.userId === userId &&
                            record.type === item.type &&
                            record.key === item.key
                        ) : [];
                    replacements.forEach(record => store.delete(record.id));
                    const owned = records.filter(record => record.userId === userId);
                    if (owned.length - replacements.length >= MAX_QUEUE_ITEMS) {
                        transaction.abort();
                        reject(new Error('Offline queue is full. Reconnect before saving more updates.'));
                        return;
                    }
                    store.add({
                        userId,
                        type: item.type,
                        key: item.key || null,
                        method: item.method,
                        path: item.path,
                        body: item.body || null,
                        createdAt: Date.now(),
                        expiresAt: Date.now() + item.maxAgeMs
                    });
                };
                request.onerror = () => reject(request.error || new Error('Could not read offline queue'));
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error || new Error('Could not save update offline'));
                transaction.onabort = () => reject(transaction.error || new Error('Could not save update offline'));
            });
        } finally {
            database.close();
        }
        notify('offlinequeuechange');
    }

    async function discard(type) {
        const userId = currentUserId();
        if (!userId) return;
        const records = await readAll();
        await Promise.all(records
            .filter(record => record.userId === userId && record.type === type)
            .map(record => remove(record.id)));
        notify('offlinequeuechange');
    }

    async function count() {
        const userId = currentUserId();
        if (!userId) return 0;
        const records = await readAll();
        return records.filter(record => record.userId === userId).length;
    }

    async function pending(type) {
        const userId = currentUserId();
        if (!userId) return [];
        const records = await readAll();
        return records.filter(record =>
            record.userId === userId && (!type || record.type === type)
        );
    }

    async function flush() {
        if (!navigator.onLine || flushPromise) return flushPromise;
        flushPromise = (async () => {
            const token = localStorage.getItem('token');
            const userId = currentUserId();
            if (!token || !userId) return;

            const records = (await readAll()).sort((a, b) => a.id - b.id);
            for (const record of records) {
                if (record.userId !== userId) continue;
                if (record.expiresAt <= Date.now()) {
                    await remove(record.id);
                    notify('offlinequeueexpired', { type: record.type, key: record.key });
                    continue;
                }

                let response;
                try {
                    response = await fetch(record.path, {
                        method: record.method,
                        headers: {
                            Authorization: `Bearer ${token}`,
                            ...(record.body ? { 'Content-Type': 'application/json' } : {})
                        },
                        ...(record.body ? { body: JSON.stringify(record.body) } : {})
                    });
                } catch (err) {
                    console.warn('Offline queue delivery paused:', err);
                    break;
                }

                if (response.ok) {
                    await remove(record.id);
                    notify('offlinequeuesynced', { type: record.type, key: record.key });
                    continue;
                }
                if (response.status === 401 || response.status === 408 ||
                    response.status === 429 || response.status >= 500) break;

                const message = await response.text().catch(() => '');
                await remove(record.id);
                notify('offlinequeuerejected', {
                    type: record.type,
                    key: record.key,
                    status: response.status,
                    message
                });
            }
            notify('offlinequeuechange');
        })().catch(err => {
            console.error('Offline queue sync failed:', err);
        }).finally(() => {
            flushPromise = null;
        });
        return flushPromise;
    }

    window.WMSOfflineQueue = { enqueue, discard, count, pending, flush };
    window.addEventListener('online', flush);
    window.addEventListener('load', flush, { once: true });
})();
