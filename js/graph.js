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
 * ConflictError (412/409) og GraphError (andet).
 */

import { getToken, graphBase } from './auth.js';
import { CONFIG } from './config.js';

export class OfflineError extends Error {
  constructor(msg = 'Ingen forbindelse. Ændringen gemmes og sendes, når der er net igen.') { super(msg); this.name = 'OfflineError'; }
}
export class ConflictError extends Error {
  constructor(status) { super(`Filen er ændret et andet sted (HTTP ${status}).`); this.name = 'ConflictError'; this.status = status; }
}
export class GraphError extends Error {
  constructor(status, msg) { super(msg || `Microsoft Graph svarede ${status}.`); this.name = 'GraphError'; this.status = status; }
}

const encode = (rel) => [CONFIG.folder, ...String(rel || '').split('/').filter(Boolean)]
  .map((seg) => encodeURIComponent(seg)).join('/');

export const itemUrl = (rel) => `${graphBase()}/me/drive/root:/${encode(rel)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch mod Graph med token, ét nyt forsøg ved 401 og pause ved 429/503. */
async function call(url, opts = {}) {
  if (navigator.onLine === false) throw new OfflineError();
  let token = await getToken();
  let res;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      res = await fetch(url, { cache: 'no-store', ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
    } catch {
      throw new OfflineError();
    }
    if (res.status === 401 && attempt === 0) { token = await getToken({ forceRefresh: true }); continue; }
    if ([429, 503, 504].includes(res.status) && attempt < 3) {
      const wait = Math.min(10, Number(res.headers.get('Retry-After')) || 2 ** attempt);
      await sleep(wait * 1000);
      continue;
    }
    return res;
  }
  return res;
}

async function fail(res) {
  let msg = '';
  try { msg = (await res.json())?.error?.message || ''; } catch { /* ignorer */ }
  throw new GraphError(res.status, msg ? `Microsoft Graph svarede ${res.status}: ${msg}` : undefined);
}

export async function getMeta(rel) {
  const res = await call(itemUrl(rel));
  if (res.status === 404) return null;
  if (!res.ok) await fail(res);
  return res.json();
}

export async function readFile(rel) {
  const meta = await getMeta(rel);
  if (!meta) return null;
  let res;
  const dl = meta['@microsoft.graph.downloadUrl'];
  try {
    res = dl ? await fetch(dl, { cache: 'no-store' }) : await call(`${itemUrl(rel)}:/content`);
  } catch (err) {
    if (err instanceof OfflineError) throw err;
    throw new OfflineError();
  }
  if (!res.ok) await fail(res);
  return {
    text: await res.text(),
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
    const body = await res.json();
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
  return res.json();
}

export async function me() {
  const res = await call(`${graphBase()}/me?$select=displayName,userPrincipalName,mail`);
  if (!res.ok) await fail(res);
  return res.json();
}
