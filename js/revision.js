const SUBJECT_META = {
  cdp:         { label: 'CDP',         color: '#1565c0', bg: '#e3f2fd' },
  telugu:      { label: 'Telugu',      color: '#bf360c', bg: '#fbe9e7' },
  english:     { label: 'English',     color: '#2e7d32', bg: '#e8f5e9' },
  mathematics: { label: 'Math',        color: '#6a1b9a', bg: '#f3e5f5' },
  science:     { label: 'Science',     color: '#00695c', bg: '#e0f2f1' },
};

const REVISION_KEY  = 'tet_revision_questions';

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function applySubjectChipColors() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    const key = (chip.dataset.subject || '').toLowerCase();
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

function getRevisionList() {
  try { return JSON.parse(localStorage.getItem(REVISION_KEY)) || []; } catch { return []; }
}

function questionSubject(item) {
  const q = item && item.q;
  if (q && q.sectionId) return String(q.sectionId).toLowerCase();
  if (item && item.examId && item.examId.includes(':')) {
    return item.examId.split(':').pop().toLowerCase();
  }
  return '';
}

let revisionSubjectFilter = 'all';

function renderRevision() {
  const container = document.getElementById('revision-container');
  const toolbar   = document.getElementById('revision-toolbar');
  const allItems  = getRevisionList();

  if (!allItems.length) {
    toolbar.style.display = 'none';
    container.innerHTML = '<p class="loading-msg">No questions marked for revision yet. Use the <strong>Mark for Revision</strong> button inside any exam (Practice Mode must be on).</p>';
    return;
  }

  toolbar.style.display = '';

  try {
    const indexed = allItems.map((item, i) => ({ item, i }));
    const filtered = revisionSubjectFilter === 'all'
      ? indexed
      : indexed.filter(({ item }) => questionSubject(item) === revisionSubjectFilter);

    if (!filtered.length) {
      container.innerHTML = '<p class="loading-msg">No revision questions match this subject filter.</p>';
      return;
    }

    const pending = filtered.filter(({ item }) => !item.revised);
    const revised = filtered.filter(({ item }) => item.revised);

    const makeRows = (entries, isPending) => entries.map(({ item, i }, rowNum) => {
      const q = item.q;
      if (!q) return '';
      const isImg = q.questionType === 'image';

      const sourceHtml = `<div class="rev-source-label">${escHtml(item.examTitle || item.examId || '')} &middot; ${escHtml((q.sectionId || '').toUpperCase())} &middot; Q${q.globalIndex != null ? q.globalIndex + 1 : '?'}</div>`;

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
        ? `<div class="rev-action-row">${explainBtn}<button class="btn btn--revision-done btn--xs" onclick="markAsRevised(${i})">&#10003; Revised</button></div>`
        : `<div class="rev-action-row"><button class="btn btn--ghost btn--xs" onclick="unmarkRevised(${i})">&#8617; Review</button><button class="btn btn--ghost btn--xs" onclick="removeRevisionQ(${i})">&#10005;</button></div>`;

      return `<tr>
        <td class="rev-idx-cell">${rowNum + 1}</td>
        <td class="rev-content-cell">
          ${sourceHtml}
          ${questionHtml}
          <div class="rev-opts-stack">${optionsHtml}</div>
        </td>
        <td class="rev-actions-cell">${actionCell}</td>
      </tr>`;
    }).join('');

    const makeTable = (entries, isPending) => `<table class="rev-table rev-table--new">
      <thead>
        <tr>
          <th class="rev-idx-cell">#</th>
          <th>Question <span style="color:#388e3c;font-size:11px;font-weight:400">(green = correct answer)</span></th>
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
      html += `
        <details class="rev-revised-details" style="margin-top:28px">
          <summary class="rev-section-heading rev-section-heading--revised">
            Revised <span class="rev-count rev-count--revised">${revised.length}</span>
          </summary>
          ${makeTable(revised, false)}
        </details>`;
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="error-msg">Error rendering revision questions: ${escHtml(err.message)}. Try clearing and re-adding.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applySubjectChipColors();
  renderRevision();

  document.querySelectorAll('#revision-subject-filters .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      revisionSubjectFilter = btn.dataset.subject;
      document.querySelectorAll('#revision-subject-filters .filter-chip').forEach(b =>
        b.classList.toggle('active', b.dataset.subject === revisionSubjectFilter));
      applySubjectChipColors();
      renderRevision();
    });
  });

  document.getElementById('revision-container').addEventListener('click', e => {
    const btn = e.target.closest('.btn--explain');
    if (!btn || !btn.dataset.qimg) return;
    const entry = getRevisionList().find(r => r.q && r.q.questionImage === btn.dataset.qimg);
    if (!entry) return;
    ExplanationModal.openFull(btn.dataset.qimg, {
      optionImages:      entry.q.optionImages   || [],
      correctAnswer:     entry.q.correctAnswer  || '',
      optionsInQuestion: !!entry.q.optionsInQuestion,
      revisionEntry:     entry,
    });
  });

  document.getElementById('btn-clear-revision').addEventListener('click', () => {
    if (confirm('Remove all revision questions? This cannot be undone.')) {
      localStorage.removeItem(REVISION_KEY);
      renderRevision();
    }
  });
});

window.removeRevisionQ = (idx) => {
  const list = getRevisionList();
  list.splice(idx, 1);
  localStorage.setItem(REVISION_KEY, JSON.stringify(list));
  renderRevision();
};

window.markAsRevised = (idx) => {
  const list = getRevisionList();
  if (list[idx]) list[idx].revised = true;
  localStorage.setItem(REVISION_KEY, JSON.stringify(list));
  renderRevision();
};

window.unmarkRevised = (idx) => {
  const list = getRevisionList();
  if (list[idx]) list[idx].revised = false;
  localStorage.setItem(REVISION_KEY, JSON.stringify(list));
  renderRevision();
};
