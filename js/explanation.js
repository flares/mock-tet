/**
 * explanation.js
 *
 * Public API:
 *   ExplanationModal.open(questionImage)          — simple dialog (exam page)
 *   ExplanationModal.openFull(questionImage, q)   — 2-panel card (result/revision)
 *   ExplanationModal.stopSpeech()
 *   ExplanationModal.getAiCache(questionImage)    — read AI explanation from localStorage
 *   ExplanationModal.setAiCache(questionImage, html) — persist AI explanation
 */
(function (global) {

  // ── AI explanation localStorage cache ──────────────────────────────────────
  const AI_CACHE_PREFIX = 'ai_exp_persist:';

  function cacheKey(questionImage) {
    const parts = questionImage.split('/');
    return AI_CACHE_PREFIX + parts[parts.length - 2];
  }

  function getAiCache(questionImage) {
    if (!questionImage) return null;
    try { return localStorage.getItem(cacheKey(questionImage)) || null; } catch (_) { return null; }
  }

  function setAiCache(questionImage, html) {
    if (!questionImage || !html) return;
    try { localStorage.setItem(cacheKey(questionImage), html); } catch (_) {}
  }

  // ── Speech helpers ──────────────────────────────────────────────────────────
  const tts = {
    supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    speaking: false,

    start(text, onEnd) {
      if (!this.supported) return;
      this.stop();
      const utt  = new SpeechSynthesisUtterance(text);
      utt.lang   = 'en-IN';
      utt.pitch  = 0.85;
      utt.rate   = 0.88;
      const voices = window.speechSynthesis.getVoices();
      const voice  = voices.find(v => v.lang === 'en-IN' && /female|woman|heera|priya|raveena/i.test(v.name))
                  || voices.find(v => v.lang === 'en-IN')
                  || null;
      if (voice) utt.voice = voice;
      const finish = () => { this.speaking = false; if (onEnd) onEnd(); };
      utt.onend   = finish;
      utt.onerror = finish;
      window.speechSynthesis.speak(utt);
      this.speaking = true;
    },

    stop() {
      if (this.supported && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      this.speaking = false;
    },
  };

  // ── Shared helpers ─────────────────────────────────────────────────────────
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function metadataPathFor(questionImage) {
    if (!questionImage) return null;
    const i = questionImage.lastIndexOf('/');
    return i < 0 ? null : questionImage.substring(0, i) + '/metadata.json';
  }

  // ── Simple modal (exam.html) ───────────────────────────────────────────────
  let dialog      = null;
  let bodyEl      = null;
  let confEl      = null;
  let titleEl     = null;
  let readBtn     = null;
  let initialized = false;

  function resetReadBtn() {
    if (!readBtn) return;
    readBtn.textContent = '🔊 Read';
    readBtn.title = 'Read explanation aloud';
  }

  function ensureInit() {
    if (initialized) return;
    dialog  = document.getElementById('explanation-dialog');
    if (!dialog) return;
    bodyEl  = dialog.querySelector('.explanation-dialog__body');
    confEl  = dialog.querySelector('.explanation-dialog__conf');
    titleEl = dialog.querySelector('.explanation-dialog__header-title');
    const closeBtn = dialog.querySelector('.explanation-dialog__close');

    if (tts.supported && closeBtn) {
      readBtn = document.createElement('button');
      readBtn.className = 'btn--read-aloud explanation-dialog__read-aloud';
      readBtn.textContent = '🔊 Read';
      readBtn.title = 'Read explanation aloud';
      readBtn.type = 'button';
      closeBtn.parentNode.insertBefore(readBtn, closeBtn);
      readBtn.addEventListener('click', () => {
        if (tts.speaking) { tts.stop(); resetReadBtn(); return; }
        const text = (bodyEl.innerText || bodyEl.textContent || '').trim();
        if (!text) return;
        readBtn.textContent = '⏹ Stop';
        readBtn.title = 'Stop reading';
        tts.start(text, resetReadBtn);
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', () => { tts.stop(); resetReadBtn(); dialog.close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { tts.stop(); resetReadBtn(); dialog.close(); } });
    initialized = true;
  }

  async function open(questionImage) {
    ensureInit();
    if (!dialog) { console.error('explanation-dialog element not found'); return; }
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
        if (typeof exp['confidence-level'] === 'number' && confEl)
          confEl.textContent = `Confidence: ${exp['confidence-level']}/10`;
      } else {
        bodyEl.innerHTML = '';
      }
    } catch (_) { bodyEl.innerHTML = ''; }
  }

  // ── Fullcard modal (result / revision pages) ───────────────────────────────
  async function openFull(questionImage, { optionImages = [], correctAnswer, optionsInQuestion = false } = {}) {
    let dlg = document.getElementById('explanation-dialog');
    if (!dlg) return;
    tts.stop();

    dlg.classList.add('expdlg--card');

    // Left panel: question image + options
    const optsHtml = !optionsInQuestion
      ? (optionImages || []).slice(0, 4).map((src, i) => {
          const k   = String(i + 1);
          const cls = k === String(correctAnswer) ? 'rev-opt rev-opt--correct' : 'rev-opt';
          return `<div class="${cls}"><span class="rev-opt-num">${k}</span><img src="${esc(src)}" class="rev-opt-img" alt="Option ${k}" loading="lazy"></div>`;
        }).join('')
      : '';

    const ttsOk = tts.supported;
    dlg.innerHTML = `
      <div class="expdlg-card">
        <button class="expdlg-card__close" aria-label="Close">&#215;</button>
        <div class="expdlg-card__left">
          <img src="${esc(questionImage)}" alt="Question" class="qbank-question-img">
          <div class="rev-opts-stack">${optsHtml}</div>
        </div>
        <div class="expdlg-card__right">
          <div class="expdlg-body" id="expdlg-body"><em style="color:#888">Loading explanation…</em></div>
          <div class="expdlg-actions">
            ${ttsOk ? `<button class="btn--read-aloud expdlg-read-aloud" id="expdlg-ra">&#128266; Read Aloud</button>` : ''}
          </div>
        </div>
      </div>`;

    dlg.showModal();

    // Close button + backdrop
    dlg.querySelector('.expdlg-card__close').addEventListener('click', () => { tts.stop(); dlg.close(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) { tts.stop(); dlg.close(); } });

    // Read Aloud
    const raBtn = dlg.querySelector('#expdlg-ra');
    if (raBtn) {
      raBtn.addEventListener('click', () => {
        if (tts.speaking) { tts.stop(); raBtn.innerHTML = '&#128266; Read Aloud'; return; }
        const exBody = document.getElementById('expdlg-body');
        const text = (exBody?.innerText || '').trim();
        if (!text) return;
        raBtn.innerHTML = '&#9209; Stop';
        tts.start(text, () => { raBtn.innerHTML = '&#128266; Read Aloud'; });
      });
    }

    // Load explanation — prefer localStorage AI cache, then metadata.json
    const exBody = document.getElementById('expdlg-body');
    const aiCached = getAiCache(questionImage);
    if (aiCached) { exBody.innerHTML = aiCached; return; }

    const path = metadataPathFor(questionImage);
    if (!path) { exBody.innerHTML = '<em style="color:#888">No explanation available.</em>'; return; }
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error('not found');
      const data = await resp.json();
      const html = data?.explanation?.html_text;
      exBody.innerHTML = html || '<em style="color:#888">No explanation available yet.</em>';
    } catch (_) {
      exBody.innerHTML = '<em style="color:#888">Could not load explanation.</em>';
    }
  }

  global.ExplanationModal = {
    open,
    openFull,
    stopSpeech: () => { tts.stop(); resetReadBtn(); },
    getAiCache,
    setAiCache,
  };
})(window);
