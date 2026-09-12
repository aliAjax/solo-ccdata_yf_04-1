import type { Phrase, PracticeRecord } from './types';

const DB_NAME = 'shadowing-lab';
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('phrases')) {
          db.createObjectStore('phrases', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('phraseId', 'phraseId', { unique: false });
        }
        // v1 created "audios" with an inline keyPath that Blob values cannot
        // satisfy; it never stored anything successfully, so recreate it with
        // out-of-line keys (record id -> Blob).
        if (db.objectStoreNames.contains('audios')) {
          db.deleteObjectStore('audios');
        }
        db.createObjectStore('audios');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('无法打开本地数据库'));
    });
  }
  return dbPromise;
}

/** Run a transaction and resolve when it completes. Aborts if a write throws. */
async function run(stores: string[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => void): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    try {
      fn(tx);
    } catch (err) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('数据库写入失败'));
    tx.onabort = () => reject(tx.error ?? new Error('数据库事务被中止'));
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function getOne<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export interface RecordWithAudio {
  record: PracticeRecord;
  audio: Blob | null;
}

export const db = {
  getPhrases: () => getAll<Phrase>('phrases'),
  getRecords: () => getAll<PracticeRecord>('records'),
  getAudio: (id: string) => getOne<Blob>('audios', id),

  putPhrase: (p: Phrase) => run(['phrases'], 'readwrite', tx => {
    tx.objectStore('phrases').put(p);
  }),

  putRecord: (r: PracticeRecord, audio?: Blob) => run(['records', 'audios'], 'readwrite', tx => {
    tx.objectStore('records').put(r);
    if (audio) tx.objectStore('audios').put(audio, r.id);
  }),

  /** Delete a record and its audio blob. */
  deleteRecord: (id: string) => run(['records', 'audios'], 'readwrite', tx => {
    tx.objectStore('records').delete(id);
    tx.objectStore('audios').delete(id);
  }),

  /** Delete a phrase plus all of its records and audio blobs. */
  deletePhraseCascade: (phraseId: string, recordIds: string[]) =>
    run(['phrases', 'records', 'audios'], 'readwrite', tx => {
      tx.objectStore('phrases').delete(phraseId);
      for (const rid of recordIds) {
        tx.objectStore('records').delete(rid);
        tx.objectStore('audios').delete(rid);
      }
    }),

  bulkImport: (phrases: Phrase[], records: RecordWithAudio[]) =>
    run(['phrases', 'records', 'audios'], 'readwrite', tx => {
      for (const p of phrases) tx.objectStore('phrases').put(p);
      for (const { record, audio } of records) {
        tx.objectStore('records').put(record);
        if (audio) tx.objectStore('audios').put(audio, record.id);
      }
    }),
};
