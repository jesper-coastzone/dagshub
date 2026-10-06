/**
 * sync.js — ét lagerlag med ÉT interface, uanset hvor data ligger.
 *
 *   const s = getSync();
 *   await s.get(key, fallback)          → værdi eller fallback (JSON-filer parses, .md gives som tekst)
 *   await s.set(key, value)             → gemmer (hele værdien)
 *   await s.update(key, fn, fallback)   → læs-ændr-gem; fn køres igen på frisk data ved konflikt
 *   await s.remove(key)
 *   await s.apply(key, op, args)        → navngiven ændring (se MUTATIONS), sættes i kø og
 *                                         overlever genstart/offline; flettes ved konflikt
 *   await s.list(folder)                → filer i en mappe (kun OneDrive)
 *   s.name / s.shared                   → 'lokal' | 'onedrive', og om data deles mellem enheder
 *   s.status() / s.onChange(fn) / s.flush()
 *
 * LocalBackend: localStorage på denne enhed (bruges uden login / uden clientId).
 * OneDriveBackend: filerne i OneDrive › Sekretærassistent via Microsoft Graph.
 *   Nøglen er stien i mappen, fx 'handlinger.json', 'Dage/2026-10-07/forside.json'
 *   eller 'Dage/2026-10-07/noter/10.00 Tjek in.md'.
 *
 *   - Læsning: hentes fra Graph, når der er net, og gemmes som lokal kopi
 *     (localStorage, præfiks 'od:'). Offline vises den sidst hentede kopi med
 *     de ændringer, der står i kø, lagt ovenpå.
 *   - Skrivning: hver ændring lægges i en kø (præfiks 'sync:queue') og sendes
 *     med If-Match: <eTag>. Svarer OneDrive 412 (filen er ændret af en rutine
 *     eller en anden enhed), hentes filen igen, ændringen lægges ind i den nye
 *     version, og der prøves igen (op til 5 gange). Uden net bliver ændringen
 *     liggende i køen og sendes, når nettet er tilbage.
 *   - Efter ændringer i handlinger.json skrives Handlinger.md forfra (visning).
 */

import * as store from './store.js';
import * as graph from './graph.js';
import { AuthNeededError, isSignedIn } from './auth.js';
import { renderHandlingerMd } from './hub-model.js';

const SYNC_PREFIX = 'sync:';
const CACHE_PREFIX = 'od:';
const QUEUE_KEY = `${SYNC_PREFIX}queue`;
const META_KEY = `${SYNC_PREFIX}meta`;
const MAX_ATTEMPTS = 5;
export const NO_CHANGE = Symbol('no-change');

const nowIso = () => new Date().toISOString();
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const isJson = (path) => /\.json$/i.test(path);

/* ------------------------------------------------------------------ */
/* Navngivne ændringer — rene funktioner af (data, args) → ny data      */
/* Køres igen på frisk data, når OneDrive svarer 412.                  */
/* ------------------------------------------------------------------ */

function findAction(h, id) { return (h?.items || []).find((it) => it.id === id); }

