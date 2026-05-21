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
      if (target === 'questionbank') renderQuestionBankTab();
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
  renderRevisionTab();

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
  const UNDERSTOOD_KEY = 'tet_understood_questions';
  let revisionSubjectFilter = 'all';

  function getRevisionList() {
    try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
  }

  // sectionId is exam-section ID ('cdp', 'telugu', 'english', 'math', 'science').
  // The filter chips use the same id (lowercase). For mini-test subject-filter
  // examIds the suffix after ':' is the subject token ('cdp'|'telugu'|...).
  function questionSubject(item) {
    const q = item && item.q;
    if (q && q.sectionId) return String(q.sectionId).toLowerCase();
    if (item && item.examId && item.examId.includes(':')) {
      return item.examId.split(':').pop().toLowerCase();
    }
    return '';
  }

  function renderRevisionTab() {
    const container = document.getElementById('revision-container');
    const toolbar   = document.getElementById('revision-toolbar');
    const allItems = getRevisionList();

    if (!allItems.length) {
      toolbar.style.display = 'none';
      container.innerHTML = '<p class="loading-msg">No questions marked for revision yet. Use the <strong>Mark for Revision</strong> button inside any exam (Practice Mode must be on).</p>';
      return;
    }

    toolbar.style.display = '';

    try {
    // Preserve original indexes (used by the action handlers) before filtering.
    const indexed = allItems.map((item, i) => ({ item, i }));
    const filtered = revisionSubjectFilter === 'all'
      ? indexed
      : indexed.filter(({ item }) => questionSubject(item) === revisionSubjectFilter);

    if (!filtered.length) {
      container.innerHTML = '<p class="loading-msg">No revision questions match this subject filter.</p>';
      return;
    }

    const pending  = filtered.filter(({ item }) => !item.revised);
    const revised  = filtered.filter(({ item }) => item.revised);

    const makeRows = (entries, isPending) => entries.map(({ item, i }) => {
      const q = item.q;
      if (!q) return '';
      const isImg = q.questionType === 'image';

      const questionHtml = isImg
        ? `<img src="${escHtml(q.questionImage || '')}" alt="Question" class="rev-question-img" loading="lazy">`
        : `<div class="rev-question-text">${escHtml(q.text || '')}</div>`;

      let optionsHtml = '';
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
          return `<div class="${cls}"><span class="rev-opt-num">${opt.key}</span><span class="rev-opt-label">${escHtml(opt.text || '')}</span></div>`;
        }).join('');
      }

      const qimg = escHtml(q.questionImage || '');
      const explainBtn = qimg
        ? `<button class="btn btn--explain btn--xs" data-qimg="${qimg}">&#128218; Explain</button>`
        : '';

      const actionCell = isPending
        ? `${explainBtn}${explainBtn ? '<br>' : ''}<button class="btn btn--revision-done btn--xs" style="margin-top:4px" onclick="markAsRevised(${i})" title="Mark as Revised">&#10003; Revised</button>`
        : `<button class="btn btn--ghost btn--xs" onclick="unmarkRevised(${i})" title="Move back to review">&#8617; Review</button><br><button class="btn btn--ghost btn--xs" style="margin-top:4px" onclick="removeRevisionQ(${i})">&#10005;</button>`;

      return `<tr>
          <td class="rev-meta-cell">
            <div class="rev-meta">${escHtml(item.examTitle || item.examId || '')}</div>
            <div class="rev-qnum">Q${q.globalIndex != null ? q.globalIndex + 1 : '?'}</div>
          </td>
          <td class="rev-question-cell">${questionHtml}</td>
          <td class="rev-options-cell"><div class="rev-opts-grid">${optionsHtml}</div></td>
          <td class="rev-remove-cell">${actionCell}</td>
        </tr>`;
    }).join('');

    const makeTable = (entries, isPending) => `<table class="rev-table">
      <thead>
        <tr>
          <th>Source</th>
          <th>Question</th>
          <th>Options <span style="color:#388e3c;font-size:11px">(green = correct)</span></th>
          <th></th>
        </tr>
      </thead>
      <tbody>${makeRows(entries, isPending)}</tbody>
    </table>`;

    let html = '';
    if (pending.length) {
      html += `<div class="rev-section-heading">To Review <span class="rev-count">${pending.length}</span></div>${makeTable(pending, true)}`;
    }
    if (revised.length) {
      html += `<div class="rev-section-heading rev-section-heading--revised" style="margin-top:28px">Revised <span class="rev-count rev-count--revised">${revised.length}</span></div>${makeTable(revised, false)}`;
    }

      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p class="error-msg">Error rendering revision questions: ${escHtml(err.message)}. Try clearing and re-adding.</p>`;
    }
  }

  // Subject filter chip handler for revision tab
  document.querySelectorAll('#revision-subject-filters .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      revisionSubjectFilter = btn.dataset.subject;
      document.querySelectorAll('#revision-subject-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.subject === revisionSubjectFilter));
      renderRevisionTab();
    });
  });

  // Single delegated Explain click handler on the revision container
  document.getElementById('revision-container').addEventListener('click', e => {
    const btn = e.target.closest('.btn--explain');
    if (btn && btn.dataset.qimg) ExplanationModal.open(btn.dataset.qimg);
  });

  window.removeRevisionQ = (idx) => {
    const list = getRevisionList();
    list.splice(idx, 1);
    localStorage.setItem(REVISION_KEY, JSON.stringify(list));
    renderRevisionTab();
  };

  window.markAsRevised = (idx) => {
    const list = getRevisionList();
    if (list[idx]) { list[idx].revised = true; }
    localStorage.setItem(REVISION_KEY, JSON.stringify(list));
    renderRevisionTab();
  };

  window.unmarkRevised = (idx) => {
    const list = getRevisionList();
    if (list[idx]) { list[idx].revised = false; }
    localStorage.setItem(REVISION_KEY, JSON.stringify(list));
    renderRevisionTab();
  };

  document.getElementById('btn-clear-revision').addEventListener('click', () => {
    if (confirm('Remove all revision questions? This cannot be undone.')) {
      localStorage.removeItem(REVISION_KEY);
      renderRevisionTab();
    }
  });

  // ── Question Bank tab ────────────────────────────────────────────────────
  let qbankCache = null;          // [{ questionImage, optionImages, optionsInQuestion, questionType, correctAnswer, sectionId, examId, examTitle, globalIndex }]
  let qbankSubjectFilter = 'all';
  let qbankStatusFilter  = 'all';
  let qbankPage = 1;
  const QBANK_PAGE_SIZE = 25;

  function getUnderstoodSet() {
    try {
      const raw = JSON.parse(localStorage.getItem(UNDERSTOOD_KEY)) || [];
      return new Set(raw);
    } catch { return new Set(); }
  }

  function toggleUnderstood(qimg) {
    const set = getUnderstoodSet();
    if (set.has(qimg)) set.delete(qimg); else set.add(qimg);
    localStorage.setItem(UNDERSTOOD_KEY, JSON.stringify(Array.from(set)));
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
        const data = await r.json();
        return { exam, data };
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

  async function renderQuestionBankTab() {
    const container = document.getElementById('qbank-container');
    const summary   = document.getElementById('qbank-summary');
    const pagination = document.getElementById('qbank-pagination');

    if (!qbankCache) container.innerHTML = '<p class="loading-msg">Loading question bank&hellip;</p>';

    let all;
    try {
      all = await loadQuestionBank();
    } catch (err) {
      container.innerHTML = `<p class="error-msg">Could not load question bank: ${escHtml(err.message)}</p>`;
      return;
    }

    const understood = getUnderstoodSet();
    const revisionImgs = new Set(getRevisionList().map(r => r.q && r.q.questionImage).filter(Boolean));

    const subjectMatches = q =>
      qbankSubjectFilter === 'all' || (q.sectionId || '').toLowerCase() === qbankSubjectFilter;
    const statusMatches = q => {
      if (qbankStatusFilter === 'all') return true;
      const isUnderstood = understood.has(q.questionImage);
      return qbankStatusFilter === 'understood' ? isUnderstood : !isUnderstood;
    };

    const filtered = all.filter(q => subjectMatches(q) && statusMatches(q));

    const totalPages = Math.max(1, Math.ceil(filtered.length / QBANK_PAGE_SIZE));
    if (qbankPage > totalPages) qbankPage = totalPages;

    summary.innerHTML = `Showing <strong>${filtered.length}</strong> question${filtered.length === 1 ? '' : 's'}
      &middot; <span style="color:#2e7d32">${filtered.filter(q => understood.has(q.questionImage)).length} understood</span>
      &middot; <span style="color:#888">${filtered.filter(q => !understood.has(q.questionImage)).length} yet to read</span>`;

    if (!filtered.length) {
      container.innerHTML = '<p class="loading-msg">No questions match these filters.</p>';
      pagination.innerHTML = '';
      return;
    }

    const start = (qbankPage - 1) * QBANK_PAGE_SIZE;
    const slice = filtered.slice(start, start + QBANK_PAGE_SIZE);

    const rows = slice.map(item => {
      const qimg = escHtml(item.questionImage);
      const opts = item.optionImages.map((src, idx2) => {
        const k = String(idx2 + 1);
        const cls = k === item.correctAnswer ? 'rev-opt rev-opt--correct' : 'rev-opt';
        return `<div class="${cls}"><span class="rev-opt-num">${k}</span><img src="${escHtml(src)}" class="rev-opt-img" alt="Option ${k}" loading="lazy"></div>`;
      }).join('');

      const isUnderstood = understood.has(item.questionImage);
      const isInRevision = revisionImgs.has(item.questionImage);
      const understoodCls = isUnderstood ? 'btn--understood--marked' : '';
      const understoodLabel = isUnderstood ? '&#10003; Understood' : 'Understood';
      const revisionLabel = isInRevision ? '&#10003; In Revision' : '&#128278; Revision';

      return `<tr>
        <td class="rev-meta-cell">
          <div class="rev-meta">${escHtml(item.examTitle || item.examId || '')}</div>
          <div class="rev-qnum">${escHtml((item.sectionId || '').toUpperCase())} &middot; Q${item.globalIndex != null ? item.globalIndex + 1 : '?'}</div>
        </td>
        <td class="rev-question-cell"><img src="${qimg}" alt="Question" class="rev-question-img" loading="lazy"></td>
        <td class="rev-options-cell"><div class="rev-opts-grid">${opts}</div></td>
        <td class="rev-remove-cell">
          <button class="btn btn--explain btn--xs" data-qimg="${qimg}">&#128218; Explain</button><br>
          <button class="btn btn--revision btn--xs" style="margin-top:4px${isInRevision ? ';background:#1565c0;color:#fff' : ''}" data-qbank-revision="${qimg}" title="Mark for Revision">${revisionLabel}</button><br>
          <button class="btn btn--understood btn--xs ${understoodCls}" style="margin-top:4px" data-qbank-understood="${qimg}" title="Toggle understood">${understoodLabel}</button>
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

    // Pagination controls
    const pageNums = [];
    const maxNumsShown = 7;
    let from = Math.max(1, qbankPage - 3);
    let to   = Math.min(totalPages, from + maxNumsShown - 1);
    from = Math.max(1, Math.min(from, to - maxNumsShown + 1));
    for (let p = from; p <= to; p++) pageNums.push(p);

    pagination.innerHTML = `
      <button class="qbank-page-btn" data-page="prev" ${qbankPage === 1 ? 'disabled' : ''}>‹ Prev</button>
      ${pageNums.map(p => `<button class="qbank-page-btn ${p === qbankPage ? 'qbank-page-btn--active' : ''}" data-page="${p}">${p}</button>`).join('')}
      <button class="qbank-page-btn" data-page="next" ${qbankPage === totalPages ? 'disabled' : ''}>Next ›</button>
      <span class="qbank-page-info">Page ${qbankPage} of ${totalPages}</span>
    `;
  }

  // Filter chip handlers for Question Bank
  document.querySelectorAll('#qbank-subject-filters .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      qbankSubjectFilter = btn.dataset.subject;
      qbankPage = 1;
      document.querySelectorAll('#qbank-subject-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.subject === qbankSubjectFilter));
      renderQuestionBankTab();
    });
  });
  document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      qbankStatusFilter = btn.dataset.status;
      qbankPage = 1;
      document.querySelectorAll('#qbank-status-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.status === qbankStatusFilter));
      renderQuestionBankTab();
    });
  });

  // Pagination + action handlers (event delegation)
  document.getElementById('qbank-pagination').addEventListener('click', e => {
    const btn = e.target.closest('.qbank-page-btn');
    if (!btn || btn.disabled) return;
    const p = btn.dataset.page;
    if (p === 'prev') qbankPage = Math.max(1, qbankPage - 1);
    else if (p === 'next') qbankPage++;
    else qbankPage = parseInt(p, 10) || qbankPage;
    renderQuestionBankTab();
  });

  document.getElementById('qbank-container').addEventListener('click', e => {
    const explainBtn = e.target.closest('.btn--explain');
    if (explainBtn && explainBtn.dataset.qimg) {
      ExplanationModal.open(explainBtn.dataset.qimg);
      return;
    }
    const understoodBtn = e.target.closest('[data-qbank-understood]');
    if (understoodBtn) {
      toggleUnderstood(understoodBtn.dataset.qbankUnderstood);
      renderQuestionBankTab();
      return;
    }
    const revisionBtn = e.target.closest('[data-qbank-revision]');
    if (revisionBtn) {
      toggleQbankRevision(revisionBtn.dataset.qbankRevision);
      renderQuestionBankTab();
      return;
    }
  });

  function toggleQbankRevision(qimg) {
    if (!qbankCache) return;
    const item = qbankCache.find(x => x.questionImage === qimg);
    if (!item) return;
    const list = getRevisionList();
    const existingIdx = list.findIndex(r => r.q && r.q.questionImage === qimg);
    if (existingIdx >= 0) {
      list.splice(existingIdx, 1);
    } else {
      list.push({ examId: item.examId, examTitle: item.examTitle, q: item.q });
    }
    localStorage.setItem(REVISION_KEY, JSON.stringify(list));
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
