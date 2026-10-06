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
import { TIMEOUT_MS, withTimeout, describeError } from './timeout.js';

/** Hvor længe der går, før en automatisk login-redirect må prøves igen (undgår løkker). */
const AUTO_REDIRECT_KEY = 'dagshub:v1:auth:autoRedirectAt';
const AUTO_REDIRECT_PAUSE_MS = 3 * 60 * 1000;

let pca = null;
let account = null;
let status = 'off';
let lastError = '';
let lastErrorDetail = '';
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
export const getLastErrorDetail = () => lastErrorDetail;
function remember(err, call) {
  if (err && call && !err.call) err.call = call;
  lastError = err?.message || String(err);
  lastErrorDetail = describeError(err);
}
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Testtilstand: kun når en test (via DevTools-protokollen) har sat
 * window.DAGSHUB_TEST = { graphBase, token? } med en graphBase på localhost.
 * Med token springes MSAL over; uden token bruges MSAL (som testen kan erstatte
 * med en falsk window.msal). Rigtige tokens bruges aldrig mod test-serveren.
 */
function testBase() {
  const t = window.DAGSHUB_TEST;
  if (!t || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(String(t.graphBase || ''))) return null;
  return t;
}
function testConfig() {
  const t = testBase();
  return t && t.token ? t : null;
}

export function graphBase() {
  return testBase()?.graphBase || CONFIG.graphBase;
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
  lastError = ''; lastErrorDetail = '';
  try {
    await withTimeout(loadScript('js/vendor/msal-browser.min.js'), 10000, 'indlæs msal-browser.min.js');
    const msal = window.msal;
    pca = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.clientId,
        authority: CONFIG.authority,
        redirectUri: CONFIG.redirectUri,
        postLogoutRedirectUri: CONFIG.redirectUri,
      },
      cache: { cacheLocation: 'localStorage' },
      system: { iframeBridgeTimeout: 10000 },
    });
    await withTimeout(pca.initialize(), 10000, 'MSAL initialize');
  } catch (err) {
    console.error('[auth]', err);
    remember(err, 'MSAL initialize');
    pca = null;
    account = null;
    setStatus('signed-out');
    return status;
  }
  // Login-svaret fra Microsoft (gemt af auth-bridge.js) løses ind her. Det må
  // aldrig blokere opstarten: efter 15 s går vi videre med de konti, der er i cachen.
  try {
    const result = await withTimeout(pca.handleRedirectPromise(), 12000, 'handleRedirectPromise');
    if (result?.account) {
      pca.setActiveAccount(result.account);
      try { sessionStorage.removeItem(AUTO_REDIRECT_KEY); } catch { /* ignorer */ }
    }
  } catch (err) {
    console.error('[auth] handleRedirectPromise:', err);
    remember(err, 'handleRedirectPromise');
  }
  try {
    const a = pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
    if (a) pca.setActiveAccount(a);
    account = toAccount(a);
  } catch (err) {
    remember(err, 'getAllAccounts');
    account = null;
  }
  setStatus(account ? 'signed-in' : 'signed-out');
  return status;
}

/** Kaldes af app.js, hvis hele login-opstarten overskred tidsgrænsen. */
export function markInitTimeout(err) {
  remember(err, 'login-opstart');
  if (status === 'off' && isConfigured()) setStatus('signed-out');
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
    const r = await withTimeout(pca.acquireTokenSilent({ scopes: CONFIG.scopes, account: a, forceRefresh }),
      TIMEOUT_MS, 'acquireTokenSilent');
    if (status !== 'signed-in') setStatus('signed-in');
    return r.accessToken;
  } catch (err) {
    console.warn('[auth] Stille token-hentning fejlede:', err);
    if (!err.call) err.call = 'acquireTokenSilent';
    remember(err, 'acquireTokenSilent');
    const needsInteraction = err.name === 'TimeoutError'
      || (window.msal?.InteractionRequiredAuthError && err instanceof window.msal.InteractionRequiredAuthError)
      || /interaction_required|login_required|consent_required|no_tokens_found|no_account|monitor_window_timeout|timed_out|token_refresh_required|refresh_token_expired|invalid_grant/i
        .test(`${err?.errorCode} ${err?.subError} ${err?.message}`);
    if (!needsInteraction) throw err;
    // Stille hentning virker ikke (fx tredjepartscookies i Safari/Chrome eller udløbet login):
    // hent token med redirect – automatisk én gang, derefter først når brugeren trykker.
    if (interactive || autoRedirectAllowed()) {
      markAutoRedirect();
      setStatus('redirecting');
      redirectForToken(a);
      throw new AuthNeededError('Logger ind igen hos Microsoft …');
    }
    setStatus('needs-login');
    const e2 = new AuthNeededError('Login er udløbet. Tryk "Log ind med Microsoft" for at fortsætte.');
    e2.call = 'acquireTokenSilent';
    e2.cause = err;
    throw e2;
  }
}

function autoRedirectAllowed() {
  try {
    const at = Number(sessionStorage.getItem(AUTO_REDIRECT_KEY) || 0);
    return !at || Date.now() - at > AUTO_REDIRECT_PAUSE_MS;
  } catch { return false; }
}
function markAutoRedirect() {
  try { sessionStorage.setItem(AUTO_REDIRECT_KEY, String(Date.now())); } catch { /* ignorer */ }
}

let redirecting = false;
/** acquireTokenRedirect – siden forlader appen og kommer tilbage samme sted. Afventes ikke. */
function redirectForToken(a) {
  if (redirecting) return;
  redirecting = true;
  Promise.resolve()
    .then(() => pca.acquireTokenRedirect({ scopes: CONFIG.scopes, account: a, redirectStartPage: window.location.href }))
    .catch((err) => {
      console.error('[auth] acquireTokenRedirect:', err);
      remember(err, 'acquireTokenRedirect');
      setStatus('needs-login');
    })
    .finally(() => { setTimeout(() => { redirecting = false; }, 5000); });
}

/** Til "Log ind igen"-knappen: redirect uden at vente på stille hentning. */
export async function reauth() {
  if (testConfig()) { setStatus('signed-in'); return; }
  if (!pca) throw new Error('Login er ikke sat op.');
  const a = pca.getActiveAccount();
  if (!a) { await login(); return; }
  markAutoRedirect();
  redirectForToken(a);
}

export const isSignedIn = () => status === 'signed-in';
export { isConfigured };
