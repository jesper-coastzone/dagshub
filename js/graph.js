/**
 * graph.js — tynd klient til Microsoft Graph (OneDrive), kun det appen bruger.
 *
 * Alle stier er relative til OneDrive › Sekretærassistent (CONFIG.folder) og
 * adresseres som /me/drive/root:/Sekretærassistent/<sti>.
 *
 *   readFile(sti)            → { text, eTag, webUrl, name, lastModified } | null (findes ikke)
 *   listFolder(sti)          → [{ name, eTag, webUrl, lastModified, size, isFolder }]  ([] hvis mappen ikke findes)
 *   writeFile(sti, tekst, { eTag, createOnly, contentType })
 *       → driveItem. Med eTag sendes If-Match; er filen ændret siden, kastes
 *         ConflictError (HTTP 412). createOnly=true fejler med ConflictError,
 *         hvis filen allerede findes (HTTP 409). Manglende mapper oprettes af OneDrive.
 *
 * Fejltyper: OfflineError (intet net), AuthNeededError (fra auth.js),
 * ConflictError (412/409), TimeoutError (intet svar inden for 15 s),
 * NetworkError (kaldet kunne ikke gennemføres, fx CORS/DNS) og GraphError (andet).
 * Alle fejl har `call` (fx "GET Dage/2026-10-06/forside.json"), som vises i
 * den tekniske detalje. Ingen kald kan hænge: token og fetch har tidsgrænse.
 */

import { getToken, graphBase } from './auth.js';
import { CONFIG } from './config.js';
import { TIMEOUT_MS, TimeoutError, withTimeout, fetchWithTimeout } from './timeout.js';

export { TimeoutError };

export class OfflineError extends Error {
  constructor(msg = 'Ingen forbindelse. Ændringen gemmes og sendes, når der er net igen.') { super(msg); this.name = 'OfflineError'; }
}
export class ConflictError extends Error {
  constructor(status) { super(`Filen er ændret et andet sted (HTTP ${status}).`); this.name = 'ConflictError'; this.status = status; }
}
export class GraphError extends Error {
  constructor(status, msg) { super(msg || `Microsoft Graph svarede ${status}.`); this.name = 'GraphError'; this.status = status; }
}
export class NetworkError extends Error {
  constructor(call) {
    super(`Kunne ikke kontakte Microsoft Graph (${call}). Tjek forbindelsen, eller om et netværk/filter blokerer graph.microsoft.com.`);
    this.name = 'NetworkError'; this.call = call; this.transient = true;
  }
}

const encode = (rel) => [CONFIG.folder, ...String(rel || '').split('/').filter(Boolean)]
  .map((seg) => encodeURIComponent(seg)).join('/');

