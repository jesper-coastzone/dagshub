/**
 * diagnostics.js — tekst til "Teknisk detalje" i fejlbeskeder.
 * Indeholder aldrig tokens, koder eller filindhold – kun fejltekst, kald og miljø.
 */
import { APP_VERSION } from './config.js';
import * as auth from './auth.js';

/** errors: [{ part, name, message, call, status }] eller Error-objekter. */
export function techDetail(errors = [], extra = []) {
  const lines = [];
  (Array.isArray(errors) ? errors : [errors]).filter(Boolean).forEach((e) => {
    lines.push(`• ${e.part ? `${e.part}: ` : ''}${e.name || 'Error'}: ${e.message || String(e)}`);
    if (e.call) lines.push(`  Kald: ${e.call}`);
    if (e.status) lines.push(`  HTTP-status: ${e.status}`);
    if (e.errorCode) lines.push(`  MSAL-kode: ${e.errorCode}`);
  });
  extra.filter(Boolean).forEach((x) => lines.push(x));
  const authErr = auth.getLastErrorDetail?.();
  lines.push('',
    `Tid: ${new Date().toLocaleString('da-DK')} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    `Version: ${APP_VERSION}`,
    `Side: ${location.pathname}${location.hash.replace(/(code|state|session_state|client_info)=[^&]*/g, '$1=…')}`,
    `Login: ${auth.getStatus?.()}${authErr ? ` · seneste login-fejl: ${authErr.replace(/\n/g, ' · ')}` : ''}`,
    `Online: ${navigator.onLine ? 'ja' : 'nej'} · Service worker: ${navigator.serviceWorker?.controller ? 'aktiv' : 'ingen'}`,
    `Browser: ${navigator.userAgent}`);
  return lines.join('\n');
}

/** Afregistrér service worker, slet app-cachen og genindlæs (data i OneDrive røres ikke). */
export async function resetAppCache() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) || [];
    await Promise.all(keys.filter((k) => k.startsWith('dagshub')).map((k) => caches.delete(k)));
  } catch (err) { console.warn('[reset]', err); }
  location.replace(`${location.pathname}#idag`);
  location.reload();
}
