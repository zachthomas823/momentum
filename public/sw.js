// Service Worker — Decision-Impact Fitness Tracker
// Hand-written (no next-pwa/serwist) to avoid Turbopack conflicts.

const CACHE_NAME = "fitness-v1";
const PRECACHE_URLS = ["/", "/manifest.webmanifest"];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] install");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] activate");
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests — always network (let Next.js handle routing)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  // API routes — network-first, never cache
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets — cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache successful same-origin responses
        if (
          response.ok &&
          url.origin === self.location.origin
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "offline-queue-drain") {
    console.log("[SW] sync:offline-queue-drain");
    event.waitUntil(drainOfflineQueue());
  }
});

// Drain the IndexedDB offline queue from inside the SW context
async function drainOfflineQueue() {
  const db = await openDB();
  const tx = db.transaction("offline-logs", "readonly");
  const store = tx.objectStore("offline-logs");
  const entries = await getAllEntries(store);
  tx.oncomplete = () => {};

  for (const entry of entries) {
    try {
      const res = await fetch(entry.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.body),
      });
      if (res.ok) {
        const delTx = db.transaction("offline-logs", "readwrite");
        delTx.objectStore("offline-logs").delete(entry.id);
        await new Promise((resolve, reject) => {
          delTx.oncomplete = resolve;
          delTx.onerror = reject;
        });
      }
    } catch {
      // Entry stays in queue for next sync attempt
    }
  }
  db.close();
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("fitness-offline", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("offline-logs")) {
        db.createObjectStore("offline-logs", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAllEntries(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    const keyReq = store.getAllKeys();
    req.onsuccess = () => {
      keyReq.onsuccess = () => {
        const entries = req.result.map((entry, i) => ({
          ...entry,
          id: keyReq.result[i],
        }));
        resolve(entries);
      };
    };
    req.onerror = () => reject(req.error);
  });
}
