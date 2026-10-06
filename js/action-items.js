/**
 * action-items.js — simpel heuristik der finder mulige action items i tekst.
 *
 * Teksten deles i sætninger, og sætninger med typiske "handlingsord"
 * (skal, aftalt, opfølgning, send …) foreslås som action items. Brugeren
 * retter/sletter/tilføjer manuelt bagefter — det er bevidst simpelt.
 */

/** Ordstammer der indikerer en handling. Matcher starten af et ord. */
const KEYWORDS = [
  'skal', 'aftal', 'opfølg', 'følger op', 'send', 'undersøg', 'book',
  'deadline', 'inden', 'ansvarlig', 'husk', 'tjek', 'ring',
];

// (?<!\p{L}) sikrer at vi matcher fra starten af et ord (også med æ/ø/å).
const KEYWORD_RE = new RegExp(`(?<!\\p{L})(${KEYWORDS.join('|')})`, 'iu');

/** Deler tekst i sætninger (punktum, spørgsmålstegn, udråbstegn eller linjeskift). */
export function splitSentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim().replace(/^[-•*]\s*/u, ''))
    .filter((s) => s.length > 3);
}

/** Returnerer unikke sætninger der ligner action items. */
export function extractActionItems(text) {
  const seen = new Set();
  return splitSentences(text)
    .filter((s) => KEYWORD_RE.test(s))
    .map((s) => s.replace(/[.!]+$/u, ''))
    .filter((s) => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
