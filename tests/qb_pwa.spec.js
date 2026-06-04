// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Mock data ───────────────────────────────────────────────────────────────

const WORKER_URL = 'https://tet-qb-worker.y-manojkrishna.workers.dev';

function mkQ(sectionId, subjectDir, n) {
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
    stream:    'Maths_Science_Telugu',
    tet_bank:  'tgtet_maths_science_telugu',
    spriteUrl: `${WORKER_URL}/qb/tgtet_maths_science_telugu/Q${id}_sprite.png`,
    sprite: {
      question: { y: 0,   h: 50, w: 100 },
      option1:  { y: 50,  h: 30, w: 100 },
      option2:  { y: 80,  h: 30, w: 100 },
      option3:  { y: 110, h: 30, w: 100 },
      option4:  { y: 140, h: 30, w: 100 },
    },
  };
}

/** 8 questions: 3 CDP, 3 Mathematics, 2 Science — all from one paper */
const MOCK_INDEX = [
  mkQ('cdp',         'CDP',         1),
  mkQ('cdp',         'CDP',         2),
  mkQ('cdp',         'CDP',         3),
  mkQ('mathematics', 'Mathematics', 4),
  mkQ('mathematics', 'Mathematics', 5),
  mkQ('mathematics', 'Mathematics', 6),
  mkQ('science',     'Science',     7),
  mkQ('science',     'Science',     8),
];

// 1×1 transparent PNG — satisfies any <img src> without a real file
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function mockRoutes(page) {
  await page.route('**/exams/qb_index.json', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(MOCK_INDEX) }),
  );
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
 * @param {import('@playwright/test').Page} page
 * @param {{ understood?: string[], revision?: object[] }} opts
 */
async function loadApp(page, { understood = [], revision = [] } = {}) {
  await page.addInitScript(({ u, r }) => {
    localStorage.removeItem('qb_index_cache_v1');
    localStorage.setItem('tet_understood_questions', JSON.stringify(u));
    localStorage.setItem('tet_revision_questions',  JSON.stringify(r));
  }, { u: understood, r: revision });

  await page.goto('/qb_pwa.html');

  // Wait until the progress counter has live data (changes from '—' to 'N / M')
  await expect(page.locator('#pwa-progress-count')).not.toHaveText('—', { timeout: 8000 });
}

/** Open the subject dropdown and select a subject. */
async function selectSubject(page, subject) {
  await page.click('#pwa-subject-btn');
  await page.click(`.pwa-dd-item[data-subject="${subject}"]`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

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
    const cdpQ1  = MOCK_INDEX[0].questionImage;  // CDP
    const mathQ1 = MOCK_INDEX[3].questionImage;  // Mathematics

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
    const cdpQ2     = MOCK_INDEX[1];  // CDP Q2
    const scienceQ1 = MOCK_INDEX[6];  // Science Q1

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