export const MUTATIONS = {
  /** Erstat hele værdien. */
  put: (_data, { value }) => clone(value),

  /** Luk en handling i handlinger.json ("A er klaret"). */
  'action.close': (h, { id, at }) => {
    const it = findAction(h, id);
    if (!it || it.status === 'klaret') return NO_CHANGE;
    it.status = 'klaret';
    it.closedAt = at || nowIso();
    it.closedBy = 'dagshub';
    h.updatedAt = nowIso();
    return h;
  },

  /** Fortryd lukning. */
  'action.reopen': (h, { id }) => {
    const it = findAction(h, id);
    if (!it || it.status === 'åben') return NO_CHANGE;
    it.status = 'åben';
    it.closedAt = null;
    delete it.closedBy;
    h.updatedAt = nowIso();
    return h;
  },

  /** Ret ansvarlig og/eller frist. Tom streng = fjern (bliver "mangler"). */
  'action.edit': (h, { id, owner, due }) => {
    const it = findAction(h, id);
    if (!it) return NO_CHANGE;
    const missing = new Set(it.missing || []);
    if (owner !== undefined) {
      it.owner = String(owner).trim() || null;
      if (it.owner) missing.delete('owner'); else missing.add('owner');
    }
    if (due !== undefined) {
      it.due = /^\d{4}-\d{2}-\d{2}$/.test(String(due)) ? due : null;
      if (it.due) missing.delete('due'); else missing.add('due');
    }
    it.missing = ['owner', 'due'].filter((f) => missing.has(f));
    it.editedAt = nowIso();
    it.editedBy = 'dagshub';
    h.updatedAt = nowIso();
    return h;
  },

  /** Luk et punkt på dagens forside (forside.json). */
  'front.close': (f, { key, at }) => {
    const it = (f?.items || []).find((x) => x.key === key);
    if (!it || it.status === 'lukket') return NO_CHANGE;
    it.status = 'lukket';
    it.closedAt = at || nowIso();
    it.closedBy = 'dagshub';
    if (it.kind === 'møde') it.notesConfirmed = true;
    f.mdStale = true; // Forside.md skrives forfra af rutinen (day.py)
    return f;
  },

  'front.reopen': (f, { key }) => {
    const it = (f?.items || []).find((x) => x.key === key);
    if (!it || it.status !== 'lukket') return NO_CHANGE;
    it.status = 'åben';
    it.closedAt = null;
    delete it.closedBy;
    if (it.kind === 'møde') it.notesConfirmed = false;
    f.mdStale = true;
    return f;
  },

  /** Mødenote (.md). Flettes, hvis filen er ændret et andet sted siden base. */
  'note.put': (text, { header, body, base }) => {
    if (text === null || text === undefined) return composeNote(header, body);
    const remote = noteBody(text);
    if (remote === body) return NO_CHANGE;
    if (base === undefined || base === null || remote === base) return composeNote(noteHeader(text) || header, body);
    return composeNote(noteHeader(text) || header, mergeText(base, remote, body));
  },
};

/* ------------------------------------------------------------------ */
/* Mødenoter: fil = header + "## Noter" + brødtekst                    */
/* ------------------------------------------------------------------ */

const NOTE_MARK = '## Noter';

export function composeNote(header, body) {
  return `${String(header || '').trimEnd()}\n\n${NOTE_MARK}\n\n${String(body || '').trimEnd()}\n`;
}
export function noteBody(text) {
  const s = String(text || '');
  const i = s.indexOf(`\n${NOTE_MARK}\n`);
  if (i < 0) return s.startsWith(`${NOTE_MARK}\n`) ? s.slice(NOTE_MARK.length + 1).replace(/^\n/, '').trimEnd() : s.trimEnd();
  return s.slice(i + NOTE_MARK.length + 2).replace(/^\n/, '').trimEnd();
}
export function noteHeader(text) {
  const s = String(text || '');
  const i = s.indexOf(`\n${NOTE_MARK}\n`);
  return i < 0 ? '' : s.slice(0, i).trimEnd();
}

/** Simpel trevejs-fletning af tekst: typisk har begge sider tilføjet noget. */
export function mergeText(base, remote, mine) {
  if (remote.startsWith(base) && mine.startsWith(base)) {
    const r = remote.slice(base.length);
    const m = mine.slice(base.length);
    if (r.includes(m.trim())) return remote;
    if (m.includes(r.trim())) return mine;
    return `${base}${r}${r.endsWith('\n') ? '' : '\n'}${m.replace(/^\n+/, '')}`.trimEnd();
  }
  if (mine.includes(remote)) return mine;
  if (remote.includes(mine)) return remote;
  const stamp = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }).format(new Date());
  return `${mine}\n\n---\n*Fra en anden enhed (flettet kl. ${stamp}):*\n\n${remote}`.trimEnd();
}

/* ------------------------------------------------------------------ */
/* Lokal backend                                                       */
/* ------------------------------------------------------------------ */

