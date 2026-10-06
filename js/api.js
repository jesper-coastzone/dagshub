/**
 * api.js — appens ENESTE datalag.
 *
 * Views kalder kun funktionerne herfra. Alle funktioner er async og
 * returnerer Promises, så mock-implementeringerne kan udskiftes med rigtige
 * kald (Microsoft Graph, Gmail API, HubSpot via backend-proxy) uden at
 * røre ved views.
 *
 * Status pr. funktion:
 *   MOCK   = fiktive data fra data/mock.js
 *   LOKAL  = rigtig funktionalitet, men gemt lokalt i browseren
 *
 * Se README.md, afsnittet "Vejen til live", for hvilke endpoints der skal
 * bruges i stedet.
 */

import * as mock from '../data/mock.js';
import * as store from './store.js';
import * as audioStore from './audio-store.js';
import { analyseTransport } from './travel.js';
import {
  dateKey, fromDateKey, addDaysKey, delay, uid,
} from './utils.js';

/** Simuleret netværksforsinkelse, så UI'et opfører sig som med rigtige kald. */
const LATENCY_MS = 60;

/* ------------------------------------------------------------------ */
/* Møder (MOCK → Microsoft Graph: GET /me/calendarView)                */
/* ------------------------------------------------------------------ */

/** Dagens møder, sorteret, beriget med lokalt "logget i HubSpot"-flag. */
export async function getTodayMeetings() {
  await delay(LATENCY_MS);
  const logged = new Set(store.load('logged', []));
  return mock.mockTodayMeetings(dateKey())
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .map((m) => ({ ...m, loggedToHubSpot: logged.has(m.id) }));
}

/** Næste uges møder mandag–fredag. */
export async function getWeekMeetings() {
  await delay(LATENCY_MS);
  return mock.mockWeekMeetings(dateKey())
    .sort((a, b) => new Date(a.start) - new Date(b.start));
}

/** Datoerne (nøgler) for næste uges mandag–fredag. */
export function getNextWeekDays() {
  const mon = mock.nextMondayKey(dateKey());
  return [0, 1, 2, 3, 4].map((n) => addDaysKey(mon, n));
}

