#!/usr/bin/env python3
"""
gen_tet_config.py — Generate config/tet_types.json from the batch_papers_flat layout.

Folder naming convention: <STATE>_TET_Paper_<PAPER>_<CONTENT?>_<LANGUAGE>
  TS_TET_Paper_2A_Math_Science_Telugu   → TGTET, Paper 2A, math_science, Telugu
  TS_TET_Paper_2A_Social_Studies_Hindi  → TGTET, Paper 2A, social_studies, Hindi
  TS_TET_Paper_1_Bengali                → TGTET, Paper 1,  paper1,        Bengali

Folders that don't end in a known language (Question_Paper, Key, Paper, the
AP scans) are emitted as non-parseable candidates so the ingest skips them
and moves their PDFs to unprocessed/.

The existing TS_TET_Paper_2A_Math_Science_Telugu set is PINNED to the already
-processed bank `tgtet_maths_science_telugu` with legacy_keys=true so its
localStorage / R2 keys are reproduced bit-for-bit (no user-progress loss).

Run:  python3 scripts/gen_tet_config.py   →  writes config/tet_types.json
"""
import json, re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_OUT = REPO_ROOT / "config" / "tet_types.json"
BATCH = Path("/mnt/c/Users/ymano/Universe/coworker/TET Preparation/batch_papers_flat")

# Known language slots (Language-I = the regional/medium language the folder is named for)
LANGUAGES = ["Telugu", "Hindi", "Urdu", "Kannada", "Marathi",
             "Tamil", "Sanskrit", "Bengali", "Gujarati"]

STATE_TO_TET = {"TS": ("TGTET", "TG TET"), "AP": ("APTET", "AP TET")}

# Canonical subject → frontend sectionId
SUBJECT_SECTION_ID = {
    "CDP": "cdp",
    "English": "english",
    "Mathematics": "mathematics",
    "Science": "science",
    "Social Studies": "social",
    "Environmental Studies": "evs",
    "Telugu": "telugu", "Hindi": "hindi", "Urdu": "urdu", "Kannada": "kannada",
    "Marathi": "marathi", "Tamil": "tamil", "Sanskrit": "sanskrit",
    "Bengali": "bengali", "Gujarati": "gujarati",
}

# Section templates per content type. "__LANG1__" is resolved per-stream to the
# folder's language. Question-number ranges are the standard TET Paper structure
# (verified against section headers embedded in the answer-key PDFs).
SECTION_SPECS = {
    "math_science": [
        {"name": "CDP", "start": 1, "end": 30},
        {"name": "__LANG1__", "start": 31, "end": 60},
        {"name": "English", "start": 61, "end": 90},
        {"name": "Mathematics", "start": 91, "end": 120},
        {"name": "Science", "start": 121, "end": 150},
    ],
    "social_studies": [
        {"name": "CDP", "start": 1, "end": 30},
        {"name": "__LANG1__", "start": 31, "end": 60},
        {"name": "English", "start": 61, "end": 90},
        {"name": "Social Studies", "start": 91, "end": 150},
    ],
    "paper1": [
        {"name": "CDP", "start": 1, "end": 30},
        {"name": "__LANG1__", "start": 31, "end": 60},
        {"name": "English", "start": 61, "end": 90},
        {"name": "Mathematics", "start": 91, "end": 120},
        {"name": "Environmental Studies", "start": 121, "end": 150},
    ],
}

CONTENT_SLUG = {"math_science": "maths_science",
                "social_studies": "social_studies",
                "paper1": "paper1"}
CONTENT_LABEL = {"math_science": "Maths/Science",
                 "social_studies": "Social Studies",
                 "paper1": "Paper 1"}
PAPER_LABEL = {"1": "Paper 1", "2A": "Paper 2A"}

# The one bank already extracted + uploaded to R2 — pinned, never re-processed.
PINNED = {
    "TS_TET_Paper_2A_Math_Science_Telugu": {
        "tet_bank": "tgtet_maths_science_telugu",
        "stream": "Maths_Science_Telugu",
        "already_processed": True,
        "legacy_keys": True,
    },
}


def parse_folder(folder: str):
    """Return stream dict, or None if the folder is not a parseable language variant."""
    m = re.match(r"^(TS|AP)_TET_Paper_(1|2A)_(.+)$", folder)
    if not m:
        return None
    state, paper, rest = m.groups()
    tet_type, tet_label = STATE_TO_TET[state]

    # Find a trailing known language
    language = None
    for L in LANGUAGES:
        if rest == L or rest.endswith("_" + L):
            language = L
            break
    if language is None:
        return None  # Question_Paper / Key / Paper / unlabelled AP scan → not a candidate

    content_part = rest[:-len(language)].rstrip("_")
    if paper == "1":
        content = "paper1"
    elif content_part == "Math_Science":
        content = "math_science"
    elif content_part == "Social_Studies":
        content = "social_studies"
    else:
        return None  # unknown content layout

    cslug = CONTENT_SLUG[content]
    stream_machine = f"{CONTENT_LABEL[content].replace('/', '_').replace(' ', '_')}_{language}"
    stream_label = f"{CONTENT_LABEL[content]} · {language}"
    tet_bank = f"{tet_type.lower()}_{cslug}_{language.lower()}"

    rec = {
        "folder": folder,
        "tet_type": tet_type,
        "tet_label": tet_label,
        "paper": paper,
        "paper_label": PAPER_LABEL[paper],
        "content": content,
        "language": language,
        "stream": stream_machine,
        "stream_label": stream_label,
        "tet_bank": tet_bank,
        "already_processed": False,
        "legacy_keys": False,
    }
    # Apply pins (existing bank)
    if folder in PINNED:
        rec.update(PINNED[folder])
    return rec


def main():
    folders = sorted([d.name for d in BATCH.iterdir() if d.is_dir()]) if BATCH.exists() else []
    streams, non_candidates = [], []
    for folder in folders:
        rec = parse_folder(folder)
        (streams if rec else non_candidates).append(rec or folder)

    config = {
        "_comment": "Generated by scripts/gen_tet_config.py. Maps batch_papers_flat folders "
                    "to TET taxonomy + section specs. Edit SECTION_SPECS/PINNED in the "
                    "generator, not this file, then regenerate.",
        "languages": {L: SUBJECT_SECTION_ID[L] for L in LANGUAGES},
        "subject_section_ids": SUBJECT_SECTION_ID,
        "section_specs": SECTION_SPECS,
        "streams": streams,
        "non_candidate_folders": non_candidates,
    }
    CONFIG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_OUT.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"wrote {CONFIG_OUT.relative_to(REPO_ROOT)}")
    print(f"  {len(streams)} parseable stream candidates:")
    for s in streams:
        tag = "  [PINNED/done]" if s.get("already_processed") else ""
        print(f"    {s['tet_bank']:<38} ← {s['folder']}{tag}")
    print(f"  {len(non_candidates)} non-candidate folders (→ unprocessed/): {non_candidates}")


if __name__ == "__main__":
    main()
