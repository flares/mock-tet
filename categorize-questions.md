# Question Topic Classification — Design Notes

## Goal

Classify all 3,150 question-bank questions into per-subject syllabus topics so the
QB PWA can offer topic-based filtering for focused study.

Each question's `metadata.json` gets a `"topic"` field (e.g. `"math_algebra_sets"`).
The `questions.json` master index and `qb_index.json` are rebuilt after classification.

---

## Topics

Defined in `assets/syllabus_topics.json`. Two versions per subject:

- **`topics`** — 5–6 human-readable labels, used in the PWA filter UI
- **`llm_topics`** — same topics with keyword-dense descriptions for LLM classification

Subject → topic count:
| Subject | Topics |
|---|---|
| CDP | 5 (Child Development, Learning Theories, Motivation/Memory/Transfer, Teaching Methods & Inclusive Ed, Assessment) |
| Telugu | 5 (Comprehension, Literature & Culture, Vocabulary, Grammar, Pedagogy) |
| English | 6 (Grammar, Vocabulary, Comprehension, Speech & Questions, Writing, Pedagogy) |
| Mathematics | 6 (Number & Arithmetic, Algebra & Sets, Geometry, Coordinate/Mensuration/Trig, Statistics & Probability, Pedagogy) |
| Science | 6 (Physics, Chemistry, Cell Biology, Plant & Animal Sciences, Environment & Recent Trends, Pedagogy) |

For non-CDP subjects, all pedagogy sub-topics are merged into a single **Pedagogy** topic.

---

## Why classify by image (vision LLM), not OCR + text

- Questions are PNG images cropped from exam PDFs.
- Telugu script OCR is unreliable with open-source tools.
- Vision models read the image directly — one step, no OCR pipeline.
- The subject is already known from the folder path, so the model only needs to
  pick from 5–6 options, not make an open-ended decision.

---

## Model choice

### Why Gemini, not Claude

- Gemini API key already exists in `js/firebase-config.js` (`geminiApiKey`).
- No Anthropic API key available (the project uses Claude Code via a Pro subscription,
  not the Anthropic API directly).
- Even if Anthropic API were available: Haiku ~$4, Gemini Flash Lite ~$0.02 for this job.

### Why Gemini 2.5 Flash Lite, not Flash or Pro

| Model | Issue |
|---|---|
| `gemini-2.5-flash` | Has "thinking" mode — uses token budget on reasoning before output; hits `MAX_TOKENS` before producing the topic ID at low token limits |
| `gemini-2.5-flash-lite` | No thinking, fast, cheap — perfect for a constrained 5-option pick |
| `gemini-2.0-flash-lite` | Also works; slightly older |

**Rule of thumb:** for constrained classification (pick 1 of N), disable or avoid thinking
models. Flash Lite is the right call.

---

## Cost

~460 tokens per question (258 image + 185 prompt text)
× 3,150 questions = ~1.45M tokens

| Tier | Cost |
|---|---|
| Gemini 2.5 Flash Lite (paid) | ~$0.02 total |
| Gemini 2.5 Flash Lite (free) | $0 but 10 RPM → ~6 hours |

---

## Rate limits

Free tier: **10 RPM** for `gemini-2.5-flash-lite` (as of May 2026).

The script handles this two ways:

1. **Pre-throttle**: set `RATE_LIMIT_RPM = 9` in the script to sleep between requests
   and stay under the free tier limit. Takes ~6 hours.

2. **Auto-backoff**: on a `429` error the script extracts the `retryDelay` from the
   error message and waits exactly that long before retrying.

**Recommended**: enable billing in Google AI Studio (aistudio.google.com). Cost is
literally $0.02. Removes rate limits. Script finishes in ~10 minutes at
concurrency=8.

---

## Prompt design

Sending the full LLM topic description (~500 chars each) to the model is redundant —
the model can see the image. The prompt uses only the first 80 chars of each
description as a hint:

```
CTET Paper II exam question. Subject: Mathematics.

Classify into exactly one of these topics:
  math_number_arithmetic: Number System & Arithmetic — Prime/composite numbers, divisibility tests, whole numbers, integers, fractions…
  math_algebra_sets: Algebra & Sets — Concept of sets, set language, empty/finite/infinite sets, subsets, set operations…
  math_geometry: Geometry — History of geometry, Euclid's geometry, lines and angles, triangles (similarity, congruence…
  math_coordinate_mensuration_trigonometry: Coordinate Geometry, Mensuration & Trigonometry — Cartesian system, plotting points…
  math_statistics_probability: Statistics, Data Handling & Probability — Collection and classification of data, frequency dis…
  math_pedagogy: Pedagogy — Nature, definition and aims of mathematics; values of mathematics teaching; methods of teaching…

Reply with ONLY the topic id string. Nothing else.
```

Output: `math_algebra_sets`

---

## Running the script

```bash
# Full run (requires billing enabled on Gemini key)
python3 scripts/classify_topics.py

# Single subject (test/resume)
python3 scripts/classify_topics.py --subject Mathematics

# Dry run (count what would be classified, no API calls)
python3 scripts/classify_topics.py --dry-run

# Free tier overnight run (pre-throttle to 9 RPM)
# Edit script: set RATE_LIMIT_RPM = 9, then:
python3 scripts/classify_topics.py
```

The script is **resumable** — it checks for an existing `topic` field in each
`metadata.json` and skips it. Safe to re-run after a crash or rate-limit interruption.

After classification it automatically rebuilds `questions.json` and `qb_index.json`.

---

## Output

Each `metadata.json` gets:
```json
{
  "topic": "math_algebra_sets",
  "topic_needs_review": true   // only set if the model returned an unrecognised id
}
```

`questions.json` and `qb_index.json` get a `"topic"` field on each question entry.

---

## After classification — PWA integration (TODO)

1. Add a topic filter chip row to the QB PWA header (below the subject dropdown).
2. `buildFiltered()` in `qb_pwa.html` already filters on subject/status — add topic
   filter using the `topic` field now present in `qb_index.json`.
3. Use the human-readable `topics` array from `assets/syllabus_topics.json` to
   render the chip labels.
4. Topic filter should stack with subject filter (i.e. show CDP × Child Development).

---

## Human correction (TODO)

~5% of questions may be misclassified (edge cases, ambiguous images).
Plan: add a long-press or swipe gesture on the topic chip in the PWA explanation panel
to reassign the topic. Client-side correction writes back via a new Worker endpoint
`PATCH /topic/:subject/:folder` which updates the R2 metadata doc.
