/**
 * QuestionRenderer — renders a question and its options into the DOM.
 */
const QuestionRenderer = (() => {
  let _cardEl = null;
  let _onSelectCb = null;
  let _currentQuestion = null;

  function init(questionCardEl, onSelect) {
    _cardEl = questionCardEl;
    _onSelectCb = onSelect;
  }

  function render(question, selectedKey) {
    _currentQuestion = question;
    const q = question;

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

    // Bind option selection
    _cardEl.querySelectorAll('.option-item').forEach(label => {
      label.addEventListener('click', () => {
        const key = label.dataset.key;
        // Update visual selection
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

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init, render, clearSelection };
})();
