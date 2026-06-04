# Task Backlog

Tracked work items for the TET Suite project. Update status and subtask checkboxes as work progresses.

---

## Task 1 — Multiplayer Quiz Game (Firebase Realtime)
**Status:** Pending

Gamified 2-player quiz over Firebase Realtime Database. Host configures a game, gets a room key, shares it. Guest joins by entering key. Both mark ready → questions appear in sync. Both tap answers. Winner = most correct.

### Config options
- Paper: specific paper or all papers
- Subjects: one or more of CDP / Telugu / English / Math / Science
- Mode A: 5-minute countdown
- Mode B: X questions (host picks N)

### Subtasks
- [ ] Design Firebase room schema — room key, players[], config{}, questions[], answers{}, ready flags, scores, status
- [ ] Host flow: configure game → write room to Firebase → display shareable key
- [ ] Guest flow: enter key → join room → wait screen
- [ ] Ready-up screen: both players visible, Ready button, auto-start countdown when both ready
- [ ] Question display: synced, opponent-answered indicator, tap to lock in answer
- [ ] End screen: scores, correct/wrong per player, winner banner, play again
- [ ] Mode A: 5-min global timer visible to both
- [ ] Mode B: X-questions mode, progress bar
- [ ] UI: dedicated game screen or modal layered over PWA (no separate HTML file needed)
- [ ] Firebase security rules for rooms

---

## Task 2 — AI Topic Tagging for Each Question
**Status:** Pending

Classify all 3150 questions into syllabus topics using AI. Optimise over the existing `scripts/classify_topics.py`.

### Subtasks
- [ ] Review current `classify_topics.py` — model, prompt, batching, cost per question
- [ ] Design optimised prompt: batch multiple questions per call, structured JSON output, Gemini Flash Lite
- [ ] Run classification, write `topic` field to each `metadata.json`
- [ ] Flow topic through build pipeline: `questions.json` → `real-*.json` → `qb_index.json`
- [ ] Expose topic in PWA: sub-label on question or additional filter chip
- [ ] Ensure resumability (skip already-classified questions)

---

## Task 3 — Native App (App Store & Google Play)
**Status:** Pending

Package the PWA as a native app using Capacitor (wraps existing HTML/JS with no rewrite).

### Subtasks
- [ ] Evaluate: Capacitor vs TWA (Android only) vs React Native rewrite → decision: Capacitor
- [ ] Set up Capacitor project pointing at `qb_pwa.html`
- [ ] iOS: Xcode config, icons, splash, entitlements, App Store Connect listing
- [ ] Android: Gradle config, icons, Play Console listing
- [ ] Handle `firebase-config.js` secret in native build (currently gitignored)
- [ ] CI: GitHub Actions for build + submit (Fastlane or EAS)
- [ ] App Store prep: privacy policy, age rating, description copy

---

## Task 4 — PWA Background Auto-Update & Offline-First Question Bank
**Status:** Complete (2026-05-27, commit f68a0bb6)

Make the PWA self-updating: fetch new `qb_index.json` and assets silently in the background.

### Subtasks
- [x] Background Sync API: register sync event in SW to revalidate `qb_index.json` when back online
- [x] Periodic Background Sync (Android Chrome): periodic sync tag for question bank refresh
- [x] SW cache strategy review: move `qb_index.json` to stale-while-revalidate
- [x] Version-aware cache busting: SW compares ETag, updates cache; CACHE_BUST constant wipes localStorage on special pushes
- [x] "New questions available" banner with Reload/Dismiss; "App updated" toast on SW controllerchange
- [x] Document iOS limitation: periodicSync not supported on iOS PWA; online-event Background Sync is the fallback

---

## Task 5 — Frontend, Network & Performance Simplification
**Status:** Pending
**Priority:** Medium

Holistic audit and simplification of the PWA's frontend code, data flows, network layer, and Cloudflare Worker. The app has grown organically — this task creates a clean, coherent, fast architecture.

### Blockers / decisions needed before starting
- **Scope decision**: pure cleanup (no UX change) vs UX redesign. Recommend cleanup-only first pass.
- **Firebase dependency**: if Task 6 (DeepSeek) fully replaces Gemini in the in-app flow, Firebase can be dropped entirely — that unblocks a significant simplification. Decide dependency first.
- **Cookie audit first**: run a cookie audit before deciding what to remove; Firebase SDK may set cookies that aren't obvious.

### Subtasks — Performance
- [ ] `qb_index.json` (1.8 MB): evaluate Brotli compression via GitHub Pages headers, or split-by-subject indexes
- [ ] Image loading: audit prefetch strategy, consider WebP conversion for question/option PNGs
- [ ] Cloudflare Worker: add `Cache-Control` headers on R2 GET responses, reduce cold-start latency
- [ ] SW install/activate: trim cached asset list, add cache size cap
- [ ] `qb_pwa.html` is a monolithic file (~2000+ lines) — evaluate lazy-loading explanation + Firebase modules without a build step

