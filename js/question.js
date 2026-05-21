/**
 * QuestionRenderer — renders a question and its options into the DOM.
 * Supports both text questions and image-based questions (questionType === 'image').
 */
const QuestionRenderer = (() => {
  let _cardEl = null;
  let _onSelectCb = null;

  function init(questionCardEl, onSelect) {
    _cardEl = questionCardEl;
    _onSelectCb = onSelect;
  }

  function render(question, selectedKey) {
    if (question.questionType === 'image') {
      _renderImage(question, selectedKey);
    } else {
      _renderText(question, selectedKey);
    }
  }

  function _renderText(q, selectedKey) {
    const optionsHtml = q.options.map(opt => `
      <label class="option-item${selectedKey === opt.key ? ' selected' : ''}" data-key="${opt.key}">
        <input type="radio" name="option" value="${opt.key}" ${selectedKey === opt.key ? 'checked' : ''}>
        <span class="option-label">
          <span class="option-key">${opt.key}.</span> ${escHtml(opt.text)}
        </span>
      </label>`).join('');

    _cardEl.innerHTML = `
      <div class="question-card__number-bar">Question No. ${q.globalIndex + 1}</div>
      <div class="question-card__text">${escHtml(q.text)}</div>
      <div class="options-list">${optionsHtml}</div>
    `;

    _bindOptionClicks();
  }

  function _renderImage(q, selectedKey) {
    const KEYS = ['1', '2', '3', '4'];

    let optionRows = '';
    if (q.optionsInQuestion) {
      // Options are drawn inside the question image — show bare radio rows
      optionRows = KEYS.map(k => `
        <tr>
          <td class="img-q-opt-num">${k}</td>
          <td class="img-q-opt-cell">
            <label class="option-item option-item--img${selectedKey === k ? ' selected' : ''}" data-key="${k}">
              <input type="radio" name="option" value="${k}" ${selectedKey === k ? 'checked' : ''}>
              <span class="option-item--img__label">Option ${k}</span>
            </label>
          </td>
        </tr>`).join('');
    } else {
      optionRows = KEYS.map((k, i) => {
        const src = q.optionImages[i] || '';
        return `
        <tr>
          <td class="img-q-opt-num">${k}</td>
          <td class="img-q-opt-cell">
            <label class="option-item option-item--img${selectedKey === k ? ' selected' : ''}" data-key="${k}">
              <input type="radio" name="option" value="${k}" ${selectedKey === k ? 'checked' : ''}>
              <img src="${escHtml(src)}" alt="Option ${k}" class="option-img" loading="lazy">
            </label>
          </td>
        </tr>`;
      }).join('');
    }

    const discrepancyBanner = q.correctAnswer == null
      ? `<div class="discrepancy-banner">⚠️ Official discrepancy — full marks awarded to all candidates for this question.</div>`
      : '';

    _cardEl.innerHTML = `
      <div class="question-card__number-bar">Question No. ${q.globalIndex + 1}</div>
      ${discrepancyBanner}
      <table class="img-question-table">
        <tbody>
          <tr>
            <td colspan="2" class="img-q-question-cell">
              <img src="${escHtml(q.questionImage)}" alt="Question ${q.globalIndex + 1}" class="question-img" loading="lazy">
            </td>
          </tr>
          ${optionRows}
        </tbody>
      </table>
    `;

    _bindOptionClicks();
  }

  function _bindOptionClicks() {
    _cardEl.querySelectorAll('.option-item').forEach(label => {
      label.addEventListener('click', () => {
        const key = label.dataset.key;
        _cardEl.querySelectorAll('.option-item').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        label.querySelector('input').checked = true;
        _onSelectCb(key);
      });
    });
  }

  function clearSelection() {
    if (!_cardEl) return;
    _cardEl.querySelectorAll('.option-item').forEach(l => l.classList.remove('selected'));
    _cardEl.querySelectorAll('input[name="option"]').forEach(i => { i.checked = false; });
  }

  function showAnswer(correctAnswer) {
    if (!_cardEl || correctAnswer == null) return;
    _cardEl.querySelectorAll('.option-item').forEach(label => {
      if (label.dataset.key === String(correctAnswer)) {
        label.classList.add('option-correct');
      }
    });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init, render, clearSelection, showAnswer };
})();
