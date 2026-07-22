/* Speech-to-text via the Web Speech API.
 * Best support: Chrome (Android/desktop) and Edge. iOS Safari 14.5+ has partial
 * support; on unsupported browsers the mic button is hidden and the keyboard's
 * built-in dictation still works into any text field.
 *
 * Emits a single running transcript (onTranscript) rather than one event per
 * word, so the caller can render dictation as one continuous, non-duplicated
 * stream instead of a new line per word.
 */
function createDictation(handlers) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  let rec = null;
  let wantActive = false;
  let committedFinal = ''; // finalized text carried across auto-restarts
  let instanceFinal = '';  // finalized text within the current recognition instance

  function build() {
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-GB';
    instanceFinal = '';

    rec.onresult = (e) => {
      // Recompute the whole transcript for this instance every event — this is
      // idempotent, so a result that fires more than once can't be duplicated.
      let interim = '';
      let finalNow = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalNow += r[0].transcript + ' ';
        else interim += r[0].transcript + ' ';
      }
      instanceFinal = finalNow;
      handlers.onTranscript(committedFinal + instanceFinal, interim);
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantActive = false;
        handlers.onState(false);
        handlers.onError('Microphone access was blocked. Allow it in your browser settings.');
      }
      // 'no-speech' / 'aborted' are routine; onend handles the restart.
    };

    // Mobile browsers stop recognition after a pause — restart while active,
    // preserving everything finalized so far.
    rec.onend = () => {
      committedFinal += instanceFinal;
      instanceFinal = '';
      if (wantActive) {
        try { rec.start(); } catch (_) { /* already starting */ }
      } else {
        handlers.onState(false);
      }
    };
  }

  return {
    start() {
      wantActive = true;
      committedFinal = '';
      instanceFinal = '';
      build();
      try {
        rec.start();
        handlers.onState(true);
      } catch (_) {
        wantActive = false;
        handlers.onState(false);
      }
    },
    stop() {
      wantActive = false;
      try { rec.stop(); } catch (_) { /* not running */ }
    },
    get active() {
      return wantActive;
    },
  };
}
