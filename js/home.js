document.addEventListener('DOMContentLoaded', async () => {
  const grid = document.getElementById('exam-grid');
  const ATTEMPTS_KEY = 'tet_attempts_';
  const RESULT_KEY   = 'tet_result_';

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.home-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.home-tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === target));
      document.querySelectorAll('.home-tab-pane').forEach(p =>
        p.classList.toggle('active', p.id === `tab-${target}`));
    });
  });

  // ── Syllabus accordion ─────────────────────────────────────────────────────
  document.querySelectorAll('.syl-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      hdr.closest('.syl-section').classList.toggle('open');
    });
  });

  // ── LocalStorage helpers ───────────────────────────────────────────────────
  function getAttempts(examId) {
    try {
      const raw = localStorage.getItem(`${ATTEMPTS_KEY}${examId}`);
      if (!raw) return [];
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }

  function clearAll() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(ATTEMPTS_KEY) || k.startsWith(RESULT_KEY))) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    renderExams();
  }

  function clearOne(examId) {
    localStorage.removeItem(`${ATTEMPTS_KEY}${examId}`);
    localStorage.removeItem(`${RESULT_KEY}${examId}`);
    renderExams();
  }

  // ── Attempt history fragment ───────────────────────────────────────────────
  function attemptHistoryHtml(attempts) {
    if (!attempts.length) return '';

    const badges = attempts.slice(0, 6).map((a, i) => {
      const cls = a.pct >= 60 ? 'att--good' : a.pct >= 40 ? 'att--avg' : 'att--low';
      const date = new Date(a.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const num  = attempts.length - i;
      return `<span class="${cls}" title="Attempt ${num} · ${date} · ${a.correct}✓ ${a.incorrect}✗ ${a.unattempted}—">${a.pct.toFixed(0)}%</span>`;
    }).join('');

    let trend = '';
    if (attempts.length >= 2) {
      const d = attempts[0].pct - attempts[1].pct;
      trend = d > 0
        ? '<span class="att-trend att-trend--up">↑</span>'
        : d < 0
          ? '<span class="att-trend att-trend--down">↓</span>'
          : '<span class="att-trend att-trend--flat">→</span>';
    }

    return `<div class="att-history">
      <div class="att-history__label">${attempts.length} attempt${attempts.length > 1 ? 's' : ''} ${trend}</div>
      <div class="att-history__badges">${badges}</div>
    </div>`;
  }

  // ── Render exam cards ──────────────────────────────────────────────────────
  let manifest = null;

  async function renderExams() {
    if (!manifest) {
      try {
        const resp = await fetch('exams/manifest.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        manifest = await resp.json();
      } catch (err) {
        grid.innerHTML = `<p class="error-msg">Could not load exam list: ${err.message}</p>`;
        return;
      }
    }

    if (!manifest.exams || manifest.exams.length === 0) {
      grid.innerHTML = '<p class="loading-msg">No exam papers available yet.</p>';
      return;
    }

    grid.innerHTML = manifest.exams.map(exam => {
      const attempts   = getAttempts(exam.id);
      const tried      = attempts.length > 0;
      const historyFrag = attemptHistoryHtml(attempts);

      return `<div class="exam-card">
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
          ${historyFrag}
        </div>
        <div class="exam-card__footer">
          ${tried ? `
            <button class="btn btn--ghost btn--xs" onclick="clearOneExam('${escHtml(exam.id)}')">Clear</button>
            <button class="btn btn--outline btn--sm" onclick="viewResult('${escHtml(exam.id)}')">Last Result</button>
          ` : ''}
          <button class="btn btn--primary btn--sm" onclick="startExam('${escHtml(exam.id)}')">
            ${tried ? '&#8635; Retake' : 'Start Test &#8594;'}
          </button>
        </div>
      </div>`;
    }).join('');
  }

  await renderExams();

  // ── Clear-all button ───────────────────────────────────────────────────────
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('Delete all saved attempt results? This cannot be undone.')) clearAll();
  });

  // ── Expose to inline onclick attrs ────────────────────────────────────────
  window.startExam = id => { location.href = `instructions.html?exam=${encodeURIComponent(id)}`; };
  window.viewResult  = id => { location.href = `result.html?exam=${encodeURIComponent(id)}`; };
  window.clearOneExam = id => {
    if (confirm('Clear saved results for this exam? This cannot be undone.')) clearOne(id);
  };
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
