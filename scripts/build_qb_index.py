#!/usr/bin/env python3
"""
build_qb_index.py — flatten every Real Paper exam JSON into a single
question-bank index file consumed by qb_pwa.html.

The PWA previously had to fetch 17 exam JSONs (~1.3 MB total) and dedupe
in-browser before rendering Q1. With this index it fetches one file and
renders immediately.

Writes:
    exams/qb_index.json     — flat array, deduped on questionImage

Run automatically at the end of scripts/build_exam.py.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMS_DIR = REPO_ROOT / "exams"
MANIFEST_PATH = EXAMS_DIR / "manifest.json"
INDEX_PATH = EXAMS_DIR / "qb_index.json"


def build() -> None:
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        manifest = json.load(fh)

    real_exams = [e for e in manifest.get("exams", []) if e.get("type") == "Real Paper"]
    seen: set[str] = set()
    out: list[dict] = []

    for exam in real_exams:
        exam_path = EXAMS_DIR / f"{exam['id']}.json"
        if not exam_path.exists():
            print(f"  skip {exam['id']} — file missing")
            continue
        with exam_path.open(encoding="utf-8") as fh:
            data = json.load(fh)
        exam_title = data.get("title") or exam.get("title", "")
        for q in data.get("questions", []):
            qimg = q.get("questionImage")
            if not qimg or qimg in seen:
                continue
            seen.add(qimg)
            out.append({
                "questionImage":     qimg,
                "optionImages":      q.get("optionImages", []),
                "optionsInQuestion": bool(q.get("optionsInQuestion")),
                "questionType":      q.get("questionType"),
                "correctAnswer":     q.get("correctAnswer"),
                "sectionId":         q.get("sectionId"),
                "globalIndex":       q.get("globalIndex"),
                "examId":            data.get("id"),
                "examTitle":         exam_title,
            })

    with INDEX_PATH.open("w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    size_kb = INDEX_PATH.stat().st_size / 1024
    print(f"wrote {INDEX_PATH.relative_to(REPO_ROOT)}: {len(out)} questions, {size_kb:.1f} kB")


if __name__ == "__main__":
    build()
