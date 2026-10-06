/**
 * Møde — optag et møde (op til 5 min), få live-transskription hvor browseren
 * understøtter det, ret noter og action items, og gem til arkivet.
 *
 * Kladden (draft) ligger i modul-scope, så den overlever at man skifter fane
 * og kommer tilbage. Den gemmes først permanent ved "Gem".
 */

import * as api from '../api.js';
import {
  esc, $, toast, formatTimeRange, formatClock,
} from '../utils.js';
import { isOngoing, ICONS } from '../components.js';
import {
  createRecorder, isRecordingSupported, isTranscriptionSupported, MAX_SECONDS,
} from '../recorder.js';
import { extractActionItems } from '../action-items.js';

export const title = 'Møde';

/** Kladde for den igangværende note. */
const draft = freshDraft();

function freshDraft() {
  return {
    meetingId: null,
    transcript: '',
    interim: '',
    notes: '',
    actionItems: [],
    audioBlob: null,
    audioUrl: null,
    seconds: 0,
  };
}

function resetDraft() {
  if (draft.audioUrl) URL.revokeObjectURL(draft.audioUrl);
  Object.assign(draft, freshDraft());
}

/** Standardvalg: igangværende møde → senest startede → første kommende. */
function defaultMeetingId(meetings, now = new Date()) {
  const ongoing = meetings.find((m) => isOngoing(m, now));
  if (ongoing) return ongoing.id;
  const started = meetings.filter((m) => new Date(m.start) <= now);
  if (started.length) return started.at(-1).id;
  return meetings[0]?.id ?? null;
}

