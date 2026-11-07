import { FlashcardInfographic } from '../types/flashcards';

const DATABASE_NAME = 'studylab-workspace';
const STORE_NAME = 'infographics';
const DATABASE_VERSION = 1;

interface StoredInfographic extends Omit<FlashcardInfographic, 'image'> {
  image: Blob;
}

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('Image storage is unavailable in this browser.'));
    return;
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'id' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Could not open image storage.'));
});

const runTransaction = async <T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not update image storage.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update image storage.'));
  });
};

export const InfographicsStorage = {
  async list(): Promise<FlashcardInfographic[]> {
    const records = await runTransaction<StoredInfographic[]>((store) => store.getAll());
    return records ?? [];
  },

  async put(infographic: FlashcardInfographic): Promise<void> {
    await runTransaction<IDBValidKey>((store) => store.put(infographic));
  },

  async remove(id: string): Promise<void> {
    await runTransaction<undefined>((store) => store.delete(id));
  },

  async clear(): Promise<void> {
    await runTransaction<undefined>((store) => store.clear());
  },
};
