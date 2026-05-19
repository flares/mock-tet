/**
 * PaletteRenderer — builds and updates the right-side question palette.
 */
const PaletteRenderer = (() => {
  let _container = null;
  let _navigateFn = null;
  let _getStatusFn = null;

  function render(container, examData, getStatusFn, navigateFn) {
    _container = container;
    _navigateFn = navigateFn;
    _getStatusFn = getStatusFn;

    let html = '';

    for (const section of examData.sections) {
      html += `<div class="palette-section">
        <div class="palette-section__header">${section.name}</div>
        <div class="palette-section__grid">`;
      for (let i = 0; i < section.questionCount; i++) {
        const idx = section.startIndex + i;
        const status = getStatusFn(idx);
        html += `<button
          class="palette-btn"
          data-index="${idx}"
          data-status="${status}"
          title="Question ${idx + 1}"
          aria-label="Question ${idx + 1}"
        >${idx + 1}</button>`;
      }
      html += `</div></div>`;
    }

    // Legend
    html += `<div class="palette-legend">
      <div class="palette-legend__title">Legend</div>
      <div class="legend-item"><span class="legend-dot legend-dot--not-visited"></span>Not Visited</div>
      <div class="legend-item"><span class="legend-dot legend-dot--not-answered"></span>Not Answered</div>
      <div class="legend-item"><span class="legend-dot legend-dot--answered"></span>Answered</div>
      <div class="legend-item"><span class="legend-dot legend-dot--marked"></span>Marked for Review</div>
      <div class="legend-item"><span class="legend-dot legend-dot--answered-marked"></span>Answered &amp; Marked</div>
    </div>`;

    container.innerHTML = html;

    // Event delegation — single listener for all palette buttons
    container.addEventListener('click', e => {
      const btn = e.target.closest('.palette-btn');
      if (btn) navigateFn(parseInt(btn.dataset.index, 10));
    });
  }

  function updateButton(globalIndex, status) {
    if (!_container) return;
    const btn = _container.querySelector(`.palette-btn[data-index="${globalIndex}"]`);
    if (btn) btn.dataset.status = status;
  }

  function highlightCurrent(globalIndex) {
    if (!_container) return;
    _container.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('palette-btn--current'));
    const btn = _container.querySelector(`.palette-btn[data-index="${globalIndex}"]`);
    if (btn) {
      btn.classList.add('palette-btn--current');
      // Scroll the button into view within the palette panel
      btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  return { render, updateButton, highlightCurrent };
})();
