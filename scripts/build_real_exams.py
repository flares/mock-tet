#!/usr/bin/env python3
"""
build_real_exams.py — regenerate all real-paper exam JSONs from question_bank/questions.json.

Run after every question_bank sync from the coworker. Always regenerates ALL papers,
not just new ones — questions.json is the sole source of truth for correctAnswer and
image paths. Existing exam JSONs may drift if correctAnswer values are corrected upstream.

Writes:
    exams/real-<paper_id>.json   for every paper in questions.json
    exams/manifest.json          updated with all real-paper entries
    exams/qb_index.json          rebuilt at the end
"""

import json
import importlib.util as ilu
from pathlib import Path

REPO_ROOT    = Path(__file__).resolve().parent.parent
QB_PATH      = REPO_ROOT / "question_bank/questions.json"
EXAMS_DIR    = REPO_ROOT / "exams"
MANIFEST_PATH = EXAMS_DIR / "manifest.json"

SECTION_ORDER = [
    ("CDP",         "cdp",         "Child Development & Pedagogy", "CDP"),
    ("Telugu",      "telugu",      "Telugu",                       "Telugu"),
    ("English",     "english",     "English",                      "English"),
    ("Mathematics", "mathematics", "Mathematics",                   "Math"),
    ("Science",     "science",     "Science",                       "Science"),
]

INSTRUCTIONS = [
    "This is a 150-question paper with 5 sections (30 questions each).",
    "Each question carries 1 mark. There is no negative marking.",
    "Questions are displayed as images from the original exam paper.",
    "Use the question palette on the right to navigate between questions.",
    "Mark questions for review using the 'Mark & Next' button.",
    "You can change your answer at any time before submitting.",
    "The timer will auto-submit when time expires.",
]


def make_title(paper_id: str) -> str:
    # "2026-Jan-03-Shift1" → "03 Jan 2026 — Shift 1"
    year, month, day, shift_raw = paper_id.split("-")
    return f"{day} {month} {year} — Shift {shift_raw.replace('Shift', '')}"


def build() -> None:
    qb = json.loads(QB_PATH.read_text(encoding="utf-8"))

    # All unique paper IDs, sorted chronologically
    all_papers = sorted(set(q["paper"] for q in qb["CDP"]))

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.is_file() else {"exams": []}

    for paper_id in all_papers:
        questions, sections = [], []
        global_idx, start = 0, 0

        for subj_key, sec_id, sec_name, sec_short in SECTION_ORDER:
            qs = sorted([q for q in qb[subj_key] if q["paper"] == paper_id], key=lambda q: q["q_num"])
            if len(qs) != 30:
                print(f"  WARNING: {paper_id}/{subj_key} has {len(qs)} questions (expected 30)")

            sections.append({"id": sec_id, "name": sec_name, "shortName": sec_short,
                              "questionCount": len(qs), "startIndex": start})

            for q in qs:
                questions.append({
                    "id":               f"q{global_idx + 1}",
                    "sectionId":        sec_id,
                    "globalIndex":      global_idx,
                    "questionType":     "image",
                    "questionImage":    q["question"],
                    "optionImages":     q["options"],
                    "optionsInQuestion": bool(q.get("options_in_question_image", False)),
                    "correctAnswer":    str(q["correct_answer"]),
                })
                global_idx += 1
            start += len(qs)

        exam_id = f"real-{paper_id}"
        exam = {
            "id":              exam_id,
            "title":           make_title(paper_id),
            "type":            "Real Paper",
            "conductingBody":  "CTET",
            "duration":        150,
            "totalMarks":      150,
            "totalQuestions":  150,
            "negativeMarking": False,
            "marksPerQuestion": 1,
            "instructions":    INSTRUCTIONS,
            "sections":        sections,
            "questions":       questions,
        }

        out = EXAMS_DIR / f"{exam_id}.json"
        out.write_text(json.dumps(exam, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        entry = {
            "id":             exam_id,
            "title":          exam["title"],
            "subtitle":       "Child Development & Pedagogy, Telugu, English, Mathematics, Science",
            "type":           "Real Paper",
            "targetClasses":  "VI–VIII",
            "duration":       150,
            "totalQuestions": 150,
            "totalMarks":     150,
            "negativeMarking": False,
            "file":           f"exams/{exam_id}.json",
        }
        replaced = False
        for i, e in enumerate(manifest["exams"]):
            if e.get("id") == exam_id:
                manifest["exams"][i] = entry; replaced = True; break
        if not replaced:
            manifest["exams"].append(entry)

        print(f"  {exam_id}  ({len(questions)} questions)")

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"manifest updated — {len(all_papers)} real papers")

    spec = ilu.spec_from_file_location("build_qb_index", Path(__file__).parent / "build_qb_index.py")
    mod  = ilu.module_from_spec(spec); spec.loader.exec_module(mod); mod.build()


if __name__ == "__main__":
    build()
