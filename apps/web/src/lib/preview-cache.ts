import type { KnowledgeItem } from '@studydocs/shared';

// Preview data is independent of resumable download chunks. Cache failures must
// never prevent reading (private browsing, quota exhaustion, disabled IndexedDB).
const DATABASE = 'studydocs-previews';
const STORE = 'files';
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_FILES = 12;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export const MAX_PREVIEW_BYTES = 100 * 1024 * 1024;
interface Entry { key: string; blob: Blob; accessed: number }

export function previewKey(owner: string, item: KnowledgeItem): string {
  return JSON.stringify([owner, item.id, item.version, item.storageId]);
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('预览缓存暂不可用'));
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}
export async function readPreview(key: string): Promise<Blob | undefined> {
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const done = complete(tx);
    void done.catch(() => {});
    const objectStore = tx.objectStore(STORE);
    const entry = await result<Entry | undefined>(objectStore.get(key));
    if (entry) {
      if (Date.now() - entry.accessed > MAX_AGE) objectStore.delete(key);
      else objectStore.put({ ...entry, accessed: Date.now() });
    }
    await done;
    return entry && Date.now() - entry.accessed <= MAX_AGE ? entry.blob : undefined;
  } catch { return undefined; }
  finally { db?.close(); }
}
export async function savePreview(key: string, blob: Blob): Promise<void> {
  if (!blob.size || blob.size > MAX_PREVIEW_BYTES) return;
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const done = complete(tx);
    void done.catch(() => {});
    const objectStore = tx.objectStore(STORE);
    const entries = await result<Entry[]>(objectStore.getAll());
    const candidates = entries.filter((entry) => entry.key !== key).sort((a, b) => b.accessed - a.accessed);
    let bytes = blob.size;
    let count = 1;
    for (const entry of candidates) {
      if (Date.now() - entry.accessed > MAX_AGE || bytes + entry.blob.size > MAX_BYTES || count >= MAX_FILES) objectStore.delete(entry.key);
      else { bytes += entry.blob.size; count++; }
    }
    objectStore.put({ key, blob, accessed: Date.now() } satisfies Entry);
    await done;
  } catch { /* A full or unavailable cache is optional. */ }
  finally { db?.close(); }
}
