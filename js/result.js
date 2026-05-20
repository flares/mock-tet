document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');
  const autoSubmit = params.get('auto') === '1';

  if (!examId) { location.replace('index.html'); return; }

  const result = ExamState.loadResult(examId);
  if (!result) {
    document.getElementById('result-main').innerHTML =
      `<p class="error-msg">No result found. <a href="index.html">Go back to home</a>.</p>`;
    return;
  }

  const { session, score, examData } = result;

  document.title = `Result — ${examData.title}`;

  if (autoSubmit) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#c62828;color:#fff;padding:10px 20px;font-size:13px;font-weight:700;text-align:center;';
    banner.textContent = 'Time expired — exam auto-submitted.';
    document.body.prepend(banner);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  document.getElementById('result-exam-title').textContent = examData.title;
  document.getElementById('result-exam-meta').textContent =
    `${examData.type} · ${examData.duration} minutes · ${examData.totalMarks} marks`;

  // ── Score ─────────────────────────────────────────────────────────────────
  const hasAnswerKey = score.details.some(d => d.question.correctAnswer != null);
  const marksScored = score.correct * examData.marksPerQuestion;
  document.getElementById('score-number').textContent = hasAnswerKey ? marksScored : score.attempted;
  document.getElementById('score-total').textContent  = hasAnswerKey
    ? `out of ${examData.totalMarks}`
    : `answered out of ${examData.totalQuestions}`;
  const pct = hasAnswerKey && examData.totalMarks > 0
    ? ((marksScored / examData.totalMarks) * 100).toFixed(1)
    : '0.0';
  document.getElementById('score-percent').textContent = hasAnswerKey ? `${pct}%` : 'No answer key';

  // ── Summary stat cards ────────────────────────────────────────────────────
  document.getElementById('stat-correct').textContent    = score.correct;
  document.getElementById('stat-incorrect').textContent  = score.incorrect;
  document.getElementById('stat-unattempted').textContent = score.unattempted;

  const elapsed = examData.duration * 60 - (session.remainingSeconds || 0);
  document.getElementById('stat-time').textContent = formatTime(elapsed);

  // ── Section breakdown ─────────────────────────────────────────────────────
  const breakdownBody = document.getElementById('breakdown-body');
  breakdownBody.innerHTML = examData.sections.map(sec => {
    const secDetails  = score.details.filter(d => d.question.sectionId === sec.id);
    const secCorrect  = secDetails.filter(d => d.result === 'correct').length;
    const secIncorrect = secDetails.filter(d => d.result === 'incorrect').length;
    const secSkipped  = secDetails.filter(d => d.result === 'skipped' || d.result === 'no-key').length;
    const secMarks    = secCorrect * examData.marksPerQuestion;
    return `<tr>
      <td>${escHtml(sec.name)}</td>
      <td>${sec.questionCount}</td>
      <td style="color:#388e3c;font-weight:700">${secCorrect}</td>
      <td style="color:#d32f2f;font-weight:700">${secIncorrect}</td>
      <td style="color:#757575">${secSkipped}</td>
      <td style="font-weight:700">${hasAnswerKey ? secMarks : '—'}</td>
    </tr>`;
  }).join('');

  // ── Question review table ─────────────────────────────────────────────────
  let activeFilter = 'all';
  const reviewBody = document.getElementById('review-body');

  function renderReview(filter) {
    activeFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.filter === filter)
    );

    const filtered = score.details.filter(d => {
      if (filter === 'all') return true;
      return d.result === filter;
    });

    if (filtered.length === 0) {
      reviewBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#888;padding:20px">No questions match this filter.</td></tr>';
      return;
    }

    reviewBody.innerHTML = filtered.map(d => {
      const rowClass = d.result === 'correct' ? 'row--correct'
        : d.result === 'incorrect' ? 'row--incorrect'
        : d.result === 'no-key' ? 'row--no-key'
        : 'row--skipped';
      const userBadge = d.userAnswer
        ? `<span class="answer-badge answer-badge--${d.result}">${d.userAnswer}</span>`
        : `<span class="answer-badge answer-badge--skipped">—</span>`;
      const correctBadge = d.question.correctAnswer != null
        ? `<span class="answer-badge answer-badge--correct">${d.question.correctAnswer}</span>`
        : `<span class="answer-badge answer-badge--skipped">N/A</span>`;
      const marks = !hasAnswerKey ? '—'
        : d.result === 'correct' ? examData.marksPerQuestion : 0;

      let questionContent;
      if (d.question.questionType === 'image') {
        questionContent = `<img src="${escHtml(d.question.questionImage)}" alt="Q${d.question.globalIndex + 1}" class="review-question-img" loading="lazy">`;
      } else {
        const explanation = d.question.explanation
          ? `<div class="review-explanation"><span class="review-explanation__label">Explanation:</span> ${escHtml(d.question.explanation)}</div>`
          : '';
        questionContent = `<div class="review-question-text">${escHtml(d.question.text)}</div>${explanation}`;
      }

      return `<tr class="${rowClass}">
        <td>${d.question.globalIndex + 1}</td>
        <td class="review-cell-question">${questionContent}</td>
        <td style="text-align:center">${userBadge}</td>
        <td style="text-align:center">${correctBadge}</td>
        <td style="text-align:center">${marks}</td>
      </tr>`;
    }).join('');
  }

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => renderReview(btn.dataset.filter));
  });

  renderReview('all');

  // ── Actions ───────────────────────────────────────────────────────────────
  document.getElementById('btn-retake').addEventListener('click', () => {
    location.href = `instructions.html?exam=${encodeURIComponent(examId)}`;
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    location.replace('index.html');
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function formatTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
