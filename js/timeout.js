/**
 * timeout.js — fælles tidsgrænse for netværk og login.
 *
 * Alle kald til Microsoft Graph og alle token-hentninger skal svare inden for
 * TIMEOUT_MS. Ellers afvises de med TimeoutError, så siden aldrig hænger på
 * "Indlæser …". `call` beskriver kaldet (fx "GET handlinger.json" eller
 * "acquireTokenSilent") og vises i den tekniske detalje i fejlbeskeden.
 */

export const TIMEOUT_MS = 15000;

export class TimeoutError extends Error {
  constructor(call, ms = TIMEOUT_MS) {
    super(`Intet svar efter ${Math.round(ms / 1000)} sekunder (${call}).`);
    this.name = 'TimeoutError';
    this.call = call;
    this.transient = true;
  }
}

/** Afvis `promise` med TimeoutError efter `ms`. Rydder timeren op bagefter. */
export function withTimeout(promise, ms, call) {
  let timer;
  const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(call, ms)), ms); });
  return Promise.race([Promise.resolve(promise), t]).finally(() => clearTimeout(timer));
}

/** fetch med tidsgrænse (AbortController, virker også i ældre Safari). */
export async function fetchWithTimeout(url, opts = {}, ms = TIMEOUT_MS, call = `GET ${url}`) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted) throw new TimeoutError(call, ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Kort teknisk beskrivelse af en fejl til "Teknisk detalje". */
export function describeError(err) {
  if (!err) return '';
  const parts = [`${err.name || 'Error'}: ${err.message || String(err)}`];
  if (err.call) parts.push(`Kald: ${err.call}`);
  if (err.status) parts.push(`HTTP-status: ${err.status}`);
  if (err.errorCode) parts.push(`MSAL-kode: ${err.errorCode}`);
  return parts.join('\n');
}
