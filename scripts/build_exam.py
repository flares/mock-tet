#!/usr/bin/env python3
"""
build_exam.py — assemble a Mock TET exam JSON from raw section files.

Usage:
    python3 scripts/build_exam.py <exam-id>

Reads:
    exams/_raw/<exam-id>/meta.txt
    exams/_raw/<exam-id>/<section>.txt   (one file per section listed in meta)

Writes:
    exams/<exam-id>.json
    exams/manifest.json                  (entry appended or replaced)

The script owns the JSON schema. No *Hindi fields are emitted.
Telugu sections carry Telugu (UTF-8) content; all other sections are English.
"""

import json
import re
import sys
from pathlib import Path
import importlib.util as _ilu

REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMS_DIR = REPO_ROOT / "exams"
RAW_DIR = EXAMS_DIR / "_raw"
MANIFEST_PATH = EXAMS_DIR / "manifest.json"

SECTIONS = {
    "cdp":     {"name": "Child Development & Pedagogy", "shortName": "CDP",     "questionCount": 30},
    "english": {"name": "English",                      "shortName": "English", "questionCount": 30},
    "telugu":  {"name": "Telugu",                       "shortName": "Telugu",  "questionCount": 30},
    "math":    {"name": "Mathematics",                  "shortName": "Math",    "questionCount": 30},
    "science": {"name": "Science",                      "shortName": "Science", "questionCount": 30},
}

CONDUCTING_BODY = "Central Board of Secondary Education"


def build_instructions(total_questions: int, duration_minutes: int) -> list[str]:
    hours, mins = divmod(duration_minutes, 60)
    if hours and mins:
        duration_phrase = f"{hours} hour{'s' if hours != 1 else ''} and {mins} minutes ({duration_minutes} minutes)"
    elif hours:
        duration_phrase = f"{hours} hour{'s' if hours != 1 else ''} ({duration_minutes} minutes)"
    else:
        duration_phrase = f"{duration_minutes} minutes"
    return [
        f"This test comprises {total_questions} questions, each carrying 1 mark.",
        "All questions are compulsory. There is no negative marking for wrong answers.",
        f"The exam duration is {duration_phrase}.",
        "The timer will start as soon as you click 'Start Test'. The test will auto-submit when the timer reaches 00:00:00.",
        "Use the question palette on the right to navigate directly to any question.",
        "Click 'Save & Next' to save your answer and move to the next question. Answers are NOT saved automatically.",
        "Use 'Mark for Review & Next' to flag a question for later review. If you have answered it, the answer will still be counted.",
        "Use 'Clear Response' to deselect your chosen option for the current question.",
        "You can switch between sections at any time using the section tabs in the header.",
        "Do not refresh or close the browser window during the exam — your progress is saved but it is not recommended.",
        "Click 'Submit' to end the exam before the timer expires. A confirmation screen will appear.",
    ]


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_meta(path: Path) -> dict:
    if not path.is_file():
        die(f"meta file not found: {path}")
    meta = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            die(f"{path.name}: malformed line (no colon): {line!r}")
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip()
    for required in ("id", "title", "type", "targetClasses", "sections"):
        if required not in meta:
            die(f"{path.name}: missing required field {required!r}")
    return meta


QUESTION_OPEN = re.compile(r"^Q(\d+)\s+(.+)$")
OPTION_LINE = re.compile(r"^([A-D])\)\s*(.*?)(\s\*)?$")
EXPLANATION_LINE = re.compile(r"^E\s+(.+)$")


def parse_section(path: Path, section_id: str, expected_count: int) -> list[dict]:
    if not path.is_file():
        die(f"section file not found: {path}")

    blocks: list[list[str]] = []
    current: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("#"):
            continue
        if not line.strip():
            if current:
                blocks.append(current)
                current = []
            continue
        current.append(line)
    if current:
        blocks.append(current)

    if len(blocks) != expected_count:
        die(f"{section_id}: expected {expected_count} questions, found {len(blocks)}")

    questions: list[dict] = []
    for i, block in enumerate(blocks, start=1):
        q = parse_question_block(block, section_id, i)
        questions.append(q)
    return questions


