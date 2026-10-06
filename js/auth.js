/**
 * auth.js — login med Microsoft (Entra ID) via MSAL.js (@azure/msal-browser v5,
 * vendoret i js/vendor/). SPA med authorization code + PKCE; ingen hemmeligheder.
 *
 *   await initAuth()        → 'off' | 'signed-out' | 'signed-in'
 *   login()                 → loginRedirect (virker i iPhone/iPad Safari og som installeret PWA)
 *   logout()                → logoutRedirect + sletter lokale kopier af OneDrive-data
 *   getToken({interactive}) → access token til Microsoft Graph
 *   getAccount()            → { name, username } eller null
 *   onAuthChange(fn)        → kaldes ved ændring af status
 *
 * 'off' betyder, at config.js ikke har et rigtigt clientId; så kører appen på
 * data/hub-data.js som før. Tokens gemmes i localStorage (MSAL krypterer dem),
 * så login overlever, at PWA'en lukkes. Stille fornyelse kan fejle i Safari
 * (tredjepartscookies); så beder appen om at logge ind igen med ét tryk.
 */

import { CONFIG, isConfigured } from './config.js';

let pca = null;
let account = null;
let status = 'off';
let lastError = '';
const listeners = new Set();

export class AuthNeededError extends Error {
  constructor(msg = 'Log ind med Microsoft for at hente og gemme data i OneDrive.') {
    super(msg);
    this.name = 'AuthNeededError';
  }
}

function emit() { listeners.forEach((fn) => { try { fn(status, account); } catch (e) { console.error(e); } }); }
function setStatus(s) { status = s; emit(); }

export const getStatus = () => status;
export const getAccount = () => account;
export const getLastError = () => lastError;
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Testtilstand: kun når en test (via DevTools-protokollen) har sat
 * window.DAGSHUB_TEST = { token, graphBase } med en graphBase på localhost.
 * Bruges til at teste mod en lokal falsk Graph-server; rigtige tokens bruges aldrig.
 */
function testConfig() {
  const t = window.DAGSHUB_TEST;
  if (!t || !t.token || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(String(t.graphBase || ''))) return null;
  return t;
}

export function graphBase() {
  return testConfig()?.graphBase || CONFIG.graphBase;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.msal) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Kunne ikke indlæse ${src}`));
    document.head.appendChild(s);
  });
}

function toAccount(a) {
  return a ? { name: a.name || a.username, username: a.username, homeAccountId: a.homeAccountId } : null;
}

export async function initAuth() {
  const test = testConfig();
  if (test) {
    account = { name: test.name || 'Testbruger', username: test.username || 'test@example.invalid' };
    setStatus(test.signedOut ? 'signed-out' : 'signed-in');
    return status;
  }
  if (!isConfigured()) { setStatus('off'); return status; }
  try {
    await loadScript('js/vendor/msal-browser.min.js');
    const msal = window.msal;
    pca = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.clientId,
        authority: CONFIG.authority,
        redirectUri: CONFIG.redirectUri,
        postLogoutRedirectUri: CONFIG.redirectUri,
      },
      cache: { cacheLocation: 'localStorage' },
    });
    await pca.initialize();
    const result = await pca.handleRedirectPromise();
    if (result?.account) pca.setActiveAccount(result.account);
    const a = pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
    if (a) pca.setActiveAccount(a);
    account = toAccount(a);
    setStatus(account ? 'signed-in' : 'signed-out');
  } catch (err) {
    console.error('[auth]', err);
    lastError = err?.message || String(err);
    account = null;
    setStatus('signed-out');
  }
  return status;
}

/** Starter login. Siden forlader appen og kommer tilbage til samme visning. */
export async function login() {
  if (testConfig()) { setStatus('signed-in'); return; }
  if (!pca) throw new Error('Login er ikke sat op: config.js mangler et clientId (se opsætningsvejledningen).');
  await pca.loginRedirect({ scopes: CONFIG.scopes, prompt: 'select_account', redirectStartPage: window.location.href });
}

export async function logout() {
  clearLocalData();
  if (testConfig()) { account = null; setStatus('signed-out'); return; }
  if (!pca) return;
  const a = pca.getActiveAccount();
  await pca.logoutRedirect({ account: a, postLogoutRedirectUri: CONFIG.redirectUri });
}

/** Sletter lokale kopier af OneDrive-filer, kø og kladder (fx på en lånt enhed). */
export function clearLocalData() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('dagshub:v1:od:') || k.startsWith('dagshub:v1:sync:'))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignorer */ }
}

/**
 * Access token til Graph. interactive=true må kun bruges efter et tryk fra
 * brugeren (det kan sende hen til login-siden). Ellers kastes AuthNeededError.
 */
export async function getToken({ interactive = false, forceRefresh = false } = {}) {
  const test = testConfig();
  if (test) {
    if (status !== 'signed-in') throw new AuthNeededError();
    return test.token;
  }
  if (!pca) throw new AuthNeededError('Login er ikke sat op (mangler clientId).');
  const a = pca.getActiveAccount();
  if (!a) { setStatus('signed-out'); throw new AuthNeededError(); }
  try {
    const r = await pca.acquireTokenSilent({ scopes: CONFIG.scopes, account: a, forceRefresh });
    if (status !== 'signed-in') setStatus('signed-in');
    return r.accessToken;
  } catch (err) {
    const needsInteraction = err instanceof window.msal.InteractionRequiredAuthError
      || /interaction_required|login_required|consent_required|no_tokens_found|monitor_window_timeout|timed_out/i.test(`${err?.errorCode} ${err?.message}`);
    if (needsInteraction && interactive) {
      await pca.acquireTokenRedirect({ scopes: CONFIG.scopes, account: a, redirectStartPage: window.location.href });
    }
    if (needsInteraction) {
      setStatus('needs-login');
      throw new AuthNeededError('Login er udløbet. Tryk "Log ind med Microsoft" for at fortsætte.');
    }
    throw err;
  }
}

export const isSignedIn = () => status === 'signed-in';
export { isConfigured };
