/**
 * store.js — tynd wrapper om localStorage til appens lokale tilstand.
 *
 * Gemmes i localStorage (overlever genstart af browseren, pr. enhed):
 *   notes           Mødenoter (inkl. action items og arkiveret-flag)
 *   parked          Parkerede mails (opfølgning) med kopi af mailen
 *   logged          Møde-id'er der er "logget i HubSpot" (mock)
 *   blocks          Accepterede transportblokke (mock)
 *   doneItems       Åbne punkter markeret som klaret
 *   decided         Beslutninger markeret som truffet
 *
 * Lydoptagelser gemmes IKKE her (for store) — se js/audio-store.js (IndexedDB).
 */

const PREFIX = 'dagshub:v1:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('[store] Kunne ikke gemme', key, err);
  }
}

/** Læs-ændr-gem i ét kald: update('logged', (list) => [...list, id], []) */
export function update(key, fn, fallback) {
  const next = fn(load(key, fallback));
  save(key, next);
  return next;
}

/** Sletter al lokal tilstand for appen (bruges til "Nulstil demo"). */
export function clearAll() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
