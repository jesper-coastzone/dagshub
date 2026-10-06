/**
 * I dag — første stop, når computeren tændes.
 *
 * Alt indhold kommer fra data/hub-data.js (window.HUB_DATA) via
 * api.getHubData(). Skemaet er beskrevet i README.md. Alle felter er
 * valgfrie: manglende eller tomme felter giver tomme tilstande i stedet for
 * fejl. Genvejene linker ud til de rigtige apps — de genskabes ikke her.
 *
 * Rækkefølge (ét samlet overblik): Dagens forside (front) →
 * Åbne handlinger (actions) → brief/møder → referater → dokumenter.
 *
 * To datakilder med samme form:
 *  - Logget ind (OneDrive): hentes direkte fra OneDrive › Sekretærassistent
 *    via js/sync.js + js/hub-model.js. "Klaret", "Ret" og "Luk" skrives
 *    tilbage i handlinger.json / forside.json (med eTag/If-Match).
 *  - Ikke logget ind / intet clientId: data/hub-data.js (window.HUB_DATA),
 *    genereret af /workspace/sekretaer/build_hub.py. "Markér klaret" gemmes
 *    kun på enheden; den fælles liste opdateres via Grok Bot ("B er klaret").
 */

import * as api from '../api.js';
import {
  esc, $, toast, formatLongDate, formatTime, formatShortDate, fromDateKey,
} from '../utils.js';
import { sourceTag, empty, ICONS, errorPanel, explainError } from '../components.js';
import { withTimeout } from '../timeout.js';
import { techDetail, resetAppCache } from '../diagnostics.js';
import { getSync } from '../sync.js';
import { loadOneDriveHub } from '../hub-model.js';
import { renderMarkdown } from '../markdown.js';
import * as auth from '../auth.js';
import {
  speak, stopSpeaking, isSpeechSupported, sentencesFrom,
} from '../speech.js';

export const title = 'I dag';

/** Faste genveje til de rigtige apps. */
const SHORTCUTS = [
  { label: 'Outlook mail', url: 'https://outlook.office.com/mail/', tag: 'outlook' },
  { label: 'Outlook kalender', url: 'https://outlook.office.com/calendar/', tag: 'outlook' },
  { label: 'Gmail', url: 'https://mail.google.com/', tag: 'gmail' },
  { label: 'HubSpot', url: 'https://app.hubspot.com/', tag: 'hubspot' },
  { label: 'SharePoint', url: 'https://www.office.com/launch/sharepoint', tag: 'deltdrev' },
  { label: 'OneDrive', url: 'https://www.office.com/launch/onedrive', tag: 'deltdrev' },
];

const MAX_OPEN_ITEMS = 3;

/* ------------------------------------------------------------------ */
/* Robuste hjælpere — data kan være ufuldstændige                      */
/* ------------------------------------------------------------------ */

const list = (x) => (Array.isArray(x) ? x.filter((v) => v !== null && v !== undefined && v !== '') : []);
const text = (x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : '');

