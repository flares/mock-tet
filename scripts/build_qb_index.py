#!/usr/bin/env python3
"""
build_qb_index.py — Build the PWA question-bank indexes (multi-TET, Task 7).

For every bank present under qb/<tet_bank>/ it writes one per-stream index:
    exams/qb_index_<tet_bank>.json
and a small top-level manifest the PWA loads first to render the
TET → Paper → Stream selector with per-stream paper/question counts:
    exams/qb_manifest.json

Backward compat: exams/qb_index.json is also written as a copy of the pinned
legacy bank (tgtet_maths_science_telugu) so old cached PWA installs and the
service worker keep working through the transition.

Key reconstruction:
  • Legacy bank (legacy_keys=true in config): questionImage / examId reproduced
    bit-for-bit  →  question_bank/<Subject>/<paper>_Q<NNN>_<id>/question.png,
    real-<paper>.  No user-progress loss.
  • New banks: keys are namespaced by tet_bank so q_id collisions across banks
    (the same exam printed in many languages) never clash.

Reads stream taxonomy + section ordering from config/tet_types.json.

Usage:  python3 scripts/build_qb_index.py
"""
import json
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT   = Path(__file__).resolve().parent.parent
QB_BASE     = REPO_ROOT / "qb"
EXAMS_DIR   = REPO_ROOT / "exams"
CONFIG      = REPO_ROOT / "config" / "tet_types.json"
WORKER_BASE = "https://tet-qb-worker.y-manojkrishna.workers.dev"

LEGACY_BANK = "tgtet_maths_science_telugu"


def make_title(paper_id: str) -> str:
    try:
        year, month, day, shift_raw = paper_id.split("-")
        return f"{day} {month} {year} — Shift {shift_raw.replace('Shift', '')}"
    except Exception:
        return paper_id


def ordered_subjects(stream_cfg: dict, config: dict) -> list:
    """Canonical [(subject_name, section_id)] order for a stream, from its section spec."""
    spec = config["section_specs"][stream_cfg["content"]]
    sid  = config["subject_section_ids"]
    out  = []
    for sec in spec:
        name = stream_cfg["language"] if sec["name"] == "__LANG1__" else sec["name"]
        out.append((name, sid.get(name, name.lower().replace(" ", "_"))))
    return out


def build_entry(meta: dict, stream_cfg: dict, section_id: str) -> dict:
    q_id    = meta.get("q_id", "")
    subj    = meta.get("subject", "")
    paper   = meta.get("paper_id", "")
    correct = meta.get("correct_answer")
    bank    = meta.get("tet_bank", stream_cfg["tet_bank"])
    legacy  = stream_cfg.get("legacy_keys", False)
    q_num   = meta.get("q_num", 1)

    if legacy:
        folder    = f"{paper}_Q{q_num:03d}_{q_id}"
        questionImage = f"question_bank/{subj}/{folder}/question.png"
        examId    = f"real-{paper}"
    else:
        folder    = f"{bank}__{paper}_Q{q_num:03d}_{q_id}"
        questionImage = f"question_bank/{subj}/{folder}/question.png"
        examId    = f"{bank}__{paper}"

    return {
        "questionImage":     questionImage,
        "optionsInQuestion": bool(meta.get("options_in_question_image", False)),
        "questionType":      "image",
        "correctAnswer":     str(correct) if correct is not None else None,
        "sectionId":         section_id,
        "globalIndex":       q_num - 1,
        "examId":            examId,
        "examTitle":         make_title(paper) if paper else "",
        "tet_type":          meta.get("tet_type", stream_cfg["tet_type"]),
        "stream":            meta.get("stream", stream_cfg["stream"]),
        "tet_bank":          bank,
        "spriteUrl":         f"{WORKER_BASE}/qb/{bank}/Q{q_id}_sprite.png" if q_id else None,
        "sprite":            meta.get("sprite", {}),
    }


