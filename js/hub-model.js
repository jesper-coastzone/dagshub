/**
 * hub-model.js — samme omformning som /workspace/sekretaer/build_hub.py, bare i
 * browseren: OneDrive-filerne (handlinger.json, Dage/<dato>/forside.json,
 * Referater/) → HUB_DATA-formen, som "I dag" viser (front, actions, referater).
 *
 * Holdes i takt med build_hub.py, så de to veje giver samme visning.
 */

import { dateKey, addDaysKey } from './utils.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const WEEKDAY = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

/** id → bogstav ud fra lastShown (det, brugeren sidst har set). */
export function letters(h) {
  const out = {};
  Object.entries(h?.lastShown || {}).forEach(([k, v]) => { out[v] = k; });
  return out;
}

/** Referatfil ud fra præfikset 'YYYY-MM-DD HH.MM'. */
export function referatFor(sm, refs) {
  if (!sm) return null;
  const prefix = `${sm.date} ${String(sm.start || '').replace(':', '.')}`;
  return (refs || []).filter((r) => !r.isFolder && r.name.endsWith('.md')).sort((a, b) => a.name.localeCompare(b.name))
    .find((r) => r.name.startsWith(prefix)) || null;
}

export function buildActions(h, today, refs = [], listUrl = '') {
  if (!h) return null;
  const L = letters(h);
  const src = (it) => {
    const r = referatFor(it.sourceMeeting, refs);
    const sm = it.sourceMeeting || {};
    return { title: sm.title, date: sm.date, start: sm.start, referatName: r?.name || null, referatUrl: r?.webUrl || null };
  };
  const order = {};
  Object.values(h.lastShown || {}).forEach((v, i) => { order[v] = i; });
  const items = h.items || [];
  const open = items.filter((it) => it.status === 'åben')
    .sort((a, b) => ((order[a.id] ?? 999) - (order[b.id] ?? 999)) || a.id.localeCompare(b.id));
  const cutoff = addDaysKey(today, -7);
  const closed = items.filter((it) => it.status === 'klaret' && String(it.closedAt || '').slice(0, 10) >= cutoff)
    .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
  const pick = (it) => ({
    id: it.id,
    letter: L[it.id] || null,
    text: it.text,
    owner: it.owner,
    due: it.due,
    kind: it.kind,
    company: it.company,
    missing: it.missing || [],
    source: src(it),
    overdue: Boolean(it.due && it.due < today),
    dueToday: it.due === today,
  });
  return {
    updatedAt: h.updatedAt,
    listUrl,
    open: open.map(pick),
    closedRecent: closed.map((it) => ({ ...pick(it), closedAt: it.closedAt })),
    counts: { open: open.length, missing: open.filter((it) => (it.missing || []).length).length, closed7d: closed.length },
  };
}

const FRONT_KEYS = ['key', 'kind', 'title', 'start', 'end', 'location', 'attendees', 'context', 'detail', 'letter',
  'actionId', 'eventId', 'carriedFrom', 'status', 'closedAt', 'links', 'notesFile'];

export function buildFront(f, url = '') {
  if (!f) return null;
  const empty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
  return {
    date: f.date,
    generatedAt: f.generatedAt,
    status: f.status,
    url: f.forsideUrl || url,
    items: (f.items || []).map((it) => Object.fromEntries(FRONT_KEYS.filter((k) => !empty(it[k])).map((k) => [k, it[k]]))),
    relevantActions: f.relevantActions || [],
    upcomingActions: f.upcomingActions || [],
    skipped: f.skipped || [],
  };
}

/** Referater fra de sidste `days` dage, nyeste først. */
export function recentReferater(refs, today, days = 14) {
  const cutoff = addDaysKey(today, -days);
  return (refs || [])
    .filter((r) => !r.isFolder && /\.md$/.test(r.name))
    .map((r) => {
      const m = /^(\d{4}-\d{2}-\d{2}) (\d{2})\.(\d{2}) (.+)\.md$/.exec(r.name);
      return { ...r, date: m?.[1] || '', start: m ? `${m[2]}:${m[3]}` : '', title: m?.[4] || r.name.replace(/\.md$/, '') };
    })
    .filter((r) => !r.date || r.date >= cutoff)
    .sort((a, b) => b.name.localeCompare(a.name));
}

