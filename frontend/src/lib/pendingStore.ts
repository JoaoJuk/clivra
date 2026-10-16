const databaseName = 'cartao-shared-text';
export const pendingMaxAge = 10 * 60 * 1000;
export type PendingStore = 'incoming' | 'push-actions';
type TimedValue = { createdAt?: number };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onupgradeneeded = () => {
      for (const name of ['incoming', 'push-actions']) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function isFresh(value: TimedValue): boolean {
  const age = Date.now() - (value.createdAt ?? NaN);
  return Number.isFinite(age) && age >= 0 && age < pendingMaxAge;
}

export async function prunePendingData(clear = false): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['incoming', 'push-actions'], 'readwrite');
      for (const name of ['incoming', 'push-actions']) {
        const store = transaction.objectStore(name);
        if (clear) { store.clear(); continue; }
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (!isFresh(cursor.value as TimedValue)) cursor.delete();
          cursor.continue();
        };
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function savePendingValue(store: PendingStore, value: object): Promise<void> {
  await prunePendingData();
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, 'readwrite');
      transaction.objectStore(store).add({ ...value, createdAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function takePendingValue<T>(store: PendingStore): Promise<T | null> {
  await prunePendingData();
  const database = await openDatabase();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      let value: T | null = null;
      const transaction = database.transaction(store, 'readwrite');
      const request = transaction.objectStore(store).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (isFresh(cursor.value as TimedValue)) value = cursor.value as T;
        cursor.delete();
        if (!value) cursor.continue();
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
