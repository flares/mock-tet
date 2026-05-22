const SUBJECT_META = {
  cdp:         { label: 'CDP',         color: '#1565c0', bg: '#e3f2fd' },
  telugu:      { label: 'Telugu',      color: '#bf360c', bg: '#fbe9e7' },
  english:     { label: 'English',     color: '#2e7d32', bg: '#e8f5e9' },
  mathematics: { label: 'Math',        color: '#6a1b9a', bg: '#f3e5f5' },
  science:     { label: 'Science',     color: '#00695c', bg: '#e0f2f1' },
};

const UNDERSTOOD_KEY = 'tet_understood_questions';
const REVISION_KEY   = 'tet_revision_questions';

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


let qbankCache         = null;
let qbankFiltered      = [];
let qbankSubjectFilter = 'all';
let qbankStatusFilter  = 'yet-to-read';   // default: show un-read questions
let qbankIndex         = 0;
let manifest           = null;

function getUnderstoodSet() {
  try { return new Set(JSON.parse(localStorage.getItem(UNDERSTOOD_KEY)) || []); } catch { return new Set(); }
}

function getRevisionList() {
  try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
}

function toggleUnderstood(qimg) {
  const set = getUnderstoodSet();
  if (set.has(qimg)) set.delete(qimg); else set.add(qimg);
  localStorage.setItem(UNDERSTOOD_KEY, JSON.stringify(Array.from(set)));
}

function toggleQbankRevision(qimg) {
  if (!qbankCache) return;
  const item = qbankCache.find(x => x.questionImage === qimg);
  if (!item) return;
  const list = getRevisionList();
  const idx = list.findIndex(r => r.q && r.q.questionImage === qimg);
  if (idx >= 0) list.splice(idx, 1);
  else list.push({ examId: item.examId, examTitle: item.examTitle, q: item.q });
  localStorage.setItem(REVISION_KEY, JSON.stringify(list));
}

async function loadQuestionBank() {
  if (qbankCache) return qbankCache;
  if (!manifest) {
    const resp = await fetch('exams/manifest.json');
    manifest = await resp.json();
  }
  const realExams = (manifest.exams || []).filter(e => e.style === 'Real Paper');
  const results = await Promise.all(realExams.map(async exam => {
    try {
      const r = await fetch(`exams/${exam.id}.json`);
      if (!r.ok) return null;
      return { exam, data: await r.json() };
    } catch { return null; }
  }));

  const dedupe = new Map();
  for (const entry of results) {
    if (!entry) continue;
    const { exam, data } = entry;
    for (const q of data.questions || []) {
      if (!q.questionImage || dedupe.has(q.questionImage)) continue;
      dedupe.set(q.questionImage, {
        questionImage: q.questionImage,
        optionImages: q.optionImages || [],
        optionsInQuestion: !!q.optionsInQuestion,
        questionType: q.questionType,
        correctAnswer: q.correctAnswer,
        sectionId: q.sectionId,
        examId: data.id,
        examTitle: data.title || exam.title,
        globalIndex: q.globalIndex,
        q,
      });
    }
  }
  qbankCache = Array.from(dedupe.values());
  return qbankCache;
}

function updateProgress(filtered, understood) {
  const el = document.getElementById('qbank-header-progress');
  if (!el) return;
  const doneCount = filtered.filter(q => understood.has(q.questionImage)).length;
  const current = filtered.length > 0 ? qbankIndex + 1 : 0;
  el.innerHTML = `
    <div class="qbank-progress-count">${current} <span class="qbank-progress-total">/ ${filtered.length}</span></div>
    <div class="qbank-progress-sub">${doneCount} understood</div>`;
}

