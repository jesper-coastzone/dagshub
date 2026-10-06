/**
 * Arkiv — arkiverede mødenoter med action items, transskription og lyd.
 */

import * as api from '../api.js';
import {
  esc, toast, formatShortDate, formatTimeRange,
} from '../utils.js';
import { empty, ICONS } from '../components.js';

export const title = 'Arkiv';

export async function render(root) {
  const audioUrls = [];

  async function paint() {
    const notes = await api.getArchive();
    root.innerHTML = `
      <section class="section">
        <a class="back-link" href="#dagsafslutning">← Dagsafslutning</a>
        <h1>Arkiv <span class="count">${notes.length}</span></h1>
        <p class="summary">Arkiverede mødenoter, gemt lokalt på denne enhed.</p>
      </section>

      <div class="stack">
        ${notes.map((n) => `
          <article class="card" data-note="${esc(n.id)}">
            <h3>${esc(n.meeting?.title ?? 'Note uden møde')}</h3>
            <p class="meta-line">
              ${esc(n.meeting?.client ?? '')}
              ${n.meeting ? ` · ${esc(formatShortDate(n.meeting.start))} ${esc(formatTimeRange(n.meeting.start, n.meeting.end))}` : ''}
            </p>
            ${n.notes ? `<p class="prewrap">${esc(n.notes)}</p>` : ''}
            ${n.actionItems.length ? `
              <h4>Action items</h4>
              <ul class="bullets">${n.actionItems.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
            ${n.transcript ? `
              <details><summary>Transskription</summary><p class="prewrap">${esc(n.transcript)}</p></details>` : ''}
            <div class="actions">
              ${n.hasAudio ? `<button class="btn btn-small" data-play="${esc(n.id)}">${ICONS.speaker} Afspil optagelse</button>` : ''}
              <button class="btn btn-small btn-ghost" data-delete="${esc(n.id)}">${ICONS.trash} Slet</button>
            </div>
            <div class="audio-slot"></div>
          </article>`).join('') || empty('Arkivet er tomt. Arkivér noter under Dagsafslutning.')}
      </div>

      <section class="section danger-zone">
        <h2>Demo</h2>
        <p class="hint">Nulstil al lokal tilstand: noter, arkiv, lyd, parkeringer og flag.</p>
        <button class="btn btn-ghost" id="reset-btn">Nulstil demo-data</button>
      </section>
    `;
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.play) {
      const blob = await api.getNoteAudio(btn.dataset.play);
      if (!blob) {
        toast('Optagelsen findes ikke længere på denne enhed.');
        return;
      }
      const url = URL.createObjectURL(blob);
      audioUrls.push(url);
      const slot = btn.closest('article').querySelector('.audio-slot');
      slot.innerHTML = `<audio controls autoplay class="audio" src="${url}"></audio>`;
      btn.remove();
    } else if (btn.dataset.delete) {
      if (!confirm('Slet noten permanent?')) return;
      await api.deleteNote(btn.dataset.delete);
      toast('Noten er slettet');
      paint();
    } else if (btn.id === 'reset-btn') {
      if (!confirm('Nulstil alle lokale data i Dagshub?')) return;
      await api.resetDemo();
      toast('Demo-data er nulstillet');
      paint();
    }
  });

  await paint();
  return () => audioUrls.forEach((u) => URL.revokeObjectURL(u));
}
