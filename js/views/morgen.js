/**
 * Morgen — dagens overblik + "Læs op" til brug i bilen.
 */

import * as api from '../api.js';
import {
  esc, formatLongDate, toast, $, dateKey,
} from '../utils.js';
import {
  meetingCard, sourceTag, relativeDayLabel, empty, ICONS,
} from '../components.js';
import {
  buildBrief, speak, stopSpeaking, isSpeechSupported,
} from '../speech.js';

export const title = 'Morgen';

export async function render(root) {
  let speaking = false;
  let brief = [];

  /** Henter data og tegner indholdet. Kaldes igen efter ændringer. */
  async function paint() {
    const [meetings, openItems, decisions] = await Promise.all([
      api.getTodayMeetings(), api.getOpenItems(), api.getDecisions(),
    ]);
    const now = new Date();
    const today = dateKey(now);
    brief = buildBrief({ meetings, openItems, decisions, now });

    const openCount = openItems.filter((i) => !i.done).length;
    const decisionCount = decisions.filter((d) => !d.decided).length;

    root.innerHTML = `
      <section class="hero">
        <p class="eyebrow">${esc(formatLongDate(now))}</p>
        <h1>${esc(brief[0].split('.')[0])}</h1>
        <p class="summary">
          ${meetings.length} møder · ${openCount} åbne punkter · ${decisionCount} kræver beslutning
        </p>
        <button class="btn btn-primary btn-xl" id="read-aloud" ${isSpeechSupported() ? '' : 'disabled'}>
          ${ICONS.speaker}<span>Læs op</span>
        </button>
        ${isSpeechSupported() ? '' : '<p class="hint">Oplæsning understøttes ikke i denne browser.</p>'}
        <p class="hint speech-status" id="speech-status" aria-live="polite"></p>
      </section>

      <section class="section">
        <h2>Dagens møder <span class="count">${meetings.length}</span></h2>
        <div class="stack">
          ${meetings.length
            ? meetings.map((m) => meetingCard(m, {
                now,
                actions: `<a class="btn btn-small" href="#mode?m=${encodeURIComponent(m.id)}">Tag noter</a>`,
              })).join('')
            : empty('Ingen møder i dag.')}
        </div>
      </section>

      <section class="section">
        <h2>Åbne punkter <span class="count">${openCount}</span></h2>
        <ul class="checklist">
          ${openItems.map((i) => `
            <li class="${i.done ? 'is-done' : ''}">
              <label>
                <input type="checkbox" data-item="${esc(i.id)}" ${i.done ? 'checked' : ''}>
                <span class="checklist-text">${esc(i.text)}</span>
              </label>
              <span class="checklist-meta">
                ${sourceTag(i.source)}
                <span class="due ${i.due === today ? 'due-today' : ''}">${esc(relativeDayLabel(i.due, today))}</span>
              </span>
            </li>`).join('') || `<li>${empty('Ingen åbne punkter.')}</li>`}
        </ul>
      </section>

      <section class="section">
        <h2>Kræver beslutning <span class="count">${decisionCount}</span></h2>
        <div class="stack">
          ${decisions.map((d) => `
            <article class="card decision ${d.decided ? 'is-done' : ''}">
              <h3>${esc(d.title)}</h3>
              <p>${esc(d.context)}</p>
              <div class="actions">
                <span class="due ${d.deadline === today ? 'due-today' : ''}">Frist: ${esc(relativeDayLabel(d.deadline, today))}</span>
                ${d.decided
                  ? `<span class="done-label">${ICONS.check} Besluttet</span>`
                  : `<button class="btn btn-small" data-decide="${esc(d.id)}">Markér som besluttet</button>`}
              </div>
            </article>`).join('') || empty('Intet kræver beslutning.')}
        </div>
      </section>

      <details class="section brief-text">
        <summary>Vis oplæsningstekst</summary>
        <ol>${brief.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      </details>
    `;
  }

  /* --- Oplæsning --- */

  function setSpeaking(on, statusText = '') {
    speaking = on;
    const btn = $('#read-aloud', root);
    const status = $('#speech-status', root);
    if (btn) {
      btn.innerHTML = on ? `${ICONS.stop}<span>Stop oplæsning</span>` : `${ICONS.speaker}<span>Læs op</span>`;
      btn.classList.toggle('is-active', on);
    }
    if (status) status.textContent = statusText;
  }

  async function toggleReadAloud() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    try {
      const { voice } = await speak(brief, { onProgress: (i) => setSpeaking(true, brief[i]) });
      if (!voice) toast('Ingen dansk stemme fundet — bruger standardstemmen.');
    } catch (err) {
      toast(err.message);
    }
    setSpeaking(false);
  }

  /* --- Hændelser (delegation på root, lægges på én gang) --- */

  root.addEventListener('click', async (e) => {
    if (e.target.closest('#read-aloud')) {
      toggleReadAloud();
      return;
    }
    const decideId = e.target.closest('[data-decide]')?.dataset.decide;
    if (decideId) {
      await api.markDecided(decideId);
      toast('Markeret som besluttet');
      paint();
    }
  });

  root.addEventListener('change', async (e) => {
    const id = e.target.dataset?.item;
    if (!id) return;
    const done = await api.toggleOpenItem(id);
    e.target.closest('li').classList.toggle('is-done', done);
  });

  await paint();

  // Stop oplæsning, når brugeren forlader viewet.
  return () => stopSpeaking();
}