export class LocalBackend {
  constructor() { this.name = 'lokal'; this.shared = false; }
  async get(key, fallback) { return store.load(SYNC_PREFIX + key, fallback); }
  async set(key, value) { store.save(SYNC_PREFIX + key, value); return value; }
  async remove(key) {
    try { localStorage.removeItem(`dagshub:v1:${SYNC_PREFIX}${key}`); } catch { /* ignorer */ }
  }
  async apply(key, op, args) {
    const cur = store.load(SYNC_PREFIX + key, null);
    const next = MUTATIONS[op](clone(cur), args);
    if (next !== NO_CHANGE) store.save(SYNC_PREFIX + key, next);
    return next === NO_CHANGE ? cur : next;
  }
  async list() { return []; }
  status() { return { mode: 'lokal', online: navigator.onLine, pending: 0, failed: 0, lastSync: null, lastError: '' }; }
}

/* ------------------------------------------------------------------ */
/* OneDrive-backend                                                    */
/* ------------------------------------------------------------------ */

export class OneDriveBackend {
  constructor() {
    this.name = 'onedrive';
    this.shared = true;
    this.listeners = new Set();
    this.memoryFns = new Map(); // update(fn) i denne session: qid → fn
    this.flushing = null;
    this.meta = store.load(META_KEY, { lastSync: null, lastError: '' });
  }

