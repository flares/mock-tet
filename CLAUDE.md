# Mock TET — Project Intelligence

## What this project is

A static site on GitHub Pages that serves two distinct purposes:

1. **QB PWA** (`qb_pwa.html`) — the **primary focus**. An installable mobile PWA (iOS + Android) that lets TET candidates browse 3,150+ real-exam questions one at a time, with AI explanation, mark-understood / mark-for-revision tracking, subject filtering, and offline support. Images are rendered from R2-hosted sprites via canvas.

2. **Mock Test interface** (`exam.html`) — a pixel-faithful replica of the NTA CBT interface for practising the exam UI (navigation, timers, palette, submit flow). Secondary priority — functional but not the active development focus.

Target audience: CTET Paper 2 (Classes VI–VIII), Mathematics & Science stream. Multi-TET expansion planned (Task 7).

---

## Automated behaviour — read before every task

### Change logging rule (mandatory)

For every code or content change, prepend an entry to the **top** of `change_history.md` (newest first):
```
- YYYY-MM-DD HH:MM | vX.X.X | major|minor | one-line summary
```
Every commit must include a `change_history.md` update.

### Version rule (mandatory)

`APP_VERSION` is defined as a JS constant at the top of the `<script>` block in `qb_pwa.html`. **Increment it on every commit** using semver-light:
- `minor` change → bump patch (0.0.5 → 0.0.6)
- `major` change → bump minor (0.0.5 → 0.1.0)

The current version is `0.3.0`. After this session the next commit starts from whatever version was last set.

### Auto-skill triggers

**When the user asks to create a new mock test** (any phrasing like "create a test", "make a new exam", "new mock test", "mini test for X"), **automatically invoke the `/create-mock-test` skill** — it contains the complete syllabus, JSON schema, and generation instructions. Do not ask the user for the syllabus.

**The exam JSON file is always the source of truth** for `duration`, `sections`, `totalMarks`, `marksPerQuestion`, `negativeMarking`. Never hardcode values in HTML/JS that contradict the JSON.

---

## Tech stack

- Pure static HTML + CSS + vanilla JS (no framework, no build step)
- GitHub Pages — `index.html` at repo root, all paths relative
- `fetch()` for JSON — **requires a local HTTP server** (`python3 -m http.server 8080`), not `file://`
- `sessionStorage` for active exam session; `localStorage` for saved results and QB progress
- Cloudflare Worker + R2 for sprite images and AI explanation persistence

---

## File map

