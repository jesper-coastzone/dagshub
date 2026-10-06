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
 * FEJL RETTET 6/10-2026: Login startede fra ".../dagshub/#idag", og svaret kom
 * til ".../dagshub/#code=…". MSAL's egen navigation til "#idag" er derfor kun
 * et hash-skift på samme side – siden genindlæses ikke, appen starter aldrig,
 * og skærmen blev stående på "Indlæser …" (først efter MSAL's 30 s-timeout
 * kom den videre). Nu bruges en navigation, der altid genindlæser, når kun
 * #fragmentet er forskelligt. Og er siden her stadig efter 8 s, genstartes den.
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
  var topLevel = window === window.top && !window.opener;
  var left = false;

  // Fuld genindlæsning på en ren adresse (svaret fjernes fra URL'en).
  function restart(target) {
    if (left) return;
    left = true;
    var url = target || (location.pathname + '#idag');
    history.replaceState(null, '', url);
    location.reload();
  }

  // Navigation til siden, login startede fra. Er det samme side og kun
  // #fragmentet er anderledes, er location.replace() ikke nok – så genindlæses.
  var navigationClient = {
    navigateInternal: function (url) { return go(url); },
    navigateExternal: function (url) { return go(url); },
  };
  function go(url) {
    try {
      var target = new URL(url, location.href);
      if (target.origin === location.origin) {
        if (target.pathname === location.pathname && target.search === location.search) {
          restart(target.pathname + target.search + (target.hash || '#idag'));
        } else {
          left = true;
          location.replace(target.href);
        }
      } else {
        left = true;
        location.replace(target.href);
      }
    } catch (e) {
      restart();
    }
    return new Promise(function () { /* siden skifter */ });
  }

  if (topLevel) {
    // Sikkerhedsnet: hænger noget, genstartes appen efter 8 s.
    setTimeout(function () { console.warn('[auth] Login-svaret tog for lang tid – genstarter.'); restart(); }, 8000);
  }

  var s = document.createElement('script');
  s.src = 'js/vendor/msal-redirect-bridge.min.js';
  s.onload = function () {
    window.msalRedirectBridge.broadcastResponseToMainFrame(navigationClient).catch(function (err) {
      console.warn('[auth] Login-svaret kunne ikke behandles:', err && err.message);
      if (topLevel) restart();
    });
  };
  s.onerror = function () { if (topLevel) restart(); };
  document.head.appendChild(s);
})();
