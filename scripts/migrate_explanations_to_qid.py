#!/usr/bin/env python3
"""
migrate_explanations_to_qid.py — one-time R2 migration of AI explanations to the
q_id-based key scheme (v0.3.0).

Before:  explanations/<subject>/<paper>_Q<n>_<id>.json   (paper/subject in the key)
After:   explanations/q/Q<id>.json                       (globally-unique q_id only)

Why: q_id is unique across every TET stream, so this scheme is stream-agnostic and
avoids spaces in R2 paths (some subjects are "Social Studies"/"Environmental Studies").
Matches the new js/r2-explanations.js client keys.

SAFE: copies (never deletes) the old objects, so they remain as a backup. Backs up the
index to questions-with-explanations.backup.json before rewriting it. Idempotent —
re-running skips objects already migrated.

Requires env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
Usage:
  python3 scripts/migrate_explanations_to_qid.py --dry-run
  python3 scripts/migrate_explanations_to_qid.py
"""
import os, json, argparse
import boto3
from botocore.config import Config

BUCKET    = "tet-questionbank-explanations"
INDEX_KEY = "questions-with-explanations.json"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    acct = os.environ["R2_ACCOUNT_ID"]
    s3 = boto3.client(
        "s3", endpoint_url=f"https://{acct}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"), region_name="auto")

    # list all keys
    keys = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET):
        keys.extend(o["Key"] for o in page.get("Contents", []))
    existing = set(keys)
    exp_keys = [k for k in keys
                if k.startswith("explanations/") and k.endswith(".json")
                and not k.startswith("explanations/q/")]

    print(f"{'[DRY RUN] ' if args.dry_run else ''}explanation objects to migrate: {len(exp_keys)}")

    migrated = skipped = 0
    for k in exp_keys:
        parts = k.split("/")
        if len(parts) != 3:
            skipped += 1; continue
        folder = parts[2][:-5]               # strip .json
        qid = folder.split("_")[-1]
        if not qid.isdigit():
            print(f"  skip (no numeric q_id): {k}"); skipped += 1; continue
        new_key = f"explanations/q/Q{qid}.json"
        if new_key in existing:
            skipped += 1; continue
        if args.dry_run:
            print(f"  {k}  →  {new_key}")
        else:
            body = s3.get_object(Bucket=BUCKET, Key=k)["Body"].read()
            s3.put_object(Bucket=BUCKET, Key=new_key, Body=body, ContentType="application/json")
        migrated += 1
    print(f"  {'would migrate' if args.dry_run else 'migrated'} {migrated}, skipped {skipped}")

    # index: questionIds  folder → "Q<id>"
    idx = json.loads(s3.get_object(Bucket=BUCKET, Key=INDEX_KEY)["Body"].read())
    old_ids = idx.get("questionIds", [])
    new_ids = sorted({"Q" + str(x).split("_")[-1] for x in old_ids})
    print(f"\nindex: {len(old_ids)} → {len(new_ids)} ids  (sample {old_ids[:1]} → {new_ids[:1]})")
    if not args.dry_run:
        s3.put_object(Bucket=BUCKET, Key="questions-with-explanations.backup.json",
                      Body=json.dumps({"questionIds": old_ids}), ContentType="application/json")
        idx["questionIds"] = new_ids
        s3.put_object(Bucket=BUCKET, Key=INDEX_KEY, Body=json.dumps(idx), ContentType="application/json")
        print("  index rewritten (old backed up to questions-with-explanations.backup.json)")


if __name__ == "__main__":
    main()