/* ------------------------------------------------------------------ */
/* Handlinger.md (samme opbygning som Sekretærassistentens gen.py)      */
/* ------------------------------------------------------------------ */

function fmtDue(d, today) {
  if (!d) return '**mangler**';
  const dt = new Date(`${d}T12:00:00Z`);
  let s = `${WEEKDAY[dt.getUTCDay()]} ${dt.getUTCDate()}/${dt.getUTCMonth() + 1}`;
  if (d < today) s += ' ⚠️ forfalden';
  else if (d === today) s += ' (i dag)';
  return s;
}

const cph = (iso, opts) => new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', ...opts }).format(new Date(iso));
function closedLabel(iso) {
  const p = new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('weekday').replace('.', '')} ${g('day')}/${g('month')} kl. ${g('hour')}:${g('minute')}`;
}
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderHandlingerMd(h, refs = [], now = new Date()) {
  const today = dateKey(now);
  const L = letters(h);
  const items = h.items || [];
  const byDue = (a, b) => ((a.due === null || a.due === undefined) - (b.due === null || b.due === undefined))
    || String(a.due || '').localeCompare(String(b.due || '')) || a.id.localeCompare(b.id);
  const open = items.filter((x) => x.status === 'åben');
  const kunde = open.filter((x) => x.kind !== 'intern').sort(byDue);
  const intern = open.filter((x) => x.kind === 'intern').sort(byDue);
  const src = (x) => {
    const sm = x.sourceMeeting || {};
    const r = referatFor(sm, refs);
    const d = sm.date ? `${Number(sm.date.slice(8, 10))}/${Number(sm.date.slice(5, 7))}` : '';
    const label = `${d} ${sm.start || ''} ${r ? r.name.slice(17, -3) : (sm.title || '')}`.trim();
    return r?.webUrl ? `[${label}](${r.webUrl})` : label;
  };
  const letterOf = (x) => L[x.id] || '–';
  const table = (rows) => (rows.length ? ['| | Handling | Ansvarlig | Frist | Kilde |', '|---|---|---|---|---|',
    ...rows.map((x) => `| **${letterOf(x)}** | ${cell(x.text)}${x.company ? ` (${cell(x.company)})` : ''} | ${cell(x.owner) || '**mangler**'} | ${fmtDue(x.due, today)} | ${src(x)} · ${x.id} |`)]
    : ['_Ingen._']);
  const cutoff = addDaysKey(today, -7);
  const closed = items.filter((x) => x.status === 'klaret' && String(x.closedAt || '').slice(0, 10) >= cutoff)
    .sort((a, b) => String(b.closedAt).localeCompare(String(a.closedAt)));
  const miss = [...kunde, ...intern].filter((x) => (x.missing || []).length);
  const upd = h.updatedAt || now.toISOString();
  const names = { owner: 'ansvarlig', due: 'frist' };
  const md = ['# Handlinger', '',
    `_Opdateret ${cph(upd, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} kl. ${cph(upd, { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}. ${open.length} åbne · ${closed.length} lukket de sidste 7 dage. Kilden er \`handlinger.json\` – ret ikke her, filen skrives forfra ved hver ændring (af Grok Bot eller Dagshub)._`, '',
    'Luk en handling ved at skrive fx **"A er klaret"** eller **"A og C er klaret"**, eller tryk ✓ i Dagshub.', '',
    `## Kunde (${kunde.length})`, ...table(kunde), '', `## Internt (${intern.length})`, ...table(intern), ''];
  if (miss.length) {
    md.push('## Mangler oplysninger', 'Skal afklares – der gættes ikke:');
    miss.forEach((x) => md.push(`- **${letterOf(x)}** (${x.id}): ${x.missing.map((f) => names[f] || f).join(' og ')}`));
    md.push('');
  }
  md.push('## Lukket de sidste 7 dage');
  if (closed.length) {
    md.push('| Id | Handling | Ansvarlig | Lukket | Kilde |', '|---|---|---|---|---|');
    closed.forEach((x) => md.push(`| ${x.id} | ${cell(x.text)} | ${cell(x.owner) || '–'} | ${closedLabel(x.closedAt)} | ${src(x)} |`));
  } else {
    md.push('_Ingen._');
  }
  return `${md.join('\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* Saml data fra OneDrive                                              */
/* ------------------------------------------------------------------ */

/**
 * Henter alt til "I dag" fra OneDrive via sync (OneDriveBackend).
 *
 * Hver del hentes for sig (Promise.allSettled), så én manglende eller fejlende
 * fil aldrig stopper resten:
 *  - Mangler dagens forside (404), vises den nyeste forside fra de sidste 7 dage
 *    eller en tom forside-sektion – de åbne handlinger vises stadig.
 *  - Mangler hub-data.json eller Dage/<i dag>/, er det ikke en fejl.
 *  - Fejler et kald (timeout, netværk, HTTP-fejl), står det i `errors`
 *    ({ part, message, call, name }) og vises som en tydelig fejl med detalje.
 */
export async function loadOneDriveHub(sync, today = dateKey()) {
  const errors = [];
  const settle = async (part, p, fallback) => {
    try { return await p; } catch (err) {
      console.error(`[hub] ${part}:`, err);
      errors.push({ part, message: err?.message || String(err), call: err?.call || '', name: err?.name || 'Error', status: err?.status || null });
      return fallback;
    }
  };
  const [hEntry, root, refs, extra] = await Promise.all([
    settle('Handlinger (handlinger.json)', sync.backend.getEntry('handlinger.json'), null),
    settle('Mappen Sekretærassistent', sync.list(''), []),
    settle('Referater', sync.list('Referater'), []),
    settle('Brief (hub-data.json)', sync.get('hub-data.json', null), null),
  ]);
  let frontDate = today;
  let fEntry = await settle(`Forside (Dage/${today}/forside.json)`, sync.backend.getEntry(`Dage/${today}/forside.json`), null);
  if (fEntry && !fEntry.value) {
    const dage = await settle('Mappen Dage', sync.list('Dage'), []);
    const days = (dage || []).filter((d) => d.isFolder && /^\d{4}-\d{2}-\d{2}$/.test(d.name)
      && d.name < today && d.name >= addDaysKey(today, -7)).map((d) => d.name).sort().reverse();
    for (const d of days) {
      const e = await settle(`Forside (Dage/${d}/forside.json)`, sync.backend.getEntry(`Dage/${d}/forside.json`), null);
      if (!e) break; // fejl (fx timeout): prøv ikke flere dage
      if (e.value) { fEntry = e; frontDate = d; break; }
    }
  }
  const byName = Object.fromEntries((root || []).map((r) => [r.name, r]));
  const base = extra && typeof extra === 'object' ? extra : {};
  const frontErr = errors.find((e) => e.part.startsWith('Forside'));
  let front;
  if (fEntry?.value) {
    front = buildFront(fEntry.value, '');
    if (frontDate !== today) front.olderThanToday = true;
  } else {
    front = { date: today, items: [], missing: frontErr ? '' : `Ingen forside for ${today} i OneDrive endnu. Den bygges af morgenrutinen.`, error: frontErr || null };
  }
  const hErr = errors.find((e) => e.part.startsWith('Handlinger'));
  const actions = hEntry?.value
    ? buildActions(hEntry.value, today, refs, byName['Handlinger.md']?.webUrl || '')
    : { open: [], closedRecent: [], counts: { open: 0, missing: 0, closed7d: 0 }, error: hErr || null,
      note: hErr ? '' : 'handlinger.json blev ikke fundet i OneDrive › Sekretærassistent.' };
  return {
    ...base,
    example: false,
    source: 'onedrive',
    briefDate: base.briefDate || today,
    generatedAt: base.generatedAt || hEntry?.value?.updatedAt,
    front,
    actions,
    referater: recentReferater(refs, today),
    referaterUrl: byName.Referater?.webUrl || '',
    folderUrl: '',
    stale: Boolean(hEntry?.stale || fEntry?.stale),
    fetchedAt: hEntry?.fetchedAt,
    errors,
    // Intet brugbart at vise: handlingerne kunne hverken hentes eller findes i cachen.
    failed: Boolean(hErr && !hEntry?.value),
  };
}
