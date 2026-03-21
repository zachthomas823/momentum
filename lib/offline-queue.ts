// IndexedDB-based offline logging queue
// Stores failed API POSTs and drains them when connectivity returns.

const DB_NAME = "fitness-offline";
const DB_VERSION = 1;
const STORE_NAME = "offline-logs";

interface QueueEntry {
  url: string;
  body: Record<string, unknown>;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Queue a log entry for later sync.
 * Stores {url, body, timestamp} in IndexedDB.
 */
export async function queueLog(
  url: string,
  body: Record<string, unknown>
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const entry: QueueEntry = { url, body, timestamp: Date.now() };
  store.add(entry);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Drain all queued entries by POSTing them in chronological order.
 * Deletes entries on successful POST. Returns counts.
 */
export async function drainQueue(): Promise<{
  sent: number;
  failed: number;
}> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  const entries = await new Promise<(QueueEntry & { id: number })[]>(
    (resolve, reject) => {
      const dataReq = store.getAll();
      const keyReq = store.getAllKeys();
      dataReq.onsuccess = () => {
        keyReq.onsuccess = () => {
          const results = (dataReq.result as QueueEntry[]).map((entry, i) => ({
            ...entry,
            id: keyReq.result[i] as number,
          }));
          resolve(results);
        };
        keyReq.onerror = () => reject(keyReq.error);
      };
      dataReq.onerror = () => reject(dataReq.error);
    }
  );

  let sent = 0;
  let failed = 0;

  // Sort by timestamp to ensure chronological order
  entries.sort((a, b) => a.timestamp - b.timestamp);

  for (const entry of entries) {
    try {
      const res = await fetch(entry.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.body),
      });
      if (res.ok) {
        const delTx = db.transaction(STORE_NAME, "readwrite");
        delTx.objectStore(STORE_NAME).delete(entry.id);
        await new Promise<void>((resolve, reject) => {
          delTx.oncomplete = () => resolve();
          delTx.onerror = () => reject(delTx.error);
        });
        sent++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  db.close();
  return { sent, failed };
}