```
index.html              Home — exam card selector
instructions.html       Pre-exam instructions + checkbox gate
exam.html               Full CBT interface
result.html             Score + section breakdown + question review
questionbank.html       Desktop question bank browser (legacy; PWA is the mobile version)
revision.html           Revision / flashcard view
syllabus.html           Syllabus reference page

css/reset.css           Base reset
css/variables.css       All CSS custom properties (colours, spacing, layout)
css/exam.css            Full CBT layout (grid, palette, status colours, timer)
css/home.css            Home page styles
css/instructions.css    Instructions page styles
css/result.css          Result page styles
css/common.css          Shared styles

js/state.js             ExamState singleton — all session logic lives here
js/timer.js             ExamTimer — drift-resistant countdown
js/palette.js           PaletteRenderer — question palette grid
js/question.js          QuestionRenderer — question + options
js/exam.js              Main CBT controller — wires everything together
js/home.js              Loads manifest.json, renders exam cards
js/instructions.js      Checkbox gate, fresh session init
js/result.js            Reads localStorage result, renders review
js/questionbank.js      Desktop question bank logic
js/revision.js          Revision page logic
js/explanation.js       AI explanation panel (shared by QB pages)
js/firebase-ai.js       Gemini AI via direct REST API — sprite-based prompt (1 image + coords)
js/firebase-config.js   Credentials (gitignored — use .example as template)
js/r2-explanations.js   R2 client module — fetch/save/rate explanations, localStorage cache

assets/pwa-icon.svg     PWA icon (SVG)
assets/pwa-icon-180.png PWA icon (180×180 PNG for iOS)
assets/syllabus/        Syllabus reference images

qb_pwa.html             ★ PRIMARY — Mobile PWA question-bank browser (renders via canvas from R2 sprites)
qb_pwa_manifest.json    Web App Manifest for the PWA
qb_pwa_sw.js            Service Worker — cache-first images, network-first JSON

exams/manifest.json     Index of all available exam papers (read by home.js and build scripts) — CBT exam.html only
exams/qb_manifest.json  ★ PWA stream selector source — TET→Paper→Stream tree + per-stream paper/question counts
exams/qb_index_<bank>.json  ★ Per-stream question index (one per tet_bank) — loaded on demand by the PWA
exams/qb_index.json     Back-compat copy of the legacy tgtet_maths_science_telugu index (old installs + SW shell)
exams/real-*.json       Real CTET exam papers (21 papers, 150 Qs each = 3150 Qs total)
exams/paper2-*.json     Assembled mock tests (from _raw text files)
exams/_raw/             Raw text source for mock tests (input to build_exam.py)

question_bank/          ★ Per-question folders with uncompressed individual PNGs + metadata.json
question_bank/CDP/      30 Qs × 21 papers = 630 question folders
question_bank/English/  30 Qs × 21 papers = 630 question folders
question_bank/Mathematics/ 30 Qs × 21 papers = 630 question folders
question_bank/Science/  30 Qs × 21 papers = 630 question folders
question_bank/Telugu/   30 Qs × 21 papers = 630 question folders
question_bank/questions.json  ★ Structured index of all questions (keyed by subject) — written by extract_questions.py

qb/                     ★ LOCAL STAGING ONLY — gitignored flat sprite store before R2 upload
qb/<tet_bank>/          Q<id>_sprite.png + Q<id>_metadata.json per question
                        Built by build_flat_qb.py or extract_questions.py --sprites-only
                        Uploaded to R2 by upload_sprites.py — do not commit

config/tet_types.json         ★ Multi-TET taxonomy — maps batch_papers_flat folders → tet_type/paper/stream/
                               tet_bank + section specs per content type. Generated by gen_tet_config.py.
config/unprocessed_report.json  List of folders that couldn't be ingested (old scans) + why
scripts/gen_tet_config.py     Scan batch_papers_flat → write config/tet_types.json (edit generator, not the JSON)
scripts/ingest_batch.py       ★ MULTI-TET DRIVER — config → for each stream folder: normalise filenames, map
                               sections, extract sprites → qb/<tet_bank>/. Flags: --dry-run, --stream <bank>,
                               --batch-dir <dir> (point at a fast local copy). Records unparseable papers.
scripts/extract_questions.py  ★ PDF → question_bank/ (uncompressed PNGs) + sprite (compressed once) + metadata.json + questions.json
                               Flags: --pdf <file>, --pdf-dir <dir>, --sprites-only, --tet-bank, --validate
                               Now generalised: subject_from_qnum(q_num, section_spec) + normalize_paper_id()
                               (flexible messy-filename → YYYY-Mon-DD-ShiftN). Default behaviour unchanged.
scripts/build_flat_qb.py      Collect existing question_bank/ sprites → qb/<tet_bank>/ flat structure
                               Computes sprite coords from individual PNG dimensions when metadata.json lacks them
scripts/upload_sprites.py     Upload qb/<tet_bank>/Q*_sprite.png to R2 tet-questionbank bucket (32 threads)
                               --all-banks uploads every qb/ bank; --skip <a,b> excludes; --tet-bank <one>
                               Requires env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
scripts/build_qb_index.py     ★ qb/<tet_bank>/ (ALL banks) → exams/qb_index_<bank>.json + exams/qb_manifest.json
                               + exams/qb_index.json (back-compat copy of the legacy tgtet_maths_science_telugu bank).
                               Reads config/tet_types.json for section order/labels. Legacy bank keys reproduced
                               bit-for-bit; new banks namespace questionImage/examId by tet_bank.
scripts/build_real_exams.py   Regenerate all real-paper exam JSONs for the CBT exam.html interface
scripts/build_exam.py         Assemble mock-test JSON from _raw text files → exams/<id>.json

papers/                 ★ Source PDFs for extract_questions.py (gitignored — add PDFs here)
                          Also available at /mnt/c/Users/ymano/Universe/coworker/TET Preparation/papers/
                        batch_papers_flat/ (multi-TET source, /mnt/c/.../TET Preparation/) holds per-stream
                        folders <STATE>_TET_Paper_<P>_<Content>_<Language>; unparseable → its unprocessed/ subfolder

worker/wrangler.toml    Cloudflare Worker config — R2 bindings: EXPLANATIONS + QB_SPRITES
worker/src/index.js     Worker code — /explanations/* API + /qb/:bank/:filename sprite serving
worker/package.json     wrangler as dev dependency (npm install + npx wrangler deploy to redeploy)

.claude/commands/create-mock-test.md   Skill for generating new mock test JSONs

tests/qb_pwa.spec.js   Playwright E2E tests for the PWA (filters, mark for review/understood, progress counts)
playwright.config.js   Playwright config — port 8085, service workers blocked, webServer auto-starts
package.json           Dev deps: @playwright/test alpha (Ubuntu 26.04 support)
```

