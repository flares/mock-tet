# Mock TET — Project Intelligence

## What this project is

A pixel-faithful replica of the NTA/CTET Computer-Based Test (CBT) interface built as a pure static site for GitHub Pages. The goal is to help candidates practise the **computer interface** of the exam — navigation, timers, question palette, submit flow — not just the questions.

Target audience: Candidates preparing for **CTET Paper 2 (Classes VI–VIII)**, specifically the **Mathematics & Science** stream, with extended syllabus coverage of classes IX–X.

---

## Automated behaviour — read before every task

## Change logging rule (mandatory)

For every code or content change made in this repository, append an entry to `change_history.md` with:
- Date/time
- Complexity (`major` or `minor`)
- One-line summary of the change

Every commit must include a corresponding `change_history.md` update.

**When the user asks to create a new mock test** (any phrasing like "create a test", "make a new exam", "new mock test", "mini test for X"), **automatically invoke the `/create-mock-test` skill** — it contains the complete syllabus, JSON schema, and generation instructions. Do not ask the user for the syllabus; it is already documented in the skill.

**The JSON file is always the source of truth** for:
- `duration` — drives the exam countdown timer
- `sections` — determines which tabs appear and what questions load
- `totalMarks` / `marksPerQuestion` — drives scoring on result page
- `negativeMarking` — affects scoring calculation

Never hardcode values in HTML/JS that contradict what's in the JSON.

---

## Tech stack

- Pure static HTML + CSS + vanilla JS (no framework, no build step)
- GitHub Pages — `index.html` at repo root, all paths relative
- `fetch()` for JSON loading — requires a local HTTP server for dev (not `file://`)
- `sessionStorage` for active exam session; `localStorage` for saved results

---

## File map

```
index.html              Home — exam card selector
instructions.html       Pre-exam instructions + checkbox gate
exam.html               Full CBT interface
result.html             Score + section breakdown + question review

css/variables.css       All CSS custom properties (colours, spacing, layout)
css/exam.css            Full CBT layout (grid, palette, status colours, timer)

js/state.js             ExamState singleton — all session logic lives here
js/timer.js             ExamTimer — drift-resistant countdown
js/palette.js           PaletteRenderer — question palette grid
js/question.js          QuestionRenderer — question + options
js/exam.js              Main CBT controller — wires everything together
js/home.js              Loads manifest.json, renders exam cards
js/instructions.js      Checkbox gate, fresh session init
js/result.js            Reads localStorage result, renders review

exams/manifest.json     Index of all available exam papers
exams/*.json            Individual exam papers (one file per test)

.claude/commands/create-mock-test.md   Skill for generating new exam JSONs
```

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

## Exam JSON naming convention

Pattern: `<paper>-<subjects>-<nn>.json`

Examples:
- `paper2-math-sci-01.json` — CTET Paper 2 full (Math+Science stream)
- `paper2-mini-cdp-math-01.json` — Mini-test: CDP + Maths only
- `paper2-mini-sci-01.json` — Mini-test: Science only

---

## Task backlog — future features

These are planned but NOT currently implemented. Do not start any of these without explicit user instruction.

### 1. Result persistence with multiple attempts (Priority: High)
- Store each attempt result in browser cookies (or localStorage) keyed by `examId + timestamp`
- Show multiple attempt history on the exam card in `index.html` — e.g., "3 attempts: 82%, 91%, 88%"
- Show trend (improving / declining) with a small sparkline or colour indicator
- Allow viewing past result detail pages (store full `score.details` per attempt)

### 2. User login / authentication (Priority: Medium)
- Add a lightweight auth layer (Firebase Auth or Supabase are good free-tier options)
- Login with Google OAuth (single sign-on, no password management)
- Associate all attempts and results with the logged-in user
- Allow access to personal dashboard showing all exams taken, scores, time trends

### 3. Paid tests / monetisation (Priority: Low — after login)
- Integrate Razorpay (India-native, supports UPI / cards / net banking)
- Charge ₹10 per test access (or ₹49/month unlimited)
- Gate `exam.html` behind a payment check: if exam is `paid: true` in manifest and user has no purchase record, redirect to payment
- Webhook from Razorpay to update user's purchase record
- Consider: first 1–2 tests free, paid for additional attempts or advanced papers