def build_bank(bank_dir: Path, stream_cfg: dict, config: dict) -> list:
    """Build the ordered index entry list for one bank."""
    metas = []
    for mf in bank_dir.glob("Q*_metadata.json"):
        try:
            metas.append(json.loads(mf.read_text(encoding="utf-8")))
        except Exception as e:
            print(f"  [WARN] {mf.name}: {e}")

    order   = ordered_subjects(stream_cfg, config)          # [(subject, section_id)]
    rank    = {name: i for i, (name, _) in enumerate(order)}
    sid_of  = {name: sid for name, sid in order}

    metas.sort(key=lambda m: (rank.get(m.get("subject", ""), 99),
                              m.get("paper_id", ""), m.get("q_num", 0)))
    seen, out = set(), []
    for m in metas:
        subj = m.get("subject", "")
        sid  = sid_of.get(subj, subj.lower().replace(" ", "_"))
        e    = build_entry(m, stream_cfg, sid)
        if e["questionImage"] in seen:
            continue
        seen.add(e["questionImage"])
        out.append(e)
    return out


def build() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    by_bank = {s["tet_bank"]: s for s in config["streams"]}

    manifest_tets: dict = {}   # tet_type -> {label, papers: {paper -> {label, streams: []}}}
    legacy_entries: list = []
    total_q = 0

    # Process every bank that actually has sprites on disk
    bank_dirs = sorted([d for d in QB_BASE.iterdir() if d.is_dir()]) if QB_BASE.exists() else []
    for bank_dir in bank_dirs:
        bank = bank_dir.name
        if not any(bank_dir.glob("Q*_metadata.json")):
            continue
        stream_cfg = by_bank.get(bank)
        if not stream_cfg:
            print(f"  [WARN] bank {bank} not in config — skipping")
            continue

        entries = build_bank(bank_dir, stream_cfg, config)
        if not entries:
            continue

        index_name = f"qb_index_{bank}.json"
        (EXAMS_DIR / index_name).write_text(
            json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

        paper_ids = sorted({e["examId"] for e in entries})
        sections  = [{"id": sid, "name": name}
                     for name, sid in ordered_subjects(stream_cfg, config)]
        print(f"  {bank:<38} {len(entries):>4} q, {len(paper_ids):>2} papers → exams/{index_name}")
        total_q += len(entries)

        if bank == LEGACY_BANK:
            legacy_entries = entries

        # Manifest grouping: tet_type → paper → stream
        tt   = stream_cfg["tet_type"]
        tlab = stream_cfg["tet_label"]
        ppr  = stream_cfg["paper"]
        plab = stream_cfg["paper_label"]
        tet  = manifest_tets.setdefault(tt, {"tet_type": tt, "label": tlab, "_papers": {}})
        pap  = tet["_papers"].setdefault(ppr, {"paper": ppr, "label": plab, "streams": []})
        pap["streams"].append({
            "tet_bank":       bank,
            "stream":         stream_cfg["stream"],
            "label":          stream_cfg["stream_label"],
            "language":       stream_cfg["language"],
            "sections":       sections,
            "paper_count":    len(paper_ids),
            "question_count": len(entries),
            "index":          f"exams/{index_name}",
        })

    # Finalise manifest: sort papers (1 before 2A) and streams (by label)
    tets_out = []
    for tt in sorted(manifest_tets):
        t = manifest_tets[tt]
        papers = []
        for pk in sorted(t["_papers"]):
            p = t["_papers"][pk]
            p["streams"].sort(key=lambda s: s["label"])
            papers.append(p)
        tets_out.append({"tet_type": t["tet_type"], "label": t["label"], "papers": papers})

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tets": tets_out,
    }
    (EXAMS_DIR / "qb_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    # Backward-compat default index = legacy bank
    if legacy_entries:
        (EXAMS_DIR / "qb_index.json").write_text(
            json.dumps(legacy_entries, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")

    n_streams = sum(len(p["streams"]) for t in tets_out for p in t["papers"])
    print(f"\nwrote exams/qb_manifest.json: {len(tets_out)} TET type(s), {n_streams} streams, "
          f"{total_q} questions total")
    print(f"wrote exams/qb_index.json (back-compat = {LEGACY_BANK}, {len(legacy_entries)} q)")


if __name__ == "__main__":
    build()