### Subtasks — Audits
- [ ] Cookie audit: DevTools → Application → Cookies on the live site; document every cookie, its source, and whether it is needed
- [ ] localStorage audit: enumerate all keys across `qb_pwa.html`, `js/r2-explanations.js`, `js/explanation.js`; identify stale/duplicate keys; add eviction policy for AI cache entries older than 30 days
- [ ] Network audit: log all fetches on cold start and warm start; identify redundant or sequential requests that could be parallelised or eliminated
- [ ] Lighthouse audit: record baseline scores (Performance / PWA / Accessibility / SEO), fix top-3 issues per category

### Subtasks — Code cleanup
- [ ] `js/firebase-config.js` is gitignored and must be manually copied — move secrets to Cloudflare Worker secrets so the repo is self-contained for new contributors
- [ ] Remove legacy `questionbank.html` + `revision.html` + `js/questionbank.js` + `js/revision.js` if confirmed unused in favour of the PWA

---

## Task 6 — Bulk Explanation Generation (Multi-Model)
**Status:** Pending
**Priority:** Medium

Bulk-generate AI explanations for every question in the bank and persist them to R2, so users always see an explanation without needing to tap "Explain with AI". Integrate DeepSeek as the primary model (cheaper, better at STEM than Gemini Flash) with Gemini as fallback.

### Blockers / decisions needed before starting
- **DeepSeek API key**: must be provisioned and stored as a Cloudflare Worker secret + in `firebase-config.js` locally. Not in git.
- **Model choice**: DeepSeek v3 (chat) vs v4 (reasoning) — v4 chain-of-thought may be too verbose for a mobile card. Recommend v3 for bulk, v4 optionally for in-app on demand.
- **Routing logic**: decide if DeepSeek is a replacement or Gemini fallback for the in-app flow. Simplest: DeepSeek for bulk script, keep Gemini for in-app until tested.
- **Prompt adaptation**: DeepSeek uses the OpenAI-compatible API but may need prompt tuning for bilingual (English + Telugu) image questions.

### Subtasks
- [ ] Write `scripts/generate_explanations.py` — iterates `exams/qb_index.json`, supports `--model gemini|deepseek` flag, `--dry-run` for cost estimate
- [ ] Add DeepSeek API call path in the script (OpenAI-compatible endpoint); calculate tokens × price before full run
- [ ] POST each explanation to the Cloudflare Worker (`/explanations/:subject/:folder`) with bearer token; pass `model` field through
- [ ] Skip questions already explained in R2 (check GET before POST — resumable)
- [ ] Rate-limit per provider quota (batch by subject, configurable delay)
- [ ] Add DeepSeek call path in the in-app explanation flow (`js/firebase-ai.js` or new `js/deepseek-ai.js`) with the same HTML-string output contract
- [ ] Add model label to the explanation card UI (e.g. "Generated by DeepSeek v3")
- [ ] Verify a sample of generated explanations in the PWA after the bulk run

---

## Task 7 — Multi-TET Data Ingestion Pipeline
**Status:** Largely complete (v0.3.0, 2026-06-04) — 21 new TGTET streams (16,646 Qs) ingested + uploaded to R2; PWA stream selector live. Remaining: non-TGTET states (APTET etc.) when un-scanned PDFs arrive; CBT `build_real_exams.py` still 5-subject hardcoded (PWA is the focus).
**Priority:** High

A generalised pipeline to ingest ~120+ new exam papers spanning multiple TET types (CTET, TGTET, APTET, KTET, …). Each TET has a different section structure, question count, and language slots. The pipeline produces sprites → R2 → qb_index.json → PWA. All new papers go through the sprite pipeline exclusively.

### Scope of change

| TET | Section structure | Total Qs | Notes |
|---|---|---|---|
| CTET Paper 2 Math+Sci | CDP(30)+Lang1(30)+Lang2(30)+Math(30)+Science(30) | 150 | Current app |
| CTET Paper 2 Social | CDP(30)+Lang1(30)+Lang2(30)+Social(60) | 150 | Social replaces Math+Sci |
| TGTET / APTET | CDP + Language + Content area | varies | Need spec per TET |
| KTET / others | TBD | TBD | Add as papers arrive |

### What the sprite work already resolved (v0.2.0)
- ✅ `tet_type`, `stream`, `tet_bank` fields added to `qb_index.json` and flat metadata
- ✅ R2 sprite key namespace: `<tet_bank>/Q<id>_sprite.png` — no collision across TET types
- ✅ `extract_questions.py --sprites-only --tet-bank <bank>` — canonical ingestion command
- ✅ `extract_questions.py --pdf-dir <dir>` — batch process all PDFs in a folder
- ✅ `build_qb_index.py` reads flat `qb/<tet_bank>/` metadata, carries all taxonomy fields through
- ✅ Worker `/qb/:bank/:filename` route — bank-namespaced sprite serving live

