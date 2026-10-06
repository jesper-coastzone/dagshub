/**
 * Dagsafslutning — 5-minutters afslutning af dagen i tre trin:
 *   1. Log dagens møder i HubSpot (mock)
 *   2. Arkivér mødenoter
 *   3. Ryd uberørte mails (parkér til opfølgning)
 */

import * as api from '../api.js';
import {
  esc, $, toast, formatTime, formatTimeRange, dateKey, addDaysKey, nextWeekdayKey,
} from '../utils.js';
import {
  sourceTag, relativeDayLabel, shortDayLabel, empty, ICONS,
} from '../components.js';

export const title = 'Dagsafslutning';

export async function render(root) {
  async function paint() {
    const [meetings, pendingNotes, emails, followUps, archive] = await Promise.all([
      api.getTodayMeetings(), api.getPendingNotes(), api.getUntouchedEmails(),
      api.getFollowUps(), api.getArchive(),
    ]);
    const today = dateKey();
    const tomorrow = addDaysKey(today, 1);
    const thursday = nextWeekdayKey(4, today);

    const steps = [
      { label: 'Log møder i HubSpot', done: meetings.every((m) => m.loggedToHubSpot) },
      { label: 'Arkivér noter', done: pendingNotes.length === 0 },
      { label: 'Ryd uberørte mails', done: emails.length === 0 },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const currentIndex = steps.findIndex((s) => !s.done);

    root.innerHTML = `
      <section class="section">
        <h1>Dagsafslutning</h1>
        <p class="summary">Fem minutter: log, arkivér, ryd op.</p>

        <ol class="stepper" aria-label="Fremskridt: ${doneCount} af 3 trin klaret">
          ${steps.map((s, i) => `
            <li class="${s.done ? 'is-done' : ''} ${i === currentIndex ? 'is-current' : ''}">
              <span class="step-dot">${s.done ? ICONS.check : i + 1}</span>
              <span class="step-label">${esc(s.label)}</span>
            </li>`).join('')}
        </ol>
        <p class="hint">${doneCount === 3 ? 'Alt er klaret — god aften!' : `${doneCount} af 3 trin klaret`}</p>
      </section>

      <!-- Trin 1 -->
      <section class="section">
        <h2><span class="step-num">1</span> Log møder i HubSpot</h2>
        <div class="stack">
          ${meetings.map((m) => `
            <div class="row-card">
              <div>
                <p class="row-title">${esc(m.title)}</p>
                <p class="meta-line">${esc(formatTimeRange(m.start, m.end))} · ${esc(m.client)}</p>
              </div>
              ${m.loggedToHubSpot
                ? `<span class="done-label">${ICONS.check} Logget</span>`
                : `<button class="btn btn-small" data-log="${esc(m.id)}">Log i HubSpot</button>`}
            </div>`).join('') || empty('Ingen møder i dag.')}
        </div>
      </section>

      <!-- Trin 2 -->
      <section class="section">
        <div class="section-head">
          <h2><span class="step-num">2</span> Mødenoter</h2>
          <a class="btn btn-ghost btn-small" href="#arkiv">Arkiv (${archive.length})</a>
        </div>
        <div class="stack">
          ${pendingNotes.map((n) => `
            <article class="card">
              <h3>${esc(n.meeting?.title ?? 'Note uden møde')}</h3>
              <p class="meta-line">${esc(n.meeting?.client ?? '')} · gemt kl. ${esc(formatTime(n.createdAt))}
                ${n.hasAudio ? ' · med lyd' : ''}</p>
              ${n.notes ? `<p class="excerpt">${esc(n.notes.slice(0, 180))}${n.notes.length > 180 ? ' …' : ''}</p>` : ''}
              ${n.actionItems.length ? `<p class="meta-line">${n.actionItems.length} action items</p>` : ''}
              <div class="actions">
                <button class="btn btn-small" data-archive="${esc(n.id)}">Arkivér</button>
              </div>
            </article>`).join('') || empty('Ingen nye noter. Optag noter under fanen Møde.')}
        </div>
      </section>

      <!-- Trin 3 -->
      <section class="section">
        <h2><span class="step-num">3</span> Uberørte mails <span class="count">${emails.length}</span></h2>
        <div class="stack">
          ${emails.map((e) => `
            <article class="card email" data-email="${esc(e.id)}">
              <div class="email-head">
                ${sourceTag(e.account)}
                <span class="meta-line">${esc(formatTime(e.receivedAt))}</span>
              </div>
              <h3>${esc(e.subject)}</h3>
              <p class="meta-line">${esc(e.from)}</p>
              <p class="excerpt">${esc(e.snippet)}</p>
              <div class="actions">
                <button class="btn btn-small" data-park="${esc(e.id)}" data-date="${tomorrow}">Parkér til i morgen</button>
                <button class="btn btn-small" data-park="${esc(e.id)}" data-date="${thursday}">Parkér til torsdag</button>
                <button class="btn btn-small btn-ghost" data-custom="${esc(e.id)}">Vælg dato …</button>
              </div>
              <form class="inline-form custom-date" data-custom-form="${esc(e.id)}" hidden>
                <input type="date" min="${today}" value="${addDaysKey(today, 7)}" aria-label="Opfølgningsdato">
                <button class="btn btn-small" type="submit">Parkér</button>
              </form>
            </article>`).join('') || empty('Indbakken er ryddet.')}
        </div>
      </section>

      <!-- Opfølgning -->
      <section class="section">
        <h2>Opfølgning</h2>
        ${followUps.map((g) => `
          <div class="group">
            <h3 class="group-title">${esc(relativeDayLabel(g.date, today))} <span class="meta-line">${esc(shortDayLabel(g.date))}</span></h3>
            <ul class="item-list">
              ${g.items.map((e) => `
                <li>
                  <span>${sourceTag(e.account)} ${esc(e.subject)} <span class="meta-line">· ${esc(e.from.replace(/\s*<.*>/, ''))}</span></span>
                  <button class="btn btn-ghost btn-small" data-unpark="${esc(e.id)}">Fortryd</button>
                </li>`).join('')}
            </ul>
          </div>`).join('') || empty('Intet parkeret til opfølgning.')}
      </section>
    `;
  }

  /* ---------------- Handlinger ---------------- */

  async function park(id, date) {
    await api.parkEmail(id, date);
    toast(`Parkeret til ${relativeDayLabel(date).toLowerCase()}`);
    paint();
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const d = btn.dataset;

    if (d.log) {
      btn.disabled = true;
      btn.textContent = 'Logger …';
      await api.logToHubSpot(d.log);
      toast('Logget i HubSpot (mock — intet er sendt)');
      paint();
    } else if (d.archive) {
      await api.archiveNote(d.archive);
      toast('Noten er arkiveret');
      paint();
    } else if (d.park) {
      park(d.park, d.date);
    } else if (d.custom) {
      const form = $(`[data-custom-form="${CSS.escape(d.custom)}"]`, root);
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('input').focus();
    } else if (d.unpark) {
      await api.unparkEmail(d.unpark);
      toast('Mailen er tilbage i indbakken');
      paint();
    }
  });

  root.addEventListener('submit', (e) => {
    const id = e.target.dataset.customForm;
    if (!id) return;
    e.preventDefault();
    const value = e.target.querySelector('input').value;
    if (!value) {
      toast('Vælg en dato');
      return;
    }
    park(id, value);
  });

  await paint();
}
