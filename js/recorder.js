/**
 * recorder.js — lydoptagelse (MediaRecorder) + live-transskription
 * (webkitSpeechRecognition, da-DK) samlet bag ét lille interface.
 *
 * Begge kræver en "sikker kontekst": HTTPS eller http://localhost.
 * Live-transskription findes i Chrome/Edge (desktop + Android) og Safari
 * (begrænset). Firefox har den ikke — så vises en tydelig pladsholder.
 */

export const MAX_SECONDS = 5 * 60;

export const isRecordingSupported = () =>
  Boolean(navigator.mediaDevices?.getUserMedia) && 'MediaRecorder' in window;

const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
export const isTranscriptionSupported = () => Boolean(SpeechRecognitionImpl);

/**
 * Opretter en optager.
 * @param {Object} handlers
 *   onTick(seconds)            hvert sekund under optagelse
 *   onTranscript(final, interim) når transskriptionen opdateres
 *   onStop({ blob, transcript, seconds }) når optagelsen er slut
 *   onError(message)
 */
export function createRecorder({ onTick, onTranscript, onStop, onError }) {
  let mediaRecorder = null;
  let stream = null;
  let recognition = null;
  let chunks = [];
  let timer = null;
  let startedAt = 0;
  let finalText = '';
  let active = false;

  const seconds = () => Math.floor((Date.now() - startedAt) / 1000);

  function startRecognition() {
    if (!SpeechRecognitionImpl) return;
    recognition = new SpeechRecognitionImpl();
    recognition.lang = 'da-DK';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += `${r[0].transcript.trim()}. `;
        else interim += r[0].transcript;
      }
      onTranscript?.(finalText.trim(), interim.trim());
    };
    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        onError?.(`Transskription: ${e.error}`);
      }
    };
    // Chrome stopper genkendelsen efter pauser — genstart så længe vi optager.
    recognition.onend = () => {
      if (active) {
        try { recognition.start(); } catch { /* allerede startet */ }
      }
    };
    try { recognition.start(); } catch (err) { onError?.(err.message); }
  }

  async function start() {
    if (!isRecordingSupported()) throw new Error('Lydoptagelse understøttes ikke her (kræver HTTPS eller localhost).');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    finalText = '';
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      onStop?.({ blob, transcript: finalText.trim(), seconds: seconds() });
    };
    mediaRecorder.start(1000);
    startedAt = Date.now();
    active = true;
    startRecognition();

    timer = setInterval(() => {
      const s = seconds();
      onTick?.(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
  }

  function stop() {
    if (!active) return;
    active = false;
    clearInterval(timer);
    try { recognition?.stop(); } catch { /* ignorer */ }
    if (mediaRecorder?.state !== 'inactive') mediaRecorder.stop();
  }

  return { start, stop, isActive: () => active };
}
