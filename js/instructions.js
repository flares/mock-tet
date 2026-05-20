document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');
  const subjectFilter = params.get('subject') || null;
  if (!examId) { location.replace('index.html'); return; }

  const titleEl        = document.getElementById('exam-title');
  const typeEl         = document.getElementById('exam-type');
  const durationEl     = document.getElementById('exam-duration');
  const marksEl        = document.getElementById('exam-marks');
  const questionsEl    = document.getElementById('exam-questions');
  const instructionsList = document.getElementById('instructions-list');
  const agreeCheckbox  = document.getElementById('agree-checkbox');
  const btnStart       = document.getElementById('btn-start');
  const btnBack        = document.getElementById('btn-back-home');
  const errorEl        = document.getElementById('error-msg');

  btnStart.disabled = true;

  // ── Fetch exam data ──────────────────────────────────────────────────────
  let examData;
  try {
    const resp = await fetch(`exams/${examId}.json`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    examData = await resp.json();
  } catch (err) {
    errorEl.textContent = `Failed to load exam: ${err.message}`;
    errorEl.style.display = 'block';
    return;
  }

  // ── Apply subject filter display ─────────────────────────────────────────
  const SUBJECT_LABELS = {
    cdp: 'Child Development & Pedagogy', english: 'English',
    telugu: 'Telugu', mathematics: 'Mathematics', science: 'Science',
  };
  const displayTitle = subjectFilter
    ? `${examData.title} — ${SUBJECT_LABELS[subjectFilter] || subjectFilter}`
    : examData.title;
  const displayDuration = subjectFilter ? 30 : examData.duration;
  const displayMarks    = subjectFilter ? 30 : examData.totalMarks;
  const sec = subjectFilter ? examData.sections.find(s => s.id === subjectFilter) : null;
  const displayQCount   = sec ? sec.questionCount : examData.questions.length;

  // ── Populate UI ──────────────────────────────────────────────────────────
  document.title = displayTitle + ' — Instructions';
  titleEl.textContent = displayTitle;
  typeEl.textContent  = examData.type || '';
  durationEl.textContent = `${displayDuration} min`;
  marksEl.textContent    = `${displayMarks} marks`;
  questionsEl.textContent = `${displayQCount} Qs`;

  const instructions = examData.instructions || [];
  instructionsList.innerHTML = instructions
    .map(line => `<li>${escHtml(line)}</li>`)
    .join('');

  // ── Checkbox gate ────────────────────────────────────────────────────────
  agreeCheckbox.addEventListener('change', () => {
    btnStart.disabled = !agreeCheckbox.checked;
  });

  // ── Start test ───────────────────────────────────────────────────────────
  btnStart.addEventListener('click', () => {
    if (!agreeCheckbox.checked) return;
    sessionStorage.removeItem('tet_exam_session');
    let url = `exam.html?exam=${encodeURIComponent(examId)}`;
    if (subjectFilter) url += `&subject=${encodeURIComponent(subjectFilter)}`;
    location.href = url;
  });

  btnBack.addEventListener('click', () => location.replace('index.html'));

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