  /* --- lokale kopier --- */
  cacheGet(path) { return store.load(CACHE_PREFIX + path, null); }
  cachePut(path, entry) { store.save(CACHE_PREFIX + path, { ...entry, fetchedAt: nowIso() }); }
  queue() { return store.load(QUEUE_KEY, []); }
  saveQueue(q) { store.save(QUEUE_KEY, q); this.emit(); }
  setMeta(patch) { this.meta = { ...this.meta, ...patch }; store.save(META_KEY, this.meta); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { const s = this.status(); this.listeners.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } }); }

  status() {
    const q = this.queue();
    return {
      mode: 'onedrive',
      online: navigator.onLine,
      pending: q.filter((x) => !x.failed).length,
      failed: q.filter((x) => x.failed).length,
      failedItems: q.filter((x) => x.failed).map((x) => ({ path: x.path, op: x.op, error: x.error })),
      lastSync: this.meta.lastSync,
      lastError: this.meta.lastError,
    };
  }

  canTalk() { return navigator.onLine !== false && isSignedIn(); }

  /** Hent en fil (frisk, hvis muligt). Returnerer cache-entry eller null. */
  async entry(path, { preferCache = false } = {}) {
    const cached = this.cacheGet(path);
    if (preferCache && cached) return cached;
    if (!this.canTalk()) return cached ? { ...cached, stale: true } : null;
    try {
      const f = await graph.readFile(path);
      if (!f) { this.cachePut(path, { missing: true }); return null; }
      this.cachePut(path, { text: f.text, eTag: f.eTag, webUrl: f.webUrl, name: f.name, lastModified: f.lastModified });
      this.setMeta({ lastSync: nowIso(), lastError: '' });
      return this.cacheGet(path);
    } catch (err) {
      if (err instanceof graph.OfflineError || err instanceof AuthNeededError) {
        return cached ? { ...cached, stale: true } : null;
      }
      this.setMeta({ lastError: err.message });
      throw err;
    }
  }

  parse(path, text) {
    if (text === undefined || text === null) return null;
    if (!isJson(path)) return text;
    try { return JSON.parse(text); } catch { return null; }
  }

  /** Lægger ventende ændringer ovenpå (så offline-ændringer vises med det samme). */
  withPending(path, value) {
    let v = clone(value);
    this.queue().filter((x) => x.path === path && !x.failed).forEach((x) => {
      const fn = x.op === '__fn' ? this.memoryFns.get(x.qid) : MUTATIONS[x.op];
      if (!fn) return;
      const input = isJson(path) ? v : v;
      const next = fn(input === null ? null : clone(input), x.args);
      if (next !== NO_CHANGE) v = isJson(path) ? next : next;
    });
    return v;
  }

  async get(key, fallback) {
    const e = await this.entry(key);
    const value = this.withPending(key, e && !e.missing ? this.parse(key, e.text) : null);
    return value === null || value === undefined ? fallback : value;
  }

  /** Som get, men med metadata: { value, webUrl, eTag, stale, fetchedAt }. */
  async getEntry(key) {
    const e = await this.entry(key);
    const value = this.withPending(key, e && !e.missing ? this.parse(key, e.text) : null);
    return { value, webUrl: e?.webUrl || '', eTag: e?.eTag || '', stale: Boolean(e?.stale), fetchedAt: e?.fetchedAt || null };
  }

  /** Kun den lokale kopi (ingen netværk) — til hurtig første visning. */
  peek(key, fallback) {
    const e = this.cacheGet(key);
    const value = this.withPending(key, e && !e.missing ? this.parse(key, e.text) : null);
    return value === null || value === undefined ? fallback : value;
  }

  async list(folder) {
    const ck = `${CACHE_PREFIX}list:${folder}`;
    if (!this.canTalk()) return store.load(ck, []);
    try {
      const items = await graph.listFolder(folder);
      store.save(ck, items);
      return items;
    } catch (err) {
      if (err instanceof graph.OfflineError || err instanceof AuthNeededError) return store.load(ck, []);
      throw err;
    }
  }

  async set(key, value) { return this.apply(key, 'put', { value }); }

  async update(key, fn, fallback) {
    const qid = this.enqueue({ path: key, op: '__fn', args: { fallback } });
    this.memoryFns.set(qid, (data, args) => fn(data ?? clone(args.fallback)));
    this.flush();
    return this.peek(key, fallback);
  }

  async remove(key) {
    // Bruges ikke af appen; filer slettes aldrig herfra.
    throw new Error(`Sletning af ${key} i OneDrive er ikke understøttet fra appen.`);
  }

  async apply(key, op, args) {
    if (!MUTATIONS[op]) throw new Error(`Ukendt ændring: ${op}`);
    this.enqueue({ path: key, op, args });
    const done = this.flush();
    return { value: this.peek(key, null), done };
  }

  enqueue({ path, op, args }) {
    const q = this.queue();
    const qid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    if (op === 'note.put') {
      // Kun den nyeste version af en note skal sendes; behold den ældste base.
      const prev = q.find((x) => x.path === path && x.op === 'note.put' && !x.failed);
      if (prev) {
        prev.args = { ...args, base: prev.args.base };
        prev.createdAt = nowIso();
        this.saveQueue(q);
        return prev.qid;
      }
    }
    q.push({ qid, path, op, args, createdAt: nowIso(), attempts: 0 });
    this.saveQueue(q);
    return qid;
  }

  /** Skriv én ændring med If-Match; ved 412 hentes filen igen og ændringen lægges ind på ny. */
  async writeWithMerge(path, mutate) {
    let cur = this.cacheGet(path);
    if (!cur || cur.missing === undefined && cur.text === undefined) cur = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1 || !cur || cur.missing) {
        const f = await graph.readFile(path);
        cur = f ? { text: f.text, eTag: f.eTag, webUrl: f.webUrl, name: f.name } : null;
        if (cur) this.cachePut(path, cur); else this.cachePut(path, { missing: true });
      }
      const base = cur ? this.parse(path, cur.text) : null;
      const next = mutate(base === null ? null : clone(base));
      if (next === NO_CHANGE) return { changed: false, attempts: attempt };
      const text = isJson(path) ? `${JSON.stringify(next, null, 2)}\n` : String(next);
      try {
        const item = await graph.writeFile(path, text, { eTag: cur?.eTag, createOnly: !cur });
        this.cachePut(path, { text, eTag: item.eTag, webUrl: item.webUrl, name: item.name });
        return { changed: true, attempts: attempt, conflicts: attempt - 1 };
      } catch (err) {
        if (err instanceof graph.ConflictError) { cur = null; continue; }
        throw err;
      }
    }
    throw new Error(`Kunne ikke gemme ${path}: filen blev ændret samtidig ${MAX_ATTEMPTS} gange i træk.`);
  }

  /** Send køen. Stopper ved manglende net/login; prøver igen senere. */
  flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      await Promise.resolve(); // så this.flushing er sat, før finally kan nulstille den
      const touched = new Set();
      let conflicts = 0;
      try {
        while (this.canTalk()) {
          const q = this.queue();
          const item = q.find((x) => !x.failed);
          if (!item) break;
          const fn = item.op === '__fn' ? this.memoryFns.get(item.qid) : MUTATIONS[item.op];
          if (!fn) { this.saveQueue(q.filter((x) => x.qid !== item.qid)); continue; }
          try {
            const r = await this.writeWithMerge(item.path, (data) => fn(data, item.args));
            conflicts += r.conflicts || 0;
            touched.add(item.path);
            this.memoryFns.delete(item.qid);
            this.saveQueue(this.queue().filter((x) => x.qid !== item.qid));
            if (item.op === 'note.put') this.markNoteSynced(item.path, item.args.body);
            this.setMeta({ lastSync: nowIso(), lastError: '' });
          } catch (err) {
            if (err instanceof graph.OfflineError || err instanceof AuthNeededError) break;
            const q2 = this.queue();
            const it = q2.find((x) => x.qid === item.qid);
            if (it) {
              it.attempts += 1;
              it.error = err.message;
              if (it.attempts >= MAX_ATTEMPTS || (err.status >= 400 && err.status < 500)) it.failed = true;
              this.saveQueue(q2);
            }
            this.setMeta({ lastError: err.message });
            if (!it?.failed) break; // prøv igen senere
          }
        }
        if (touched.has('handlinger.json') && this.canTalk()) await this.renderHandlingerMd();
      } finally {
        this.flushing = null;
        this.emit();
      }
      return { touched: [...touched], conflicts };
    })();
    return this.flushing;
  }

  /** Handlinger.md er en visning af handlinger.json og skrives forfra (uden If-Match). */
  async renderHandlingerMd() {
    try {
      const h = this.parse('handlinger.json', this.cacheGet('handlinger.json')?.text);
      if (!h) return;
      const refs = await this.list('Referater');
      const md = renderHandlingerMd(h, refs);
      const cur = this.cacheGet('Handlinger.md');
      if (cur?.text === md) return;
      const item = await graph.writeFile('Handlinger.md', md);
      this.cachePut('Handlinger.md', { text: md, eTag: item.eTag, webUrl: item.webUrl, name: item.name });
    } catch (err) {
      console.warn('[sync] Handlinger.md blev ikke opdateret:', err);
    }
  }

  /* --- kladder til mødenoter --- */
  draftKey(path) { return `${SYNC_PREFIX}draft:${path}`; }
  getDraft(path) { return store.load(this.draftKey(path), null); }
  saveDraft(path, draft) { store.save(this.draftKey(path), { ...draft, updatedAt: nowIso() }); }
  markNoteSynced(path, body) {
    const d = this.getDraft(path);
    if (d && d.body === body) this.saveDraft(path, { ...d, base: body, synced: true, syncedAt: nowIso() });
  }
}

