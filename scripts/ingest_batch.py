#!/usr/bin/env python3
"""
ingest_batch.py — Multi-TET batch ingestion (Task 7).

Reads config/tet_types.json and, for every parseable stream candidate, runs the
sprite extraction over each PDF in its batch_papers_flat folder, writing sprites
+ metadata to qb/<tet_bank>/. Filenames are normalised to clean YYYY-Mon-DD-ShiftN
paper_ids and questions are mapped to sections via the stream's section spec.

Papers that don't parse cleanly (old scans, wrong format, partial extraction) are
recorded in the report and NOT written — the caller moves them to unprocessed/.

The pinned already_processed bank (tgtet_maths_science_telugu) is skipped.

Usage:
  python3 scripts/ingest_batch.py --dry-run          # report parse counts, write nothing
  python3 scripts/ingest_batch.py                     # process all candidate streams
  python3 scripts/ingest_batch.py --stream tgtet_maths_science_hindi
  python3 scripts/ingest_batch.py --report-only       # just re-print last report
"""
import json, sys, argparse, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import extract_questions as eq

REPO_ROOT  = Path(__file__).resolve().parent.parent
CONFIG     = REPO_ROOT / "config" / "tet_types.json"
BATCH      = Path("/mnt/c/Users/ymano/Universe/coworker/TET Preparation/batch_papers_flat")
QB_BASE    = REPO_ROOT / "qb"
REPORT_OUT = REPO_ROOT / "config" / "ingest_report.json"

# A paper must yield at least this many embedded-image questions (of 150) to be
# accepted — "parsed perfectly". Below this it goes to unprocessed/.
MIN_PARSE = 145


def resolve_spec(stream: dict, section_specs: dict) -> list:
    spec = [dict(s) for s in section_specs[stream["content"]]]
    for s in spec:
        if s["name"] == "__LANG1__":
            s["name"] = stream["language"]
    return spec


def embedded_count(questions: list) -> int:
    return sum(1 for q in questions
               if len(q["content_xrefs"]) >= (4 if q.get("passage_xref") else 5))


def answer_count(questions: list) -> int:
    return sum(1 for q in questions if q.get("correct_answer") is not None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    ap.add_argument("--stream", help="process only this tet_bank")
    ap.add_argument("--report-only", action="store_true")
    ap.add_argument("--batch-dir", help="override batch_papers_flat path (e.g. a fast local copy)")
    args = ap.parse_args()

    global BATCH
    if args.batch_dir:
        BATCH = Path(args.batch_dir)

    config = json.loads(CONFIG.read_text(encoding="utf-8"))

    if args.report_only:
        print(REPORT_OUT.read_text(encoding="utf-8"))
        return

    report = {"min_parse": MIN_PARSE, "streams": {}, "unprocessed": {}}
    totals = {"papers_ok": 0, "papers_bad": 0, "questions": 0}

    for stream in config["streams"]:
        if stream.get("already_processed"):
            continue
        if args.stream and stream["tet_bank"] != args.stream:
            continue

        bank   = stream["tet_bank"]
        folder = BATCH / stream["folder"]
        if not folder.exists():
            print(f"[WARN] folder missing: {folder}")
            continue

        spec     = resolve_spec(stream, config["section_specs"])
        tet_meta = {"tet_type": stream["tet_type"], "stream": stream["stream"],
                    "tet_bank": bank}
        bank_dir = QB_BASE / bank
        pdfs     = sorted(folder.glob("*.pdf"))

        ok_papers, bad_papers = [], []
        seen_pids = {}
        print(f"\n══ {bank}  ({len(pdfs)} pdfs)  [{stream['folder']}]")

        for pdf in pdfs:
            paper_id = eq.normalize_paper_id(pdf.name) or pdf.stem
            if paper_id in seen_pids:
                bad_papers.append({"file": pdf.name, "paper_id": paper_id,
                                   "reason": f"paper_id collision with {seen_pids[paper_id]}"})
                print(f"   ✗ {pdf.name[:50]:<50} COLLISION → {paper_id}")
                continue
            seen_pids[paper_id] = pdf.name
            pmeta    = eq.paper_info_from_id(paper_id)
            try:
                questions = eq.extract_pdf(pdf, section_spec=spec, paper_meta=pmeta)
            except Exception as e:
                bad_papers.append({"file": pdf.name, "paper_id": paper_id,
                                   "reason": f"{type(e).__name__}: {e}",
                                   "tb": traceback.format_exc()[-300:]})
                print(f"   ✗ {pdf.name[:50]:<50} ERROR {type(e).__name__}")
                continue

            n_total = len(questions)
            n_emb   = embedded_count(questions)
            n_ans   = answer_count(questions)

            if n_emb < MIN_PARSE:
                bad_papers.append({"file": pdf.name, "paper_id": paper_id,
                                   "reason": f"only {n_emb}/{n_total} embedded-image questions",
                                   "n_total": n_total, "n_embedded": n_emb, "n_answers": n_ans})
                print(f"   ✗ {pdf.name[:50]:<50} {n_emb:>3}/{n_total} imgs — UNPROCESSED")
                continue

            if not args.dry_run:
                bank_dir.mkdir(parents=True, exist_ok=True)
                eq.save_images(questions, pdf, eq.OUTPUT_DIR, sprites_only=True,
                               flat_qb_dir=bank_dir, tet_meta=tet_meta)

            ok_papers.append({"file": pdf.name, "paper_id": paper_id,
                              "n_embedded": n_emb, "n_answers": n_ans})
            totals["questions"] += n_emb
            print(f"   ✓ {pdf.name[:50]:<50} {n_emb:>3} q  ({n_ans} ans)  → {paper_id}")

        report["streams"][bank] = {
            "folder": stream["folder"], "tet_type": stream["tet_type"],
            "paper": stream["paper"], "stream_label": stream["stream_label"],
            "papers_ok": ok_papers, "papers_bad": bad_papers,
            "paper_count": len(ok_papers),
            "question_count": sum(p["n_embedded"] for p in ok_papers),
        }
        if bad_papers:
            report["unprocessed"][stream["folder"]] = [b["file"] for b in bad_papers]
        totals["papers_ok"] += len(ok_papers)
        totals["papers_bad"] += len(bad_papers)

    report["totals"] = totals
    REPORT_OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n{'='*70}")
    mode = "DRY RUN — nothing written" if args.dry_run else "WROTE sprites to qb/"
    print(f"  {mode}")
    print(f"  papers OK:   {totals['papers_ok']}")
    print(f"  papers BAD:  {totals['papers_bad']}  (→ unprocessed/)")
    print(f"  questions:   {totals['questions']}")
    print(f"  report:      {REPORT_OUT.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
