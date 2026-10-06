/**
 * config.js — opsætning af login (Microsoft Entra ID) og OneDrive.
 *
 * Det eneste, der SKAL udfyldes, er clientId (Application (client) ID fra
 * app-registreringen "Dagshub" i Microsoft Entra). Se docs/opsaetning-microsoft.md.
 * Et client ID er ikke en hemmelighed; det må gerne ligge i et offentligt repo.
 *
 * Så længe clientId er pladsholderen, kører appen som i dag på data/hub-data.js.
 */

const CLIENT_ID = 'INDSÆT_CLIENT_ID';

/** Den offentlige adresse (GitHub Pages). Skal stå præcis sådan – med afsluttende "/" – som redirect-URI i Entra. */
export const PUBLIC_URL = 'https://jesper-coastzone.github.io/dagshub/';
export const BASE_PATH = '/dagshub/';

/** Sidens egen URL uden hash, query og "index.html". På GitHub Pages altid PUBLIC_URL. */
function ownUrl() {
  const { origin, pathname } = window.location;
  if (origin === new URL(PUBLIC_URL).origin && pathname.startsWith(BASE_PATH)) return PUBLIC_URL;
  return origin + pathname.replace(/index\.html$/, '');
}

export const CONFIG = {
  clientId: CLIENT_ID,
  // "organizations" = arbejds-/skolekonti i alle lejere. Kan skiftes til lejerens
  // eget domæne eller tenant-id, hvis app-registreringen er "single tenant".
  authority: 'https://login.microsoftonline.com/organizations',
  redirectUri: ownUrl(),
  scopes: ['User.Read', 'Files.ReadWrite'],

  // Microsoft Graph og mappen i OneDrive (fra roden af brugerens OneDrive).
  graphBase: 'https://graph.microsoft.com/v1.0',
  folder: 'Sekretærassistent',

  // Hvor ofte data hentes igen, mens appen er åben (minutter).
  refreshMinutes: 5,
};

/** Er appen sat op med et rigtigt client ID? */
export function isConfigured() {
  const id = String(CONFIG.clientId || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