---

## Running tests

```bash
npm test
```

`pretest` hook auto-downloads `libnspr4` + `libnss3` from apt into `/tmp/pw-libs` if missing (needed on Ubuntu 26.04 because the Playwright Chromium binary predates the distro). Safe to run after a reboot — it's a no-op when the libs are already present.

Do NOT use `npx playwright test` directly — the `LD_LIBRARY_PATH` and library check are wired through the npm scripts only.

---

## question_bank — structure and data pipeline

### Folder layout

Each question lives in its own folder:
```
question_bank/<Subject>/<paper_id>_Q<NNN>_<q_id>/
    question.png      Question image — uncompressed (full quality, source for sprite)
    option1.png       Option A image — uncompressed
    option2.png       Option B image — uncompressed
    option3.png       Option C image — uncompressed
    option4.png       Option D image — uncompressed
    metadata.json     Question metadata (see schema below)
    sprite.png        ★ Stacked composite — gitignored, built from uncompressed PNGs, compressed once
```

**Individual PNGs are intentionally uncompressed.** The sprite is built from them and compressed once with pngquant+optipng. Compressing individual PNGs first then building a sprite causes double quantisation and visible quality degradation.

`sprite.png` files are gitignored (`question_bank/**/sprite.png`) — they are local build artefacts uploaded to R2 via `upload_sprites.py`. The R2 sprite is the canonical image source for the PWA.

Subject folder names: `CDP`, `English`, `Mathematics`, `Science`, `Telugu`

`metadata.json` schema:
```json
{
  "q_num": 1,
  "q_id": "8657994132",
  "subject": "CDP",
  "correct_answer": 2,
  "paper_id": "2026-Jan-03-Shift1",
  "year": "2026",
  "month": "Jan",
  "day": "03",
  "shift": "1",
  "date": "03 Jan 2026",
  "is_comprehension": false,
  "sprite": {
    "question": { "y": 0,   "h": 108, "w": 612 },
    "option1":  { "y": 108, "h": 65,  "w": 353 },
    "option2":  { "y": 173, "h": 66,  "w": 332 },
    "option3":  { "y": 239, "h": 68,  "w": 326 },
    "option4":  { "y": 307, "h": 65,  "w": 336 }
  }
}
```

`sprite` key is present for questions extracted with the current pipeline. For older questions (pre-sprite), coords are computed from individual PNG dimensions by `build_flat_qb.py`.

### Root-level index

**`question_bank/questions.json`** — structured master index keyed by subject, written by `extract_questions.py`. Single source of truth for the pipeline.

### Current coverage

`question_bank/` (individual PNGs, desktop) still holds only the original **21-paper / 3,150-question**
TGTET Maths/Science Telugu set:
- 2024 May: Shift1/2 on 20th, 21st, 22nd (6 papers)
- 2025 Jan: 5-Shift2, 11-Shift2, 19-Shift1/2, 20-Shift1/2 (6 papers)
- 2025 Jun: 18-Shift1/2, 19-Shift1/2, 24-Shift1 (5 papers)
- 2026 Jan: 03-Shift1/2, 04-Shift1/2 (4 papers)

The **sprite banks** (`qb/` → R2 → PWA) now span **22 streams / 19,796 questions** (Task 7, v0.3.0):
one TGTET tet_type with Paper 1 (8 languages), Paper 2A Maths/Science (7 languages incl. the
original Telugu set), and Paper 2A Social Studies (7 languages). See `exams/qb_manifest.json` for
exact per-stream paper/question counts. New papers/streams go through `ingest_batch.py` exclusively.

---

## Multi-TET architecture (v0.3.0, Task 7)

The PWA is no longer single-bank. Data is split so adding papers/streams never touches existing ones:

- **`exams/qb_manifest.json`** — small tree (TET type → Paper → Stream) with `paper_count`,
  `question_count`, `sections`, and the per-stream `index` path. The PWA loads this first and renders
  the **TET → Paper → Stream picker** (native `<select>`s). Picker auto-opens on first launch
  (nothing saved in localStorage `qb_selected_bank`); the header stream-switcher reopens it.
- **`exams/qb_index_<tet_bank>.json`** — one index per stream, loaded on demand. `qbankCache` holds
  only the active stream, so progress/subject counts are naturally stream-scoped.
- **Stream ↔ tet_bank**: a `tet_bank` slug like `tgtet_social_studies_hindi` is the R2 sprite subfolder,
  the index filename suffix, and the manifest key. The pinned legacy bank `tgtet_maths_science_telugu`
  keeps bare `questionImage`/`examId` keys (no progress loss); all new banks namespace those keys by
  `tet_bank` so q_id collisions across language variants of one exam — and R2 explanation keys — never clash.
- **Sections per stream** come from `config/tet_types.json` section specs (CDP / Language-I / English /
  {Maths+Science | Social Studies | Maths+EVS}); the subject dropdown is rebuilt per stream.

To add papers to an existing stream later: drop PDFs in its `batch_papers_flat/<folder>`, then
`ingest_batch.py --stream <bank>` → `build_qb_index.py` → `upload_sprites.py --tet-bank <bank>`.

---

## Build pipeline — what to run and when

### Full sprite pipeline (PDF → R2 → PWA)

This is the canonical pipeline for all new papers going forward. Everything flows through sprites.

```
PDF  →  extract_questions.py --sprites-only  →  qb/<tet_bank>/  →  upload_sprites.py  →  R2
                                                       ↓
                                               build_qb_index.py  →  exams/qb_index.json  →  PWA
```

```bash
# Step 1 — Extract sprites directly to flat qb/ (no individual PNGs written)
python3 scripts/extract_questions.py --sprites-only \
  --pdf-dir "/mnt/c/Users/ymano/Universe/coworker/TET Preparation/papers/"

# Step 2 — Build the PWA index from flat metadata
python3 scripts/build_qb_index.py

# Step 3 — Upload sprites to R2 (set env vars first)
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
python3 scripts/upload_sprites.py
```

`--sprites-only` loads images in-memory from PDF xrefs (never writes individual PNGs), builds the sprite, compresses it once, and writes to `qb/<tet_bank>/`. This is the highest-quality path.

After upload, deploy the Worker if `worker/src/index.js` changed:
```bash
cd worker && npx wrangler deploy
```

---

### Full pipeline including question_bank/ (individual PNGs preserved)

Use this when you also need the desktop `questionbank.html` to work, or want to keep individual PNGs for reference.

```bash
# Step 1 — Extract to question_bank/ (uncompressed individual PNGs + sprite per question)
python3 scripts/extract_questions.py \
  --pdf-dir "/mnt/c/Users/ymano/Universe/coworker/TET Preparation/papers/"

# Step 2 — Collect sprites from question_bank/ into flat qb/ structure
python3 scripts/build_flat_qb.py

# Step 3 — Build PWA index
python3 scripts/build_qb_index.py

# Step 4 — Upload sprites to R2
python3 scripts/upload_sprites.py

# Step 5 (optional) — Regenerate CBT exam JSONs
python3 scripts/build_real_exams.py
```

`build_flat_qb.py` reads `question_bank/questions.json`, copies `sprite.png` files into `qb/<tet_bank>/`, and computes missing sprite coords from individual PNG dimensions.

---

### SSIM quality check

Always validate sprite quality after a new extraction run:

```bash
python3 scripts/extract_questions.py --sprites-only \
  --pdf-dir "/mnt/c/Users/ymano/Universe/coworker/TET Preparation/papers/" 2>&1 | grep -A 15 "SSIM report"
```

Expected: mean ≥ 0.98, min ≥ 0.96, 0 below 0.92 threshold.  
Baseline from 21 papers: min 0.9662, mean 0.9839, 0/15750 below threshold.

---

### When new PDFs arrive from the coworker

PDFs are at: `/mnt/c/Users/ymano/Universe/coworker/TET Preparation/papers/`

```bash
# Sprites-only (fastest, best quality — recommended for production)
python3 scripts/extract_questions.py --sprites-only \
  --pdf "2026-Jun-15-Shift1.pdf"        # single new PDF
# or
python3 scripts/extract_questions.py --sprites-only \
  --pdf-dir "/mnt/c/.../papers/"        # all PDFs at once

python3 scripts/build_qb_index.py
python3 scripts/upload_sprites.py
```