async function renderQuestionBank() {
  const leftEl    = document.getElementById('qbank-card-left');
  const rightEl   = document.getElementById('qbank-card-right');
  const actionsEl = document.getElementById('qbank-footer-actions');

  if (!qbankCache && leftEl) leftEl.innerHTML = '<p class="loading-msg">Loading question bank&hellip;</p>';

  let all;
  try {
    all = await loadQuestionBank();
  } catch (err) {
    if (leftEl) leftEl.innerHTML = `<p class="error-msg">Could not load: ${escHtml(err.message)}</p>`;
    return;
  }

  const understood   = getUnderstoodSet();
  const revisionImgs = new Set(getRevisionList().map(r => r.q && r.q.questionImage).filter(Boolean));

  const subjectMatches = q =>
    qbankSubjectFilter === 'all' || (q.sectionId || '').toLowerCase() === qbankSubjectFilter;
  const statusMatches = q => {
    if (qbankStatusFilter === 'all') return true;
    const isUnderstood = understood.has(q.questionImage);
    return qbankStatusFilter === 'understood' ? isUnderstood : !isUnderstood;
  };

  const filtered = all.filter(q => subjectMatches(q) && statusMatches(q));
  qbankFiltered = filtered;

  updateProgress(filtered, understood);

  if (!filtered.length) {
    leftEl.innerHTML = '<p class="loading-msg">No questions match these filters.</p>';
    rightEl.innerHTML = '';
    actionsEl.innerHTML = '';
    return;
  }

  if (qbankIndex >= filtered.length) qbankIndex = filtered.length - 1;
  if (qbankIndex < 0) qbankIndex = 0;

  const item = filtered[qbankIndex];
  const qimg = escHtml(item.questionImage);

  const opts = item.optionImages.map((src, idx2) => {
    const k   = String(idx2 + 1);
    const cls = k === item.correctAnswer ? 'rev-opt rev-opt--correct' : 'rev-opt';
    return `<div class="${cls}"><span class="rev-opt-num">${k}</span><img src="${escHtml(src)}" class="rev-opt-img" alt="Option ${k}" loading="lazy"></div>`;
  }).join('');

  const sectionLabel = escHtml((item.sectionId || '').toUpperCase());
  const qNum = item.globalIndex != null ? item.globalIndex + 1 : '?';

  // Left panel: source label + question image + options
  leftEl.innerHTML = `
    <div class="qbank-card__qnum">${escHtml(item.examTitle || item.examId || '')} &middot; ${sectionLabel} &middot; Q${qNum}</div>
    <img src="${qimg}" alt="Question" class="qbank-question-img" loading="lazy">
    <div class="rev-opts-stack">${opts}</div>`;

  // Stop any in-progress speech when navigating to a new question
  if (typeof ExplanationModal !== 'undefined') ExplanationModal.stopSpeech();
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  // Right panel: inline explanation + action buttons
  const ttsSupported = 'speechSynthesis' in window;
  rightEl.innerHTML = `
    <div class="qbank-explanation" id="qbank-explanation-body">Loading explanation&hellip;</div>
    <div class="qbank-right-actions">
      ${ttsSupported ? `<button class="btn--read-aloud" id="qbank-read-aloud" title="Read explanation aloud">&#128266; Read Aloud</button>` : ''}
      <button class="btn btn--explain btn--xs" data-qimg="${qimg}">&#128218; Open Full Explanation</button>
      <button class="btn btn--ai-explain btn--xs" id="qbank-ai-explain"
        data-qimg="${qimg}"
        data-correct="${escHtml(item.correctAnswer || '')}"
        data-subject="${escHtml((item.sectionId || '').toLowerCase())}"
        data-opts-in-q="${item.optionsInQuestion ? '1' : '0'}"
        title="Generate AI explanation for this question">&#10024; Explain with AI</button>
    </div>`;

  // Footer action buttons
  const isUnderstood = understood.has(item.questionImage);
  const isInRevision = revisionImgs.has(item.questionImage);
  const understoodCls   = isUnderstood ? 'btn--understood--marked' : '';
  const understoodLabel = isUnderstood ? '&#10003; Understood' : 'Understood';
  const revisionLabel   = isInRevision ? '&#10003; Marked for Revision' : 'Mark for Revision';

  actionsEl.innerHTML = `
    <button class="btn btn--revision btn--sm ${isInRevision ? 'btn--revision--marked' : ''}" data-qbank-revision="${qimg}">${revisionLabel}</button>
    <button class="btn btn--understood btn--sm ${understoodCls}" data-qbank-understood="${qimg}">${understoodLabel}</button>
    <button class="btn btn--ghost btn--sm" data-qbank-random="1">Random</button>`;

  loadQbankExplanation(item.questionImage);
}

async function loadQbankExplanation(questionImage) {
  const target = document.getElementById('qbank-explanation-body');
  if (!target) return;
  const lastSlash = questionImage.lastIndexOf('/');
  if (lastSlash < 0) { target.innerHTML = '<em style="color:#888">No explanation available yet.</em>'; return; }
  const path = questionImage.substring(0, lastSlash) + '/metadata.json';
  try {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error('not found');
    const data = await resp.json();
    const html = data && data.explanation && data.explanation.html_text;
    target.innerHTML = html || '<em style="color:#888">No explanation available yet.</em>';
  } catch (_) {
    target.innerHTML = '<em style="color:#888">No explanation available yet.</em>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderQuestionBank();

  // Subject filter buttons (large rectangular — class qbank-subj-btn)
  document.querySelectorAll('#qbank-subject-filters .qbank-subj-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qbankSubjectFilter = btn.dataset.subject;
      qbankStatusFilter  = 'yet-to-read';   // always fall back to unread when subject changes
      qbankIndex = 0;
      document.querySelectorAll('#qbank-subject-filters .qbank-subj-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.subject === qbankSubjectFilter));
      // Sync status chip highlight
      document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.status === qbankStatusFilter));
      renderQuestionBank();
    });
  });

  // Status filter chips (small pills)
  document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      qbankStatusFilter = btn.dataset.status;
      qbankIndex = 0;
      document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.status === qbankStatusFilter));
      renderQuestionBank();
    });
  });

  // Prev / Next buttons (outside the card body but inside the card footer)
  document.getElementById('qbank-prev').addEventListener('click', () => {
    qbankIndex = Math.max(0, qbankIndex - 1);
    renderQuestionBank();
  });
  document.getElementById('qbank-next').addEventListener('click', () => {
    qbankIndex = Math.min(qbankFiltered.length - 1, qbankIndex + 1);
    renderQuestionBank();
  });

  // ── Inline Read Aloud for qbank right panel ──────────────────────────
  document.getElementById('qbank-card-right').addEventListener('click', e => {
    const btn = e.target.closest('#qbank-read-aloud');
    if (!btn || !window.speechSynthesis) return;

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      btn.textContent = '🔊 Read Aloud';
      btn.title = 'Read explanation aloud';
      return;
    }

    const bodyEl = document.getElementById('qbank-explanation-body');
    const text = bodyEl ? (bodyEl.innerText || bodyEl.textContent || '').trim() : '';
    if (!text) return;

    btn.textContent = '⏹ Stop';
    btn.title = 'Stop reading';

    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-IN';
    const done = () => { btn.textContent = '🔊 Read Aloud'; btn.title = 'Read explanation aloud'; };
    utt.onend   = done;
    utt.onerror = done;
    window.speechSynthesis.speak(utt);
  });

  // Delegated clicks on dynamic card areas
  function handleCardClick(e) {
    const explainBtn = e.target.closest('.btn--explain');
    if (explainBtn && explainBtn.dataset.qimg) { ExplanationModal.open(explainBtn.dataset.qimg); return; }

    const aiBtn = e.target.closest('.btn--ai-explain');
    if (aiBtn) { handleAiExplain(aiBtn); return; }

    const understoodBtn = e.target.closest('[data-qbank-understood]');
    if (understoodBtn) { toggleUnderstood(understoodBtn.dataset.qbankUnderstood); renderQuestionBank(); return; }

    const revisionBtn = e.target.closest('[data-qbank-revision]');
    if (revisionBtn) { toggleQbankRevision(revisionBtn.dataset.qbankRevision); renderQuestionBank(); return; }

    const randomBtn = e.target.closest('[data-qbank-random]');
    if (randomBtn && qbankFiltered.length > 0) {
      qbankIndex = Math.floor(Math.random() * qbankFiltered.length);
      renderQuestionBank();
      return;
    }
  }

  async function handleAiExplain(btn) {
    if (btn.disabled) return;

    const item = qbankFiltered[qbankIndex];
    if (!item) return;

    if (!window.AiExplainer) {
      showAiError('AI module is still loading — please try again in a moment.');
      return;
    }

    const bodyEl = document.getElementById('qbank-explanation-body');
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    if (bodyEl) bodyEl.innerHTML = '<div class="qbank-ai-loading"><span class="qbank-ai-spinner"></span>Generating AI explanation — this may take 10–20 seconds…</div>';

    try {
      const html = await window.AiExplainer.explain({
        questionImage:    item.questionImage,
        optionImages:     item.optionImages || [],
        optionsInQuestion: !!item.optionsInQuestion,
        correctAnswer:    item.correctAnswer,
        sectionId:        item.sectionId,
      });
      if (bodyEl) bodyEl.innerHTML = html;
      btn.textContent = '✨ Regenerate';
    } catch (err) {
      console.error('[AiExplainer]', err);
      showAiError(err.message || 'AI explanation failed.');
      btn.textContent = '✨ Explain with AI';
    } finally {
      btn.disabled = false;
    }
  }

  function showAiError(msg) {
    const bodyEl = document.getElementById('qbank-explanation-body');
    if (bodyEl) bodyEl.innerHTML = `<div class="qbank-ai-error"><strong>AI error:</strong> ${escHtml(msg)}</div>`;
  }

  document.getElementById('qbank-card-left').addEventListener('click', handleCardClick);
  document.getElementById('qbank-card-right').addEventListener('click', handleCardClick);
  document.getElementById('qbank-footer-actions').addEventListener('click', handleCardClick);
});
