/**
 * Noter — enkel notevisning pr. møde, bygget til tablet under mødet.
 *
 * #noter?d=YYYY-MM-DD           → dagens møder (fra forsiden) som store felter
 * #noter?d=YYYY-MM-DD&k=P3      → noteredigering for mødet P3 på forsiden
 *
 * Logget ind: noten gemmes i OneDrive som
 *   Sekretærassistent/Dage/<dato>/noter/<HH.MM Titel>.md
 * med autosave (ca. 1,5 sek. efter du holder op med at skrive). Hvert
 * tastetryk gemmes straks som lokal kladde, så intet går tabt uden net;
 * kladden sendes, når der er forbindelse igen. Er filen ændret fra en anden
 * enhed imens, flettes teksterne (se sync.js → note.put).
 *
 * Ikke logget ind: noten gemmes kun som kladde på denne enhed.
 */

import * as api from '../api.js';
import { esc, toast, dateKey, addDaysKey, fromDateKey, formatLongDate } from '../utils.js';
import { getSync, localDrafts, noteBody, composeNote } from '../sync.js';
import { relativeDayLabel } from '../components.js';
import * as auth from '../auth.js';

export const title = 'Noter';

const AUTOSAVE_MS = 1500;
const text = (x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : '');

const cphFmt = (opts) => new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hourCycle: 'h23', ...opts });
function hm(iso, sep = ':') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = cphFmt({ hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  return `${p.find((x) => x.type === 'hour').value}${sep}${p.find((x) => x.type === 'minute').value}`;
}

/** Filnavn uden tegn, OneDrive ikke tillader. */
export function safeName(s) {
  return String(s || 'Møde').replace(/["*:<>?/\\|#%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '');
}

export function notePath(date, item) {
  const t = hm(item.start, '.') || '00.00';
  return `Dage/${date}/noter/${t} ${safeName(item.title)}.md`;
}

function noteHeaderFor(date, item) {
  const when = [formatLongDate(fromDateKey(date, 12)), [hm(item.start), hm(item.end)].filter(Boolean).join('–')].filter(Boolean).join(', ');
  const people = (item.attendees || []).map(text).filter(Boolean);
  return [
    `# ${text(item.title) || 'Møde'}`,
    '',
    `- **Tid:** ${when}`,
    item.location ? `- **Sted:** ${text(item.location)}` : '',
    people.length ? `- **Deltagere:** ${people.join(', ')}` : '',
    `- **Forside:** ${text(item.key)} (${date}) · skrevet i Dagshub`,
  ].filter((l, i) => l || i === 1).join('\n');
}

/** Forsiden for en dato: OneDrive, når logget ind; ellers HUB_DATA.front. */
async function loadFront(date) {
  const sync = getSync();
  if (sync.shared) {
    const f = await sync.get(`Dage/${date}/forside.json`, null);
    return f ? { ...f, items: f.items || [] } : null;
  }
  const data = await api.getHubData();
  const f = data.front;
  if (f && (!date || f.date === date)) return f;
  return null;
}

/* ------------------------------------------------------------------ */
/* Oversigt                                                            */
/* ------------------------------------------------------------------ */

async function renderList(root, date) {
  const sync = getSync();
  const front = await loadFront(date);
  const meetings = (front?.items || []).filter((it) => it.kind === 'møde')
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const existing = sync.shared ? (await sync.list(`Dage/${date}/noter`)).filter((f) => !f.isFolder) : [];
  const names = new Set(existing.map((f) => f.name));
  const today = dateKey();
  const days = [addDaysKey(today, -1), today, addDaysKey(today, 1)];
  if (front?.date && !days.includes(front.date) && !sync.shared) days.push(front.date);

  const stateOf = (it) => {
    const path = notePath(date, it);
    const d = sync.shared ? sync.backend.getDraft(path) : localDrafts.get(path);
    if (d && !d.synced && d.body) return sync.shared ? 'Kladde – ikke sendt endnu' : 'Kladde på denne enhed';
    if (names.has(path.split('/').pop())) return 'Noter gemt i OneDrive';
    if (d?.body) return sync.shared ? 'Noter gemt i OneDrive' : 'Kladde på denne enhed';
    return 'Ingen noter endnu';
  };

  root.innerHTML = `
    <section class="section page-head">
      <div>
        <p class="eyebrow">${esc(formatLongDate(fromDateKey(date, 12)))}</p>
        <h1>Noter</h1>
        <p class="summary">Vælg mødet, og skriv løs. Alt gemmes automatisk${sync.shared ? ' i OneDrive' : ' på denne enhed'}.</p>
      </div>
    </section>
    ${sync.shared ? '' : `<p class="notice">${auth.getStatus() === 'off' ? 'Login er ikke sat op endnu, så noter gemmes kun på denne enhed.' : 'Du er ikke logget ind, så noter gemmes kun på denne enhed. Log ind med Microsoft for at gemme dem i OneDrive.'}</p>`}
    <nav class="day-switch" aria-label="Vælg dag">
      ${days.map((d) => `<a class="btn btn-lg ${d === date ? 'btn-primary' : 'btn-ghost'}" href="#noter?d=${d}" ${d === date ? 'aria-current="page"' : ''}>${esc(relativeDayLabel(d, today))}</a>`).join('')}
    </nav>
    ${meetings.length ? `<div class="note-tiles">${meetings.map((it) => `
      <a class="note-tile card" href="#noter?d=${encodeURIComponent(date)}&k=${encodeURIComponent(it.key)}">
        <span class="note-tile-time">${esc([hm(it.start), hm(it.end)].filter(Boolean).join('–'))}</span>
        <span class="note-tile-title">${esc(text(it.title))}</span>
        ${it.location ? `<span class="note-tile-meta">${esc(text(it.location))}</span>` : ''}
        <span class="note-tile-state">${esc(stateOf(it))}</span>
      </a>`).join('')}</div>`
    : `<p class="empty">${front ? 'Ingen møder på forsiden for denne dag.' : 'Der er ingen forside for denne dag endnu.'}</p>`}
  `;
}

/* ------------------------------------------------------------------ */
/* Redigering                                                          */
/* ------------------------------------------------------------------ */

async function renderEditor(root, date, key) {
  const sync = getSync();
  const od = sync.shared;
  const front = await loadFront(date);
  const item = (front?.items || []).find((it) => it.key === key);
  if (!item) {
    root.innerHTML = `<section class="card"><h2>Mødet blev ikke fundet</h2><p>Punkt ${esc(key)} findes ikke på forsiden for ${esc(date)}.</p><a class="btn btn-lg" href="#noter?d=${esc(date)}">Tilbage til møderne</a></section>`;
    return null;
  }
  const path = notePath(date, item);
  const header = noteHeaderFor(date, item);

  let body = '';
  let base = null;
  if (od) {
    const draft = sync.backend.getDraft(path);
    let remote = null;
    try {
      const e = await sync.backend.entry(path);
      remote = e && !e.missing ? noteBody(e.text) : null;
    } catch (err) { toast(`Kunne ikke hente noten: ${err.message}`); }
    if (draft && !draft.synced) { body = draft.body; base = draft.base ?? remote; }
    else if (remote !== null) { body = remote; base = remote; }
    else if (draft) { body = draft.body; base = draft.base ?? null; }
    sync.backend.saveDraft(path, { body, base, synced: draft ? draft.synced : remote !== null, header });
  } else {
    body = localDrafts.get(path)?.body || '';
  }

  const people = (item.attendees || []).map(text).filter(Boolean);
  root.innerHTML = `
    <section class="note-editor">
      <div class="note-top">
        <a class="btn btn-ghost btn-lg" href="#noter?d=${esc(date)}">← Møderne</a>
        <a class="btn btn-primary btn-lg" href="#idag" data-note-done>Færdig</a>
      </div>
      <p class="eyebrow">${esc([formatLongDate(fromDateKey(date, 12)), [hm(item.start), hm(item.end)].filter(Boolean).join('–')].filter(Boolean).join(' · '))}</p>
      <h1 class="note-title">${esc(text(item.title))}</h1>
      ${item.location ? `<p class="meta-line">${esc(text(item.location))}</p>` : ''}
      ${people.length ? `<p class="meta-line">${esc(people.join(', '))}</p>` : ''}
      <p class="note-status" id="note-status" aria-live="polite"></p>
      <div class="note-tools" role="group" aria-label="Indsæt">
        <button class="btn btn-lg" data-insert="Handling: ">+ Handling</button>
        <button class="btn btn-lg" data-insert="Beslutning: ">+ Beslutning</button>
        <button class="btn btn-lg" data-insert="Spørgsmål: ">+ Spørgsmål</button>
        <button class="btn btn-lg" data-insert="time">Klokkeslæt</button>
      </div>
      <label class="visually-hidden" for="note-body">Noter</label>
      <textarea id="note-body" class="note-text" placeholder="Skriv dine noter her …" spellcheck="true" autocapitalize="sentences" autocomplete="off"></textarea>
      <p class="hint">Skriv "Handling: …", "Beslutning: …" eller "Spørgsmål: …" på hver sin linje, så kan Grok Bot tage dem med i referatet og på den fælles liste om aftenen.</p>
    </section>`;

  const ta = root.querySelector('#note-body');
  const statusEl = root.querySelector('#note-status');
  ta.value = body;

  const setStatus = (msg, warn = false) => {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-warn', warn);
  };

  function describe() {
    if (!od) {
      setStatus(auth.getStatus() === 'off' ? 'Gemt på denne enhed (login er ikke sat op).' : 'Gemt på denne enhed. Log ind for at gemme i OneDrive.', true);
      return;
    }
    const d = sync.backend.getDraft(path);
    const st = sync.status();
    if (d?.synced) setStatus(`Gemt i OneDrive${d.syncedAt ? ` kl. ${hm(d.syncedAt)}` : ''}.`);
    else if (st.failed) setStatus('Kunne ikke gemme i OneDrive. Noten ligger sikkert på enheden.', true);
    else if (!st.online || !auth.isSignedIn()) setStatus('Gemt på enheden – sendes til OneDrive, når der er net.', true);
    else setStatus('Gemmer …');
  }

  let timer = null;
  function pushNow() {
    clearTimeout(timer);
    timer = null;
    if (!od) return;
    const d = sync.backend.getDraft(path);
    if (!d || d.synced) return;
    sync.apply(path, 'note.put', { header, body: d.body, base: d.base ?? null }).then((r) => r.done).then(describe, describe);
    describe();
  }

  ta.addEventListener('input', () => {
    if (od) {
      const d = sync.backend.getDraft(path) || {};
      sync.backend.saveDraft(path, { ...d, body: ta.value, synced: false, header });
    } else {
      localDrafts.save(path, { body: ta.value, header, file: composeNote(header, ta.value) });
    }
    if (od) setStatus('Gemt på enheden …');
    else describe();
    clearTimeout(timer);
    timer = setTimeout(pushNow, AUTOSAVE_MS);
  });
  ta.addEventListener('blur', pushNow);

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-insert]');
    if (!b) return;
    e.preventDefault();
    const what = b.dataset.insert === 'time' ? `${hm(new Date().toISOString())} ` : b.dataset.insert;
    const { selectionStart: s, selectionEnd: en, value } = ta;
    const before = value.slice(0, s);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    ta.setRangeText(`${prefix}${what}`, s, en, 'end');
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  });

  const onVis = () => { if (document.visibilityState === 'hidden') pushNow(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', pushNow);
  const off = sync.onChange(describe);

  describe();
  if (od) { const d = sync.backend.getDraft(path); if (d && !d.synced && d.body) pushNow(); }
  setTimeout(() => ta.focus(), 50);

  return () => {
    pushNow();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', pushNow);
    off();
  };
}

export async function render(root, params) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') || '') ? params.get('d') : null;
  const key = params.get('k');
  let d = date;
  if (!d) {
    const sync = getSync();
    d = dateKey();
    if (!sync.shared) {
      const data = await api.getHubData();
      if (data.front?.date) d = data.front.date;
    }
  }
  if (key) return renderEditor(root, d, key);
  await renderList(root, d);
  return null;
}
