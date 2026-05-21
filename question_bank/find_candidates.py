#!/usr/bin/env python3
"""Scan question_bank/ for the next N questions that still lack an `explanation`
field in their metadata.json, and write them — together with the verified
correct-option letter sourced from exams/real-*.json — to _pending.jsonl.

Re-runnable: every invocation queries live state, so it picks up wherever the
previous run left off.

Usage:
    python3 question_bank/find_candidates.py --count 10
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

SUBJECTS = ["CDP", "English", "Mathematics", "Science", "Telugu"]
ROOT = Path(__file__).resolve().parent          # question_bank/
REPO = ROOT.parent
EXAMS_DIR = REPO / "exams"


def build_answer_index() -> dict[str, str]:
    """Map question-folder name → correct option letter (A/B/C/D).

    Sourced from exams/real-*.json — every question there carries a
    `questionImage` of shape `question_bank/<Subject>/<folder>/question.png`
    plus a `correctAnswer` of "1".."4".
    """
    index: dict[str, str] = {}
    for f in sorted(EXAMS_DIR.glob("real-*.json")):
        try:
            data = json.loads(f.read_text())
        except (OSError, json.JSONDecodeError) as e:
            print(f"warn: could not read {f.name}: {e}", file=sys.stderr)
            continue
        for q in data.get("questions", []):
            img = q.get("questionImage")
            ans = q.get("correctAnswer")
            if not img or not ans:
                continue
            try:
                letter = "ABCD"[int(ans) - 1]
            except (ValueError, IndexError):
                continue
            folder_name = Path(img).parent.name
            index[folder_name] = letter
    return index


def find_candidates(n: int, answer_index: dict[str, str]) -> list[dict]:
    candidates: list[dict] = []
    for subj in SUBJECTS:
        subj_dir = ROOT / subj
        if not subj_dir.is_dir():
            print(f"warn: missing subject dir {subj_dir}", file=sys.stderr)
            continue
        for folder in sorted(subj_dir.iterdir()):
            if not folder.is_dir():
                continue
            meta_path = folder / "metadata.json"
            if not meta_path.is_file():
                continue
            try:
                meta = json.loads(meta_path.read_text())
            except json.JSONDecodeError as e:
                print(f"warn: bad json {meta_path}: {e}", file=sys.stderr)
                continue
            if "explanation" in meta:
                continue
            correct = answer_index.get(folder.name)
            if correct is None:
                print(
                    f"warn: no answer-key mapping for {folder.name}; skipping",
                    file=sys.stderr,
                )
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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=10,
                        help="how many candidates to collect (default: 10)")
    parser.add_argument("--output", type=Path, default=ROOT / "_pending.jsonl",
                        help="output JSONL path (default: question_bank/_pending.jsonl)")
    args = parser.parse_args()

    if args.count < 1:
        parser.error("--count must be >= 1")

    index = build_answer_index()
    if not index:
        print("error: built empty answer index from exams/real-*.json", file=sys.stderr)
        return 2

    candidates = find_candidates(args.count, index)
    args.output.write_text(
        "\n".join(json.dumps(c, ensure_ascii=False) for c in candidates)
        + ("\n" if candidates else "")
    )

    counts = Counter(c["subject"] for c in candidates)
    print(f"{len(candidates)} candidates -> {args.output.relative_to(REPO)}")
    for subj in SUBJECTS:
        if counts[subj]:
            print(f"  {subj}: {counts[subj]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
