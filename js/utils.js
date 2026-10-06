/**
 * utils.js — små, rene hjælpefunktioner uden afhængigheder.
 *
 * Alt dato/tid formateres i Europe/Copenhagen med dansk sprog (da-DK) og
 * 24-timers ur, uanset hvilken tidszone browseren/enheden står i.
 */

export const TIME_ZONE = 'Europe/Copenhagen';
export const LOCALE = 'da-DK';

/* ------------------------------------------------------------------ */
/* Tidszone-sikre datohjælpere                                         */
/* ------------------------------------------------------------------ */

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
});

/** Returnerer {year, month, day, hour, minute, second, weekday} for en Date i København. */
export function cphParts(date = new Date()) {
  const p = Object.fromEntries(
    partsFormatter.formatToParts(date).map((x) => [x.type, x.value]),
  );
  const year = Number(p.year), month = Number(p.month), day = Number(p.day);
  // Ugedag beregnes ud fra kalenderdatoen (0 = søndag … 6 = lørdag).
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year, month, day,
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
    weekday,
  };
}

/**
 * Bygger en Date ud fra et vægur-tidspunkt i København
 * (fx 2026-10-06 10:00 dansk tid), uanset browserens tidszone.
 * Måneder er 1-baserede.
 */
export function cphDate(year, month, day, hour = 0, minute = 0) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // To iterationer håndterer skift mellem sommer- og vintertid korrekt.
  let ts = asUtc - offsetMs(asUtc);
  ts = asUtc - offsetMs(ts);
  return new Date(ts);
}

/** Københavns UTC-offset (ms) på et givet tidspunkt. */
function offsetMs(ts) {
  const p = cphParts(new Date(ts));
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wall - Math.floor(ts / 1000) * 1000;
}

/** 'YYYY-MM-DD' for datoen i København — bruges som nøgle til gruppering. */
export function dateKey(date = new Date()) {
  const p = cphParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Date (kl. 00:00 dansk tid) ud fra en 'YYYY-MM-DD'-nøgle. */
export function fromDateKey(key, hour = 0, minute = 0) {
  const [y, m, d] = key.split('-').map(Number);
  return cphDate(y, m, d, hour, minute);
}

/** Lægger et antal kalenderdage til en dato-nøgle og returnerer ny nøgle. */
export function addDaysKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Ugedag (0 = søndag) for en dato-nøgle. */
export function weekdayOfKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Næste forekomst af en ugedag (0–6) strengt efter i dag, som dato-nøgle. */
export function nextWeekdayKey(targetWeekday, fromKey = dateKey()) {
  const diff = (targetWeekday - weekdayOfKey(fromKey) + 7) % 7 || 7;
  return addDaysKey(fromKey, diff);
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

/* ------------------------------------------------------------------ */
/* Dansk formatering                                                   */
/* ------------------------------------------------------------------ */

const fmtLongDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const fmtDayMonth = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long',
});
const fmtShortDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
});
const fmtTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Tirsdag den 6. oktober 2026" */
export const formatLongDate = (d) => capitalize(fmtLongDate.format(toDate(d)));
/** "Tirsdag den 6. oktober" */
export const formatDayMonth = (d) => capitalize(fmtDayMonth.format(toDate(d)));
/** "06.10.2026" */
export const formatShortDate = (d) => fmtShortDate.format(toDate(d));
/** "09.30" (dansk notation, 24-timers ur) */
export const formatTime = (d) => fmtTime.format(toDate(d));
/** "09.30–10.30" */
export const formatTimeRange = (a, b) => `${formatTime(a)}–${formatTime(b)}`;

/** Varighed i minutter som dansk tekst: "1 t 15 min" */
export function formatMinutes(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} t ${m} min` : `${h} t`;
}

/** Timer-visning mm:ss */
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}

/* ------------------------------------------------------------------ */
/* DOM-hjælpere                                                        */
/* ------------------------------------------------------------------ */

/** Escaper tekst før den indsættes i en HTML-skabelon. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Tagged template der returnerer en DocumentFragment. Brug esc() på data. */
export function html(strings, ...values) {
  const tpl = document.createElement('template');
  tpl.innerHTML = strings.reduce((acc, s, i) => acc + s + (i < values.length ? values[i] : ''), '');
  return tpl.content;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Viser en kort besked nederst på skærmen. */
export function toast(message, { timeout = 3200 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

/** Lille ventefunktion — bruges til at simulere netværksforsinkelse i mock-API'et. */
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kort, unik id (tilstrækkelig til lokal brug). */
export const uid = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** ISO-ugenummer (dansk standard) for en dato-nøgle. */
export function isoWeek(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayNum = dt.getUTCDay() || 7; // mandag = 1 … søndag = 7
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum); // torsdag i samme uge
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}