/** Gyldig Date eller null. Accepterer ISO-strenge og 'YYYY-MM-DD'. */
function toDate(value) {
  const v = text(value);
  if (!v) return null;
  // 'HH:MM' (som i hub-data.js) tolkes som et klokkeslæt i dag.
  const hm = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (hm) { const t = new Date(); t.setHours(+hm[1], +hm[2], 0, 0); return t; }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? fromDateKey(v, 12) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const timeOf = (v) => { const d = toDate(v); return d ? formatTime(d) : ''; };
const dateOf = (v) => { const d = toDate(v); return d ? formatShortDate(d) : text(v); };

function timeRange(start, end) {
  const a = timeOf(start), b = timeOf(end);
  return a && b ? `${a}–${b}` : a || b;
}

/** Kun http(s)-links tillades (beskytter mod fx javascript:-URL'er i data). */
function safeUrl(value) {
  try {
    const u = new URL(text(value));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Ekstern link med title; falder tilbage til ren tekst uden gyldig URL. */
function extLink(label, url) {
  const href = safeUrl(url);
  return href
    ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
    : esc(label);
}

/** Synlig "Mangler"-markering. */
const gap = (msg) => `<span class="gap"><strong>Mangler:</strong> ${esc(msg)}</span>`;

/** Personer kan være strenge eller {name, org}. */
function personLabel(p) {
  if (typeof p === 'string') return p;
  if (p && typeof p === 'object') return [text(p.name), p.org ? `(${text(p.org)})` : ''].filter(Boolean).join(' ');
  return '';
}

/* ------------------------------------------------------------------ */
/* Sektioner                                                           */
/* ------------------------------------------------------------------ */

function briefSection(brief, canSpeak) {
  const desk = brief?.desk ?? {};
  const meetings = list(desk.meetings)
    .slice()
    .sort((a, b) => (toDate(a?.start)?.getTime() ?? 0) - (toDate(b?.start)?.getTime() ?? 0));
  const openItems = list(desk.openItems).slice(0, MAX_OPEN_ITEMS);
  const extraOpen = Math.max(0, list(desk.openItems).length - MAX_OPEN_ITEMS);

  return `
    <section class="section card brief">
      <div class="section-head">
        <h2>Dagens brief</h2>
        <button class="btn btn-primary" id="hub-read-aloud" ${canSpeak ? '' : 'disabled'}>
          ${ICONS.speaker}<span>Læs op</span>
        </button>
      </div>
      <p class="hint speech-status" id="hub-speech-status" aria-live="polite"></p>
      ${text(desk.overview) ? `<p class="overview">${esc(desk.overview)}</p>` : empty('Intet overblik for i dag.')}

      <h3 class="sub">Møder <span class="count">${meetings.length}</span></h3>
      ${meetings.length ? `<ol class="brief-meetings">
        ${meetings.map((m) => {
          const people = list(m?.attendees).map(personLabel).filter(Boolean);
          return `
          <li>
            <span class="bm-time">${esc(timeRange(m?.start, m?.end)) || '—'}</span>
            <div class="bm-body">
              <p class="bm-title">${esc(text(m?.title) || 'Møde uden titel')}</p>
              ${text(m?.location) ? `<p class="meta">${ICONS.pin}<span>${esc(m.location)}</span></p>` : ''}
              ${people.length ? `<p class="meta">${ICONS.people}<span>${esc(people.join(', '))}</span></p>` : ''}
              ${text(m?.purpose) ? `<p class="bm-line"><span class="label">Formål</span> ${esc(m.purpose)}</p>` : ''}
              ${text(m?.keyFact) ? `<p class="key-fact"><span class="label">Vigtigt</span> ${esc(m.keyFact)}</p>` : ''}
            </div>
          </li>`;
        }).join('')}
      </ol>` : empty('Ingen møder i briefen.')}

      <h3 class="sub">Åbne punkter</h3>
      ${openItems.length ? `<ul class="item-list">
        ${openItems.map((i) => `
          <li>
            <span>${extLink(text(i?.title) || 'Uden titel', i?.url)}</span>
            ${text(i?.source) ? sourceTag(text(i.source)) : ''}
          </li>`).join('')}
      </ul>` : empty('Ingen åbne punkter.')}
      ${extraOpen ? `<p class="hint">+ ${extraOpen} flere åbne punkter.</p>` : ''}
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Dagens forside + åbne handlinger (Sekretærassistenten)              */
/* ------------------------------------------------------------------ */

const DONE_KEY = 'hubDone';
const KIND_LABEL = { møde: 'Møde', handling: 'Handling', opfølgning: 'Opfølgning' };

/** "ons 7/10" for en 'YYYY-MM-DD'-frist. */
function dueLabel(key) {
  const d = toDate(key);
  if (!d) return text(key);
  const wd = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'short' }).format(d).replace('.', '');
  const p = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'numeric' }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t)?.value ?? '';
  return `${wd} ${get('day')}/${get('month')}`;
}

const frontDoneKey = (front, it) => `front:${text(front?.date)}:${text(it?.key)}`;
const actionDoneKey = (id) => `action:${text(id)}`;

/** Tekst, der fortæller hvordan den fælles liste bliver opdateret. */
function closeHint(letter, title) {
  return letter
    ? `Markeret lokalt. Sig „${letter} er klaret“ til Grok Bot, så den fælles liste bliver opdateret.`
    : `Markeret lokalt. Sig til Grok Bot, at „${title}“ er klaret, så punktet lukkes ved dagsafslutningen.`;
}

function linkButtons(links) {
  const ok = list(links).filter((l) => safeUrl(l?.url));
  if (!ok.length) return '';
  return `<div class="front-links">${ok.map((l) => `
    <a class="btn btn-small ${l.type === 'noter' ? 'btn-primary' : 'btn-ghost'}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">
      ${esc(text(l.label) || 'Åbn')} <span aria-hidden="true">↗</span>
    </a>`).join('')}</div>`;
}

/** Link til notevisningen i appen for et møde på forsiden. */
const notesHref = (front, it) => `#noter?d=${encodeURIComponent(text(front?.date))}&k=${encodeURIComponent(text(it?.key))}`;

function frontItemOd(front, it) {
  const isDone = it?.status === 'lukket';
  const people = list(it?.attendees);
  const time = it?.kind === 'møde' ? timeRange(it?.start, it?.end) : '';
  const carried = text(it?.carriedFrom);
  const key = text(it?.key);
  return `
    <article class="card front-item kind-${esc(text(it?.kind))} ${isDone ? 'is-done' : ''}">
      <div class="front-head">
        ${time ? `<span class="front-time">${esc(time)}</span>` : ''}
        ${text(it?.letter) ? `<span class="letter" title="Bogstav i den fælles liste">${esc(it.letter)}</span>` : ''}
        <span class="badge">${esc(KIND_LABEL[it?.kind] || 'Punkt')}</span>
        ${carried ? `<span class="badge badge-carried">Fra ${esc(dateOf(carried))}</span>` : ''}
      </div>
      <h3>${esc(text(it?.title) || 'Punkt uden titel')}</h3>
      ${text(it?.location) ? `<p class="meta">${ICONS.pin}<span>${esc(it.location)}</span></p>` : ''}
      ${people.length ? `<p class="meta">${ICONS.people}<span>${esc(people.join(', '))}</span></p>` : ''}
      ${text(it?.detail) ? `<p class="front-detail">${esc(it.detail)}</p>` : ''}
      ${list(it?.context).length ? `<ul class="bullets front-context">${list(it.context).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${it?.kind === 'møde' ? `<a class="btn btn-primary btn-block" href="${esc(notesHref(front, it))}">Skriv noter i appen</a>` : ''}
      ${linkButtons(it?.links)}
      <div class="front-foot">
        ${isDone
          ? `<span class="done-label">${ICONS.check}Lukket${text(it?.closedAt) ? ` kl. ${esc(timeOf(it.closedAt))}` : ''}</span>
             <button class="btn btn-ghost btn-small" data-front-reopen="${esc(key)}">Genåbn</button>`
          : `<button class="btn btn-small" data-front-close="${esc(key)}" ${it?.kind === 'handling' ? `data-action="${esc(text(it.actionId))}"` : ''}>${ICONS.check}<span>${it?.kind === 'møde' ? 'Noter er skrevet – luk' : 'Luk punktet'}</span></button>`}
      </div>
    </article>`;
}

function frontItem(front, it, done, od = false) {
  if (od) return frontItemOd(front, it);
  const key = frontDoneKey(front, it);
  const isDone = Boolean(done[key]) || it?.status === 'lukket'
    || (it?.kind === 'handling' && done[actionDoneKey(it.actionId)]);
  const people = list(it?.attendees);
  const time = it?.kind === 'møde' ? timeRange(it?.start, it?.end) : '';
  const carried = text(it?.carriedFrom);
  return `
    <article class="card front-item kind-${esc(text(it?.kind))} ${isDone ? 'is-done' : ''}">
      <div class="front-head">
        ${time ? `<span class="front-time">${esc(time)}</span>` : ''}
        ${text(it?.letter) ? `<span class="letter" title="Bogstav i den fælles liste">${esc(it.letter)}</span>` : ''}
        <span class="badge">${esc(KIND_LABEL[it?.kind] || 'Punkt')}</span>
        ${carried ? `<span class="badge badge-carried">Fra ${esc(dateOf(carried))}</span>` : ''}
      </div>
      <h3>${esc(text(it?.title) || 'Punkt uden titel')}</h3>
      ${text(it?.location) ? `<p class="meta">${ICONS.pin}<span>${esc(it.location)}</span></p>` : ''}
      ${people.length ? `<p class="meta">${ICONS.people}<span>${esc(people.join(', '))}</span></p>` : ''}
      ${text(it?.detail) ? `<p class="front-detail">${esc(it.detail)}</p>` : ''}
      ${list(it?.context).length ? `<ul class="bullets front-context">${list(it.context).map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${it?.kind === 'møde' ? `<a class="btn btn-primary btn-block" href="${esc(notesHref(front, it))}">Skriv noter i appen</a>` : ''}
      ${linkButtons(it?.links)}
      <div class="front-foot">
        ${isDone
          ? `<span class="done-label">${ICONS.check}Klaret</span>
             ${it?.status === 'lukket' ? '' : `<button class="btn btn-ghost btn-small" data-undo="${esc(key)}" ${it?.kind === 'handling' ? `data-action="${esc(text(it.actionId))}"` : ''}>Fortryd</button>`}`
          : `<button class="btn btn-small" data-done="${esc(key)}" data-letter="${esc(text(it?.letter))}" data-title="${esc(text(it?.title))}" ${it?.kind === 'handling' ? `data-action="${esc(text(it.actionId))}"` : ''}>${ICONS.check}<span>Markér klaret</span></button>`}
      </div>
      ${isDone && it?.status !== 'lukket' ? `<p class="hint close-hint">${esc(closeHint(text(it?.letter), text(it?.title)))}</p>` : ''}
    </article>`;
}

function frontSection(front, done, od = false) {
  if (!front || typeof front !== 'object') return '';
  const items = list(front.items);
  const open = items.filter((it) => !(done[frontDoneKey(front, it)] || it?.status === 'lukket'));
  const title = text(front.date) ? `Dagens forside · ${formatLongDate(toDate(front.date))}` : 'Dagens forside';
  return `
    <section class="section front">
      <div class="section-head">
        <h2>${esc(title)} <span class="count">${open.length}/${items.length}</span></h2>
        ${safeUrl(front.url) ? `<a class="btn btn-ghost btn-small" href="${esc(safeUrl(front.url))}" target="_blank" rel="noopener noreferrer">Forside.md ↗</a>` : ''}
      </div>
      <p class="hint">${front.olderThanToday ? '<strong>Dagens forside er ikke bygget endnu – viser den seneste.</strong> ' : ''}Det, der er relevant i dag. Punkterne lukkes, når du har bekræftet, at noterne er skrevet. Resten ruller videre.</p>
      ${items.length
        ? `<div class="front-grid">${items.map((it) => frontItem(front, it, done, od)).join('')}</div>`
        : front.error ? `<p class="section-error">Forsiden kunne ikke hentes: ${esc(text(front.error.message))}</p>`
          : (text(front.missing) ? gap(front.missing) : empty('Ingen punkter på forsiden i dag.'))}
      ${list(front.skipped).length ? `<p class="hint">Ikke med: ${esc(list(front.skipped).map((s) => `${text(s.title)} (${text(s.reason)})`).join('; '))}.</p>` : ''}
    </section>`;
}

function actionEditForm(a) {
  return `
    <form class="action-edit" data-edit-form="${esc(text(a?.id))}">
      <label class="field">
        <span>Ansvarlig</span>
        <input name="owner" type="text" autocomplete="off" value="${esc(text(a?.owner))}" placeholder="Hvem gør det?">
      </label>
      <label class="field">
        <span>Frist</span>
        <input name="due" type="date" value="${esc(text(a?.due))}">
      </label>
      <div class="edit-buttons">
        <button class="btn btn-primary btn-lg" type="submit">Gem</button>
        <button class="btn btn-ghost btn-lg" type="button" data-edit-cancel>Annullér</button>
      </div>
    </form>`;
}

function actionRow(a, done, od = false, editing = '') {
  const key = actionDoneKey(a?.id);
  const isDone = !od && Boolean(done[key]);
  const missing = list(a?.missing);
  const owner = text(a?.owner);
  const due = text(a?.due);
  const src = a?.source ?? {};
  const srcLabel = [dateOf(src.date), text(src.start)].filter(Boolean).join(' ')
    + (text(src.referatName) ? ` · ${text(src.referatName).replace(/^\d{4}-\d{2}-\d{2} \d{2}\.\d{2} /, '').replace(/\.md$/, '')}` : '');
  return `
    <li class="action-row ${missing.length ? 'has-missing' : ''} ${isDone ? 'is-done' : ''}">
      <span class="letter">${esc(text(a?.letter) || '–')}</span>
      <div class="action-body">
        <p class="action-text">${esc(text(a?.text) || 'Handling uden beskrivelse')}${text(a?.company) ? ` <span class="meta-inline">· ${esc(a.company)}</span>` : ''}</p>
        <div class="action-meta">
          ${owner ? `<span class="pill">${esc(owner)}</span>` : gap('ansvarlig')}
          ${due ? `<span class="pill ${a?.overdue ? 'pill-overdue' : a?.dueToday ? 'pill-today' : ''}">Frist ${esc(dueLabel(due))}${a?.overdue ? ' · forfalden' : a?.dueToday ? ' · i dag' : ''}</span>` : gap('frist')}
          <span class="meta-line">${src.referatUrl ? extLink(srcLabel || 'Referat', src.referatUrl) : esc(srcLabel || text(src.title))} · ${esc(text(a?.id))}</span>
        </div>
        ${isDone ? `<p class="hint close-hint">${esc(closeHint(text(a?.letter)))}</p>` : ''}
        ${od && editing === text(a?.id) ? actionEditForm(a) : ''}
        ${od && editing !== text(a?.id) ? `<button class="link-btn" data-edit-action="${esc(text(a?.id))}">Ret ansvarlig/frist</button>` : ''}
      </div>
      ${od
        ? `<button class="icon-btn check-btn" data-action-close="${esc(text(a?.id))}" data-letter="${esc(text(a?.letter))}" aria-label="Markér ${esc(text(a?.letter))} som klaret" title="Markér klaret">${ICONS.check}</button>`
        : isDone
          ? `<button class="btn btn-ghost btn-small" data-undo="${esc(key)}">Fortryd</button>`
          : `<button class="icon-btn check-btn" data-done="${esc(key)}" data-letter="${esc(text(a?.letter))}" aria-label="Markér ${esc(text(a?.letter))} som klaret" title="Markér klaret">${ICONS.check}</button>`}
    </li>`;
}

function actionsSection(actions, done, od = false, editing = '') {
  if (!actions || typeof actions !== 'object') return '';
  const open = list(actions.open);
  const groups = [['kunde', 'Kunde'], ['intern', 'Internt']];
  const closed = list(actions.closedRecent);
  const nMissing = open.filter((a) => list(a?.missing).length).length;
  return `
    <section class="section card actions-card">
      <div class="section-head">
        <h2>Åbne handlinger <span class="count">${open.length}</span></h2>
        ${safeUrl(actions.listUrl) ? `<a class="btn btn-ghost btn-small" href="${esc(safeUrl(actions.listUrl))}" target="_blank" rel="noopener noreferrer">Handlinger.md ↗</a>` : ''}
      </div>
      ${actions.error ? `<p class="section-error">Handlingerne kunne ikke hentes: ${esc(text(actions.error.message))}</p>` : ''}
      ${text(actions.note) ? gap(actions.note) : ''}
      <p class="hint">${od ? 'Tryk ✓, når en handling er klaret – det gemmes i den fælles liste i OneDrive. Du kan også sige „A er klaret“ til Grok Bot.' : 'Luk med ét ord: sig fx „A er klaret“ eller „A og C er klaret“ til Grok Bot.'}${nMissing ? ` ${nMissing} mangler ansvarlig eller frist.` : ''}</p>
      ${groups.map(([kind, label]) => {
        const rows = open.filter((a) => (a?.kind === 'intern' ? 'intern' : 'kunde') === kind);
        return `
          <h3 class="sub">${esc(label)} <span class="count">${rows.length}</span></h3>
          ${rows.length ? `<ul class="action-rows">${rows.map((a) => actionRow(a, done, od, editing)).join('')}</ul>` : empty('Ingen.')}`;
      }).join('')}
      ${closed.length ? `
        <details class="closed-recent">
          <summary>Lukket de sidste 7 dage (${closed.length})</summary>
          <ul class="bullets">${closed.map((a) => `<li><s>${esc(text(a?.text))}</s> <span class="meta-inline">· ${esc(text(a?.id))}${text(a?.closedAt) ? ` · ${esc(dateOf(a.closedAt))} kl. ${esc(timeOf(a.closedAt))}` : ''}</span>${od ? ` <button class="link-btn" data-action-reopen="${esc(text(a?.id))}">Genåbn</button>` : ''}</li>`).join('')}</ul>
        </details>` : ''}
      ${text(actions.updatedAt) ? `<p class="meta-line">Fælles liste opdateret ${esc(dateOf(actions.updatedAt))} kl. ${esc(timeOf(actions.updatedAt))}${od ? ' · gemmes i OneDrive' : ' · lokale markeringer gemmes kun på denne enhed'}.</p>` : ''}
    </section>`;
}

function recapCard(r) {
  const people = list(r?.attendees).map(personLabel).filter(Boolean);
  const agreed = list(r?.agreed).map(text).filter(Boolean);
  const actions = list(r?.actions);
  const gaps = list(r?.gaps).map(text).filter(Boolean);
  const when = [dateOf(r?.date || r?.start), timeRange(r?.start, r?.end)].filter(Boolean).join(' · ');

  return `
    <article class="card recap">
      <h3>${esc(text(r?.title) || 'Møde uden titel')}</h3>
      ${when ? `<p class="meta-line">${esc(when)}</p>` : ''}
      ${people.length ? `<p class="meta">${ICONS.people}<span>${esc(people.join(', '))}</span></p>` : ''}

      <h4>Hvad handlede det om</h4>
      ${text(r?.about) ? `<p>${esc(r.about)}</p>` : gap('Ingen beskrivelse af mødet.')}

      <h4>Aftalt</h4>
      ${agreed.length
        ? `<ul class="bullets">${agreed.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`
        : gap('Ingen aftaler registreret.')}

      <h4>Åbne handlinger</h4>
      ${actions.length ? `<ul class="actions-list">
        ${actions.map((a) => {
          const label = typeof a === 'string' ? a : text(a?.text);
          const owner = typeof a === 'object' ? text(a?.owner) : '';
          const due = typeof a === 'object' ? text(a?.due) : '';
          return `
          <li>
            <span>${esc(label || 'Handling uden beskrivelse')}</span>
            <span class="action-meta">
              ${owner ? `<span class="pill">${esc(owner)}</span>` : gap('ejer')}
              ${due ? `<span class="pill">Frist ${esc(dateOf(due))}</span>` : gap('frist')}
            </span>
          </li>`;
        }).join('')}
      </ul>` : gap('Ingen handlinger registreret.')}

      ${gaps.length ? `
        <div class="gaps">
          <h4>Mangler</h4>
          <ul>${gaps.map((g) => `<li>${gap(g)}</li>`).join('')}</ul>
        </div>` : ''}
    </article>`;
}

function referaterSection(data) {
  const refs = list(data.referater).slice(0, 12);
  return `
    <section class="section">
      <div class="section-head">
        <h2>Referater <span class="count">${refs.length}</span></h2>
        ${safeUrl(data.referaterUrl) ? `<a class="btn btn-ghost btn-small" href="${esc(safeUrl(data.referaterUrl))}" target="_blank" rel="noopener noreferrer">Mappen ↗</a>` : ''}
      </div>
      ${refs.length ? `<div class="stack referater">${refs.map((r) => `
        <details class="card referat" data-referat="${esc(r.name)}">
          <summary>
            <span class="ref-when">${esc([dateOf(r.date), text(r.start)].filter(Boolean).join(' '))}</span>
            <span class="ref-title">${esc(r.title)}</span>
          </summary>
          <div class="referat-body md"><p class="loading">Henter …</p></div>
          ${safeUrl(r.webUrl) ? `<p><a href="${esc(safeUrl(r.webUrl))}" target="_blank" rel="noopener noreferrer">Åbn i OneDrive ↗</a></p>` : ''}
        </details>`).join('')}</div>` : empty('Ingen referater de sidste 14 dage.')}
    </section>`;
}

/** Fejl ved indlæsning fra OneDrive: tydelig besked, "Prøv igen" og teknisk detalje. */
function loadErrorPanel(data) {
  const errs = list(data.errors);
  if (!errs.length) return '';
  const first = errs[0];
  const authIssue = errs.some((e) => e.name === 'AuthNeededError' || e.status === 401);
  return errorPanel({
    title: data.failed ? 'Dine data kunne ikke hentes fra OneDrive' : 'Noget kunne ikke hentes fra OneDrive',
    lead: `${explainError(first)}${data.failed ? '' : ' Det, der kunne hentes, vises nedenfor.'}`,
    detail: techDetail(errs),
    retry: true,
    reauth: authIssue,
    reset: true,
  });
}

/** Login-kort øverst, når appen ikke er logget ind på OneDrive. */
function loginCard(status) {
  if (status === 'signed-in') return '';
  if (status === 'redirecting') {
    return `
      <section class="card login-card">
        <div><h2>Logger ind igen hos Microsoft …</h2><p>Siden skifter til Microsoft og kommer tilbage hertil.</p></div>
      </section>`;
  }
  if (status === 'off') {
    return `
      <section class="card login-card is-off">
        <div>
          <h2>Dine egne data kræver login</h2>
          <p>Siden viser data fra <code>data/hub-data.js</code>. Login med Microsoft er ikke sat op endnu: appen mangler et Client ID fra app-registreringen i Microsoft Entra.</p>
        </div>
        <button class="btn btn-ms btn-lg" data-login>${MS_LOGO}<span>Log ind med Microsoft</span></button>
      </section>`;
  }
  return `
    <section class="card login-card">
      <div>
        <h2>${status === 'needs-login' ? 'Log ind igen' : 'Log ind for at se dine data'}</h2>
        ${auth.getLastError() ? `<p class="section-error">Seneste login-forsøg fejlede: ${esc(auth.getLastError())}</p>
          <details class="tech-detail"><summary>Teknisk detalje</summary><pre>${esc(techDetail([]))}</pre></details>` : ''}
        <p>Med din Microsoft-konto henter Dagshub forsiden, handlingerne og referaterne direkte fra OneDrive › Sekretærassistent, og dine ændringer gemmes samme sted – på computer, telefon og tablet.</p>
      </div>
      <button class="btn btn-ms btn-lg" ${status === 'needs-login' ? 'data-reauth' : 'data-login'}>${MS_LOGO}<span>Log ind med Microsoft</span></button>
    </section>`;
}

export const MS_LOGO = '<svg class="ms-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';

function syncLine(data, st) {
  if (data.source !== 'onedrive') return '';
  const parts = ['OneDrive'];
  if (data.fetchedAt) parts.push(`hentet ${timeOf(data.fetchedAt)}`);
  if (data.stale || !st.online) parts.push('offline – viser sidst hentede data');
  if (st.pending) parts.push(`${st.pending} ${st.pending === 1 ? 'ændring venter' : 'ændringer venter'} på at blive gemt`);
  if (st.failed) parts.push(`${st.failed} kunne ikke gemmes`);
  return `<p class="sync-line ${st.pending || st.failed || data.stale ? 'is-warn' : ''}">${esc(parts.join(' · '))}</p>`;
}

function documentsSection(documents) {
  const docs = list(documents)
    .slice()
    .sort((a, b) => (toDate(b?.date)?.getTime() ?? 0) - (toDate(a?.date)?.getTime() ?? 0));
  return `
    <section class="section">
      <h2>Dokumenter <span class="count">${docs.length}</span></h2>
      ${docs.length ? `<ul class="item-list doc-list">
        ${docs.map((d) => `
          <li>
            <span class="doc-title">${extLink(text(d?.title) || 'Dokument uden titel', d?.url)}</span>
            <span class="action-meta">
              ${text(d?.source) ? sourceTag(text(d.source)) : ''}
              ${text(d?.date) ? `<span class="meta-line">${esc(dateOf(d.date))}</span>` : ''}
            </span>
          </li>`).join('')}
      </ul>` : empty('Ingen dokumenter.')}
    </section>`;
}

function shortcutsSection() {
  return `
    <section class="section">
      <h2>Genveje</h2>
      <div class="shortcuts">
        ${SHORTCUTS.map((s) => `
          <a class="shortcut tag-${s.tag}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
            ${esc(s.label)} <span aria-hidden="true">↗</span>
          </a>`).join('')}
      </div>
    </section>`;
}

/** Manuskript til oplæsning; falder tilbage til desk-data, hvis audioScript mangler. */
function audioSentences(brief) {
  const script = text(brief?.audioScript);
  if (script) return sentencesFrom(script);
  const desk = brief?.desk ?? {};
  const s = [];
  if (text(desk.overview)) s.push(desk.overview);
  list(desk.meetings).forEach((m) => {
    const t = timeOf(m?.start);
    if (text(m?.title)) s.push(`${t ? `Klokken ${t.replace('.', ' ').replace(/ 00$/, '')}: ` : ''}${m.title}.`);
  });
  list(desk.openItems).slice(0, MAX_OPEN_ITEMS).forEach((i) => text(i?.title) && s.push(`${i.title}.`));
  return s;
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export async function render(root) {
  let data = {};
  let speaking = false;
  const sync = getSync();
  const od = sync.shared;
  let done = {};
  let editing = '';
  const openRefs = new Set();

  async function paint({ quiet = false } = {}) {
    if (od) {
      try {
        // Hvert kald har sin egen grænse på 15 s; hele indlæsningen højst 18 s.
        data = await withTimeout(loadOneDriveHub(sync), 18000, 'indlæs "I dag" fra OneDrive');
      } catch (err) {
        console.error(err);
        data = {
          source: 'onedrive', failed: true, front: null, actions: null,
          errors: [{ part: 'Indlæsning', name: err?.name, message: err?.message || String(err), call: err?.call || '', status: err?.status }],
        };
      }
      if (quiet && data.failed && root.querySelector('.front, .actions-card')) {
        // Baggrundsopdatering fejlede: behold det viste og giv besked i stedet for at tømme siden.
        toast(`Kunne ikke opdatere fra OneDrive: ${list(data.errors)[0]?.message || ''}`, { timeout: 6000 });
        return;
      }
      done = {};
    } else {
      data = await api.getHubData();
      done = await sync.get(DONE_KEY, {});
    }
    const briefDate = toDate(data.briefDate) ?? new Date();
    const generated = toDate(data.generatedAt);
    const recaps = list(data.recaps);
    const canSpeak = isSpeechSupported() && audioSentences(data.brief).length > 0;

    root.innerHTML = `
      <section class="section page-head">
        <div>
          <p class="eyebrow">${esc(formatLongDate(briefDate))}</p>
          <h1>I dag ${data.example ? '<span class="badge badge-example">Eksempeldata</span>' : ''}</h1>
          <p class="summary">
            ${generated ? `Opdateret ${esc(formatShortDate(generated))} kl. ${esc(formatTime(generated))}` : 'Intet opdateringstidspunkt'}
          </p>
          ${syncLine(data, sync.status())}
        </div>
        <button class="btn btn-ghost btn-small" id="hub-reload">Opdater</button>
      </section>

      ${loginCard(auth.getStatus())}
      ${od ? loadErrorPanel(data) : ''}

      ${Object.keys(data).length || od ? '' : `
        <div class="placeholder-box">
          <strong>Ingen data</strong>
          <p>data/hub-data.js blev ikke fundet eller satte ikke window.HUB_DATA.</p>
        </div>`}

      ${frontSection(data.front, done, od)}
      ${actionsSection(data.actions, done, od, editing)}

      ${data.brief || !od ? briefSection(data.brief, canSpeak) : ''}

      ${od ? referaterSection(data) : ''}
      ${recaps.length || !od ? `
      <section class="section">
        <h2>Mødereferater <span class="count">${recaps.length}</span></h2>
        <div class="stack recaps">
          ${recaps.map(recapCard).join('') || empty('Ingen mødereferater.')}
        </div>
      </section>` : ''}

      ${data.documents || !od ? documentsSection(data.documents) : ''}
      ${shortcutsSection()}
    `;
    // Genåbn referater, der var foldet ud.
    openRefs.forEach((name) => {
      const el = root.querySelector(`details[data-referat="${CSS.escape(name)}"]`);
      if (el) { el.open = true; loadReferat(el); }
    });
  }

  async function loadReferat(el) {
    const name = el.dataset.referat;
    const body = el.querySelector('.referat-body');
    if (!body || body.dataset.loaded) return;
    try {
      const md = await sync.get(`Referater/${name}`, '');
      body.innerHTML = md ? renderMarkdown(md) : empty('Referatet er tomt.');
      body.dataset.loaded = '1';
    } catch (err) {
      body.innerHTML = `<p class="gap">${esc(err.message)}</p>`;
    }
  }

  /** Gem en ændring i OneDrive og fortæl, om den er sendt eller venter. */
  async function saveOd(changes, okMsg) {
    let pendingDone = null;
    for (const [key, op, args] of changes) {
      const r = await sync.apply(key, op, args);
      pendingDone = r.done;
    }
    await paint({ quiet: true });
    const st = sync.status();
    if (st.pending && (!st.online || !auth.isSignedIn())) {
      toast(`${okMsg} Gemmes i OneDrive, når der er net igen.`, { timeout: 5000 });
      return;
    }
    try {
      const r = await pendingDone;
      await paint({ quiet: true });
      const st2 = sync.status();
      if (st2.failed) toast('Ændringen kunne ikke gemmes i OneDrive. Se status øverst.', { timeout: 6000 });
      else if (st2.pending) toast(`${okMsg} Gemmes i OneDrive, når der er forbindelse.`, { timeout: 5000 });
      else toast(`${okMsg} Gemt i OneDrive${r?.conflicts ? ' (flettet med en samtidig ændring)' : ''}.`, { timeout: 4000 });
    } catch (err) {
      toast(err.message, { timeout: 6000 });
    }
  }

  function setSpeaking(on, status = '') {
    speaking = on;
    const btn = $('#hub-read-aloud', root);
    if (btn) {
      btn.innerHTML = on ? `${ICONS.stop}<span>Stop</span>` : `${ICONS.speaker}<span>Læs op</span>`;
      btn.classList.toggle('is-active', on);
    }
    const s = $('#hub-speech-status', root);
    if (s) s.textContent = status;
  }

  root.addEventListener('toggle', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLDetailsElement) || !el.dataset.referat) return;
    if (el.open) { openRefs.add(el.dataset.referat); loadReferat(el); } else openRefs.delete(el.dataset.referat);
  }, true);

  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-edit-form]');
    if (!form) return;
    e.preventDefault();
    const id = form.dataset.editForm;
    const owner = form.elements.owner.value;
    const due = form.elements.due.value;
    editing = '';
    await saveOd([['handlinger.json', 'action.edit', { id, owner, due }]], 'Rettet.');
  });

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-retry]')) {
      const btn = t.closest('[data-retry]');
      btn.disabled = true; btn.textContent = 'Henter …';
      await paint();
      return;
    }
    if (t.closest('[data-reauth]')) {
      try { await auth.reauth(); } catch (err) { toast(err.message, { timeout: 6000 }); }
      return;
    }
    if (t.closest('[data-reset-app]')) { await resetAppCache(); return; }
    if (t.closest('[data-login]')) {
      if (!auth.isConfigured()) {
        toast('Login er ikke sat op endnu: config.js mangler et Client ID fra app-registreringen i Microsoft Entra.', { timeout: 7000 });
        return;
      }
      try { await auth.login(); } catch (err) { toast(err.message, { timeout: 6000 }); }
      return;
    }
    if (od) {
      const close = t.closest('[data-action-close]');
      const reopen = t.closest('[data-action-reopen]');
      const fclose = t.closest('[data-front-close]');
      const freopen = t.closest('[data-front-reopen]');
      const edit = t.closest('[data-edit-action]');
      const at = new Date().toISOString();
      if (close) {
        await saveOd([['handlinger.json', 'action.close', { id: close.dataset.actionClose, at }]],
          `${close.dataset.letter ? `${close.dataset.letter} er` : 'Handlingen er'} markeret som klaret.`);
        return;
      }
      if (reopen) { await saveOd([['handlinger.json', 'action.reopen', { id: reopen.dataset.actionReopen }]], 'Genåbnet.'); return; }
      if (fclose) {
        const changes = [[`Dage/${data.front.date}/forside.json`, 'front.close', { key: fclose.dataset.frontClose, at }]];
        if (fclose.dataset.action) changes.push(['handlinger.json', 'action.close', { id: fclose.dataset.action, at }]);
        await saveOd(changes, 'Punktet er lukket.');
        return;
      }
      if (freopen) { await saveOd([[`Dage/${data.front.date}/forside.json`, 'front.reopen', { key: freopen.dataset.frontReopen }]], 'Genåbnet.'); return; }
      if (edit) {
        editing = edit.dataset.editAction;
        await paint({ quiet: true });
        root.querySelector(`[data-edit-form="${CSS.escape(editing)}"] input`)?.focus();
        return;
      }
      if (t.closest('[data-edit-cancel]')) { editing = ''; await paint({ quiet: true }); return; }
    }
    if (e.target.closest('#hub-read-aloud')) {
      if (speaking) {
        stopSpeaking();
        setSpeaking(false);
        return;
      }
      const sentences = audioSentences(data.brief);
      setSpeaking(true);
      try {
        const { voice } = await speak(sentences, { onProgress: (i) => setSpeaking(true, sentences[i]) });
        if (!voice) toast('Ingen dansk stemme fundet — bruger standardstemmen.');
      } catch (err) {
        toast(err.message);
      }
      setSpeaking(false);
    } else if (e.target.closest('[data-done]')) {
      const btn = e.target.closest('[data-done]');
      const keys = [btn.dataset.done];
      if (btn.dataset.action) keys.push(`action:${btn.dataset.action}`);
      const stamp = new Date().toISOString();
      await sync.update(DONE_KEY, (m) => { const n = { ...(m || {}) }; keys.forEach((k) => { n[k] = stamp; }); return n; }, {});
      await paint();
      toast(closeHint(btn.dataset.letter, btn.dataset.title), { timeout: 6000 });
    } else if (e.target.closest('[data-undo]')) {
      const btn = e.target.closest('[data-undo]');
      const keys = [btn.dataset.undo];
      if (btn.dataset.action) keys.push(`action:${btn.dataset.action}`);
      await sync.update(DONE_KEY, (m) => { const n = { ...(m || {}) }; keys.forEach((k) => delete n[k]); return n; }, {});
      await paint();
    } else if (e.target.closest('#hub-reload')) {
      try {
        if (od) { await sync.flush(); await paint(); toast('Hentet fra OneDrive'); return; }
        await api.reloadHubData();
        stopSpeaking();
        await paint();
        toast('Data opdateret');
      } catch (err) {
        toast(err.message);
      }
    }
  });

  await paint();

  // OneDrive: hent igen med jævne mellemrum, når appen er synlig, og når køen er sendt.
  let timer = null;
  let offChange = () => {};
  const onVisible = () => { if (document.visibilityState === 'visible' && !editing) paint({ quiet: true }); };
  if (od) {
    timer = setInterval(() => { if (document.visibilityState === 'visible' && !editing) paint({ quiet: true }); }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);
    let last = JSON.stringify(sync.status());
    offChange = sync.onChange((st) => {
      const now = JSON.stringify({ ...st, lastSync: null });
      if (now !== last && !editing) { last = now; paint({ quiet: true }); }
    });
  }
  return () => {
    stopSpeaking();
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    offChange();
  };
}
