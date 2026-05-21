const SUBJECT_META = {
  cdp:         { label: 'CDP',         color: '#1565c0', bg: '#e3f2fd' },
  telugu:      { label: 'Telugu',      color: '#bf360c', bg: '#fbe9e7' },
  english:     { label: 'English',     color: '#2e7d32', bg: '#e8f5e9' },
  mathematics: { label: 'Math',        color: '#6a1b9a', bg: '#f3e5f5' },
  science:     { label: 'Science',     color: '#00695c', bg: '#e0f2f1' },
};
const SUBJECT_ORDER = ['cdp', 'telugu', 'english', 'mathematics', 'science'];

document.addEventListener('DOMContentLoaded', async () => {
  const tableContainer = document.getElementById('exam-table-container');
  const ATTEMPTS_KEY = 'tet_attempts_';
  const RESULT_KEY   = 'tet_result_';
  let currentFilter  = 'Real Paper';

  function applySubjectChipColors() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      const key = (chip.dataset.subject || chip.dataset.filter || '').toLowerCase();
      const normalized = key === 'math' ? 'mathematics' : key;
      const meta = SUBJECT_META[normalized];
      if (!meta) return;
      chip.style.borderColor = meta.color;
      if (chip.classList.contains('active')) {
        chip.style.color = '#fff';
        chip.style.background = meta.color;
      } else {
        chip.style.color = meta.color;
        chip.style.background = meta.bg;
      }
    });
  }
  applySubjectChipColors();

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
      const date = new Date(a.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      const num  = attempts.length - i;
      const sm   = a.subject ? SUBJECT_META[a.subject] : null;
      const style = sm
        ? `background:${sm.bg};color:${sm.color};border:1px solid ${sm.color};`
        : 'background:#f1f3f6;color:#455a64;border:1px solid #b0bec5;';
      const rid  = a.resultId || null;
      const clickAttr = rid ? `data-result-id="${escHtml(rid)}" onclick="viewResult('${escHtml(rid)}')"` : '';
      const title = `Attempt ${num} · ${date} · ${a.pct.toFixed(0)}%${sm ? ' · ' + sm.label : ''}`;
      return `<span style="${style}" title="${title}" ${clickAttr}>${a.correct}&#10003; ${a.incorrect}&#10007;</span>`;
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

  // ── Render exam table ─────────────────────────────────────────────────────
  let manifest = null;

  function filterExams(exams, filter) {
    if (filter === 'all') return exams;
    if (filter === 'Full' || filter === 'Real Paper') return exams.filter(e => e.style === filter);
    return exams.filter(e =>
      e.style !== 'Real Paper' && e.style !== 'Full' && e.subjects && e.subjects.includes(filter)
    );
  }

  async function renderExams() {
    if (!manifest) {
      try {
        const resp = await fetch('exams/manifest.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        manifest = await resp.json();
      } catch (err) {
        tableContainer.innerHTML = `<p class="error-msg">Could not load exam list: ${err.message}</p>`;
        return;
      }
    }

    if (!manifest.exams || manifest.exams.length === 0) {
      tableContainer.innerHTML = '<p class="loading-msg">No exam papers available yet.</p>';
      return;
    }

    const filtered = filterExams(manifest.exams, currentFilter);

    if (filtered.length === 0) {
      tableContainer.innerHTML = '<p class="loading-msg">No exams match this filter.</p>';
      return;
    }

    const rows = filtered.map(exam => {
      const attempts   = getAttempts(exam.id);
      const tried      = attempts.length > 0;
      const historyFrag = attemptHistoryHtml(attempts);
      const isReal     = exam.style === 'Real Paper';
      const actionBtns = isReal ? _realPaperActions(exam, tried) : _mockActions(exam, tried);
      const clearBtn   = tried ? `<button class="btn btn--ghost btn--xs" onclick="clearOneExam('${escHtml(exam.id)}')">Clear</button>` : '';

      return `<tr>
        <td class="exam-table-title">
          ${escHtml(exam.title)}
          ${exam.subtitle ? `<small>${escHtml(exam.subtitle)}</small>` : ''}
        </td>
        <td><span class="exam-table-style">${escHtml(exam.style || exam.type)}</span></td>
        <td class="col-num">${exam.duration} min</td>
        <td class="col-num">${exam.totalQuestions}</td>
        <td class="col-num">${exam.totalMarks}</td>
        <td class="exam-table-results">${historyFrag || '<span style="color:#bbb; font-size:13px;">—</span>'}${clearBtn}</td>
        <td class="exam-table-actions">${actionBtns}</td>
      </tr>`;
    }).join('');

    tableContainer.innerHTML = `<table class="exam-table">
      <thead>
        <tr>
          <th>Test Title</th><th>Test Style</th><th>Duration</th>
          <th>Questions</th><th>Marks</th><th>Past Results</th><th>Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  await renderExams();

  // ── Filter buttons ─────────────────────────────────────────────────────────
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.filter === currentFilter));
      applySubjectChipColors();
      renderExams();
    });
  });

  // ── Clear-all button ───────────────────────────────────────────────────────
  document.getElementById('btn-clear-all').addEventListener('click', () => {
    if (confirm('Delete all saved attempt results? This cannot be undone.')) clearAll();
  });

  // ── Action fragment helpers ────────────────────────────────────────────────
  function _mockActions(exam, tried) {
    const eid = escHtml(exam.id);
    return `<button class="btn btn--primary btn--sm ${tried ? 'btn--retake' : ''}" onclick="startExam('${eid}')">
      ${tried ? 'Retake ↻' : 'Take Test →'}
    </button>`;
  }

  function _realPaperActions(exam, tried) {
    const eid = escHtml(exam.id);
    const mainLabel = tried ? 'Retake ↻' : 'Take Test →';
    const subjectItems = SUBJECT_ORDER.map(s => {
      const sm = SUBJECT_META[s];
      return `<button class="split-drop-item" style="border-left:3px solid ${sm.color}" onclick="startExam('${eid}','${s}')"><span class="split-drop-dot" style="background:${sm.color}"></span>${sm.label} Only</button>`;
    }).join('');
    return `<div class="split-btn-group">
      <button class="btn btn--primary split-btn-main ${tried ? 'btn--retake' : ''}" onclick="startExam('${eid}')">${mainLabel}</button>
      <div class="split-drop-wrapper">
        <button class="btn btn--primary split-drop-toggle" onclick="toggleSplitMenu(event,this)" title="Take a single-subject mini-test">▾</button>
        <div class="split-drop-menu" hidden>${subjectItems}</div>
      </div>
    </div>`;
  }

  // ── Expose to inline onclick attrs ────────────────────────────────────────
  window.startExam = (id, subject) => {
    let url = `instructions.html?exam=${encodeURIComponent(id)}`;
    if (subject) url += `&subject=${encodeURIComponent(subject)}`;
    location.href = url;
  };
  window.viewResult  = id => { location.href = `result.html?exam=${encodeURIComponent(id)}`; };
  window.clearOneExam = id => {
    if (confirm('Clear saved results for this exam? This cannot be undone.')) clearOne(id);
  };
  window.toggleSplitMenu = (evt, btn) => {
    evt.stopPropagation();
    const menu = btn.nextElementSibling;
    const isOpen = !menu.hidden;
    document.querySelectorAll('.split-drop-menu').forEach(m => { m.hidden = true; });
    menu.hidden = isOpen;
  };
  document.addEventListener('click', () => {
    document.querySelectorAll('.split-drop-menu').forEach(m => { m.hidden = true; });
  });
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