### Remaining blockers / decisions
- **Section definitions file**: each TET type needs a machine-readable spec (subject names, question counts, ordering) — `config/tet_types.json`. `extract_questions.py` currently hardcodes CTET section detection logic.
- **Language slot generalisation**: Telugu is currently a hardcoded subject name in several places. Must become configurable (`lang1`, `lang2`) resolved at ingest time per TET type.
- **Frontend TET selector**: `qb_pwa.html` needs a TET-type / tet_bank chooser before multi-bank content is usable in one app.
- **R2 explanation key namespace**: current format is `explanations/<Subject>/<folder>.json` — must add `tet_bank` prefix or collisions will occur when multiple TET types share subject names (e.g. both have a `CDP` subject).
- **build_real_exams.py**: hardcodes 5-subject section order — must be driven by `config/tet_types.json`.

### Subtasks
- [x] Define `config/tet_types.json` — section specs per content type + folder→taxonomy map (via `gen_tet_config.py`)
- [x] Generalise section-detection — `extract_questions.py` `subject_from_qnum(q_num, section_spec)` + `normalize_paper_id()`, driven by `ingest_batch.py`
- [ ] Update `build_real_exams.py` to read section order from `config/tet_types.json` (CBT exam.html only — deferred, PWA is the focus)
- [x] R2 explanation key collisions avoided — new banks prefix the `questionImage` folder with `<tet_bank>__`, so `explanations/<Subject>/<folder>.json` is auto-namespaced (no Worker change needed)
- [x] Frontend: TET→Paper→Stream picker on the PWA; subject dropdown rebuilds per stream; counts stream-scoped; paper counts shown per stream
- [x] Run sprite pipeline on the available batch — 21 streams (Paper 1 ×8 langs, Paper 2A Maths/Sci ×7, Social ×7) = 16,646 Qs → `qb/` → R2
- [x] Verify end-to-end — headless smoke (0 console errors), 18/18 Playwright tests, live R2 sprite checks
- [ ] Backlog: ingest remaining states (APTET) + old scanned papers in `batch_papers_flat/unprocessed/` (different format — needs OCR/scan pipeline)

---

## Task 8 — IE Irodov Problems Sub-App
**Status:** Pending
**Priority:** Low

Add IE Irodov (Problems in General Physics) as a standalone sub-app within the same PWA. Crop problems from the PDF, create an interactive problem browser with AI step-by-step explanations.

### Blockers / decisions needed before starting
- **PDF source**: user has the Irodov PDF — confirm path/location before starting. Need to know if it is the original (Russian problems in English) or a solutions manual.
- **Problem structure**: Irodov problems are numbered 1.1–6.7 across 6 chapters (Mechanics, Thermodynamics, E&M, Optics, Atomic, Nuclear). Each problem is a short paragraph, often with a sub-figure. Cropping strategy differs from CTET (which has clean per-question images).
- **No answer key in book**: Irodov gives only the final numerical answer at the back, not steps. AI explanation must be generated (no `correctAnswer` equivalent). Decide what "correct" means in this sub-app (final answer check vs open-ended).
- **UI paradigm**: CTET PWA is MCQ-based (4 options, tap to select). Irodov problems are open-ended numerical/derivation. Need a different interaction model — likely: show problem → show AI explanation → show final answer.
- **Namespace isolation**: all Irodov data must live under a separate prefix (`irodov/`) in question_bank, R2, qb_index, and the PWA route to avoid collisions with CTET data.
- **TET selector integration**: fits naturally as a separate entry in the app selector (Task 7 frontend) — "Irodov Physics" as a non-TET option.

### Subtasks
- [ ] Crop all Irodov problems from the PDF into `question_bank/Irodov/<chapter>/<problem_id>/` — one `problem.png` per problem (and `figure.png` if applicable)
- [ ] Write `metadata.json` schema for Irodov: `{ problem_id, chapter, section, final_answer, has_figure }`
- [ ] Build `irodov_index.json` (analogous to `qb_index.json`) for fast PWA cold-start
- [ ] Design the Irodov problem card UI: problem image, "Show explanation" button, final answer reveal, like/dislike on explanation
- [ ] Bulk-generate AI step-by-step explanations (uses Task 6 DeepSeek or Gemini) and persist to R2 under `explanations/Irodov/<chapter>/<problem_id>.json`
- [ ] Wire the Irodov sub-app into the PWA (route / conditional render based on selected "app" in the selector)
