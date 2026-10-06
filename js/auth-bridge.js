/**
 * auth-bridge.js — klassisk script, der indlæses FØRST i index.html.
 *
 * Siden er selv redirect-URI (sidens egen URL). Når Microsoft sender brugeren
 * tilbage efter login, står svaret (code/state) i URL'ens #fragment. MSAL v5
 * kræver, at redirect-siden kører "redirect bridge": den gemmer svaret i
 * sessionStorage og navigerer tilbage til siden, login startede fra, hvor
 * auth.js (handleRedirectPromise) samler det op. Ved stille fornyelse i en
 * skjult iframe sender den svaret til hovedvinduet via BroadcastChannel.
 *
 * Mens det sker, starter selve appen ikke (app.js tjekker flaget).
 * Fragmentet sendes aldrig til serveren, så koden havner ikke i logs/caches.
 */
(function () {
  var auth = /(^|[#&?])(code|error)=/;
  var state = /(^|[#&?])state=/;
  var h = location.hash || '';
  var q = location.search || '';
  if (!((auth.test(h) && state.test(h)) || (auth.test(q) && state.test(q)))) return;

  window.__DAGSHUB_AUTH_BRIDGE__ = true;
  document.title = 'Logger ind …';
  var s = document.createElement('script');
  s.src = 'js/vendor/msal-redirect-bridge.min.js';
  // Ved fejl: fjern svaret fra URL'en og start appen normalt (fuld genindlæsning).
  function restart() {
    history.replaceState(null, '', location.pathname + '#idag');
    location.reload();
  }
  s.onload = function () {
    window.msalRedirectBridge.broadcastResponseToMainFrame().catch(function (err) {
      console.warn('[auth] Login-svaret kunne ikke behandles:', err && err.message);
      restart();
    });
  };
  s.onerror = restart;
  document.head.appendChild(s);
})();
