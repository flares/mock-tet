document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');
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

  // ── Populate UI ──────────────────────────────────────────────────────────
  document.title = examData.title + ' — Instructions';
  titleEl.textContent = examData.title;
  typeEl.textContent  = examData.type || '';
  durationEl.textContent = `${examData.duration} min`;
  marksEl.textContent    = `${examData.totalMarks} marks`;
  questionsEl.textContent = `${examData.questions.length} Qs`;

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
    // Clear any stale session for this exam so we always start fresh
    sessionStorage.removeItem('tet_exam_session');
    location.href = `exam.html?exam=${encodeURIComponent(examId)}`;
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
