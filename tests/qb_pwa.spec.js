// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Mock data ───────────────────────────────────────────────────────────────

const WORKER_URL = 'https://tet-qb-worker.y-manojkrishna.workers.dev';

// Two streams, both under the TGTET type, on two different papers.
const MS_BANK = 'tgtet_maths_science_telugu';        // Paper 2A — the default/legacy stream
const P1_BANK = 'tgtet_paper1';                       // Paper 1 — a second stream

/**
 * Build a single qb_index entry.
 * @param {string} bank        tet_bank the question belongs to
 * @param {string} sectionId   lowercase section id (must match the stream's manifest sections)
 * @param {string} subjectDir  question_bank subject folder name (for the path/key)
 * @param {number} n           1-based question number (drives the unique id / path)
 */
function mkQ(bank, sectionId, subjectDir, n) {
  const pad    = String(n).padStart(3, '0');
  const id     = String(n).repeat(10);
  const folder = `2024-May-20-Shift1_Q${pad}_${id}`;
  return {
    questionImage:    `question_bank/${subjectDir}/${folder}/question.png`,
    optionsInQuestion: false,
    questionType:     'image',
    correctAnswer:    '1',
    sectionId,
    examId:    'real-2024-May-20-Shift1',
    examTitle: '20 May 2024 — Shift 1',
    globalIndex: n - 1,
    tet_type:  'TGTET',
    stream:    bank === MS_BANK ? 'Maths_Science_Telugu' : 'Paper1',
    tet_bank:  bank,
    spriteUrl: `${WORKER_URL}/qb/${bank}/Q${id}_sprite.png`,
    sprite: {
      question: { y: 0,   h: 50, w: 100 },
      option1:  { y: 50,  h: 30, w: 100 },
      option2:  { y: 80,  h: 30, w: 100 },
      option3:  { y: 110, h: 30, w: 100 },
      option4:  { y: 140, h: 30, w: 100 },
    },
  };
}

/** MS stream (Paper 2A): 8 questions — 3 CDP, 3 Mathematics, 2 Science. */
const MS_INDEX = [
  mkQ(MS_BANK, 'cdp',         'CDP',         1),
  mkQ(MS_BANK, 'cdp',         'CDP',         2),
  mkQ(MS_BANK, 'cdp',         'CDP',         3),
  mkQ(MS_BANK, 'mathematics', 'Mathematics', 4),
  mkQ(MS_BANK, 'mathematics', 'Mathematics', 5),
  mkQ(MS_BANK, 'mathematics', 'Mathematics', 6),
  mkQ(MS_BANK, 'science',     'Science',     7),
  mkQ(MS_BANK, 'science',     'Science',     8),
];

/** Paper 1 stream: 5 questions — 3 CDP, 2 EVS (Environmental Studies). */
const P1_INDEX = [
  mkQ(P1_BANK, 'cdp', 'CDP', 11),
  mkQ(P1_BANK, 'cdp', 'CDP', 12),
  mkQ(P1_BANK, 'cdp', 'CDP', 13),
  mkQ(P1_BANK, 'evs', 'EVS', 14),
  mkQ(P1_BANK, 'evs', 'EVS', 15),
];

// Manifest tree: one TET (TGTET), two papers (2A, 1), one stream each.
const MOCK_MANIFEST = {
  version: 1,
  generatedAt: '2024-05-20T00:00:00Z',
  tets: [
    {
      tet_type: 'TGTET',
      label: 'TG TET',
      papers: [
        {
          paper: '2A',
          label: 'Paper 2A',
          streams: [
            {
              tet_bank: MS_BANK,
              stream: 'Maths_Science_Telugu',
              label: 'Maths/Science · Telugu',
              language: 'Telugu',
              sections: [
                { id: 'cdp',         name: 'CDP' },
                { id: 'telugu',      name: 'Telugu' },
                { id: 'english',     name: 'English' },
                { id: 'mathematics', name: 'Mathematics' },
                { id: 'science',     name: 'Science' },
              ],
              paper_count: 21,
              question_count: 3150,
              index: `exams/qb_index_${MS_BANK}.json`,
            },
          ],
        },
        {
          paper: '1',
          label: 'Paper 1',
          streams: [
            {
              tet_bank: P1_BANK,
              stream: 'Paper1',
              label: 'Classes I–V',
              language: 'Telugu',
              sections: [
                { id: 'cdp',     name: 'CDP' },
                { id: 'evs',     name: 'Environmental Studies' },
                { id: 'english', name: 'English' },
              ],
              paper_count: 7,
              question_count: 1050,
              index: `exams/qb_index_${P1_BANK}.json`,
            },
          ],
        },
      ],
    },
  ],
};

