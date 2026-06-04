#!/usr/bin/env python3
"""
build_qb_index.py — Build the PWA question-bank index.

Primary path: reads qb/<tet_bank>/Q*_metadata.json (flat, written by build_flat_qb.py).
Fallback:     reads question_bank/questions.json + per-question metadata.json directly
              (used if the qb/ folder has not been built yet).

Each output entry includes:
  questionImage   — old-style path kept for localStorage compat (progress not lost on upgrade)
  spriteUrl       — R2 sprite URL served via the Cloudflare Worker
  sprite          — {question:{y,h,w}, option1:…, …} crop coordinates
  tet_type/stream/tet_bank — TET taxonomy

Usage:
  python3 scripts/build_qb_index.py
"""

import json
from pathlib import Path

REPO_ROOT    = Path(__file__).resolve().parent.parent
QB_PATH      = REPO_ROOT / "question_bank" / "questions.json"
INDEX_PATH   = REPO_ROOT / "exams" / "qb_index.json"

WORKER_BASE = "https://tet-qb-worker.y-manojkrishna.workers.dev"
TET_BANK    = "tgtet_maths_science_telugu"
TET_TYPE    = "TGTET"
STREAM      = "Maths_Science_Telugu"

SECTION_ORDER = ["CDP", "Telugu", "English", "Mathematics", "Science"]
SECTION_ID = {
    "CDP":         "cdp",
    "Telugu":      "telugu",
    "English":     "english",
    "Mathematics": "mathematics",
    "Science":     "science",
}


def make_title(paper_id: str) -> str:
    try:
        year, month, day, shift_raw = paper_id.split("-")
        return f"{day} {month} {year} — Shift {shift_raw.replace('Shift', '')}"
    except Exception:
        return paper_id


def _entry_from_flat(meta: dict) -> dict:
    q_id    = meta.get("q_id", "")
    subj    = meta.get("subject", "")
    paper   = meta.get("paper_id", "")
    correct = meta.get("correct_answer")
    bank    = meta.get("tet_bank", TET_BANK)
    return {
        "questionImage":     meta.get("legacy_question_path", ""),
        "optionsInQuestion": bool(meta.get("options_in_question_image", False)),
        "questionType":      "image",
        "correctAnswer":     str(correct) if correct is not None else None,
        "sectionId":         SECTION_ID.get(subj, subj.lower()),
        "globalIndex":       meta.get("q_num", 1) - 1,
        "examId":            f"real-{paper}",
        "examTitle":         make_title(paper) if paper else "",
        "tet_type":          meta.get("tet_type", TET_TYPE),
        "stream":            meta.get("stream", STREAM),
        "tet_bank":          bank,
        "spriteUrl":         f"{WORKER_BASE}/qb/{bank}/Q{q_id}_sprite.png" if q_id else None,
        "sprite":            meta.get("sprite", {}),
    }


def build_from_flat(bank_dir: Path) -> list:
    """Build index from qb/<tet_bank>/Q*_metadata.json flat files."""
    meta_files = sorted(bank_dir.glob("Q*_metadata.json"))
    if not meta_files:
        raise FileNotFoundError(f"No Q*_metadata.json files in {bank_dir}")

    by_subject: dict[str, list] = {s: [] for s in SECTION_ORDER}
    for mf in meta_files:
        try:
            meta = json.loads(mf.read_text(encoding="utf-8"))
            subj = meta.get("subject", "")
            by_subject.setdefault(subj, []).append(meta)
        except Exception as e:
            print(f"  [WARN] {mf.name}: {e}")

    seen: set[str] = set()
    out: list[dict] = []
    for subj in SECTION_ORDER:
        entries = sorted(by_subject.get(subj, []),
                         key=lambda m: (m.get("paper_id", ""), m.get("q_num", 0)))
        for meta in entries:
            qimg = meta.get("legacy_question_path", "")
            if not qimg or qimg in seen:
                continue
            seen.add(qimg)
            out.append(_entry_from_flat(meta))
    return out


def build_from_questions_json() -> list:
    """Fallback: build from question_bank/questions.json + per-question metadata.json."""
    qb = json.loads(QB_PATH.read_text(encoding="utf-8"))
    seen: set[str] = set()
    out: list[dict] = []
    for subj in SECTION_ORDER:
        for q in qb.get(subj, []):
            qimg = q.get("question")
            if not qimg or qimg in seen:
                continue
            seen.add(qimg)
            meta_path = REPO_ROOT / Path(qimg).parent / "metadata.json"
            sprite_coords: dict = {}
            if meta_path.exists():
                try:
                    sprite_coords = json.loads(
                        meta_path.read_text(encoding="utf-8")
                    ).get("sprite", {})
                except Exception:
                    pass
            q_id    = q.get("q_id", "")
            paper   = q.get("paper", "")
            correct = q.get("correct_answer")
            out.append({
                "questionImage":     qimg,
                "optionsInQuestion": bool(q.get("options_in_question_image", False)),
                "questionType":      "image",
                "correctAnswer":     str(correct) if correct is not None else None,
                "sectionId":         SECTION_ID.get(subj, subj.lower()),
                "globalIndex":       q["q_num"] - 1,
                "examId":            f"real-{paper}",
                "examTitle":         make_title(paper) if paper else "",
                "tet_type":          TET_TYPE,
                "stream":            STREAM,
                "tet_bank":          TET_BANK,
                "spriteUrl":         f"{WORKER_BASE}/qb/{TET_BANK}/Q{q_id}_sprite.png" if q_id else None,
                "sprite":            sprite_coords,
            })
    return out


def build() -> None:
    bank_dir = REPO_ROOT / "qb" / TET_BANK
    if bank_dir.exists() and any(bank_dir.glob("Q*_metadata.json")):
        print(f"Reading from {bank_dir.relative_to(REPO_ROOT)}/")
        out = build_from_flat(bank_dir)
    else:
        print(f"qb/{TET_BANK}/ not found — falling back to question_bank/questions.json")
        out = build_from_questions_json()

    INDEX_PATH.write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    size_kb     = INDEX_PATH.stat().st_size / 1024
    with_sprites = sum(1 for e in out if e.get("sprite"))
    print(f"wrote {INDEX_PATH.relative_to(REPO_ROOT)}: {len(out)} questions, {size_kb:.1f} kB")
    print(f"  {with_sprites}/{len(out)} questions have sprite coords")


if __name__ == "__main__":
    build()