export async function render(root, params) {
  const meetings = await api.getTodayMeetings();
  const requested = params.get('m');
  if (requested && meetings.some((m) => m.id === requested)) draft.meetingId = requested;
  if (!draft.meetingId || !meetings.some((m) => m.id === draft.meetingId)) {
    draft.meetingId = defaultMeetingId(meetings);
  }

  const canRecord = isRecordingSupported();
  const canTranscribe = isTranscriptionSupported();

  const recorder = createRecorder({
    onTick: (s) => {
      draft.seconds = s;
      updateTimer();
    },
    onTranscript: (finalText, interim) => {
      draft.transcript = finalText;
      draft.interim = interim;
      const box = $('#transcript', root);
      if (box) box.value = [finalText, interim].filter(Boolean).join(' ');
    },
    onStop: ({ blob, transcript }) => {
      draft.audioBlob = blob;
      if (draft.audioUrl) URL.revokeObjectURL(draft.audioUrl);
      draft.audioUrl = URL.createObjectURL(blob);
      draft.transcript = transcript || draft.transcript;
      draft.interim = '';
      // Første udkast til noter og action items ud fra transskriptionen.
      if (!draft.notes.trim() && draft.transcript) draft.notes = draft.transcript;
      if (!draft.actionItems.length) draft.actionItems = extractActionItems(draft.notes);
      paint();
      toast('Optagelse stoppet');
    },
    onError: (msg) => toast(msg),
  });

  /* ---------------- Tegning ---------------- */

  function paint() {
    const recording = recorder.isActive();
    const meetingOptions = meetings.map((m) => `
      <option value="${esc(m.id)}" ${m.id === draft.meetingId ? 'selected' : ''}>
        ${esc(formatTimeRange(m.start, m.end))} · ${esc(m.client)}: ${esc(m.title)}
      </option>`).join('');

    root.innerHTML = `
      <section class="section">
        <h1>Mødenoter</h1>
        <label class="field">
          <span class="field-label">Møde</span>
          <select id="meeting-select" ${recording ? 'disabled' : ''}>${meetingOptions}</select>
        </label>
      </section>

      <section class="card recorder ${recording ? 'is-recording' : ''}">
        <button class="record-btn" id="record-btn" aria-pressed="${recording}"
          ${canRecord ? '' : 'disabled'} aria-label="${recording ? 'Stop optagelse' : 'Start optagelse'}">
          ${recording ? ICONS.stop : '<span class="record-dot"></span>'}
        </button>
        <div class="recorder-info">
          <p class="timer"><span id="timer">${formatClock(draft.seconds)}</span> / ${formatClock(MAX_SECONDS)}</p>
          <div class="progress"><div class="progress-bar" id="progress" style="width:${(draft.seconds / MAX_SECONDS) * 100}%"></div></div>
          <p class="hint">
            ${canRecord
              ? (recording ? 'Optager … tryk igen for at stoppe.' : 'Tryk for at optage (maks. 5 minutter).')
              : 'Lydoptagelse kræver mikrofon og HTTPS eller localhost.'}
          </p>
        </div>
      </section>

      ${draft.audioUrl ? `
        <section class="section">
          <h2>Optagelse</h2>
          <audio controls src="${draft.audioUrl}" class="audio"></audio>
        </section>` : ''}

      <section class="section">
        <h2>Transskription</h2>
        ${canTranscribe ? `
          <p class="hint">Live-transskription (da-DK) via browserens talegenkendelse.</p>
          <textarea id="transcript" rows="5" ${recording ? 'readonly' : ''}
            placeholder="Transskriptionen vises her, mens du optager …">${esc([draft.transcript, draft.interim].filter(Boolean).join(' '))}</textarea>
        ` : `
          <div class="placeholder-box">
            <strong>Transskription ikke tilgængelig</strong>
            <p>Denne browser understøtter ikke live-talegenkendelse (brug Chrome eller Edge).
               Lyden optages stadig, og du kan skrive noterne selv nedenfor.</p>
          </div>
        `}
        <button class="btn btn-ghost btn-small" id="sample-btn" ${recording ? 'disabled' : ''}>Indsæt eksempeltekst (demo)</button>
      </section>

      <section class="section">
        <h2>Noter</h2>
        <textarea id="notes" rows="7" placeholder="Hvad blev der sagt og aftalt?">${esc(draft.notes)}</textarea>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Action items <span class="count">${draft.actionItems.length}</span></h2>
          <button class="btn btn-small" id="extract-btn">Find action items</button>
        </div>
        <ul class="item-list" id="action-list">
          ${draft.actionItems.map((a, i) => `
            <li>
              <span>${esc(a)}</span>
              <button class="icon-btn" data-remove="${i}" aria-label="Fjern">${ICONS.trash}</button>
            </li>`).join('') || '<li class="empty">Ingen action items endnu.</li>'}
        </ul>
        <form class="inline-form" id="add-form">
          <input id="add-input" type="text" placeholder="Tilføj action item …" autocomplete="off">
          <button class="btn" type="submit">Tilføj</button>
        </form>
      </section>

      <div class="sticky-actions">
        <button class="btn btn-ghost" id="clear-btn" ${recording ? 'disabled' : ''}>Ryd</button>
        <button class="btn btn-primary" id="save-btn" ${recording ? 'disabled' : ''}>Gem</button>
      </div>
    `;
  }

  function updateTimer() {
    const t = $('#timer', root);
    const p = $('#progress', root);
    if (t) t.textContent = formatClock(draft.seconds);
    if (p) p.style.width = `${Math.min(100, (draft.seconds / MAX_SECONDS) * 100)}%`;
  }

  /* ---------------- Handlinger ---------------- */

  async function toggleRecording() {
    if (recorder.isActive()) {
      recorder.stop();
      return;
    }
    try {
      draft.seconds = 0;
      await recorder.start();
      paint();
    } catch (err) {
      toast(err.name === 'NotAllowedError' ? 'Adgang til mikrofonen blev afvist.' : err.message);
    }
  }

  async function save() {
    const meeting = meetings.find((m) => m.id === draft.meetingId) ?? null;
    if (!draft.notes.trim() && !draft.transcript.trim() && !draft.actionItems.length && !draft.audioBlob) {
      toast('Der er intet at gemme endnu.');
      return;
    }
    await api.saveMeetingNote({
      meeting,
      transcript: draft.transcript,
      notes: draft.notes,
      actionItems: draft.actionItems,
    }, draft.audioBlob);
    resetDraft();
    draft.meetingId = meeting?.id ?? null;
    paint();
    toast('Gemt — noten ligger klar i Dagsafslutning.');
  }

  root.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (!target) return;

    switch (target.id) {
      case 'record-btn': toggleRecording(); return;
      case 'save-btn': save(); return;
      case 'extract-btn': {
        const found = extractActionItems(`${draft.notes}\n${draft.transcript}`);
        const added = found.filter((f) => !draft.actionItems.includes(f));
        draft.actionItems.push(...added);
        paint();
        toast(added.length ? `${added.length} action items fundet` : 'Ingen nye action items fundet');
        return;
      }
      case 'sample-btn':
        draft.transcript = api.SAMPLE_TRANSCRIPT;
        draft.notes = draft.notes.trim() ? `${draft.notes}\n${api.SAMPLE_TRANSCRIPT}` : api.SAMPLE_TRANSCRIPT;
        paint();
        return;
      case 'clear-btn':
        if (confirm('Ryd noter, transskription og optagelse?')) {
          const keep = draft.meetingId;
          resetDraft();
          draft.meetingId = keep;
          paint();
        }
        return;
      default:
        if (target.dataset.remove !== undefined) {
          draft.actionItems.splice(Number(target.dataset.remove), 1);
          paint();
        }
    }
  });

  root.addEventListener('input', (e) => {
    if (e.target.id === 'notes') draft.notes = e.target.value;
    if (e.target.id === 'transcript') draft.transcript = e.target.value;
  });

  root.addEventListener('change', (e) => {
    if (e.target.id === 'meeting-select') draft.meetingId = e.target.value;
  });

  root.addEventListener('submit', (e) => {
    if (e.target.id !== 'add-form') return;
    e.preventDefault();
    const input = $('#add-input', root);
    const text = input.value.trim();
    if (text) {
      draft.actionItems.push(text);
      paint();
      $('#add-input', root)?.focus();
    }
  });

  paint();

  // Forlader man viewet under optagelse, stoppes den (lyden bevares i kladden).
  return () => recorder.stop();
}
