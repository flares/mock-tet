/**
 * explanation.js — loads a question's explanation HTML from its metadata.json
 * and renders it inside a <dialog>. Also injects a Read Aloud button that uses
 * the browser's SpeechSynthesis API.
 *
 * Public API:
 *   ExplanationModal.open(questionImage)
 *   ExplanationModal.stopSpeech()
 */
(function (global) {
  let dialog      = null;
  let bodyEl      = null;
  let confEl      = null;
  let titleEl     = null;
  let readBtn     = null;
  let initialized = false;

  // ── Speech helpers ──────────────────────────────────────────────────────
  const tts = {
    supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    speaking: false,

    start(text, onEnd) {
      if (!this.supported) return;
      this.stop();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = 'en-IN';
      const finish = () => { this.speaking = false; if (onEnd) onEnd(); };
      utt.onend   = finish;
      utt.onerror = finish;
      window.speechSynthesis.speak(utt);
      this.speaking = true;
    },

    stop() {
      if (this.supported && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      this.speaking = false;
    },
  };

  function resetReadBtn() {
    if (!readBtn) return;
    readBtn.textContent = '🔊 Read';
    readBtn.title = 'Read explanation aloud';
  }

  // ── Dialog init ─────────────────────────────────────────────────────────
  function ensureInit() {
    if (initialized) return;
    dialog  = document.getElementById('explanation-dialog');
    if (!dialog) return;
    bodyEl  = dialog.querySelector('.explanation-dialog__body');
    confEl  = dialog.querySelector('.explanation-dialog__conf');
    titleEl = dialog.querySelector('.explanation-dialog__header-title');

    const closeBtn = dialog.querySelector('.explanation-dialog__close');

    // Inject Read Aloud button before the close button
    if (tts.supported && closeBtn) {
      readBtn = document.createElement('button');
      readBtn.className = 'btn--read-aloud explanation-dialog__read-aloud';
      readBtn.textContent = '🔊 Read';
      readBtn.title = 'Read explanation aloud';
      readBtn.type = 'button';
      closeBtn.parentNode.insertBefore(readBtn, closeBtn);

      readBtn.addEventListener('click', () => {
        if (tts.speaking) {
          tts.stop();
          resetReadBtn();
          return;
        }
        const text = (bodyEl.innerText || bodyEl.textContent || '').trim();
        if (!text) return;
        readBtn.textContent = '⏹ Stop';
        readBtn.title = 'Stop reading';
        tts.start(text, resetReadBtn);
      });
    }

    // Close button and backdrop — both stop speech
    if (closeBtn) {
      closeBtn.addEventListener('click', () => { tts.stop(); resetReadBtn(); dialog.close(); });
    }
    dialog.addEventListener('click', e => {
      if (e.target === dialog) { tts.stop(); resetReadBtn(); dialog.close(); }
    });

    initialized = true;
  }

  function metadataPathFor(questionImage) {
    if (!questionImage) return null;
    const lastSlash = questionImage.lastIndexOf('/');
    if (lastSlash < 0) return null;
    return questionImage.substring(0, lastSlash) + '/metadata.json';
  }

  async function open(questionImage) {
    ensureInit();
    if (!dialog) { console.error('explanation-dialog element not found'); return; }

    // Stop any in-progress speech from a previous open
    tts.stop();
    resetReadBtn();

    bodyEl.innerHTML = '<p class="explanation-dialog__loading">Loading…</p>';
    if (confEl) confEl.textContent = '';
    if (titleEl) titleEl.textContent = 'Explanation';
    dialog.showModal();

    const path = metadataPathFor(questionImage);
    if (!path) { bodyEl.innerHTML = ''; return; }

    try {
      const resp = await fetch(path);
      if (!resp.ok) { bodyEl.innerHTML = ''; return; }
      const data = await resp.json();
      const exp  = data && data.explanation;
      if (exp && typeof exp.html_text === 'string') {
        bodyEl.innerHTML = exp.html_text;
        if (typeof exp['confidence-level'] === 'number') {
          if (confEl) confEl.textContent = `Confidence: ${exp['confidence-level']}/10`;
        }
      } else {
        bodyEl.innerHTML = '';
      }
    } catch (_) {
      bodyEl.innerHTML = '';
    }
  }

  global.ExplanationModal = { open, stopSpeech: () => { tts.stop(); resetReadBtn(); } };
})(window);