// 1×1 transparent PNG — satisfies any <img src> without a real file
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function mockRoutes(page) {
  // Multi-stream manifest (TET → Paper → Stream tree)
  await page.route('**/exams/qb_manifest.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_MANIFEST) }),
  );
  // Per-stream indices
  await page.route(`**/exams/qb_index_${MS_BANK}.json`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MS_INDEX) }),
  );
  await page.route(`**/exams/qb_index_${P1_BANK}.json`, route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(P1_INDEX) }),
  );
  // CBT exam manifest (unrelated to the PWA, but harmless to stub)
  await page.route('**/exams/manifest.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ papers: [] }) }),
  );
  // Intercept the Cloudflare Worker: serve PNG for sprite images, JSON for everything else
  await page.route('**tet-qb-worker**', route => {
    if (route.request().url().includes('/qb/')) {
      route.fulfill({ contentType: 'image/png', body: BLANK_PNG });
    } else {
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schemaVersion: '1.0', questionIds: [] }) });
    }
  });
  // Return a blank image for every question/option asset
  await page.route('**/question_bank/**', route =>
    route.fulfill({ contentType: 'image/png', body: BLANK_PNG }),
  );
}

/**
 * Seed localStorage before page scripts run, then navigate and wait for load.
 * By default the MS stream is pre-selected so the app skips the first-load picker
 * and goes straight to browsing. Pass `selectBank: null` to leave it unselected
 * (so the picker auto-opens on first load).
 *
 * v0.4.3 added "picker-on-fresh-open": the picker is skipped only when BOTH
 * `qb_selected_bank` AND `qb_pos_v1:<bank>` are set in localStorage. Tests that
 * want to land directly in browse mode must seed both keys.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ understood?: string[], revision?: object[], selectBank?: string|null }} opts
 */
async function loadApp(page, { understood = [], revision = [], selectBank = MS_BANK } = {}) {
  // Seed a saved position so initStreams bypasses the picker for the chosen bank.
  const posVal = selectBank === MS_BANK ? MS_INDEX[0].questionImage
               : selectBank === P1_BANK ? P1_INDEX[0].questionImage
               : null;

  await page.addInitScript(({ u, r, bank, pos }) => {
    // Wipe per-stream / manifest caches so the mocked routes are always hit fresh
    Object.keys(localStorage)
      .filter(k => k.startsWith('qb_index_cache_') || k === 'qb_manifest_cache_v1')
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem('tet_understood_questions', JSON.stringify(u));
    localStorage.setItem('tet_revision_questions',  JSON.stringify(r));
    if (bank) {
      localStorage.setItem('qb_selected_bank', bank);
      if (pos) localStorage.setItem(`qb_pos_v1:${bank}`, pos);
    } else {
      localStorage.removeItem('qb_selected_bank');
    }
  }, { u: understood, r: revision, bank: selectBank, pos: posVal });

  await page.goto('/qb_pwa.html');

  if (selectBank !== null) {
    // Wait until the progress counter has live data (changes from '—' to 'N / M')
    await expect(page.locator('#pwa-progress-count')).not.toHaveText('—', { timeout: 8000 });
  } else {
    // No bank: the picker opens instead — wait for it to appear
    await expect(page.locator('#pwa-stream-picker')).toBeVisible({ timeout: 8000 });
  }
}

