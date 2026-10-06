/**
 * boot-guard.js — klassisk script lige efter auth-bridge.js.
 *
 * Sikkerhedsnet, hvis app-modulet slet ikke starter (fx en modulfejl eller en
 * gammel fil fra cachen) eller hænger: står der stadig "Indlæser …" efter 20 s,
 * vises en tydelig dansk fejl med "Prøv igen", "Nulstil app-cache" og en
 * teknisk detalje (fejl fanget af window.onerror og hvilket trin, der hang).
 */
(function () {
  if (window.__DAGSHUB_AUTH_BRIDGE__) return;
  var errors = [];
  window.addEventListener('error', function (e) {
    errors.push((e.message || 'Fejl') + (e.filename ? ' (' + e.filename.split('/').slice(-2).join('/') + ':' + e.lineno + ')' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    errors.push('Afvist promise: ' + (r && (r.name + ': ' + r.message) || String(r)));
  });

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function resetApp() {
    var p = [];
    try { if (navigator.serviceWorker) p.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) { /* ignorer */ }
    try { if (window.caches) p.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) { /* ignorer */ }
    Promise.all(p).catch(function () {}).then(function () { history.replaceState(null, '', location.pathname + '#idag'); location.reload(); });
  }

  setTimeout(function () {
    var main = document.getElementById('view');
    if (!main || !main.querySelector(':scope > p.loading')) return; // appen viser noget
    var booted = Boolean(window.__DAGSHUB_BOOTED__);
    var detail = [
      booted ? 'Appen startede, men hang i trinnet: ' + (window.__DAGSHUB_STEP__ || 'ukendt') : 'App-modulet (js/app.js) startede ikke.',
    ].concat(errors.length ? ['Fejl:'].concat(errors.map(function (x) { return '• ' + x; })) : ['Ingen JavaScript-fejl fanget.'])
      .concat(['', 'Tid: ' + new Date().toLocaleString('da-DK'), 'Side: ' + location.pathname + location.hash,
        'Online: ' + (navigator.onLine ? 'ja' : 'nej') + ' · Service worker: ' + (navigator.serviceWorker && navigator.serviceWorker.controller ? 'aktiv' : 'ingen'),
        'Browser: ' + navigator.userAgent]).join('\n');
    main.innerHTML = '<section class="card error error-panel" role="alert">'
      + '<h2>Dagshub kunne ikke starte</h2>'
      + '<p>' + (booted ? 'Indlæsningen tog over 20 sekunder.' : 'Appen kunne ikke indlæses. Det skyldes oftest en gammel version i browserens cache.') + ' Tryk "Prøv igen". Hjælper det ikke, så tryk "Nulstil app-cache" under Teknisk detalje.</p>'
      + '<div class="error-actions"><button class="btn btn-primary btn-lg" id="bg-retry">Prøv igen</button></div>'
      + '<details class="tech-detail"><summary>Teknisk detalje</summary><pre>' + esc(detail) + '</pre>'
      + '<button class="btn btn-ghost btn-small" id="bg-reset">Nulstil app-cache og genindlæs</button></details></section>';
    document.getElementById('bg-retry').onclick = function () { location.reload(); };
    document.getElementById('bg-reset').onclick = resetApp;
  }, 20000);
})();
