/**
 * exam.js — main controller for exam.html.
 * Wires ExamState, ExamTimer, PaletteRenderer and QuestionRenderer together.
 */
document.addEventListener('DOMContentLoaded', async () => {

  // ── Read exam ID from URL ───────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');
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
  const btnLangEn      = document.getElementById('btn-lang-en');
  const btnLangHi      = document.getElementById('btn-lang-hi');
  const btnPaletteToggle = document.getElementById('btn-palette-toggle');
  const palettePanel   = document.querySelector('.palette-panel');

  const submitDialog    = document.getElementById('submit-dialog');
  const btnDialogCancel = document.getElementById('dialog-cancel');
  const btnDialogSubmit = document.getElementById('dialog-confirm');

  let currentLang = localStorage.getItem('tet_lang') || 'en';

  // ── Load exam ───────────────────────────────────────────────────────────
  try {
    await ExamState.load(examId);
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
  applyLanguage(currentLang);
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

  // ── Language toggle ─────────────────────────────────────────────────────
  btnLangEn.addEventListener('click', () => applyLanguage('en'));
  btnLangHi.addEventListener('click', () => applyLanguage('hi'));

  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('tet_lang', lang);
    document.body.classList.toggle('lang-hi', lang === 'hi');
    btnLangEn.classList.toggle('active', lang === 'en');
    btnLangHi.classList.toggle('active', lang === 'hi');
  }

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
    location.replace(`result.html?exam=${examId}`);
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
    location.replace(`result.html?exam=${examId}&auto=1`);
  }
});
