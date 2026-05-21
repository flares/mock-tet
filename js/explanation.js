/**
 * explanation.js — shared module that loads a question's explanation HTML
 * from its metadata.json and renders it inside a <dialog>.
 *
 * Each page using this module must include a single
 *   <dialog id="explanation-dialog"> ... </dialog>
 * element. The module wires the close button on first call.
 *
 * Public API:
 *   ExplanationModal.open(questionImage)
 *     - questionImage: path like "question_bank/CDP/<folder>/question.png"
 *     - Fetches sibling metadata.json, injects explanation.html_text into
 *       the dialog body, and calls showModal().
 *     - If no explanation key exists, the body is left empty (per project
 *       norm: all questions will eventually have explanations).
 */
(function (global) {
  let dialog = null;
  let bodyEl = null;
  let confEl = null;
  let titleEl = null;
  let initialized = false;

  function ensureInit() {
    if (initialized) return;
    dialog = document.getElementById('explanation-dialog');
    if (!dialog) return;
    bodyEl = dialog.querySelector('.explanation-dialog__body');
    confEl = dialog.querySelector('.explanation-dialog__conf');
    titleEl = dialog.querySelector('.explanation-dialog__header-title');
    const closeBtn = dialog.querySelector('.explanation-dialog__close');
    if (closeBtn) closeBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => {
      if (e.target === dialog) dialog.close();
    });
    initialized = true;
  }

  function metadataPathFor(questionImage) {
    if (!questionImage) return null;
    const lastSlash = questionImage.lastIndexOf('/');
    if (lastSlash < 0) return null;
    return questionImage.substring(0, lastSlash) + '/metadata.json';
  }

  async function open(questionImage) {
    ensureInit();
    if (!dialog) {
      console.error('explanation-dialog element not found on page');
      return;
    }
    bodyEl.innerHTML = '<p class="explanation-dialog__loading">Loading…</p>';
    confEl.textContent = '';
    if (titleEl) titleEl.textContent = 'Explanation';
    dialog.showModal();

    const path = metadataPathFor(questionImage);
    if (!path) {
      bodyEl.innerHTML = '';
      return;
    }
    try {
      const resp = await fetch(path);
      if (!resp.ok) {
        bodyEl.innerHTML = '';
        return;
      }
      const data = await resp.json();
      const exp = data && data.explanation;
      if (exp && typeof exp.html_text === 'string') {
        bodyEl.innerHTML = exp.html_text;
        if (typeof exp['confidence-level'] === 'number') {
          confEl.textContent = `Confidence: ${exp['confidence-level']}/10`;
        }
      } else {
        bodyEl.innerHTML = '';
      }
    } catch (err) {
      bodyEl.innerHTML = '';
    }
  }

  global.ExplanationModal = { open };
})(window);
