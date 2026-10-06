/**
 * components.js — genbrugelige HTML-stumper, der deles mellem views.
 * Alle funktioner returnerer HTML-strenge; data escapes med esc().
 */

import {
  esc, formatTimeRange, formatDayMonth, formatShortDate, dateKey, addDaysKey, fromDateKey,
} from './utils.js';

export const ICONS = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3z"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17h14M3 13l2-6h14l2 6v5H3z"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

/** Er mødet i gang lige nu? */
export const isOngoing = (m, now = new Date()) => new Date(m.start) <= now && now < new Date(m.end);
/** Er mødet slut? */
export const isPast = (m, now = new Date()) => new Date(m.end) <= now;

/** Deltagere uden dig selv (self: true), fx "Line Brandt (Nordlys Energi), Søren …" */
export function attendeeNames(m, { withOrg = true } = {}) {
  return m.attendees
    .filter((a) => !a.self)
    .map((a) => (withOrg ? `${a.name} (${a.org})` : a.name));
}

export function locationHtml(m) {
  return m.location.type === 'physical'
    ? `${ICONS.pin}<span>${esc(m.location.address)}</span>`
    : `${ICONS.video}<span>${esc(m.location.label)} (online)</span>`;
}

/** Mødekort som bruges i Morgen- og Uge-visningen. */
export function meetingCard(m, { actions = '', now = new Date() } = {}) {
  const ongoing = isOngoing(m, now);
  const past = isPast(m, now);
  const names = attendeeNames(m);
  return `
    <article class="meeting ${ongoing ? 'is-ongoing' : ''} ${past ? 'is-past' : ''}" data-id="${esc(m.id)}">
      <div class="meeting-time">
        <span>${esc(formatTimeRange(m.start, m.end))}</span>
        ${ongoing ? '<span class="badge badge-live">I gang</span>' : ''}
        ${m.location.type === 'online' ? '<span class="badge">Online</span>' : ''}
      </div>
      <h3 class="meeting-title">${esc(m.title)}</h3>
      <p class="meeting-client">${esc(m.client)}</p>
      <p class="meta">${locationHtml(m)}</p>
      ${names.length ? `<p class="meta">${ICONS.people}<span>${esc(names.join(', '))}</span></p>` : ''}
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </article>`;
}

/** Tag for kilde/konto, fx Outlook, Gmail, Privat, HubSpot. */
export function sourceTag(source) {
  const cls = String(source).toLowerCase().replace(/[^a-zæøå]/g, '');
  return `<span class="tag tag-${esc(cls)}">${esc(source)}</span>`;
}

/** "I dag", "I morgen", "I går" eller "torsdag den 8. oktober". */
export function relativeDayLabel(key, today = dateKey()) {
  if (key === today) return 'I dag';
  if (key === addDaysKey(today, 1)) return 'I morgen';
  if (key === addDaysKey(today, -1)) return 'I går';
  return formatDayMonth(fromDateKey(key, 12));
}

/** Kort dato med ugedag: "tor. 08.10.2026" */
export function shortDayLabel(key) {
  const d = fromDateKey(key, 12);
  const wd = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'short' }).format(d);
  return `${wd} ${formatShortDate(d)}`;
}

/** Tom-tilstand */
export const empty = (text) => `<p class="empty">${esc(text)}</p>`;

/**
 * Tydelig fejl med "Prøv igen" og en udfoldelig teknisk detalje, som brugeren
 * kan tage et billede af. `detail` er ren tekst (escapes her).
 *   errorPanel({ title, lead, detail, retry: true, reauth: false, reset: false })
 * Knapper: [data-retry], [data-reauth], [data-reset-app] – håndteres af viewet/app.js.
 */
export function errorPanel({ title = 'Noget gik galt', lead = '', detail = '', retry = true, reauth = false, reset = false } = {}) {
  return `
    <section class="card error error-panel" role="alert">
      <h2>${esc(title)}</h2>
      ${lead ? `<p>${esc(lead)}</p>` : ''}
      <div class="error-actions">
        ${retry ? '<button class="btn btn-primary btn-lg" data-retry>Prøv igen</button>' : ''}
        ${reauth ? '<button class="btn btn-ms btn-lg" data-reauth>Log ind igen</button>' : ''}
      </div>
      ${detail ? `<details class="tech-detail"><summary>Teknisk detalje</summary><pre>${esc(detail)}</pre>
        ${reset ? '<button class="btn btn-ghost btn-small" data-reset-app>Nulstil app-cache og genindlæs</button>' : ''}</details>` : ''}
    </section>`;
}

/** Dansk forklaring ud fra fejltypen (TimeoutError, NetworkError, AuthNeededError, GraphError …). */
export function explainError(e) {
  const name = e?.name || '';
  const status = Number(e?.status) || 0;
  if (name === 'TimeoutError') return 'Microsoft svarede ikke inden for 15 sekunder. Det skyldes oftest et ustabilt net eller en forsinkelse hos Microsoft.';
  if (name === 'NetworkError') return 'Dagshub kunne ikke få forbindelse til Microsoft Graph. Tjek nettet, eller om et netværk/filter blokerer graph.microsoft.com.';
  if (name === 'OfflineError') return 'Der er ingen forbindelse til internettet lige nu.';
  if (name === 'AuthNeededError' || status === 401) return 'Login hos Microsoft skal fornyes.';
  if (status === 403) return 'Microsoft afviste adgangen (403). Mangler app-registreringen tilladelsen Files.ReadWrite, eller er den ikke godkendt?';
  if (status === 404) return 'Filen eller mappen findes ikke i OneDrive.';
  if (status >= 500) return `Microsoft havde en fejl (HTTP ${status}). Prøv igen om lidt.`;
  return 'Der opstod en uventet fejl.';
}
