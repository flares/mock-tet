/**
 * explanation.js
 *
 * Public API:
 *   ExplanationModal.open(questionImage)               — simple dialog (exam page)
 *   ExplanationModal.openFull(questionImage, opts)     — qbank-style card dialog
 *   ExplanationModal.stopSpeech()
 *   ExplanationModal.getAiCache(questionImage)
 *   ExplanationModal.setAiCache(questionImage, html)
 */
(function (global) {

  // ── Storage helpers ───────────────────────────────────────────────────────
  const AI_CACHE_PREFIX = 'ai_exp_persist:';
  const UNDERSTOOD_KEY  = 'tet_understood_questions';
  const REVISION_KEY    = 'tet_revision_questions';

  function aiCacheKey(q) {
    const p = q.split('/'); return AI_CACHE_PREFIX + p[p.length - 2];
  }
  function getAiCache(q)       { try { return localStorage.getItem(aiCacheKey(q)) || null; } catch { return null; } }
  function setAiCache(q, html) { try { localStorage.setItem(aiCacheKey(q), html); } catch {} }

  function getUnderstoodSet() {
    try { return new Set(JSON.parse(localStorage.getItem(UNDERSTOOD_KEY)) || []); } catch { return new Set(); }
  }
  function getRevisionList() {
    try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
  }

  // ── Speech ────────────────────────────────────────────────────────────────
  const tts = {
    supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
    speaking: false,

    start(text, onEnd) {
      if (!this.supported) return;
      this.stop();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang  = 'en-IN';
      utt.pitch = 0.85;
      utt.rate  = 0.88;
      const v = window.speechSynthesis.getVoices();
      const voice = v.find(x => x.lang === 'en-IN' && /female|woman|heera|priya|raveena/i.test(x.name))
                 || v.find(x => x.lang === 'en-IN') || null;
      if (voice) utt.voice = voice;
      const done = () => { this.speaking = false; if (onEnd) onEnd(); };
      utt.onend = done; utt.onerror = done;
      window.speechSynthesis.speak(utt);
      this.speaking = true;
    },

    stop() {
      if (this.supported && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      this.speaking = false;
    },
  };

  // ── Shared ────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function metadataPathFor(questionImage) {
    if (!questionImage) return null;
    const i = questionImage.lastIndexOf('/');
    return i < 0 ? null : questionImage.substring(0, i) + '/metadata.json';
  }

  // ── Simple modal — exam.html ──────────────────────────────────────────────
  let dialog = null, bodyEl = null, confEl = null, titleEl = null, readBtn = null, initialized = false;

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
      readBtn.textContent = '🔊 Read'; readBtn.title = 'Read explanation aloud'; readBtn.type = 'button';
      closeBtn.parentNode.insertBefore(readBtn, closeBtn);
      readBtn.addEventListener('click', () => {
        if (tts.speaking) { tts.stop(); resetReadBtn(); return; }
        const text = (bodyEl.innerText || bodyEl.textContent || '').trim();
        if (!text) return;
        readBtn.textContent = '⏹ Stop'; readBtn.title = 'Stop reading';
        tts.start(text, resetReadBtn);
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', () => { tts.stop(); resetReadBtn(); dialog.close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { tts.stop(); resetReadBtn(); dialog.close(); } });
    initialized = true;
  }

  async function open(questionImage) {
    ensureInit();
    if (!dialog) { console.error('explanation-dialog not found'); return; }
    tts.stop(); resetReadBtn();
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
      } else { bodyEl.innerHTML = ''; }
    } catch (_) { bodyEl.innerHTML = ''; }
  }

  // ── Fullcard modal — result.html / revision.html ──────────────────────────
  // AbortController so every open cleanly replaces all listeners — no stacking.
  let _fullAbort = null;

  async function openFull(questionImage, {
    optionImages = [], correctAnswer, optionsInQuestion = false, revisionEntry = null,
  } = {}) {
    const dlg = document.getElementById('explanation-dialog');
    if (!dlg) return;

    // Cancel any listeners from a previous open
    if (_fullAbort) { _fullAbort.abort(); }
    _fullAbort = new AbortController();
    const { signal } = _fullAbort;

    tts.stop();
    dlg.classList.add('expdlg--card');

    // Options HTML (left panel)
    const optsHtml = !optionsInQuestion
      ? (optionImages || []).slice(0, 4).map((src, i) => {
          const k = String(i + 1);
          const cls = k === String(correctAnswer) ? 'rev-opt rev-opt--correct' : 'rev-opt';
          return `<div class="${cls}"><span class="rev-opt-num">${k}</span><img src="${esc(src)}" class="rev-opt-img" alt="Option ${k}" loading="lazy"></div>`;
        }).join('')
      : '';

    const isUnderstood = getUnderstoodSet().has(questionImage);
    const ttsOk = tts.supported;
    const hasAiCache = !!getAiCache(questionImage);

    dlg.innerHTML = `
      <div class="expdlg-wrap">

        <div class="expdlg-topbar">
          <button class="expdlg-close" aria-label="Close">&#215;</button>
        </div>

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
              <button class="btn btn--ai-explain btn--xs" id="expdlg-ai">&#10024; ${hasAiCache ? 'Regenerate' : 'Explain with AI'}</button>
            </div>
          </div>

        </div>

        <div class="qbank-card__footer" style="justify-content:center;gap:8px">
          <button class="btn btn--understood btn--sm ${isUnderstood ? 'btn--understood--marked' : ''}" id="expdlg-und">
            ${isUnderstood ? 'Close' : 'Understood'}
          </button>
        </div>
      </div>`;

    dlg.showModal();

    // ── Close helpers ──
    function closeDlg() {
      tts.stop();
      dlg.classList.remove('expdlg--card');
      if (_fullAbort) { _fullAbort.abort(); _fullAbort = null; }
      dlg.close();
    }

    dlg.querySelector('.expdlg-close').addEventListener('click', closeDlg, { signal });
    dlg.addEventListener('click', e => { if (e.target === dlg) closeDlg(); }, { signal });

    // ── Read Aloud ──
    const raBtn = dlg.querySelector('#expdlg-ra');
    if (raBtn) {
      raBtn.addEventListener('click', () => {
        if (tts.speaking) { tts.stop(); raBtn.innerHTML = '&#128266; Read Aloud'; return; }
        const text = (document.getElementById('expdlg-body')?.innerText || '').trim();
        if (!text) return;
        raBtn.innerHTML = '&#9209; Stop';
        tts.start(text, () => { raBtn.innerHTML = '&#128266; Read Aloud'; });
      }, { signal });
    }

    // ── Explain with AI ──
    const aiBtn = dlg.querySelector('#expdlg-ai');
    if (aiBtn) {
      aiBtn.addEventListener('click', async function () {
        if (this.disabled) return;

        // Wait up to 10s for the ES module to load
        if (!window.AiExplainer) {
          this.disabled = true;
          this.textContent = '⏳ Loading AI…';
          let waited = 0;
          while (!window.AiExplainer && waited < 10000) {
            await new Promise(r => setTimeout(r, 250));
            waited += 250;
          }
          this.disabled = false;
          if (!window.AiExplainer) {
            this.textContent = '✨ Explain with AI';
            const b = document.getElementById('expdlg-body');
            if (b) b.innerHTML = '<div class="qbank-ai-error"><strong>AI error:</strong> Module failed to load — check browser console.</div>';
            return;
          }
        }

        const exBody = document.getElementById('expdlg-body');
        if (!exBody) return;
        const isRegen = this.textContent.includes('Regenerate');
        this.disabled = true;
        this.textContent = '⏳ Generating…';
        exBody.innerHTML = '<div class="qbank-ai-loading"><span class="qbank-ai-spinner"></span>Generating AI explanation…</div>';

        try {
          const html = await window.AiExplainer.explain({
            questionImage, optionImages, optionsInQuestion, correctAnswer,
            forceRegenerate: isRegen,
          });
          exBody.innerHTML = html;
          this.textContent = '✨ Regenerate';
        } catch (err) {
          exBody.innerHTML = `<div class="qbank-ai-error"><strong>AI error:</strong> ${esc(err.message || 'Failed')}</div>`;
          this.textContent = '✨ Explain with AI';
        } finally {
          this.disabled = false;
        }
      }, { signal });
    }

    // ── Understood — marks understood, marks revised in revision list, closes dialog ──
    dlg.querySelector('#expdlg-und').addEventListener('click', function () {
      const set = getUnderstoodSet();
      if (!set.has(questionImage)) {
        set.add(questionImage);
        localStorage.setItem(UNDERSTOOD_KEY, JSON.stringify(Array.from(set)));
        // Move to Revised section (set revised:true) rather than removing
        const list = getRevisionList();
        const idx = list.findIndex(r => r.q && r.q.questionImage === questionImage);
        if (idx >= 0) { list[idx].revised = true; localStorage.setItem(REVISION_KEY, JSON.stringify(list)); }
      }
      closeDlg();
      // Refresh revision page if open
      if (typeof window.renderRevision === 'function') window.renderRevision();
    }, { signal });

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
        || '<em style="color:#888">No explanation available yet. Click ✨ Explain with AI to generate one.</em>';
    } catch (_) {
      exBody.innerHTML = '<em style="color:#888">Could not load explanation.</em>';
    }
  }

  global.ExplanationModal = { open, openFull, stopSpeech: () => { tts.stop(); resetReadBtn(); }, getAiCache, setAiCache };
})(window);
