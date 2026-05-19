document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('exam-grid');

  try {
    const resp = await fetch('exams/manifest.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const manifest = await resp.json();

    if (!manifest.exams || manifest.exams.length === 0) {
      grid.innerHTML = '<p class="loading-msg">No exam papers available yet.</p>';
      return;
    }

    grid.innerHTML = manifest.exams.map(exam => `
      <div class="exam-card">
        <div class="exam-card__header">
          <div class="exam-card__type">${escHtml(exam.type)}</div>
          <div class="exam-card__title">${escHtml(exam.title)}</div>
        </div>
        <div class="exam-card__body">
          <p class="exam-card__subtitle">${escHtml(exam.subtitle || '')}</p>
          <div class="exam-card__meta">
            ${exam.targetClasses ? `<span class="meta-pill">&#127979; ${escHtml(exam.targetClasses)}</span>` : ''}
            <span class="meta-pill">&#128221; ${exam.totalQuestions} Questions</span>
            <span class="meta-pill">&#9201; ${exam.duration} Minutes</span>
            <span class="meta-pill">&#127944; ${exam.totalMarks} Marks</span>
            ${!exam.negativeMarking ? '<span class="meta-pill">&#10003; No Negative Marking</span>' : ''}
          </div>
        </div>
        <div class="exam-card__footer">
          <button class="btn btn--primary" onclick="startExam('${escHtml(exam.id)}')">
            Start Test &#8594;
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    grid.innerHTML = `<p class="error-msg">Could not load exam list: ${err.message}</p>`;
  }
});

function startExam(examId) {
  location.href = `instructions.html?exam=${encodeURIComponent(examId)}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