export const itemUrl = (rel) => `${graphBase()}/me/drive/root:/${encode(rel)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "GET Dage/2026-10-06/forside.json" — læsbar beskrivelse af et kald (uden token). */
export function label(url, method = 'GET') {
  let p = String(url);
  const base = `${graphBase()}/me/drive/root:/`;
  if (p.startsWith(base)) p = p.slice(base.length);
  else if (p.startsWith(graphBase())) p = p.slice(graphBase().length);
  try { p = decodeURIComponent(p.split('?')[0]); } catch { /* behold */ }
  const folder = `${CONFIG.folder}/`;
  if (p.startsWith(folder)) p = p.slice(folder.length);
  return `${method} ${p || '/'}`;
}

function tag(err, what) { if (err && !err.call) err.call = what; return err; }

/**
 * fetch mod Graph med token. Ét nyt forsøg ved 401 og én kort pause ved 429/503.
 * Token og hvert fetch har hver en tidsgrænse på 15 s.
 */
async function call(url, opts = {}) {
  const what = label(url, opts.method || 'GET');
  if (navigator.onLine === false) throw tag(new OfflineError(), what);
  let token;
  try {
    token = await withTimeout(getToken(), TIMEOUT_MS + 1000, `token til ${what}`);
  } catch (err) { throw tag(err, `token til ${what}`); }
  let res;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      res = await fetchWithTimeout(url, { cache: 'no-store', ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } }, TIMEOUT_MS, what);
    } catch (err) {
      if (err instanceof TimeoutError) throw err;
      if (navigator.onLine === false) throw tag(new OfflineError(), what);
      throw new NetworkError(what);
    }
    if (res.status === 401 && attempt === 0) {
      try { token = await withTimeout(getToken({ forceRefresh: true }), TIMEOUT_MS + 1000, `token til ${what}`); } catch (err) { throw tag(err, `token til ${what}`); }
      continue;
    }
    if ([429, 503, 504].includes(res.status) && attempt < 1) {
      const wait = Math.min(3, Number(res.headers.get('Retry-After')) || 1);
      await sleep(wait * 1000);
      continue;
    }
    res.call = what;
    return res;
  }
  res.call = what;
  return res;
}

async function fail(res) {
  let msg = '';
  try { msg = (await withTimeout(res.json(), 5000, 'læs fejlsvar'))?.error?.message || ''; } catch { /* ignorer */ }
  throw tag(new GraphError(res.status, msg ? `Microsoft Graph svarede ${res.status}: ${msg}` : undefined), res.call);
}

export async function getMeta(rel) {
  const res = await call(itemUrl(rel));
  if (res.status === 404) return null;
  if (!res.ok) await fail(res);
  return withTimeout(res.json(), TIMEOUT_MS, `læs metadata ${rel}`);
}

export async function readFile(rel) {
  const meta = await getMeta(rel);
  if (!meta) return null;
  let res = null;
  const dl = meta['@microsoft.graph.downloadUrl'];
  if (dl) {
    // Forhåndsgodkendt download-link (uden token). Fejler det, bruges :/content.
    try {
      res = await fetchWithTimeout(dl, { cache: 'no-store' }, TIMEOUT_MS, `download ${rel}`);
      if (!res.ok) res = null;
    } catch (err) {
      if (navigator.onLine === false) throw tag(new OfflineError(), `download ${rel}`);
      res = null;
    }
  }
  if (!res) res = await call(`${itemUrl(rel)}:/content`);
  if (!res.ok) await fail(res);
  return {
    text: await withTimeout(res.text(), TIMEOUT_MS, `læs indhold af ${rel}`),
    eTag: meta.eTag,
    webUrl: meta.webUrl,
    name: meta.name,
    lastModified: meta.lastModifiedDateTime,
  };
}

export async function listFolder(rel) {
  let url = `${itemUrl(rel)}:/children?$top=200`;
  if (!rel) url = `${graphBase()}/me/drive/root:/${encode('')}:/children?$top=200`;
  const out = [];
  while (url) {
    const res = await call(url);
    if (res.status === 404) return [];
    if (!res.ok) await fail(res);
    const body = await withTimeout(res.json(), TIMEOUT_MS, `læs mappe ${rel || '/'}`);
    (body.value || []).forEach((it) => out.push({
      name: it.name,
      eTag: it.eTag,
      webUrl: it.webUrl,
      lastModified: it.lastModifiedDateTime,
      size: it.size,
      isFolder: Boolean(it.folder),
    }));
    url = body['@odata.nextLink'] || '';
  }
  return out;
}

export async function writeFile(rel, text, { eTag, createOnly = false, contentType } = {}) {
  const type = contentType || (rel.endsWith('.json') ? 'application/json' : 'text/markdown; charset=utf-8');
  const headers = { 'Content-Type': type };
  if (eTag) headers['If-Match'] = eTag;
  const q = createOnly ? '?@microsoft.graph.conflictBehavior=fail' : '';
  const res = await call(`${itemUrl(rel)}:/content${q}`, { method: 'PUT', headers, body: text });
  if (res.status === 412 || res.status === 409) throw new ConflictError(res.status);
  if (!res.ok) await fail(res);
  return withTimeout(res.json(), TIMEOUT_MS, res.call || 'læs svar');
}

export async function me() {
  const res = await call(`${graphBase()}/me?$select=displayName,userPrincipalName,mail`);
  if (!res.ok) await fail(res);
  return withTimeout(res.json(), TIMEOUT_MS, res.call || 'læs svar');
}
