#!/usr/bin/env python3
"""
build_qb_index.py — build the PWA question-bank index directly from
question_bank/questions.json, bypassing the real-*.json intermediate files.

Previously depended on build_real_exams.py having been run first (to produce
real-*.json). Now reads the master source directly, making this script
self-contained for the QB PWA pipeline.

Writes:
    exams/qb_index.json  — flat array of 3150 question objects

Called via:
  python3 scripts/build_qb_index.py        # standalone
  (also called by build_real_exams.py at the end of its run)
"""

import json
from pathlib import Path

REPO_ROOT  = Path(__file__).resolve().parent.parent
QB_PATH    = REPO_ROOT / "question_bank" / "questions.json"
INDEX_PATH = REPO_ROOT / "exams" / "qb_index.json"

SECTION_ORDER = ["CDP", "Telugu", "English", "Mathematics", "Science"]
SECTION_ID = {
    "CDP":         "cdp",
    "Telugu":      "telugu",
    "English":     "english",
    "Mathematics": "mathematics",
    "Science":     "science",
}


def make_title(paper_id: str) -> str:
    # "2026-Jan-03-Shift1" → "03 Jan 2026 — Shift 1"
    year, month, day, shift_raw = paper_id.split("-")
    return f"{day} {month} {year} — Shift {shift_raw.replace('Shift', '')}"


def build() -> None:
    qb = json.loads(QB_PATH.read_text(encoding="utf-8"))

    seen: set[str] = set()
    out: list[dict] = []

    for subj in SECTION_ORDER:
        for q in qb.get(subj, []):
            qimg = q.get("question")
            if not qimg or qimg in seen:
                continue
            seen.add(qimg)
            paper = q.get("paper", "")
            correct = q.get("correct_answer")
            out.append({
                "questionImage":     qimg,
                "optionImages":      q.get("options", []),
                "optionsInQuestion": bool(q.get("options_in_question_image", False)),
                "questionType":      "image",
                "correctAnswer":     str(correct) if correct is not None else None,
                "sectionId":         SECTION_ID.get(subj, subj.lower()),
                "globalIndex":       q["q_num"] - 1,
                "examId":            f"real-{paper}",
                "examTitle":         make_title(paper) if paper else "",
            })

    INDEX_PATH.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    size_kb = INDEX_PATH.stat().st_size / 1024
    print(f"wrote {INDEX_PATH.relative_to(REPO_ROOT)}: {len(out)} questions, {size_kb:.1f} kB")


if __name__ == "__main__":
    build()
