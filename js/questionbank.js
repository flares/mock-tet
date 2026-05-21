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

let qbankCache      = null;
let qbankFiltered   = [];
let qbankSubjectFilter = 'all';
let qbankStatusFilter  = 'all';
let qbankIndex      = 0;
let manifest        = null;

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

function updateHeaderProgress(filtered, understood) {
  const el = document.getElementById('qbank-header-progress');
  if (!el) return;
  const total = filtered.length;
  const doneCount = filtered.filter(q => understood.has(q.questionImage)).length;
  el.textContent = `${qbankIndex + 1} / ${total} · ${doneCount} understood`;
}

async function renderQuestionBank() {
  const container = document.getElementById('qbank-container');

  if (!qbankCache) container.innerHTML = '<p class="loading-msg">Loading question bank&hellip;</p>';

  let all;
  try {
    all = await loadQuestionBank();
  } catch (err) {
    container.innerHTML = `<p class="error-msg">Could not load question bank: ${escHtml(err.message)}</p>`;
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

  updateHeaderProgress(filtered, understood);

  if (!filtered.length) {
    container.innerHTML = '<p class="loading-msg">No questions match these filters.</p>';
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

  const isUnderstood = understood.has(item.questionImage);
  const isInRevision = revisionImgs.has(item.questionImage);
  const understoodCls   = isUnderstood ? 'btn--understood--marked' : '';
  const understoodLabel = isUnderstood ? '&#10003; Understood' : 'Understood';
  const revisionLabel   = isInRevision ? '&#10003; Marked for Revision' : 'Mark for Revision';

  const sectionLabel = escHtml((item.sectionId || '').toUpperCase());
  const qNum = item.globalIndex != null ? item.globalIndex + 1 : '?';

  container.innerHTML = `<div class="qbank-card">
    <div class="qbank-card__body">
      <div class="qbank-card__left">
        <div class="qbank-card__qnum">${escHtml(item.examTitle || item.examId || '')} &middot; ${sectionLabel} &middot; Q${qNum}</div>
        <img src="${qimg}" alt="Question" class="rev-question-img qbank-question-img" loading="lazy">
        <div class="rev-opts-stack">${opts}</div>
      </div>
      <div class="qbank-card__right">
        <div class="qbank-explanation" id="qbank-explanation-body">Loading explanation&hellip;</div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #e0e8f5">
          <button class="btn btn--explain btn--xs" data-qimg="${qimg}">&#128218; Open Full Explanation</button>
        </div>
      </div>
    </div>
    <div class="qbank-card__footer">
      <button class="qbank-nav-btn" data-qbank-nav="prev">&#8592; Prev</button>
      <div class="qbank-card__footer-center">
        <button class="btn btn--revision btn--sm ${isInRevision ? 'btn--revision--marked' : ''}" data-qbank-revision="${qimg}">${revisionLabel}</button>
        <button class="btn btn--understood btn--sm ${understoodCls}" data-qbank-understood="${qimg}">${understoodLabel}</button>
        <button class="btn btn--ghost btn--sm" data-qbank-random="1">Random</button>
      </div>
      <button class="qbank-nav-btn" data-qbank-nav="next">Next &#8594;</button>
    </div>
  </div>`;

  loadQbankExplanation(item.questionImage);
  updateHeaderProgress(filtered, understood);
}

async function loadQbankExplanation(questionImage) {
  const target = document.getElementById('qbank-explanation-body');
  if (!target) return;
  const lastSlash = questionImage.lastIndexOf('/');
  if (lastSlash < 0) { target.textContent = 'No explanation available.'; return; }
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

  // Subject filter chips in header
  document.querySelectorAll('#qbank-subject-filters .qbank-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qbankSubjectFilter = btn.dataset.subject;
      qbankIndex = 0;
      document.querySelectorAll('#qbank-subject-filters .qbank-filter-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.subject === qbankSubjectFilter));
      renderQuestionBank();
    });
  });

  // Status filter chips
  document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      qbankStatusFilter = btn.dataset.status;
      qbankIndex = 0;
      document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.status === qbankStatusFilter));
      renderQuestionBank();
    });
  });

  // Card click delegation
  document.getElementById('qbank-container').addEventListener('click', e => {
    const explainBtn = e.target.closest('.btn--explain');
    if (explainBtn && explainBtn.dataset.qimg) { ExplanationModal.open(explainBtn.dataset.qimg); return; }

    const understoodBtn = e.target.closest('[data-qbank-understood]');
    if (understoodBtn) { toggleUnderstood(understoodBtn.dataset.qbankUnderstood); renderQuestionBank(); return; }

    const revisionBtn = e.target.closest('[data-qbank-revision]');
    if (revisionBtn) { toggleQbankRevision(revisionBtn.dataset.qbankRevision); renderQuestionBank(); return; }

    const navBtn = e.target.closest('[data-qbank-nav]');
    if (navBtn) {
      qbankIndex += navBtn.dataset.qbankNav === 'next' ? 1 : -1;
      qbankIndex = Math.max(0, Math.min(qbankIndex, qbankFiltered.length - 1));
      renderQuestionBank();
      return;
    }

    const randomBtn = e.target.closest('[data-qbank-random]');
    if (randomBtn && qbankFiltered.length > 0) {
      qbankIndex = Math.floor(Math.random() * qbankFiltered.length);
      renderQuestionBank();
      return;
    }
  });
});
