# Dagshub

Dagligt overblik som PWA (ren HTML/CSS/JavaScript, ingen build-step).

Siden indeholder **ingen rigtige data**. `data/hub-data.js` er fiktive eksempeldata. Efter login med en Microsoft-konto læser og skriver appen brugerens egne filer i OneDrive (mappen `Sekretærassistent`) via Microsoft Graph, direkte fra browseren.

Login: MSAL.js (`js/vendor/`, @azure/msal-browser, MIT-licens), authorization code + PKCE. Client ID står i `js/config.js` (et client ID er ikke en hemmelighed).