/** Finder et møde (i dag eller næste uge) ud fra id. */
export async function getMeeting(id) {
  const all = [...await getTodayMeetings(), ...await getWeekMeetings()];
  return all.find((m) => m.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Åbne punkter og beslutninger (MOCK → HubSpot tasks / Outlook flag)  */
/* ------------------------------------------------------------------ */

export async function getOpenItems() {
  await delay(LATENCY_MS);
  const done = new Set(store.load('doneItems', []));
  return mock.mockOpenItems(dateKey()).map((i) => ({ ...i, done: done.has(i.id) }));
}

/** LOKAL: markér et åbent punkt som klaret / ikke klaret. */
export async function toggleOpenItem(id) {
  const list = store.update('doneItems', (l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]), []);
  return list.includes(id);
}

export async function getDecisions() {
  await delay(LATENCY_MS);
  const decided = new Set(store.load('decided', []));
  return mock.mockDecisions(dateKey()).map((d) => ({ ...d, decided: decided.has(d.id) }));
}

/** LOKAL: markér beslutning som truffet. */
export async function markDecided(id) {
  store.update('decided', (l) => [...new Set([...l, id])], []);
  return true;
}

/* ------------------------------------------------------------------ */
/* HubSpot (MOCK → backend-proxy → POST /crm/v3/objects/meetings)      */
/* ------------------------------------------------------------------ */

/**
 * Logger et møde i HubSpot. MOCK: markerer kun mødet som logget lokalt.
 * @returns {Promise<{ok: boolean, mocked: boolean}>}
 */
export async function logToHubSpot(meetingId) {
  await delay(LATENCY_MS * 3);
  store.update('logged', (l) => [...new Set([...l, meetingId])], []);
  return { ok: true, mocked: true };
}

/* ------------------------------------------------------------------ */
/* Mails (MOCK → Graph /me/messages + Gmail API users.messages.list)   */
/* ------------------------------------------------------------------ */

/** Uberørte mails, minus dem der allerede er parkeret. */
export async function getUntouchedEmails() {
  await delay(LATENCY_MS);
  const parkedIds = new Set(store.load('parked', []).map((p) => p.email.id));
  return mock.mockUntouchedEmails(dateKey()).filter((e) => !parkedIds.has(e.id));
}

/**
 * Parkerer en mail til opfølgning på en dato ('YYYY-MM-DD').
 * LOKAL: gemmer en kopi af mailen + dato. Live: fx Outlook-flag med
 * dueDateTime eller Gmail-label + egen opfølgningsliste.
 */
export async function parkEmail(id, date) {
  await delay(LATENCY_MS);
  const email = mock.mockUntouchedEmails(dateKey()).find((e) => e.id === id);
  if (!email) throw new Error(`Ukendt mail: ${id}`);
  store.update('parked', (l) => [...l.filter((p) => p.email.id !== id), { email, date }], []);
  return { ok: true, mocked: true };
}

/** Fjerner en mail fra opfølgning. */
export async function unparkEmail(id) {
  store.update('parked', (l) => l.filter((p) => p.email.id !== id), []);
  return { ok: true };
}

/** Opfølgningsliste grupperet pr. dato: [{ date, items: [email…] }], sorteret. */
export async function getFollowUps() {
  await delay(LATENCY_MS);
  const groups = new Map();
  store.load('parked', [])
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(({ email, date }) => {
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(email);
    });
  return [...groups].map(([date, items]) => ({ date, items }));
}

/* ------------------------------------------------------------------ */
/* Mødenoter og arkiv (LOKAL: localStorage + IndexedDB til lyd)        */
/* ------------------------------------------------------------------ */

/**
 * Gemmer en mødenote. Lyd gemmes separat i IndexedDB under note-id'et.
 * @param {{meeting, transcript, notes, actionItems: string[]}} data
 * @param {Blob|null} audioBlob
 */
export async function saveMeetingNote(data, audioBlob = null) {
  const note = {
    id: uid('note'),
    meetingId: data.meeting?.id ?? null,
    // Kopi af mødets nøgledata, så noten giver mening efter mock-data skifter.
    meeting: data.meeting
      ? { title: data.meeting.title, client: data.meeting.client, start: data.meeting.start, end: data.meeting.end }
      : null,
    transcript: data.transcript ?? '',
    notes: data.notes ?? '',
    actionItems: data.actionItems ?? [],
    hasAudio: Boolean(audioBlob),
    createdAt: new Date().toISOString(),
    archived: false,
  };
  if (audioBlob) await audioStore.putAudio(note.id, audioBlob);
  store.update('notes', (l) => [note, ...l], []);
  return note;
}

/** Noter der endnu ikke er arkiveret (nyeste først). */
export async function getPendingNotes() {
  return store.load('notes', []).filter((n) => !n.archived);
}

/** Arkiverede noter (nyeste først). */
export async function getArchive() {
  return store.load('notes', []).filter((n) => n.archived);
}

export async function archiveNote(id) {
  store.update('notes', (l) => l.map((n) => (n.id === id ? { ...n, archived: true, archivedAt: new Date().toISOString() } : n)), []);
  return true;
}

export async function deleteNote(id) {
  store.update('notes', (l) => l.filter((n) => n.id !== id), []);
  await audioStore.deleteAudio(id);
  return true;
}

/** Lydoptagelse for en note, eller null. */
export async function getNoteAudio(noteId) {
  return audioStore.getAudio(noteId);
}

/* ------------------------------------------------------------------ */
/* Transportblokke (MOCK-køretider; "Bloker" → Graph POST /me/events)  */
/* ------------------------------------------------------------------ */

/** Transportanalyse for næste uge inkl. lokalt "accepteret"-flag. */
export async function getTransportSuggestions() {
  const meetings = await getWeekMeetings();
  const accepted = new Set(store.load('blocks', []));
  const { hour, minute } = mock.WORKDAY_START;
  return analyseTransport(meetings, {
    office: mock.OFFICE.city,
    dayKeyOf: (iso) => dateKey(new Date(iso)),
    dayStartOf: (key) => fromDateKey(key, hour, minute),
  }).map((s) => ({ ...s, accepted: accepted.has(s.id) }));
}

/** MOCK: markerer en transportblok som accepteret (opretter ikke en rigtig kalenderaftale). */
export async function acceptTransportBlock(id) {
  await delay(LATENCY_MS * 2);
  store.update('blocks', (l) => [...new Set([...l, id])], []);
  return { ok: true, mocked: true };
}

/* ------------------------------------------------------------------ */
/* Hub-data til "I dag" (data/hub-data.js → window.HUB_DATA)           */
/* ------------------------------------------------------------------ */

/**
 * Returnerer indholdet af window.HUB_DATA (sat af data/hub-data.js, som
 * indlæses med et almindeligt <script>-tag i index.html). Returnerer {} hvis
 * filen mangler eller er ugyldig — viewet håndterer tomme felter.
 */
export async function getHubData() {
  const data = window.HUB_DATA;
  return data && typeof data === 'object' ? data : {};
}

/**
 * Henter data/hub-data.js igen uden at genindlæse siden (cache-bust).
 * Bruges af "Opdater"-knappen, når filen er blevet overskrevet.
 */
export function reloadHubData() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `data/hub-data.js?t=${Date.now()}`;
    script.onload = () => { script.remove(); resolve(getHubData()); };
    script.onerror = () => { script.remove(); reject(new Error('Kunne ikke hente data/hub-data.js')); };
    document.head.appendChild(script);
  });
}

/* ------------------------------------------------------------------ */
/* Diverse                                                             */
/* ------------------------------------------------------------------ */

export const OFFICE = mock.OFFICE;
export const SAMPLE_TRANSCRIPT = mock.SAMPLE_TRANSCRIPT;

/** Nulstiller al lokal demo-tilstand (noter, flag, parkeringer, lyd). */
export async function resetDemo() {
  store.clearAll();
  await audioStore.clearAudio();
}