---

### Validate the question bank

```bash
python3 scripts/extract_questions.py --validate
```

---

### When adding a new mock test (text-based)

Uses a separate pipeline that does NOT touch `question_bank/`:

1. Create `exams/_raw/<exam-id>/meta.txt` and one `.txt` per section
2. Run `python3 scripts/build_exam.py <exam-id>`
3. Or use the `/create-mock-test` skill which handles the whole flow.

---

### Local development server

```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080/qb_pwa.html` for the PWA.
Hard-refresh (`Ctrl+Shift+R`) or enable "Update on reload" in DevTools → Service Workers to pick up updated JSON files.

---

## qb_index.json — field reference

Each `exams/qb_index_<bank>.json` is a flat array of that stream's questions (e.g. 3,150 for the legacy
bank, 600 for a 4-paper stream). Per-entry fields:

| Field | Values |
|---|---|
| `questionType` | `"image"` — always |
| `optionsInQuestion` | `false` — almost always (rare text-option questions are skipped in sprites-only ingest) |
| `sectionId` | `"cdp"`, `"english"`, `"mathematics"`, `"science"`, `"telugu"` |
| `correctAnswer` | `"1"`–`"4"` (string), or `null` (2 known edge cases) |
| `globalIndex` | `0`–`149` — per-paper position (CDP=0–29, Telugu=30–59, English=60–89, Math=90–119, Science=120–149); repeats across papers |
| `examId` | legacy bank: `"real-2024-May-20-Shift1"`; new banks: `"<tet_bank>__<paper>"` (namespaced) |
| `examTitle` | `"20 May 2024 — Shift 1"` … built from the normalised paper_id |
| `questionImage` | legacy: `question_bank/<Subject>/<paper>_Q<NNN>_<id>/question.png`; new banks prefix the folder with `<tet_bank>__`. **localStorage key only** (understood/revision/AI cache) — not used for rendering |
| `spriteUrl` | `https://tet-qb-worker.y-manojkrishna.workers.dev/qb/<tet_bank>/Q<id>_sprite.png` — R2 sprite served via Worker |
| `sprite` | `{question:{y,h,w}, option1:{y,h,w}, …}` — per-piece pixel boundaries in the sprite |
| `tet_type` | `"TGTET"` (more TET types as states are added) |
| `stream` | e.g. `"Maths_Science_Telugu"`, `"Social_Studies_Hindi"`, `"Paper1_Telugu"` |
| `tet_bank` | e.g. `"tgtet_social_studies_hindi"` — R2 subfolder, index filename suffix, manifest key |

`sectionId` values vary per stream: `cdp` + a language id (`telugu`/`hindi`/`urdu`/…) + `english` +
either `mathematics`+`science`, or `social`, or `mathematics`+`evs`. `globalIndex` ranges follow the
stream's section spec (Social Studies fills 90–149; Paper 1 ends in EVS 120–149).

`optionImages` was removed in v0.2.0. The PWA renders everything from `spriteUrl` + `sprite` via canvas.

---

## PWA — QB app key behaviours

`qb_pwa.html` is an installable standalone PWA targeting iOS and Android.

- **Cold start**: fetches `exams/qb_manifest.json` (small), then the selected stream's `exams/qb_index_<bank>.json`
- **Stream selection**: TET → Paper → Stream picker; choice saved in `localStorage` `qb_selected_bank`; picker auto-opens on first launch
- **Warm start**: serves the active stream from `localStorage` key `qb_index_cache_v2:<bank>`, revalidates in background (manifest cached under `qb_manifest_cache_v1`)
- **Rendering**: `<canvas>` elements only — `_drawCrop(canvas, spriteImg, {y,h,w}, scale)` crops the R2 sprite per piece. No `<img>` tags for question/option content.
- **Storage keys**: understood set, revision list, AI cache use `questionImage` as the key — legacy bank keeps its old `question_bank/...` paths (progress preserved); new banks use `<tet_bank>__`-prefixed paths
- **Prefetch**: after render, adjacent questions' `spriteUrl` is prefetched via `new Image().src`
- **Offline**: service worker (`qb_pwa_sw.js`) — cache-first for images, network-first for JSON

---

## AI explanation — sprite-based prompt

`js/firebase-ai.js` sends a single sprite image to Gemini instead of 5 separate images.

