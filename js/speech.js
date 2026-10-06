/**
 * speech.js — opbygning og oplæsning af morgenbriefen (Web Speech API).
 *
 * Briefen opdeles i korte sætninger, og hver sætning læses som sin egen
 * SpeechSynthesisUtterance. Det giver naturlige pauser og undgår, at
 * Chrome afbryder lange oplæsninger efter ~15 sekunder.
 */

import { getAccount } from './auth.js';
import { cphParts, formatLongDate, dateKey, addDaysKey } from './utils.js';
import { attendeeNames, isPast } from './components.js';

export const isSpeechSupported = () => 'speechSynthesis' in window;

/** "klokken 10" / "klokken 13 30" — skrevet så dansk TTS udtaler det naturligt. */
function spokenTime(iso) {
  const { hour, minute } = cphParts(new Date(iso));
  return minute === 0 ? `klokken ${hour}` : `klokken ${hour} ${String(minute).padStart(2, '0')}`;
}

function joinDanish(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} og ${list.at(-1)}`;
}

function greeting(now = new Date()) {
  const h = cphParts(now).hour;
  if (h < 10) return 'Godmorgen';
  if (h < 12) return 'God formiddag';
  if (h < 18) return 'God eftermiddag';
  return 'God aften';
}

/**
 * Bygger briefen som en liste af korte sætninger:
 * møder først, derefter åbne punkter, derefter beslutninger.
 */
export function buildBrief({ meetings, openItems, decisions, now = new Date() }) {
  const s = [];
  const first = String(getAccount()?.name || '').split(/\s+/)[0];
  s.push(`${greeting(now)}${first ? ` ${first}` : ''}. Det er ${formatLongDate(now).replace(/ \d{4}$/, '')}.`);

  const upcoming = meetings.filter((m) => !isPast(m, now));
  if (!meetings.length) {
    s.push('Du har ingen møder i dag.');
  } else if (!upcoming.length) {
    s.push('Dagens møder er overstået.');
  } else {
    s.push(upcoming.length === 1 ? 'Du har ét møde tilbage i dag.' : `Du har ${upcoming.length} møder tilbage i dag.`);
    upcoming.forEach((m) => {
      const where = m.location.type === 'online' ? 'på Teams' : `i ${m.location.city}`;
      s.push(`${spokenTime(m.start)}: ${m.title}, ${m.client}, ${where}.`);
      const names = attendeeNames(m, { withOrg: false });
      if (names.length) s.push(`Med ${joinDanish(names)}.`);
    });
  }

  const open = openItems.filter((i) => !i.done);
  if (open.length) {
    s.push(open.length === 1 ? 'Du har ét åbent punkt.' : `Du har ${open.length} åbne punkter.`);
    open.slice(0, 5).forEach((i) => s.push(`${i.text}.`));
  } else {
    s.push('Ingen åbne punkter.');
  }

  const pending = decisions.filter((d) => !d.decided);
  if (pending.length) {
    s.push(pending.length === 1 ? 'Én ting kræver din beslutning.' : `${pending.length} ting kræver din beslutning.`);
    const today = dateKey(now);
    pending.forEach((d) => {
      const due = d.deadline === today ? ' Frist i dag.' : d.deadline === addDaysKey(today, 1) ? ' Frist i morgen.' : '';
      s.push(`${d.title.replace(/\?$/, '')}.${due}`);
    });
  }

  s.push('Kør forsigtigt.');
  return s;
}

/** Deler et færdigt oplæsningsmanuskript i sætninger til speak(). */
export function sentencesFrom(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Vælger den bedste danske stemme, hvis en findes. */
function pickDanishVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'da-DK')
    ?? voices.find((v) => v.lang?.toLowerCase().startsWith('da'))
    ?? null;
}

/** Stemmer indlæses asynkront i nogle browsere — vent kort på dem. */
function voicesReady(timeout = 1500) {
  if (speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { speechSynthesis.removeEventListener('voiceschanged', done); resolve(); };
    speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, timeout);
  });
}

/**
 * Læser sætningerne op. Returnerer et Promise der resolves, når oplæsningen
 * er færdig eller stoppet. `onProgress(index)` kaldes før hver sætning.
 * @returns {Promise<{voice: string|null}>}
 */
export async function speak(sentences, { onProgress } = {}) {
  if (!isSpeechSupported()) throw new Error('Oplæsning understøttes ikke i denne browser.');
  speechSynthesis.cancel();
  await voicesReady();
  const voice = pickDanishVoice();

  return new Promise((resolve) => {
    sentences.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'da-DK';
      if (voice) u.voice = voice;
      u.rate = 1.0;
      u.onstart = () => onProgress?.(i);
      if (i === sentences.length - 1) {
        u.onend = () => resolve({ voice: voice?.name ?? null });
        u.onerror = () => resolve({ voice: voice?.name ?? null });
      }
      speechSynthesis.speak(u);
    });
  });
}

export function stopSpeaking() {
  if (isSpeechSupported()) speechSynthesis.cancel();
}

export function isSpeaking() {
  return isSpeechSupported() && speechSynthesis.speaking;
}
