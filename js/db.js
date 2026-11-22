// Almacenamiento local en IndexedDB: un documento con todo el estado + un almacén para audios.
const DB_NAME = 'pmo-obra';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

export const kvGet = key => tx('kv', 'readonly', s => s.get(key));
export const kvSet = (key, value) => tx('kv', 'readwrite', s => s.put(value, key));
export const audioGet = id => tx('audio', 'readonly', s => s.get(id));
export const audioSet = (id, blob) => tx('audio', 'readwrite', s => s.put(blob, id));
export const audioDel = id => tx('audio', 'readwrite', s => s.delete(id));

export const DEFAULT_STATE = () => ({
  version: 1,
  projects: [],
  updates: [],
  minutes: [],
  tasks: [],
  events: [],
  schedules: {},   // projectId -> { fileName, xml, importedAt }
  finance: [],
  settings: { workStart: 8, workEnd: 18, lunchStart: 14, lunchEnd: 15, workDays: [1, 2, 3, 4, 5], hoursPerDay: 8 }
});

export async function loadState() {
  const saved = await kvGet('state');
  const base = DEFAULT_STATE();
  if (!saved) return base;
  return { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
}

let saveTimer;
export function saveState(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvSet('state', state).catch(err => console.error('Error al guardar', err)), 150);
}

// Pedir al navegador que no borre los datos automáticamente.
export async function requestPersistence() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* opcional */ }
}
