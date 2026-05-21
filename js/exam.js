/**
 * exam.js — main controller for exam.html.
 * Wires ExamState, ExamTimer, PaletteRenderer and QuestionRenderer together.
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── Read exam ID from URL ───────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');
  const subjectFilter = params.get('subject') || null;
  if (!examId) { location.replace('index.html'); return; }

  // ── DOM refs ────────────────────────────────────────────────────────────
  const loadingOverlay   = document.getElementById('loading-overlay');
  const timerEl          = document.getElementById('exam-timer');
  const examTitleEl      = document.getElementById('exam-title');
  const sectionTabsEl    = document.getElementById('section-tabs');
  const questionPaneEl   = document.getElementById('question-pane');
  const questionCardEl   = document.getElementById('question-card');
  const questionCounterEl = document.getElementById('question-counter');
  const sectionLabelEl   = document.getElementById('question-section-label');
  const paletteEl        = document.getElementById('palette-container');

  const btnBack        = document.getElementById('btn-back');
  const btnClear       = document.getElementById('btn-clear');
  const btnMark        = document.getElementById('btn-mark');
  const btnSave        = document.getElementById('btn-save');
  const btnSubmit      = document.getElementById('btn-submit');
  const btnPaletteToggle = document.getElementById('btn-palette-toggle');
  const palettePanel   = document.querySelector('.palette-panel');

  // ── Practice mode refs ──────────────────────────────────────────────────
  const strictToggleEl   = document.getElementById('strict-mode-toggle');
  const modeLabelEl      = document.getElementById('mode-toggle-label');
  const practiceBtnBar   = document.getElementById('practice-btn-bar');
  const btnMarkRevision  = document.getElementById('btn-mark-revision');
  const btnShowAnswer    = document.getElementById('btn-show-answer');

  const REVISION_KEY = 'tet_revision_questions';
  const STRICT_KEY   = 'tet_strict_mode';

  function getRevisionList() {
    try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
  }

  function isStrictMode() {
    return localStorage.getItem(STRICT_KEY) === 'on';
  }

  // Init toggle state
  strictToggleEl.checked = isStrictMode();
  updateModeUI();

  strictToggleEl.addEventListener('change', () => {
    localStorage.setItem(STRICT_KEY, strictToggleEl.checked ? 'on' : 'off');
    updateModeUI();
  });

  function updateModeUI() {
    const strict = strictToggleEl.checked;
    practiceBtnBar.classList.toggle('practice-btn-bar--hidden', strict);
    modeLabelEl.textContent = strict ? 'Strict Mode' : 'Practice Mode';
  }

  const submitDialog    = document.getElementById('submit-dialog');
  const btnDialogCancel = document.getElementById('dialog-cancel');
  const btnDialogSubmit = document.getElementById('dialog-confirm');

  // ── Load exam ───────────────────────────────────────────────────────────
  try {
    await ExamState.load(examId, subjectFilter);
  } catch (err) {
    loadingOverlay.innerHTML = `<p style="color:#c62828">Failed to load exam: ${err.message}.<br><a href="index.html">Go back</a></p>`;
    return;
  }

  const examData = ExamState.getExamData();
  examTitleEl.textContent = examData.title;
  document.title = examData.title + ' — Mock TET';

  // ── Initialise modules ──────────────────────────────────────────────────
  QuestionRenderer.init(questionCardEl, key => ExamState.selectOption(key));

  PaletteRenderer.render(
    paletteEl,
    examData,
    idx => ExamState.getStatus(idx),
    idx => navigateTo(idx)
  );

  // ── Build section tabs ──────────────────────────────────────────────────
  examData.sections.forEach(sec => {
    const btn = document.createElement('button');
    btn.className = 'section-tab';
    btn.dataset.sectionId = sec.id;
    btn.textContent = sec.shortName;
    btn.title = sec.name;
    btn.addEventListener('click', () => navigateTo(sec.startIndex));
    sectionTabsEl.appendChild(btn);
  });

  // ── Render initial state ────────────────────────────────────────────────
  renderCurrentQuestion();
  loadingOverlay.style.display = 'none';

  // ── Start timer ─────────────────────────────────────────────────────────
  ExamTimer.start(
    ExamState.getSession().remainingSeconds,
    onTimerTick,
    onTimerExpire
  );

  // ── Prevent browser back button ─────────────────────────────────────────
  history.pushState(null, '', location.href);
  window.addEventListener('popstate', () => {
    history.pushState(null, '', location.href);
    if (confirm('Are you sure you want to leave the exam? Your progress is saved but the timer will not pause.')) {
      ExamTimer.stop();
      location.replace('index.html');
    }
  });

  // ── Core render ─────────────────────────────────────────────────────────
  function renderCurrentQuestion() {
    const session = ExamState.getSession();
    const idx = session.currentGlobalIndex;
    const q = ExamState.getQuestion(idx);
    const section = examData.sections.find(s => s.id === session.activeSectionId);

    QuestionRenderer.render(q, ExamState.getPendingAnswer());
    PaletteRenderer.highlightCurrent(idx);

    questionCounterEl.textContent = `Question ${idx + 1} of ${examData.questions.length}`;
    sectionLabelEl.textContent = section ? section.name : '';

    // Section tabs — highlight active
    sectionTabsEl.querySelectorAll('.section-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.sectionId === session.activeSectionId);
    });

    // Back button — disable on first question
    btnBack.disabled = idx === 0;

    // Practice buttons state
    _updatePracticeBtns(q);
  }

  function _updatePracticeBtns(q) {
    // Reset Show Answer button
    btnShowAnswer.disabled = false;
    btnShowAnswer.textContent = '👁 Show Answer';
    if (q.correctAnswer == null) {
      btnShowAnswer.disabled = true;
      btnShowAnswer.textContent = 'No Official Answer';
    }

    // Update Mark for Revision button
    const effectiveExamId = subjectFilter ? `${examId}:${subjectFilter}` : examId;
    const list = getRevisionList();
    const isMarked = list.some(r => r.examId === effectiveExamId && r.q.globalIndex === q.globalIndex);
    btnMarkRevision.classList.toggle('btn--revision--marked', isMarked);
    btnMarkRevision.innerHTML = isMarked
      ? '&#10003; Marked for Revision'
      : '&#128278; Mark for Revision';
  }

  function navigateTo(idx) {
    const prev = ExamState.getSession().currentGlobalIndex;
    ExamState.navigateTo(idx);
    PaletteRenderer.updateButton(prev, ExamState.getStatus(prev));
    renderCurrentQuestion();
  }

  // ── Button handlers ─────────────────────────────────────────────────────
  btnBack.addEventListener('click', () => {
    const idx = ExamState.getSession().currentGlobalIndex;
    if (idx > 0) navigateTo(idx - 1);
  });

  btnClear.addEventListener('click', () => {
    const idx = ExamState.getSession().currentGlobalIndex;
    ExamState.clearResponse();
    QuestionRenderer.render(ExamState.getQuestion(idx), null);
    PaletteRenderer.updateButton(idx, ExamState.getStatus(idx));
  });

  btnMark.addEventListener('click', () => {
    const prev = ExamState.getSession().currentGlobalIndex;
    ExamState.markAndNext();
    PaletteRenderer.updateButton(prev, ExamState.getStatus(prev));
    renderCurrentQuestion();
  });

  btnSave.addEventListener('click', () => {
    const prev = ExamState.getSession().currentGlobalIndex;
    ExamState.saveAndNext();
    PaletteRenderer.updateButton(prev, ExamState.getStatus(prev));
    renderCurrentQuestion();
  });

  btnSubmit.addEventListener('click', () => openSubmitDialog());

  // ── Mobile palette toggle ───────────────────────────────────────────────
  if (btnPaletteToggle) {
    btnPaletteToggle.addEventListener('click', () => {
      palettePanel.classList.toggle('palette-panel--open');
      btnPaletteToggle.textContent = palettePanel.classList.contains('palette-panel--open')
        ? 'Hide Palette' : 'Question Palette';
    });
  }

  // Close mobile palette when a question is clicked
  paletteEl.addEventListener('click', e => {
    if (e.target.closest('.palette-btn') && palettePanel) {
      palettePanel.classList.remove('palette-panel--open');
    }
  });

  // ── Practice buttons ───────────────────────────────────────────────────
  btnMarkRevision.addEventListener('click', () => {
    const session = ExamState.getSession();
    const q = ExamState.getQuestion(session.currentGlobalIndex);
    const effectiveExamId = subjectFilter ? `${examId}:${subjectFilter}` : examId;
    const list = getRevisionList();
    const existingIdx = list.findIndex(r => r.examId === effectiveExamId && r.q.globalIndex === q.globalIndex);
    if (existingIdx >= 0) {
      list.splice(existingIdx, 1);
    } else {
      list.push({ examId: effectiveExamId, examTitle: examData.title, q });
    }
    localStorage.setItem(REVISION_KEY, JSON.stringify(list));
    _updatePracticeBtns(q);
  });

  btnShowAnswer.addEventListener('click', () => {
    const session = ExamState.getSession();
    const q = ExamState.getQuestion(session.currentGlobalIndex);
    QuestionRenderer.showAnswer(q.correctAnswer);
    btnShowAnswer.disabled = true;
    btnShowAnswer.textContent = '✓ Answer Shown';
  });

  // ── Submit dialog ───────────────────────────────────────────────────────
  function openSubmitDialog() {
    const summary = ExamState.getSummary();
    document.getElementById('sd-total').textContent         = summary.total;
    document.getElementById('sd-answered').textContent      = summary.answered;
    document.getElementById('sd-not-answered').textContent  = summary.notAnswered;
    document.getElementById('sd-marked').textContent        = summary.marked;
    document.getElementById('sd-ans-marked').textContent    = summary.answeredMarked;
    document.getElementById('sd-not-visited').textContent   = summary.notVisited;
    submitDialog.showModal();
  }

  btnDialogCancel.addEventListener('click', () => submitDialog.close());

  btnDialogSubmit.addEventListener('click', () => {
    ExamTimer.stop();
    ExamState.finalSubmit();
    const effectiveId = subjectFilter ? `${examId}:${subjectFilter}` : examId;
    location.replace(`result.html?exam=${encodeURIComponent(effectiveId)}`);
  });

  // Click outside dialog to close
  submitDialog.addEventListener('click', e => {
    if (e.target === submitDialog) submitDialog.close();
  });

  // ── Timer callbacks ─────────────────────────────────────────────────────
  function onTimerTick(remaining) {
    ExamState.tickTimer(remaining);
    timerEl.textContent = ExamTimer.format(remaining);
    const level = ExamTimer.getWarningLevel(remaining);
    timerEl.classList.toggle('timer--warning', level === 'warning');
    timerEl.classList.toggle('timer--critical', level === 'critical');
  }

  function onTimerExpire() {
    timerEl.textContent = '00:00:00';
    ExamState.finalSubmit();
    const effectiveId = subjectFilter ? `${examId}:${subjectFilter}` : examId;
    location.replace(`result.html?exam=${encodeURIComponent(effectiveId)}&auto=1`);
  }
});
