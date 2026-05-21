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
  let currentFilter = 'Real Paper';

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.header-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.header-nav-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === target));
      document.querySelectorAll('.home-tab-pane').forEach(p =>
        p.classList.toggle('active', p.id === `tab-${target}`));
      if (target === 'revision') renderRevisionTab();
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
      const sm   = a.subject ? SUBJECT_META[a.subject] : null;
      const dot  = sm ? `<span class="att-subject-dot" style="background:${sm.color}"></span>` : '';
      const border = sm ? `border-left:3px solid ${sm.color};` : '';
      const rid  = a.resultId || null;
      const clickAttr = rid ? `data-result-id="${escHtml(rid)}" onclick="viewResult('${escHtml(rid)}')"` : '';
      const title = `Attempt ${num} · ${date} · ${a.pct.toFixed(0)}%${sm ? ' · ' + sm.label : ''}`;
      return `<span class="${cls}" style="${border}" title="${title}" ${clickAttr}>${dot}${a.correct}&#10003; ${a.incorrect}&#10007;</span>`;
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
    // Subject filters: only show mini-tests (exclude Real Papers and Full mocks)
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

      return `<tr>
        <td class="exam-table-title">
          ${escHtml(exam.title)}
          ${exam.subtitle ? `<small>${escHtml(exam.subtitle)}</small>` : ''}
        </td>
        <td><span class="exam-table-style">${escHtml(exam.style || exam.type)}</span></td>
        <td class="col-num">${exam.duration} min</td>
        <td class="col-num">${exam.totalQuestions}</td>
        <td class="col-num">${exam.totalMarks}</td>
        <td class="exam-table-results">${historyFrag || '<span style="color:#bbb; font-size:13px;">—</span>'}</td>
        <td class="exam-table-actions">${actionBtns}</td>
      </tr>`;
    }).join('');

    tableContainer.innerHTML = `<table class="exam-table">
      <thead>
        <tr>
          <th>Test Title</th>
          <th>Test Style</th>
          <th>Duration</th>
          <th>Questions</th>
          <th>Marks</th>
          <th>Past Results</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
  }

  await renderExams();

  // ── Filter buttons ─────────────────────────────────────────────────────────
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.filter === currentFilter));
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
    return `
      ${tried ? `<button class="btn btn--ghost btn--xs" onclick="clearOneExam('${eid}')">Clear</button>` : ''}
      <button class="btn btn--primary btn--sm" onclick="startExam('${eid}')">
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
    return `
      ${tried ? `<button class="btn btn--ghost btn--xs" onclick="clearOneExam('${eid}')">Clear</button>` : ''}
      <div class="split-btn-group">
        <button class="btn btn--primary split-btn-main" onclick="startExam('${eid}')">${mainLabel}</button>
        <div class="split-drop-wrapper">
          <button class="btn btn--primary split-drop-toggle" onclick="toggleSplitMenu(event,this)" title="Take a single-subject mini-test">▾</button>
          <div class="split-drop-menu" hidden>${subjectItems}</div>
        </div>
      </div>`;
  }

  // ── Revision tab ─────────────────────────────────────────────────────────
  const REVISION_KEY = 'tet_revision_questions';

  function getRevisionList() {
    try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
  }

  function renderRevisionTab() {
    const container = document.getElementById('revision-container');
    const toolbar   = document.getElementById('revision-toolbar');
    const list = getRevisionList();

    if (!list.length) {
      toolbar.style.display = 'none';
      container.innerHTML = '<p class="loading-msg">No questions marked for revision yet. Use the <strong>Mark for Revision</strong> button inside any exam (Practice Mode must be on).</p>';
      return;
    }

    toolbar.style.display = '';

    const rows = list.map((item, i) => {
      const q = item.q;
      const isImg = q.questionType === 'image';

      const questionHtml = isImg
        ? `<img src="${escHtml(q.questionImage)}" alt="Question" class="rev-question-img" loading="lazy">`
        : `<div class="rev-question-text">${escHtml(q.text)}</div>`;

      let optionsHtml;
      if (isImg) {
        if (q.optionsInQuestion) {
          optionsHtml = ['1','2','3','4'].map(k => {
            const cls = k === q.correctAnswer ? 'rev-opt rev-opt--correct' : 'rev-opt';
            return `<div class="${cls}"><span class="rev-opt-num">${k}</span><span class="rev-opt-label">Option ${k}</span></div>`;
          }).join('');
        } else {
          optionsHtml = (q.optionImages || []).map((src, idx2) => {
            const k = String(idx2 + 1);
            const cls = k === q.correctAnswer ? 'rev-opt rev-opt--correct' : 'rev-opt';
            return `<div class="${cls}"><span class="rev-opt-num">${k}</span><img src="${escHtml(src)}" class="rev-opt-img" alt="Option ${k}" loading="lazy"></div>`;
          }).join('');
        }
      } else {
        optionsHtml = (q.options || []).map(opt => {
          const cls = opt.key === q.correctAnswer ? 'rev-opt rev-opt--correct rev-opt--text' : 'rev-opt rev-opt--text';
          return `<div class="${cls}"><span class="rev-opt-num">${opt.key}</span><span class="rev-opt-label">${escHtml(opt.text)}</span></div>`;
        }).join('');
      }

      return `<tr>
        <td class="rev-meta-cell">
          <div class="rev-meta">${escHtml(item.examTitle || item.examId)}</div>
          <div class="rev-qnum">Q${q.globalIndex != null ? q.globalIndex + 1 : '?'}</div>
        </td>
        <td class="rev-question-cell">${questionHtml}</td>
        <td class="rev-options-cell"><div class="rev-opts-grid">${optionsHtml}</div></td>
        <td class="rev-remove-cell">
          <button class="btn btn--ghost btn--xs" onclick="removeRevisionQ(${i})">&#10005;</button>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table class="rev-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Question</th>
          <th>Options <span style="color:#388e3c;font-size:11px">(green = correct)</span></th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  window.removeRevisionQ = (idx) => {
    const list = getRevisionList();
    list.splice(idx, 1);
    localStorage.setItem(REVISION_KEY, JSON.stringify(list));
    renderRevisionTab();
  };

  document.getElementById('btn-clear-revision').addEventListener('click', () => {
    if (confirm('Remove all revision questions? This cannot be undone.')) {
      localStorage.removeItem(REVISION_KEY);
      renderRevisionTab();
    }
  });

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
    // Close all other open menus
    document.querySelectorAll('.split-drop-menu').forEach(m => { m.hidden = true; });
    menu.hidden = isOpen;
  };
  document.addEventListener('click', () => {
    document.querySelectorAll('.split-drop-menu').forEach(m => { m.hidden = true; });
  });
});

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
