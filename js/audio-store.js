/**
 * audio-store.js — gemmer lydoptagelser (Blob) i IndexedDB.
 *
 * Hvorfor IndexedDB? localStorage kan kun gemme tekst og har typisk en
 * grænse på ~5 MB. IndexedDB kan gemme Blobs direkte, så optagelser
 * overlever genindlæsning og kan afspilles fra Arkiv.
 *
 * Hvis IndexedDB ikke er tilgængelig (fx visse private browservinduer),
 * falder vi tilbage til en Map i hukommelsen — optagelsen kan så kun
 * afspilles indtil siden genindlæses.
 */

const DB_NAME = 'dagshub';
const STORE = 'audio';
const memoryFallback = new Map();
let dbPromise = null;

function openDb() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB mangler'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  }));
}

export async function putAudio(id, blob) {
  try {
    await tx('readwrite', (s) => s.put(blob, id));
  } catch {
    memoryFallback.set(id, blob);
  }
}

export async function getAudio(id) {
  try {
    return (await tx('readonly', (s) => s.get(id))) ?? memoryFallback.get(id) ?? null;
  } catch {
    return memoryFallback.get(id) ?? null;
  }
}

export async function deleteAudio(id) {
  memoryFallback.delete(id);
  try { await tx('readwrite', (s) => s.delete(id)); } catch { /* ignorer */ }
}

export async function clearAudio() {
  memoryFallback.clear();
  try { await tx('readwrite', (s) => s.clear()); } catch { /* ignorer */ }
}