**System instruction** includes an `IMAGE FORMAT` block explaining the sprite layout (question at top, options A–D stacked below).

**User parts sent per question:**
1. `{text: "Subject area: <label>"}`
2. `{text: "This is a sprite image containing the full question at the top followed by the 4 answer options (A, B, C, D) stacked vertically below it. Exact pixel boundaries for each section are provided after the image."}`
3. `{inlineData: <base64 of R2 sprite>}` — fetched from `spriteUrl`
4. `{text: "Sprite pixel boundaries (y=0 is top of image):\nQuestion: y=0px to y=Npx...\nOption A: ..."}` — from `item.sprite`
5. `{text: "Determine the correct option yourself and explain it..."}`
6. `{text: <MOBILE_ADDENDUM>}` (mobile=true from PWA)

Fallback path: if `spriteUrl` is null (desktop `questionbank.html`), falls back to fetching individual `question.png` + `option1-4.png` files as before.

---

## R2 buckets and Worker

Two R2 buckets, one Worker:

| Bucket | Purpose | Worker binding |
|---|---|---|
| `tet-questionbank-explanations` | AI explanation JSON docs | `EXPLANATIONS` |
| `tet-questionbank` | Sprite PNGs | `QB_SPRITES` |

**Worker URL**: `https://tet-qb-worker.y-manojkrishna.workers.dev`

**Worker routes:**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/qb/:bank/:filename` | none | Serve sprite PNG from R2 with immutable cache |
| GET | `/explanations/:subject/:folder` | none | Fetch all explanations |
| POST | `/explanations/:subject/:folder` | Bearer | Save new explanation |
| PATCH | `/explanations/:subject/:folder/:expId` | Bearer | Update likes/dislikes |
| DELETE | `/explanations/:subject/:folder/:expId` | Bearer | Remove one explanation |

**R2 sprite key format**: `<tet_bank>/Q<id>_sprite.png`  
e.g. `tgtet_maths_science_telugu/Q715053766_sprite.png`

**R2 explanation key format** (v0.3.0+): `explanations/q/Q<q_id>.json` — keyed by the globally-unique
q_id, so it is stream-agnostic and has no spaces (some subjects are "Social Studies"). e.g.
`explanations/q/Q8657994132.json`. The client (`js/r2-explanations.js`) sends subject=`q`, folder=`Q<q_id>`,
so the existing `/explanations/:subject/:folder` Worker route is reused unchanged. The R2 index
(`questions-with-explanations.json`) stores `Q<q_id>` ids. Pre-v0.3.0 keys were
`explanations/<Subject>/<paper>_Q<n>_<id>.json`; the 73 existing objects were migrated by
`scripts/migrate_explanations_to_qid.py` (old keys kept as backup; index backed up to
`questions-with-explanations.backup.json`).

### Deploying the Worker

```bash
cd worker
npm install
npx wrangler login       # one-time
npx wrangler secret put AUTH_TOKEN
npx wrangler deploy
```

Re-deploy after any change to `worker/src/index.js`.

### firebase-config.js fields required

```js
geminiApiKey:    "...",
workerUrl:       "https://tet-qb-worker.y-manojkrishna.workers.dev",
workerAuthToken: "<same value as AUTH_TOKEN secret>",
```

### PWA explanation load order

1. `localStorage` (`ai_exp_persist:<folder>`) — instant
2. R2 via Worker (~100ms) — fetches best-rated explanation
3. "No explanation yet" message

---

## Question palette — status colour scheme (NTA official)

| Status | Colour | CSS variable |
|---|---|---|
| Not Visited | Grey | `--status-not-visited-bg: #9e9e9e` |
| Not Answered | Red | `--status-not-answered-bg: #d32f2f` |
| Answered | Green | `--status-answered-bg: #388e3c` |
| Marked for Review | Purple | `--status-marked-bg: #6a1b9a` |
| Answered & Marked | Purple + green dot | `--status-answered-marked-bg: #6a1b9a` |

---

## Exam JSON naming conventions

Real papers: `real-<YYYY>-<Mon>-<DD>-<ShiftN>.json`
Mock tests: `paper2-<subjects>-<nn>.json`

Examples:
- `real-2026-Jan-03-Shift1.json` — CTET Jan 2026 paper
- `paper2-full-01.json` — Full 150Q mock test
- `paper2-mini-telugu-01.json` — Mini-test: Telugu section only
