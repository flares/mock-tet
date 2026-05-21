# generate-explanations

You are generating bilingual (English + Telugu) study explanations for past TET questions held in `question_bank/`. Read this file end-to-end before doing anything else.

The user invokes this skill with an integer N — "generate explanations for N questions". If no N is given, default to **10**. The skill is intentionally re-runnable: each run picks up the next N questions that still lack an `explanation` field, so the user can call it repeatedly to drain the backlog under token-budget limits.

---

## Architecture (read this first)

Three pieces, each owning a strict slice:

1. **Deterministic Python scanner** (`question_bank/find_candidates.py`) — picks the next N candidates and pre-resolves their correct-option letter from `exams/real-*.json`. Zero LLM tokens. The main agent only runs it.
2. **Sonnet subagents (parallel, batch of 5)** — one per question. Each Reads the 5 PNGs, authors the HTML explanation, and Writes the `explanation` key into that one `metadata.json`. The main agent only dispatches them.
3. **Main agent (you)** — coordinates Phase A/B/C and reports a brief summary. **You never Read images or author explanation content yourself.**

This split keeps the main context tiny no matter how big N is.

---

## Phase A — Pick candidates

1. **Parse N** from the user's invocation. Default to 10 if not given.
2. **Ensure the scanner exists.** Check `question_bank/find_candidates.py`. If absent, recreate it from §"Scanner script — canonical source" below (you have file Edit/Write tools).
3. **Ensure `.gitignore` excludes the transient artefact.** If `question_bank/_pending.jsonl` is not already in `.gitignore`, add it.
4. **Run the scanner** from the repo root:
   ```
   python3 question_bank/find_candidates.py --count <N>
   ```
   It writes `question_bank/_pending.jsonl` (one JSON record per line: `{"folder": "...", "subject": "...", "correct_option": "A|B|C|D"}`) and prints a per-subject summary to stdout.
5. **If 0 candidates**, report "all questions already have explanations" to the user and stop.

---

## Phase B — Dispatch Sonnet subagents in parallel

1. Read `question_bank/_pending.jsonl`. Each non-empty line is one candidate.
2. Dispatch subagents in **batches of 5**, **all five tool calls in a single message** so they run in parallel. Wait for the batch to finish, then dispatch the next batch. Repeat until the JSONL is drained.
3. **Every subagent call** must use:
   - `subagent_type: "general-purpose"`
   - `model: "sonnet"`
   - The prompt template in §"Subagent prompt" below, with `{folder}`, `{subject}`, `{correct_option}` filled in.
4. Collect the one-line confirmations. Do not request, accept, or echo full HTML output back into the main context.

---

## Phase C — Summarise

After every batch is done, report to the user (concise):

- Total processed (e.g. "10 / 10 succeeded")
- Per-subject breakdown
- Any subagent that failed or returned a malformed confirmation — list the folder paths so the user can rerun those
- Any explanation with `confidence-level < 7` — list the folder paths so the user can review manually

**Do not commit or push.** Matches the norm in `create-mock-test.md`. The user owns version-control decisions.

---

## Scanner script — canonical source

If `question_bank/find_candidates.py` is missing, recreate it byte-for-byte from this template. The script is stdlib-only, idempotent, and safe to rerun.

```python
#!/usr/bin/env python3
"""Scan question_bank/ for the next N questions that still lack an `explanation`
field in their metadata.json, and write them — together with the verified
correct-option letter sourced from exams/real-*.json — to _pending.jsonl.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

SUBJECTS = ["CDP", "English", "Mathematics", "Science", "Telugu"]
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
EXAMS_DIR = REPO / "exams"


def build_answer_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for f in sorted(EXAMS_DIR.glob("real-*.json")):
        try:
            data = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError) as e:
            print(f"warn: could not read {f.name}: {e}", file=sys.stderr)
            continue
        for q in data.get("questions", []):
            img, ans = q.get("questionImage"), q.get("correctAnswer")
            if not img or not ans:
                continue
            try:
                letter = "ABCD"[int(ans) - 1]
            except (ValueError, IndexError):
                continue
            index[Path(img).parent.name] = letter
    return index


def find_candidates(n: int, answer_index: dict[str, str]) -> list[dict]:
    candidates: list[dict] = []
    for subj in SUBJECTS:
        subj_dir = ROOT / subj
        if not subj_dir.is_dir():
            continue
        for folder in sorted(subj_dir.iterdir()):
            if not folder.is_dir():
                continue
            meta_path = folder / "metadata.json"
            if not meta_path.is_file():
                continue
            try:
                meta = json.loads(meta_path.read_text())
            except json.JSONDecodeError:
                continue
            if "explanation" in meta:
                continue
            correct = answer_index.get(folder.name)
            if correct is None:
                continue
            candidates.append({
                "folder": str(folder.resolve()),
                "subject": subj,
                "correct_option": correct,
            })
            if len(candidates) == n:
                return candidates
    return candidates


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--count", type=int, default=10)
    p.add_argument("--output", type=Path, default=ROOT / "_pending.jsonl")
    args = p.parse_args()
    index = build_answer_index()
    cands = find_candidates(args.count, index)
    args.output.write_text(
        "\n".join(json.dumps(c, ensure_ascii=False) for c in cands)
        + ("\n" if cands else "")
    )
    counts = Counter(c["subject"] for c in cands)
    print(f"{len(cands)} candidates -> {args.output.relative_to(REPO)}")
    for subj in SUBJECTS:
        if counts[subj]:
            print(f"  {subj}: {counts[subj]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

---

## Subagent prompt

Use this **exactly** for every dispatched subagent (fill `{folder}`, `{subject}`, `{correct_option}`):

```
You are a TET tutor. Generate a bilingual (English + Telugu) study explanation for one past-paper question, then write it into the question's metadata.json. Bilingual means: every text element appears in BOTH English and Telugu script (UTF-8). Keep technical terms in English with Telugu glosses where they aid recall. Do NOT invent theorists, dates, or terms — if unsure, say so in the short explanation.