/** Open the subject dropdown and select a subject (items are built dynamically per stream). */
async function selectSubject(page, subject) {
  await page.click('#pwa-subject-btn');
  await page.click(`.pwa-dd-item[data-subject="${subject}"]`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('stream picker (first load)', () => {
  test.beforeEach(async ({ page }) => {
    await mockRoutes(page);
  });

  test('auto-opens when no stream is saved, lists streams with paper counts, and confirming enters the stream', async ({ page }) => {
    await loadApp(page, { selectBank: null });

    const picker = page.locator('#pwa-stream-picker');
    await expect(picker).toBeVisible();

    // Stream dropdown lists each stream with its (smaller) paper count.
    await page.click('#sp-stream-btn');
    const msOption = page.locator('.sp-dd-opt', { hasText: 'Maths/Science · Telugu' });
    await expect(msOption).toContainText('21 papers');
    // The stream panel uses position:fixed and covers the button, so clicking the button
    // again to close fails (panel intercepts the hit). Instead click the active option —
    // any sp-dd-opt click calls spCloseDD() and closes the panel.
    await msOption.click();

    // Switch to Paper 1 — the stream cascades to the (only) Paper 1 stream.
    await page.click('#sp-paper-btn');
    await page.click('.sp-dd-opt[data-paper="1"]');
    await expect(page.locator('#sp-stream-val')).toHaveText('Classes I–V');

    await page.click('#sp-stream-btn');
    const p1Option = page.locator('.sp-dd-opt', { hasText: 'Classes I–V' });
    await expect(p1Option).toContainText('7 papers');
    await p1Option.click();   // close the panel (same reason as above)

    // Summary reflects the selected (Paper 1) stream.
    await expect(page.locator('#sp-summary')).toContainText('1,050');

    // Confirm → picker closes and we enter the Paper 1 stream (5 questions, EVS subject).
    await page.click('#sp-confirm');
    await expect(picker).toBeHidden();
    await expect(page.locator('#pwa-stream-name')).toHaveText('Classes I–V');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 5');
  });

  test('does NOT open when a stream is already saved', async ({ page }) => {
    await loadApp(page);  // seeds MS_BANK by default
    await expect(page.locator('#pwa-stream-picker')).toBeHidden();
    await expect(page.locator('#pwa-stream-name')).toHaveText('Maths/Science · Telugu');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');
  });
});

test.describe('switching streams via the picker', () => {
  test.beforeEach(async ({ page }) => {
    await mockRoutes(page);
  });

  test('re-scopes progress total and rebuilds the subject dropdown', async ({ page }) => {
    await loadApp(page);  // start in the MS stream (8 questions)
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');

    // MS stream has Science but not EVS.
    await page.click('#pwa-subject-btn');
    await expect(page.locator('.pwa-dd-item[data-subject="science"]')).toHaveCount(1);
    await expect(page.locator('.pwa-dd-item[data-subject="evs"]')).toHaveCount(0);
    await page.click('#pwa-subject-btn');  // close the dropdown again

    // Open the switcher and move to Paper 1.
    await page.click('#pwa-stream-btn');
    await expect(page.locator('#pwa-stream-picker')).toBeVisible();
    await page.click('#sp-paper-btn');
    await page.click('.sp-dd-opt[data-paper="1"]');
    await page.click('#sp-confirm');

    // Progress total re-scopes to the Paper 1 stream's 5 questions.
    await expect(page.locator('#pwa-stream-name')).toHaveText('Classes I–V');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 5');

    // Subject dropdown is rebuilt: EVS now present, Science gone.
    await page.click('#pwa-subject-btn');
    await expect(page.locator('.pwa-dd-item[data-subject="evs"]')).toHaveCount(1);
    await expect(page.locator('.pwa-dd-item[data-subject="science"]')).toHaveCount(0);

    // The new subject filter works within the new stream (2 EVS questions).
    await page.click('.pwa-dd-item[data-subject="evs"]');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 2');
  });
});

test.describe('subject filter — progress count (top-right)', () => {
  test.beforeEach(async ({ page }) => {
    await mockRoutes(page);
    await loadApp(page);
  });

  test('all subjects: shows 0 / 8 on clean load', async ({ page }) => {
    await expect(page.locator('#pwa-progress-count')).toContainText('0');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');
  });

  test('CDP filter: scopes total to 3', async ({ page }) => {
    await selectSubject(page, 'cdp');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');
  });

  test('Mathematics filter: scopes total to 3', async ({ page }) => {
    await selectSubject(page, 'mathematics');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');
  });

  test('Science filter: scopes total to 2', async ({ page }) => {
    await selectSubject(page, 'science');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 2');
  });

  test('flipping subjects updates count each time', async ({ page }) => {
    await selectSubject(page, 'cdp');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    await selectSubject(page, 'science');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 2');

    await selectSubject(page, 'mathematics');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    await selectSubject(page, 'all');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');
  });
});

test.describe('mark for review', () => {
  test.beforeEach(async ({ page }) => {
    await mockRoutes(page);
    await loadApp(page);
  });

  test('marks question and shows count badge on chip', async ({ page }) => {
    await page.click('#pwa-fab-revision');
    await expect(page.locator('#pwa-fab-revision')).toHaveClass(/marked/);
    await expect(page.locator('#chip-count-review')).toHaveText('1');
  });

  test('toggling off removes the count badge', async ({ page }) => {
    await page.click('#pwa-fab-revision');
    await expect(page.locator('#chip-count-review')).toHaveText('1');
    await page.click('#pwa-fab-revision');
    await expect(page.locator('#pwa-fab-revision')).not.toHaveClass(/marked/);
    await expect(page.locator('#chip-count-review')).toHaveText('');
  });

  test('review counts toward progress scopedDone', async ({ page }) => {
    await page.click('#pwa-fab-revision');
    // progress should change from '0 / 8' to '1 / 8'
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');
  });

  test('chip count is scoped to active subject filter', async ({ page }) => {
    // Mark Q1 (CDP) for review while on all-subjects
    await page.click('#pwa-fab-revision');
    await expect(page.locator('#chip-count-review')).toHaveText('1');

    // Switch to Mathematics — no reviewed Math questions
    await selectSubject(page, 'mathematics');
    await expect(page.locator('#chip-count-review')).toHaveText('');
    await expect(page.locator('#pwa-progress-count')).toContainText('0');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    // Switch to CDP — reviewed question is back in scope
    await selectSubject(page, 'cdp');
    await expect(page.locator('#chip-count-review')).toHaveText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');
  });
});

test.describe('mark as understood', () => {
  test.beforeEach(async ({ page }) => {
    await mockRoutes(page);
    await loadApp(page);
  });

  test('marks question and shows count badge on chip', async ({ page }) => {
    await page.click('#pwa-fab-understood');
    await expect(page.locator('#pwa-fab-understood')).toHaveClass(/marked/);
    await expect(page.locator('#chip-count-understood')).toHaveText('1');
  });

  test('toggling off removes the count badge', async ({ page }) => {
    await page.click('#pwa-fab-understood');
    await expect(page.locator('#chip-count-understood')).toHaveText('1');
    await page.click('#pwa-fab-understood');
    await expect(page.locator('#pwa-fab-understood')).not.toHaveClass(/marked/);
    await expect(page.locator('#chip-count-understood')).toHaveText('');
  });

  test('understood counts toward progress scopedDone', async ({ page }) => {
    await page.click('#pwa-fab-understood');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');
  });

  test('chip count is scoped to active subject filter', async ({ page }) => {
    // Mark Q1 (CDP) as understood while on all-subjects
    await page.click('#pwa-fab-understood');
    await expect(page.locator('#chip-count-understood')).toHaveText('1');

    // Switch to Science — no understood Science questions
    await selectSubject(page, 'science');
    await expect(page.locator('#chip-count-understood')).toHaveText('');
    await expect(page.locator('#pwa-progress-count')).toContainText('0');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 2');

    // Switch back to CDP — count returns
    await selectSubject(page, 'cdp');
    await expect(page.locator('#chip-count-understood')).toHaveText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');
  });
});

test.describe('pre-seeded state from localStorage', () => {
  test('understood questions across subjects show correct scoped counts', async ({ page }) => {
    const cdpQ1  = MS_INDEX[0].questionImage;  // CDP
    const mathQ1 = MS_INDEX[3].questionImage;  // Mathematics

    await mockRoutes(page);
    await loadApp(page, { understood: [cdpQ1, mathQ1] });

    // All subjects: 2 understood out of 8
    await expect(page.locator('#chip-count-understood')).toHaveText('2');
    await expect(page.locator('#pwa-progress-count')).toContainText('2');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');

    // CDP: 1 understood out of 3
    await selectSubject(page, 'cdp');
    await expect(page.locator('#chip-count-understood')).toHaveText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    // Mathematics: 1 understood out of 3
    await selectSubject(page, 'mathematics');
    await expect(page.locator('#chip-count-understood')).toHaveText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    // Science: 0 understood out of 2
    await selectSubject(page, 'science');
    await expect(page.locator('#chip-count-understood')).toHaveText('');
    await expect(page.locator('#pwa-progress-count')).toContainText('0');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 2');
  });

  test('revision questions across subjects show correct scoped counts', async ({ page }) => {
    const cdpQ2     = MS_INDEX[1];  // CDP Q2
    const scienceQ1 = MS_INDEX[6];  // Science Q1

    // Revision list format: { examId, examTitle, q: <question object> }
    const revision = [
      { examId: cdpQ2.examId, examTitle: cdpQ2.examTitle, q: cdpQ2 },
      { examId: scienceQ1.examId, examTitle: scienceQ1.examTitle, q: scienceQ1 },
    ];

    await mockRoutes(page);
    await loadApp(page, { revision });

    // All subjects: 2 in-review, scopedDone = 2
    await expect(page.locator('#chip-count-review')).toHaveText('2');
    await expect(page.locator('#pwa-progress-count')).toContainText('2');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 8');

    // CDP: 1 in-review out of 3
    await selectSubject(page, 'cdp');
    await expect(page.locator('#chip-count-review')).toHaveText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    // Mathematics: 0 in-review out of 3
    await selectSubject(page, 'mathematics');
    await expect(page.locator('#chip-count-review')).toHaveText('');
    await expect(page.locator('#pwa-progress-count')).toContainText('0');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 3');

    // Science: 1 in-review out of 2
    await selectSubject(page, 'science');
    await expect(page.locator('#chip-count-review')).toHaveText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('1');
    await expect(page.locator('#pwa-progress-count')).toContainText('/ 2');
  });
});
