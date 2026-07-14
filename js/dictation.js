/* Speech-to-text via the Web Speech API.
 * Best support: Chrome (Android/desktop) and Edge. iOS Safari 14.5+ has partial
 * support; on unsupported browsers the mic button is hidden and the keyboard's
 * built-in dictation still works into any text field.
 */
function createDictation(handlers) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  let rec = null;
  let wantActive = false;

  function build() {
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-GB';

    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const text = res[0].transcript.trim();
          if (text) handlers.onFinal(text);
        } else {
          interim += res[0].transcript;
        }
      }
      handlers.onInterim(interim.trim());
    };

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantActive = false;
        handlers.onState(false);
        handlers.onError('Microphone access was blocked. Allow it in your browser settings.');
      }
      // 'no-speech' and 'aborted' are routine; onend handles the restart.
    };

    // Mobile browsers stop recognition after a pause — restart while active.
    rec.onend = () => {
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
      handlers.onInterim('');
      try { rec.stop(); } catch (_) { /* not running */ }
    },
    get active() {
      return wantActive;
    },
  };
}