INPUT:
  Folder: {folder}
  Subject: {subject}
  Correct option (verified from the official answer key — do not second-guess it): {correct_option}

STEPS:
  1. Read all five images in the folder using the Read tool:
       {folder}/question.png
       {folder}/option1.png
       {folder}/option2.png
       {folder}/option3.png
       {folder}/option4.png
     Each image has English text on top and Telugu below. Extract both verbatim.
  2. Author ONE HTML fragment matching the structure below.
  3. Read {folder}/metadata.json with the Read tool, parse it, ADD a single new top-level key called `explanation` with this shape (no other keys touched):
       "explanation": {
         "html_text": "<the HTML string>",
         "confidence-level": <integer 1-10>
       }
     `confidence-level` reflects YOUR confidence in the pedagogical quality of the explanation (concept notes, mnemonic, distractor analysis). The correctness of the answer is already established — confidence is about the explanation, not the answer. Use <7 honestly if the Telugu OCR was hard, the passage was ambiguous, or you had to hedge in concept notes.
  4. Write the updated JSON back to the same metadata.json. Use 2-space indent and ensure_ascii=False so Telugu glyphs are preserved as UTF-8 (not \u-escaped).
  5. Reply with EXACTLY one line: "<folder-name>: ok, conf=<N>". Do not echo the HTML or JSON back. Do not add commentary.

HTML STRUCTURE — use exactly these classes and section ids so future CSS can style them. Add the literal class ` correct` to the matching <li> only.

<div class="tet-explanation" data-subject="{SUBJECT_AREA}">
  <section class="question">
    <h3>Question / ప్రశ్న</h3>
    <p class="en">{English question}</p>
    <p class="te">{Telugu question}</p>
  </section>
  <section class="options">
    <ol type="A">
      <li class="option"><span class="en">{A en}</span><span class="te">{A te}</span></li>
      <li class="option"><span class="en">{B en}</span><span class="te">{B te}</span></li>
      <li class="option"><span class="en">{C en}</span><span class="te">{C te}</span></li>
      <li class="option"><span class="en">{D en}</span><span class="te">{D te}</span></li>
    </ol>
  </section>
  <section class="answer">
    <h3>Correct answer: {LETTER}</h3>
    <p class="en">{correct option in English}</p>
    <p class="te">{correct option in Telugu}</p>
  </section>
  <section class="short-explanation">
    <h3>Why this is right</h3>
    <p>{3-5 lines in plain language}</p>
  </section>
  <section class="why-others-wrong">
    <h3>Why the others are wrong</h3>
    <p>{one short paragraph or one line per distractor}</p>
  </section>
  <section class="concept-notes">
    <h3>Concept notes</h3>
    <p>{150-200 words: underlying theory, key theorist, important terms, related distinctions}</p>
  </section>
  <section class="corollary-questions">
    <h3>Likely spin-off TET questions</h3>
    <ol>
      <li>{spin-off Q1}</li>
      <li>{spin-off Q2}</li>
      <li>{spin-off Q3}</li>
    </ol>
  </section>
  <section class="memory-hook">
    <h3>Memory hook</h3>
    <p>{one crisp mnemonic or contrast sentence}</p>
  </section>
</div>

SUBJECT_AREA mapping (use for the data-subject attribute):
  CDP         -> "Child Development & Pedagogy"
  English     -> "Language"
  Telugu      -> "Language"
  Mathematics -> "Maths"
  Science     -> "Science"

Set the matching <li> for the correct option to `<li class="option correct">`. All other <li>s keep `class="option"`.

JSON note: the HTML lives inside a JSON string, so escape inner double quotes as \" and newlines as \n when you build the JSON. Telugu glyphs MUST be preserved as UTF-8, not \u-escaped.
```

---

## Subject area mapping (canonical)

| Folder name | data-subject value |
|---|---|
| `CDP` | Child Development & Pedagogy |
| `English` | Language |
| `Telugu` | Language |
| `Mathematics` | Maths |
| `Science` | Science |

---

## Rules of thumb

1. **Accuracy above all.** The answer key is authoritative — never override `correct_option`.
2. **One-question-per-subagent.** Don't try to pack multiple questions into one subagent; image context bloats fast.
3. **Batch of 5 parallel.** More wastes parallelism on stragglers; fewer wastes wall-clock. Stick to 5.
4. **Preserve all existing metadata keys.** The only edit is adding the new `explanation` key.
5. **No commits, no pushes.** The user controls when work goes into git.
6. **Re-running is normal.** Each invocation is independent; the scanner finds whatever is still missing.
