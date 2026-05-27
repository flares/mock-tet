"""
classify_topics.py — Classify all 3150 question_bank questions into syllabus topics
using Gemini 2.5 Flash (vision). Updates each metadata.json with a `topic` field.

Usage:
    python3 scripts/classify_topics.py [--dry-run] [--subject CDP]

Reads Gemini API key from js/firebase-config.js automatically.
Resumable: skips questions that already have a `topic` field in metadata.json.
After all done, rebuilds questions.json and qb_index.json.
"""

import argparse
import asyncio
import base64
import json
import os
import re
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

# ── Config ────────────────────────────────────────────────────────────────────
MODEL       = "gemini-2.5-flash-lite"
CONCURRENCY = 8    # reduce to 1 on free tier (auto-throttled via RATE_LIMIT_RPM)
RETRY_LIMIT = 4
RETRY_DELAY = 60   # seconds to wait on 429

# Free tier is 10 RPM. Set to None for paid tier (no throttle).
# Script auto-backs off on 429 regardless.
RATE_LIMIT_RPM = None  # set to 9 if you want to pre-throttle for free tier

ROOT        = Path(__file__).parent.parent
QB_JSON     = ROOT / "question_bank" / "questions.json"
TOPICS_JSON = ROOT / "assets" / "syllabus_topics.json"
CONFIG_JS   = ROOT / "js" / "firebase-config.js"

# ── Read Gemini key from firebase-config.js ───────────────────────────────────
def get_gemini_key():
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    try:
        src = CONFIG_JS.read_text()
        m = re.search(r'geminiApiKey\s*:\s*["\']([^"\']+)["\']', src)
        if m:
            return m.group(1)
    except FileNotFoundError:
        pass
    print("ERROR: Gemini API key not found.", file=sys.stderr)
    sys.exit(1)

# ── Load data ─────────────────────────────────────────────────────────────────
qb     = json.loads(QB_JSON.read_text())
topics = json.loads(TOPICS_JSON.read_text())

TOPIC_PROMPTS = {}
for subj, data in topics.items():
    lines = []
    for t in data["llm_topics"]:
        hint = t["description"][:80].rstrip()
        lines.append(f"  {t['id']}: {t['label']} — {hint}…")
    TOPIC_PROMPTS[subj] = "\n".join(lines)

VALID_IDS = {
    subj: {t["id"] for t in data["llm_topics"]}
    for subj, data in topics.items()
}

# ── Classify one question ─────────────────────────────────────────────────────
def classify_sync(client, q: dict, subject: str) -> tuple[str, bool]:
    img_path = ROOT / q["question"]
    img_bytes = img_path.read_bytes()

    prompt = (
        f"CTET Paper II exam question. Subject: {subject}.\n\n"
        f"Classify into exactly one of these topics:\n"
        f"{TOPIC_PROMPTS[subject]}\n\n"
        f"Reply with ONLY the topic id string. Nothing else."
    )

    for attempt in range(RETRY_LIMIT):
        try:
            # Optional pre-throttle for free tier
            if RATE_LIMIT_RPM:
                time.sleep(60 / RATE_LIMIT_RPM)

            resp = client.models.generate_content(
                model=MODEL,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    max_output_tokens=60,
                    temperature=0,
                    safety_settings=[
                        types.SafetySetting(category=c, threshold="BLOCK_NONE")
                        for c in ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH",
                                  "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"]
                    ],
                ),
            )
            topic_id     = resp.text.strip().lower().replace(" ", "_") if resp.text else ""
            needs_review = not topic_id or topic_id not in VALID_IDS[subject]
            return topic_id, needs_review

        except Exception as e:
            err = str(e)
            if "429" in err or "quota" in err.lower() or "exhausted" in err.lower():
                # Extract retry delay from error if present
                import re as _re
                m = _re.search(r'retry.*?(\d+)s', err, _re.IGNORECASE)
                wait = int(m.group(1)) + 2 if m else RETRY_DELAY * (attempt + 1)
                print(f"    Rate limit — waiting {wait}s… (attempt {attempt+1}/{RETRY_LIMIT})", file=sys.stderr)
                time.sleep(wait)
            elif attempt < RETRY_LIMIT - 1:
                time.sleep(2)
            else:
                raise

# ── Worker ────────────────────────────────────────────────────────────────────
async def worker(sem, client, subject, q, counters, dry_run):
    folder    = Path(q["question"]).parent.name
    meta_path = ROOT / "question_bank" / subject / folder / "metadata.json"
    meta      = json.loads(meta_path.read_text())

    if "topic" in meta:
        counters["skipped"] += 1
        return

    if dry_run:
        counters["done"] += 1
        return

    async with sem:
        loop = asyncio.get_event_loop()
        try:
            topic_id, needs_review = await loop.run_in_executor(
                None, classify_sync, client, q, subject
            )
            meta["topic"] = topic_id
            if needs_review:
                meta["topic_needs_review"] = True
                counters["review"] += 1
            meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
            counters["done"] += 1
            tag = "⚠" if needs_review else "✓"
            print(f"  {tag}  [{counters['done']:>4}]  {subject:<12}  {folder}  →  {topic_id}")
        except Exception as e:
            counters["errors"] += 1
            print(f"  ✗  {subject}/{folder}  ERROR: {e}", file=sys.stderr)

# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--subject",  help="Process only this subject")
    args = parser.parse_args()

    api_key = get_gemini_key()
    client  = genai.Client(api_key=api_key)

    subjects = [args.subject] if args.subject else list(qb.keys())
    work     = [(subj, q) for subj in subjects for q in qb[subj]]
    total    = len(work)
    already  = sum(
        1 for subj, q in work
        if "topic" in json.loads(
            (ROOT / "question_bank" / subj / Path(q["question"]).parent.name / "metadata.json").read_text()
        )
    )

    print(f"Questions : {total}  |  Already done: {already}  |  To classify: {total - already}")
    print(f"Model     : {MODEL}  |  Concurrency: {CONCURRENCY}")
    if args.dry_run:
        print("DRY RUN\n")

    counters = {"done": 0, "skipped": 0, "errors": 0, "review": 0}
    sem      = asyncio.Semaphore(CONCURRENCY)
    t0       = time.time()

    await asyncio.gather(*[
        worker(sem, client, subj, q, counters, args.dry_run)
        for subj, q in work
    ])

    elapsed = time.time() - t0
    print(f"\n{'─'*60}")
    print(f"Finished in {elapsed:.0f}s  ({elapsed/60:.1f} min)")
    print(f"  Classified   : {counters['done']}")
    print(f"  Skipped      : {counters['skipped']}")
    print(f"  Needs review : {counters['review']}")
    print(f"  Errors       : {counters['errors']}")

    if args.dry_run or counters["done"] == 0:
        return

    # Rebuild questions.json
    print("\nRebuilding questions.json…")
    new_qb = {}
    for subj, questions in qb.items():
        new_qb[subj] = []
        for q in questions:
            folder = Path(q["question"]).parent.name
            meta   = json.loads((ROOT / "question_bank" / subj / folder / "metadata.json").read_text())
            q_out  = dict(q)
            if "topic" in meta:
                q_out["topic"] = meta["topic"]
            if meta.get("topic_needs_review"):
                q_out["topic_needs_review"] = True
            new_qb[subj].append(q_out)
    QB_JSON.write_text(json.dumps(new_qb, indent=2, ensure_ascii=False))
    print("  questions.json updated")

    print("Rebuilding qb_index.json…")
    os.system(f"python3 {ROOT}/scripts/build_qb_index.py")
    print("  qb_index.json updated")


if __name__ == "__main__":
    asyncio.run(main())