def parse_question_block(lines: list[str], section_id: str, q_index: int) -> dict:
    where = f"{section_id} Q{q_index}"
    if len(lines) < 6:
        die(f"{where}: expected 6 lines (1 question + 4 options + 1 explanation), found {len(lines)}")

    head = QUESTION_OPEN.match(lines[0])
    if not head:
        die(f"{where}: first line must start with 'Q<n> <text>', got: {lines[0]!r}")
    if int(head.group(1)) != q_index:
        die(f"{where}: question number mismatch (file says Q{head.group(1)}, expected Q{q_index})")
    question_text = head.group(2).strip()

    options: list[dict] = []
    correct_keys: list[str] = []
    expected_keys = ["A", "B", "C", "D"]
    for j in range(4):
        line = lines[1 + j]
        m = OPTION_LINE.match(line)
        if not m:
            die(f"{where}: option line {j + 1} malformed: {line!r}")
        key, text, star = m.group(1), m.group(2).strip(), m.group(3)
        if key != expected_keys[j]:
            die(f"{where}: option {j + 1} should be '{expected_keys[j]})', got '{key})'")
        if not text:
            die(f"{where}: option {key} has empty text")
        options.append({"key": key, "text": text})
        if star:
            correct_keys.append(key)

    if len(correct_keys) != 1:
        die(f"{where}: must have exactly one option marked with ' *', found {len(correct_keys)}")

    exp_match = EXPLANATION_LINE.match(lines[5])
    if not exp_match:
        die(f"{where}: explanation line must start with 'E ', got: {lines[5]!r}")

    if len(lines) > 6:
        die(f"{where}: unexpected extra lines after explanation")

    return {
        "text": question_text,
        "options": options,
        "correctAnswer": correct_keys[0],
        "explanation": exp_match.group(1).strip(),
    }


def assemble_exam(meta: dict) -> dict:
    section_ids = meta["sections"].split()
    for sid in section_ids:
        if sid not in SECTIONS:
            die(f"unknown section id: {sid!r} (known: {sorted(SECTIONS)})")

    exam_id = meta["id"]
    raw_exam_dir = RAW_DIR / exam_id

    section_objs: list[dict] = []
    all_questions: list[dict] = []
    cumulative = 0
    for sid in section_ids:
        reg = SECTIONS[sid]
        section_obj = {
            "id": sid,
            "name": reg["name"],
            "shortName": reg["shortName"],
            "questionCount": reg["questionCount"],
            "startIndex": cumulative,
        }
        section_objs.append(section_obj)

        parsed = parse_section(raw_exam_dir / f"{sid}.txt", sid, reg["questionCount"])
        for offset, q in enumerate(parsed):
            global_idx = cumulative + offset
            all_questions.append({
                "id": f"q{global_idx + 1}",
                "sectionId": sid,
                "globalIndex": global_idx,
                "text": q["text"],
                "options": q["options"],
                "correctAnswer": q["correctAnswer"],
                "explanation": q["explanation"],
            })
        cumulative += reg["questionCount"]

    total_questions = cumulative
    duration = total_questions

    return {
        "id": exam_id,
        "title": meta["title"],
        "type": meta["type"],
        "conductingBody": CONDUCTING_BODY,
        "duration": duration,
        "totalMarks": total_questions,
        "totalQuestions": total_questions,
        "negativeMarking": False,
        "marksPerQuestion": 1,
        "instructions": build_instructions(total_questions, duration),
        "sections": section_objs,
        "questions": all_questions,
    }


def update_manifest(exam: dict, meta: dict) -> None:
    if MANIFEST_PATH.is_file():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    else:
        manifest = {"exams": []}
    if "exams" not in manifest or not isinstance(manifest["exams"], list):
        manifest["exams"] = []

    subtitle = ", ".join(s["name"] for s in exam["sections"])
    entry = {
        "id": exam["id"],
        "title": exam["title"],
        "subtitle": subtitle,
        "type": exam["type"],
        "targetClasses": meta["targetClasses"],
        "duration": exam["duration"],
        "totalQuestions": exam["totalQuestions"],
        "totalMarks": exam["totalMarks"],
        "negativeMarking": exam["negativeMarking"],
        "file": f"exams/{exam['id']}.json",
    }

    replaced = False
    for i, existing in enumerate(manifest["exams"]):
        if existing.get("id") == exam["id"]:
            manifest["exams"][i] = entry
            replaced = True
            break
    if not replaced:
        manifest["exams"].append(entry)

    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    if len(sys.argv) != 2:
        die("usage: python3 scripts/build_exam.py <exam-id>")
    exam_id = sys.argv[1]

    meta = parse_meta(RAW_DIR / exam_id / "meta.txt")
    if meta["id"] != exam_id:
        die(f"meta.txt id ({meta['id']!r}) does not match argument ({exam_id!r})")

    exam = assemble_exam(meta)

    out_path = EXAMS_DIR / f"{exam_id}.json"
    out_path.write_text(
        json.dumps(exam, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    update_manifest(exam, meta)

    print(f"built {out_path.relative_to(REPO_ROOT)} ({exam['totalQuestions']} questions, {exam['duration']} min) → manifest updated")

    # Keep the question-bank index in sync
    _spec = _ilu.spec_from_file_location("build_qb_index", Path(__file__).parent / "build_qb_index.py")
    _mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod); _mod.build()


if __name__ == "__main__":
    main()