/* Kladder til noter, når der ikke er login (kun denne enhed). */
export const localDrafts = {
  get: (path) => store.load(`${SYNC_PREFIX}draft:${path}`, null),
  save: (path, draft) => store.save(`${SYNC_PREFIX}draft:${path}`, { ...draft, updatedAt: nowIso() }),
};

/** Fælles interface oven på en backend. */
export function createSync(backend) {
  const api = {
    get backend() { return backend; },
    get name() { return backend.name; },
    get shared() { return backend.shared; },
    get: (key, fallback) => backend.get(key, fallback),
    set: (key, value) => backend.set(key, value),
    remove: (key) => backend.remove(key),
    apply: (key, op, args) => backend.apply(key, op, args),
    list: (folder) => backend.list(folder),
    status: () => backend.status(),
    onChange: (fn) => (backend.onChange ? backend.onChange(fn) : () => {}),
    flush: () => (backend.flush ? backend.flush() : Promise.resolve({ touched: [], conflicts: 0 })),
    async update(key, fn, fallback) {
      if (backend.update) return backend.update(key, fn, fallback);
      const next = fn(await backend.get(key, fallback));
      await backend.set(key, next);
      return next;
    },
  };
  return api;
}

let current = null;

/** Det aktive lager: OneDrive efter login, ellers lokalt. */
export function getSync() {
  if (!current) current = createSync(new LocalBackend());
  return current;
}

export function useSync(backend) {
  current = createSync(backend || new LocalBackend());
  return current;
}
