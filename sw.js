/**
 * sw.js — service worker der cacher app-skallen, så Dagshub virker offline.
 *
 * Strategi: "network first, cache fallback" for egne filer.
 *  - Online: du får altid den nyeste version (rart, mens du udvikler).
 *  - Offline: den senest cachede version bruges.
 *
 * data/hub-data.js (indholdet til "I dag") hentes ALTID netværk-først og
 * uden om browserens HTTP-cache (cache: 'no-cache'), så nye data vises med
 * det samme. Den cachede kopi bruges kun offline.
 *
 * Tilføjer du nye filer, så føj dem til APP_SHELL og hæv CACHE_VERSION.
 *
 * Scope: /dagshub/ på GitHub Pages (registreres fra app.js). Kald til
 * Microsoft Graph og login.microsoftonline.com er på andre origins og går
 * aldrig gennem cachen her; OneDrive-data caches af js/sync.js i localStorage.
 * En side med login-svar i URL'en (#code=…) caches ikke.
 */

const CACHE_VERSION = 'dagshub-v4';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/api.js',
  './js/store.js',
  './js/sync.js',
  './js/config.js',
  './js/auth.js',
  './js/auth-bridge.js',
  './js/boot-guard.js',
  './js/timeout.js',
  './js/diagnostics.js',
  './js/graph.js',
  './js/hub-model.js',
  './js/markdown.js',
  './js/vendor/msal-browser.min.js',
  './js/vendor/msal-redirect-bridge.min.js',
  './js/audio-store.js',
  './js/utils.js',
  './js/components.js',
  './js/speech.js',
  './js/recorder.js',
  './js/action-items.js',
  './js/travel.js',
  './js/views/idag.js',
  './js/views/morgen.js',
  './js/views/mode.js',
  './js/views/dagsafslutning.js',
  './js/views/uge.js',
  './js/views/arkiv.js',
  './js/views/noter.js',
  './data/mock.js',
  './data/hub-data.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // cache: 'reload' = forbi browserens HTTP-cache, så en ny version aldrig blandes med gamle filer.
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // Ryd gamle cache-versioner.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Kun GET til vores eget origin håndteres; alt andet går direkte på nettet.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Hub-data: netværk først, forbi HTTP-cachen; gem altid under samme nøgle
  // (uden ?t=…), så offline-fallback virker uanset cache-bust-parametre.
  if (url.pathname.endsWith('/data/hub-data.js')) {
    const key = new URL('./data/hub-data.js', self.location).href;
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(key, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(key)) ?? Response.error()),
    );
    return;
  }

  // Login-svar (#code=… / ?code=…) må aldrig caches.
  if (/[?&#](code|error)=/.test(url.search)) return;

  // Gem uden query-string, så fx ?v=2 ikke skaber dubletter i cachen.
  const cacheKey = url.origin + url.pathname;

  event.respondWith(
    // no-cache: spørg altid serveren (304 er billigt), så app.js/config.js aldrig er en gammel kopi.
    // (En navigation-request må ikke få nye init-felter; den hentes som den er.)
    (request.mode === 'navigate' ? fetch(request) : fetch(request, { cache: 'no-cache' }))
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(cacheKey, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        // Navigation offline uden cache-hit → vis app-skallen.
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
