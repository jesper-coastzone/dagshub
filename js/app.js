/**
 * app.js — opstart og hash-router.
 *
 * Ruter: #idag (start), #noter, #morgen, #mode, #dagsafslutning, #uge, #arkiv
 *
 * Opstart: (1) er siden åbnet som svar fra Microsoft-login, kører
 * auth-bridge.js og appen starter ikke; (2) auth.initAuth() — logget ind ⇒
 * OneDrive-backend (js/sync.js), ellers lokal backend og data/hub-data.js;
 * (3) routeren.
 * Parametre kan gives efter "?", fx #mode?m=<mødeId>.
 *
 * Hvert view er et modul med:
 *   export const title = 'Morgen';
 *   export async function render(root, params) { …; return cleanup?; }
 * hvor cleanup (valgfri) kaldes, når brugeren forlader viewet.
 * `root` er en ny, tom <div> pr. navigation; den indsættes i <main>, når
 * render() er færdig. Views lægger event listeners på root (delegation) én
 * gang og gentegner kun indholdet (innerHTML) ved ændringer.
 */

import * as idag from './views/idag.js';
import * as morgen from './views/morgen.js';
import * as mode from './views/mode.js';
import * as dagsafslutning from './views/dagsafslutning.js';
import * as uge from './views/uge.js';
import * as arkiv from './views/arkiv.js';
import * as noter from './views/noter.js';
import { $, $$, esc, toast } from './utils.js';
import * as auth from './auth.js';
import { useSync, getSync, OneDriveBackend, LocalBackend } from './sync.js';
import { BASE_PATH } from './config.js';

const ROUTES = { idag, noter, morgen, mode, dagsafslutning, uge, arkiv };
const DEFAULT_ROUTE = 'idag';

let cleanup = null;
let renderToken = 0;

/** Parser "#mode?m=123" → { name: 'mode', params: URLSearchParams } */
function parseHash() {
  const [name, query = ''] = location.hash.replace(/^#/, '').split('?');
  return { name: ROUTES[name] ? name : DEFAULT_ROUTE, params: new URLSearchParams(query) };
}

async function navigate() {
  const { name, params } = parseHash();
  const view = ROUTES[name];
  const main = $('#view');
  const token = ++renderToken;

  // Ryd op efter forrige view (stop optagelse, oplæsning osv.).
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;

  // Markér aktiv fane. Arkiv hører under Dagsafslutning i menuen.
  const navName = name === 'arkiv' ? 'dagsafslutning' : name;
  renderAccount();
  $$('.app-nav a').forEach((a) => {
    if (a.dataset.route === navName) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${view.title} · Dagshub`;

  // Hvert view får en frisk container, så event listeners fra tidligere
  // views aldrig hænger ved.
  const root = document.createElement('div');
  root.className = `view-${name}`;

  try {
    const result = await view.render(root, params);
    // Hvis brugeren har skiftet view imens, kassér resultatet.
    if (token !== renderToken) {
      if (typeof result === 'function') result();
      return;
    }
    cleanup = result ?? null;
    main.replaceChildren(root);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    main.innerHTML = `<section class="card error"><h2>Noget gik galt</h2><p>${esc(err.message)}</p></section>`;
  }
}

/** Viser "Offline"-mærke i headeren, når nettet forsvinder. */
function watchOnlineStatus() {
  const badge = $('#offline-badge');
  const updateBadge = () => { badge.hidden = navigator.onLine; };
  window.addEventListener('online', updateBadge);
  window.addEventListener('offline', updateBadge);
  updateBadge();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // På GitHub Pages: scope /dagshub/. Lokalt (anden sti): mappen, siden ligger i.
  const scope = location.pathname.startsWith(BASE_PATH) ? BASE_PATH : './';
  const start = () => navigator.serviceWorker.register('sw.js', { scope }).catch((err) => {
    console.warn('[sw] Registrering fejlede:', err);
  });
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
}

const MS_LOGO = '<svg class="ms-logo" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>';

/** Login-knap / konto i headeren + synk-status. */
function renderAccount() {
  const host = $('#account');
  if (!host) return;
  const status = auth.getStatus();
  if (status === 'signed-in') {
    const a = auth.getAccount() || {};
    const st = getSync().status();
    const initials = String(a.name || a.username || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const badge = st.failed ? `<span class="sync-dot is-error" title="${st.failed} ændring(er) kunne ikke gemmes"></span>`
      : st.pending ? `<span class="sync-dot is-pending" title="${st.pending} ændring(er) venter"></span>` : '';
    host.innerHTML = `
      <details class="account-menu">
        <summary class="account-btn" aria-label="Konto: ${esc(a.name || '')}"><span class="avatar">${esc(initials)}</span>${badge}</summary>
        <div class="account-pop card">
          <p><strong>${esc(a.name || '')}</strong><br><span class="meta-line">${esc(a.username || '')}</span></p>
          <p class="meta-line">Data: OneDrive › Sekretærassistent${st.pending ? ` · ${st.pending} venter` : ''}${st.failed ? ` · ${st.failed} fejlede` : ''}</p>
          <button class="btn btn-ghost btn-block" data-logout>Log ud</button>
        </div>
      </details>`;
  } else {
    host.innerHTML = `<button class="btn btn-ms" data-login>${MS_LOGO}<span class="login-label">Log ind med Microsoft</span></button>`;
  }
}

function wireAccount() {
  document.addEventListener('click', async (e) => {
    if (e.target.closest('#account [data-login]')) {
      if (!auth.isConfigured()) {
        toast('Login er ikke sat op endnu: config.js mangler et Client ID fra app-registreringen i Microsoft Entra.', { timeout: 7000 });
        return;
      }
      try { await auth.login(); } catch (err) { toast(err.message, { timeout: 6000 }); }
    } else if (e.target.closest('[data-logout]')) {
      await auth.logout();
    }
  });
}

/** Vælg lager ud fra login-status. */
let backendStatus = null;
function chooseBackend() {
  const status = auth.getStatus();
  const signedIn = status === 'signed-in' || (status === 'needs-login' && getSync().shared);
  const want = signedIn ? 'onedrive' : 'lokal';
  if (backendStatus === want) return false;
  backendStatus = want;
  const backend = signedIn ? new OneDriveBackend() : new LocalBackend();
  useSync(backend);
  if (backend.onChange) backend.onChange(renderAccount);
  return true;
}

async function boot() {
  if (window.__DAGSHUB_AUTH_BRIDGE__) return; // siden behandler et login-svar
  watchOnlineStatus();
  registerServiceWorker();
  wireAccount();
  await auth.initAuth();
  chooseBackend();
  renderAccount();
  auth.onAuthChange(() => {
    renderAccount();
    if (chooseBackend()) navigate();
  });
  // Send ventende ændringer, når nettet kommer tilbage eller appen vises igen.
  const kick = () => { if (getSync().shared) getSync().flush(); };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  setInterval(kick, 60 * 1000);
  kick();

  window.addEventListener('hashchange', navigate);
  if (!location.hash) history.replaceState(null, '', `#${DEFAULT_ROUTE}`);
  navigate();
}

boot();
