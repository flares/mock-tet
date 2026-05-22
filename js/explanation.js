/**
 * explanation.js
 *
 * Public API:
 *   ExplanationModal.open(questionImage)               — simple dialog (exam page)
 *   ExplanationModal.openFull(questionImage, opts)     — qbank-style card dialog
 *   ExplanationModal.stopSpeech()
 *   ExplanationModal.getAiCache(questionImage)         — read AI html from localStorage
 *   ExplanationModal.setAiCache(questionImage, html)   — persist AI html to localStorage
 */
(function (global) {

  // ── AI explanation localStorage cache ─────────────────────────────────────
  const AI_CACHE_PREFIX   = 'ai_exp_persist:';
  const UNDERSTOOD_KEY    = 'tet_understood_questions';
  const REVISION_KEY      = 'tet_revision_questions';

  function aiCacheKey(questionImage) {
    const parts = questionImage.split('/');
    return AI_CACHE_PREFIX + parts[parts.length - 2];
  }
  function getAiCache(questionImage) {
    if (!questionImage) return null;
    try { return localStorage.getItem(aiCacheKey(questionImage)) || null; } catch { return null; }
  }
  function setAiCache(questionImage, html) {
    if (!questionImage || !html) return;
    try { localStorage.setItem(aiCacheKey(questionImage), html); } catch {}
  }

  // ── Understood / Revision helpers ─────────────────────────────────────────
  function getUnderstoodSet() {
    try { return new Set(JSON.parse(localStorage.getItem(UNDERSTOOD_KEY)) || []); } catch { return new Set(); }
  }
  function getRevisionList() {
    try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
  }

  // ── Speech helpers ─────────────────────────────────────────────────────────
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

  // ── Shared ─────────────────────────────────────────────────────────────────
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

  // ── Simple modal — exam.html ───────────────────────────────────────────────
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

  // ── Fullcard modal — result.html / revision.html ───────────────────────────
  // Uses the exact same CSS classes as the Question Bank card body.
  // opts: { optionImages, correctAnswer, optionsInQuestion, revisionEntry }
  // revisionEntry: { examId, examTitle, q: questionObject } — for the revision toggle
  async function openFull(questionImage, {
    optionImages = [],
    correctAnswer,
    optionsInQuestion = false,
    revisionEntry = null,
  } = {}) {
    let dlg = document.getElementById('explanation-dialog');
    if (!dlg) return;
    tts.stop();

    dlg.classList.add('expdlg--card');

    // Build options HTML (same rendering as qbank left panel)
    const optsHtml = !optionsInQuestion
      ? (optionImages || []).slice(0, 4).map((src, i) => {
          const k   = String(i + 1);
          const cls = k === String(correctAnswer) ? 'rev-opt rev-opt--correct' : 'rev-opt';
          return `<div class="${cls}"><span class="rev-opt-num">${k}</span><img src="${esc(src)}" class="rev-opt-img" alt="Option ${k}" loading="lazy"></div>`;
        }).join('')
      : '';

    // Initial button states from localStorage
    const isUnderstood = getUnderstoodSet().has(questionImage);
    const isRevision   = getRevisionList().some(r => r.q && r.q.questionImage === questionImage);
    const ttsOk        = tts.supported;

    dlg.innerHTML = `
      <div class="expdlg-wrap">
        <button class="expdlg-close" aria-label="Close">&#215;</button>

        <div class="qbank-card__body">

          <div class="qbank-card__left">
            <img src="${esc(questionImage)}" alt="Question" class="qbank-question-img">
            <div class="rev-opts-stack">${optsHtml}</div>
          </div>

          <div class="qbank-card__right">
            <div class="qbank-explanation" id="expdlg-body">
              <em style="color:#888">Loading explanation…</em>
            </div>
            <div class="qbank-right-actions">
              ${ttsOk ? `<button class="btn--read-aloud qbank-header-read-aloud" id="expdlg-ra">&#128266; Read Aloud</button>` : ''}
            </div>
          </div>

        </div>

        <div class="qbank-card__footer" style="justify-content:center">
          <button class="btn btn--revision btn--sm ${isRevision ? 'btn--revision--marked' : ''}" id="expdlg-rev">
            ${isRevision ? '&#10003; Marked for Revision' : 'Mark for Revision'}
          </button>
          <button class="btn btn--understood btn--sm ${isUnderstood ? 'btn--understood--marked' : ''}" id="expdlg-und">
            ${isUnderstood ? '&#10003; Understood' : 'Understood'}
          </button>
        </div>
      </div>`;

    dlg.showModal();

    // ── Close ──
    dlg.querySelector('.expdlg-close').addEventListener('click', () => { tts.stop(); dlg.close(); });
    dlg.addEventListener('click', e => { if (e.target === dlg) { tts.stop(); dlg.close(); } });

    // ── Read Aloud ──
    const raBtn = dlg.querySelector('#expdlg-ra');
    if (raBtn) {
      raBtn.addEventListener('click', () => {
        if (tts.speaking) { tts.stop(); raBtn.innerHTML = '&#128266; Read Aloud'; return; }
        const text = (document.getElementById('expdlg-body')?.innerText || '').trim();
        if (!text) return;
        raBtn.innerHTML = '&#9209; Stop';
        tts.start(text, () => { raBtn.innerHTML = '&#128266; Read Aloud'; });
      });
    }

    // ── Understood toggle ──
    dlg.querySelector('#expdlg-und').addEventListener('click', function () {
      const set = getUnderstoodSet();
      if (set.has(questionImage)) {
        set.delete(questionImage);
        this.innerHTML = 'Understood';
        this.classList.remove('btn--understood--marked');
      } else {
        set.add(questionImage);
        this.innerHTML = '&#10003; Understood';
        this.classList.add('btn--understood--marked');
      }
      localStorage.setItem(UNDERSTOOD_KEY, JSON.stringify(Array.from(set)));
    });

    // ── Revision toggle ──
    dlg.querySelector('#expdlg-rev').addEventListener('click', function () {
      let list = getRevisionList();
      const idx = list.findIndex(r => r.q && r.q.questionImage === questionImage);
      if (idx >= 0) {
        list.splice(idx, 1);
        this.innerHTML = 'Mark for Revision';
        this.classList.remove('btn--revision--marked');
      } else {
        list.push(revisionEntry || { q: { questionImage } });
        this.innerHTML = '&#10003; Marked for Revision';
        this.classList.add('btn--revision--marked');
      }
      localStorage.setItem(REVISION_KEY, JSON.stringify(list));
    });

    // ── Load explanation — AI cache → metadata.json ──
    const exBody = document.getElementById('expdlg-body');
    const aiCached = getAiCache(questionImage);
    if (aiCached) { exBody.innerHTML = aiCached; return; }

    const path = metadataPathFor(questionImage);
    if (!path) { exBody.innerHTML = '<em style="color:#888">No explanation available.</em>'; return; }
    try {
      const resp = await fetch(path);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      exBody.innerHTML = data?.explanation?.html_text
        || '<em style="color:#888">No explanation available yet.</em>';
    } catch (_) {
      exBody.innerHTML = '<em style="color:#888">Could not load explanation.</em>';
    }
  }

  global.ExplanationModal = { open, openFull, stopSpeech: () => { tts.stop(); resetReadBtn(); }, getAiCache, setAiCache };
})(window);
