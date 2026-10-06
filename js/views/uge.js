/**
 * Uge — søndagsforberedelse: næste uges møder mandag–fredag med forslag til
 * at blokere transporttid, hvor der ikke er tid nok til at køre.
 * Analysen ligger i js/travel.js; køretider er mock.
 */

import * as api from '../api.js';
import {
  esc, toast, formatDayMonth, formatTime, formatTimeRange, formatMinutes,
  fromDateKey, isoWeek, formatShortDate, dateKey,
} from '../utils.js';
import { meetingCard, empty, ICONS } from '../components.js';
import { PARKING_BUFFER_MIN } from '../travel.js';

export const title = 'Uge';

/** Forklarende tekst for et transportforslag. */
function describe(s) {
  const route = s.fromOffice ? `Fra kontoret i ${s.from} til ${s.to}` : `${s.from} → ${s.to}`;
  const after = s.afterMeeting ? 'efter forrige aftale' : 'fra arbejdsdagens start';
  return `${route}: ${s.travelMin} min kørsel + ${PARKING_BUFFER_MIN} min buffer. `
    + `Kun ${formatMinutes(Math.max(0, s.availableMin))} ${after}.`;
}

function suggestionCard(s) {
  const shortBy = s.neededMin - s.availableMin;
  return `
    <aside class="transport ${s.accepted ? 'is-accepted' : ''}" data-block="${esc(s.id)}">
      <div class="transport-icon">${ICONS.car}</div>
      <div class="transport-body">
        <p class="transport-title">Bloker transporttid · ${esc(formatMinutes(s.neededMin))}</p>
        <p class="meta-line">${esc(describe(s))}</p>
        <p class="meta-line">Forslag: ${esc(formatTimeRange(s.blockStart, s.blockEnd))}
          ${shortBy > 0 ? ` · mangler ${esc(formatMinutes(shortBy))} — overvej at flytte et møde` : ''}</p>
      </div>
      ${s.accepted
        ? `<span class="done-label">${ICONS.check} Blokeret</span>`
        : `<button class="btn btn-small btn-warn" data-accept="${esc(s.id)}">Bloker</button>`}
    </aside>`;
}

function okLine(s) {
  return `<p class="transport-ok">${ICONS.car}<span>${esc(s.from)} → ${esc(s.to)} ≈ ${esc(formatMinutes(s.neededMin))} · god tid (${esc(formatMinutes(s.availableMin))})</span></p>`;
}

export async function render(root) {
  async function paint() {
    const [meetings, suggestions] = await Promise.all([
      api.getWeekMeetings(), api.getTransportSuggestions(),
    ]);
    const days = api.getNextWeekDays();
    const byMeeting = new Map(suggestions.map((s) => [s.meetingId, s]));
    const conflicts = suggestions.filter((s) => s.conflict);
    const open = conflicts.filter((s) => !s.accepted).length;

    root.innerHTML = `
      <section class="section">
        <h1>Ugen der kommer</h1>
        <p class="summary">Uge ${isoWeek(days[0])} · ${esc(formatShortDate(fromDateKey(days[0], 12)))}–${esc(formatShortDate(fromDateKey(days[4], 12)))}
          · ${meetings.length} møder</p>
        <div class="chips">
          <span class="chip ${open ? 'chip-warn' : 'chip-ok'}">
            ${open ? `${open} steder mangler transporttid` : 'Transporttid er på plads'}
          </span>
          ${conflicts.length - open ? `<span class="chip chip-ok">${conflicts.length - open} blokeret</span>` : ''}
        </div>
      </section>

      ${days.map((key) => {
        const list = meetings.filter((m) => dateKey(new Date(m.start)) === key);
        return `
          <section class="section day">
            <h2 class="day-title">${esc(formatDayMonth(fromDateKey(key, 12)))}</h2>
            <div class="stack">
              ${list.map((m) => {
                const s = byMeeting.get(m.id);
                const before = s ? (s.conflict ? suggestionCard(s) : okLine(s)) : '';
                return before + meetingCard(m, { now: new Date(0) });
              }).join('') || empty('Ingen møder.')}
            </div>
          </section>`;
      }).join('')}

      <p class="hint footnote">
        Køretider er estimater fra en fast tabel (mock) med udgangspunkt i kontoret i ${esc(api.OFFICE.city)}
        og arbejdsdagens start kl. ${esc(formatTime(fromDateKey(days[0], 8)))}. "Bloker" opretter endnu ikke en rigtig kalenderaftale.
      </p>
    `;
  }

  root.addEventListener('click', async (e) => {
    const id = e.target.closest('[data-accept]')?.dataset.accept;
    if (!id) return;
    e.target.closest('button').disabled = true;
    await api.acceptTransportBlock(id);
    toast('Transporttid blokeret (mock — ingen kalenderaftale oprettet)');
    paint();
  });

  await paint();
}
