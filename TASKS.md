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
**Status:** Pending

Make the PWA self-updating: fetch new `qb_index.json` and assets silently in the background.

### Subtasks
- [ ] Background Sync API: register sync event in SW to revalidate `qb_index.json` when back online
- [ ] Periodic Background Sync (Android Chrome): periodic sync tag for question bank refresh
- [ ] SW cache strategy review: move `qb_index.json` to stale-while-revalidate
- [ ] Version-aware cache busting: SW compares ETag/Last-Modified, updates localStorage silently
- [ ] Optional push notification: "New questions available — tap to refresh"
- [ ] Document iOS limitation: background fetch not supported on iOS PWA; workaround strategy

---

## Task 5 — Frontend & Backend Performance Optimisation
**Status:** Pending

Holistic performance pass on the PWA and Cloudflare Worker.

### Subtasks
- [ ] `qb_index.json` (1.8 MB): evaluate Brotli compression via GitHub Pages headers, or split-by-subject indexes
- [ ] Image loading: audit prefetch strategy, consider WebP conversion for question/option PNGs
- [ ] JS: `qb_pwa.html` is one large file — evaluate lazy-loading explanation + Firebase modules
- [ ] localStorage audit: AI cache key bloat, add eviction policy for old entries
- [ ] Cloudflare Worker: add `Cache-Control` headers on R2 GET, reduce cold-start latency
- [ ] SW install/activate: trim cached asset list, add cache size cap
- [ ] Lighthouse audit: run and address PWA, performance, accessibility scores
