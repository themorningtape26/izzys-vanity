// A fresh connection per operation avoids stale IndexedDB handles after iOS suspends a tab.
export function createLocalStore(indexedDBImpl = globalThis.indexedDB) {
  async function run(key, value, write, attempt = 0) {
    let db;
    try {
      db = await new Promise((resolve, reject) => {
        const request = indexedDBImpl.open('izzys-vanity', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('collection')) request.result.createObjectStore('collection');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close older vanity tabs and try again.'));
      });
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('collection', write ? 'readwrite' : 'readonly');
        const store = tx.objectStore('collection');
        const request = write ? (value === undefined ? store.delete(key) : store.put(value, key)) : store.get(key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('Device save interrupted. Please retry.'));
      });
    } catch (error) {
      if (attempt === 0 && ['InvalidStateError', 'UnknownError', 'AbortError'].includes(error.name)) {
        db?.close();
        return run(key, value, write, 1);
      }
      throw error;
    } finally { db?.close(); }
  }
  return { get: key => run(key), set: (key, value) => run(key, value, true), remove: key => run(key, undefined, true) };
}
