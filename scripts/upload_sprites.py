#!/usr/bin/env python3
"""
upload_sprites.py — Upload sprite PNGs from qb/<tet_bank>/ to R2 bucket tet-questionbank.

Uses boto3 with Cloudflare R2 S3-compatible API.

Before running, set environment variables:
  export R2_ACCOUNT_ID=your_account_id
  export R2_ACCESS_KEY_ID=your_access_key_id
  export R2_SECRET_ACCESS_KEY=your_secret_access_key

Get these from: Cloudflare Dashboard → R2 → Manage R2 API Tokens

Usage:
  python3 scripts/upload_sprites.py
  python3 scripts/upload_sprites.py --dry-run
  python3 scripts/upload_sprites.py --tet-bank tgtet_maths_science_telugu
"""

import os, argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
QB_BASE   = REPO_ROOT / "qb"
BUCKET    = "tet-questionbank"


def upload(tet_bank: str, dry_run: bool) -> None:
    src_dir = QB_BASE / tet_bank
    if not src_dir.exists():
        print(f"[ERROR] {src_dir} not found. Run build_flat_qb.py first.")
        raise SystemExit(1)

    sprites = sorted(src_dir.glob("Q*_sprite.png"))
    if not sprites:
        print(f"[ERROR] No Q*_sprite.png files found in {src_dir}")
        raise SystemExit(1)

    print(f"Found {len(sprites)} sprites in qb/{tet_bank}/")

    if dry_run:
        print(f"[DRY RUN] Would upload to r2://{BUCKET}/{tet_bank}/")
        for sp in sprites[:5]:
            print(f"  {sp.name} → {tet_bank}/{sp.name}")
        if len(sprites) > 5:
            print(f"  ... and {len(sprites) - 5} more")
        return

    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("[ERROR] boto3 not installed. Run: pip install boto3")
        raise SystemExit(1)

    account_id = os.environ.get("R2_ACCOUNT_ID", "")
    access_key = os.environ.get("R2_ACCESS_KEY_ID", "")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY", "")

    if not all([account_id, access_key, secret_key]):
        print("[ERROR] Missing R2 credentials. Set these env vars:")
        print("  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY")
        raise SystemExit(1)

    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading

    WORKERS = 32
    counter = threading.local()
    ok_count = [0]
    fail_count = [0]
    lock = threading.Lock()

    def _upload_one(sp):
        key = f"{tet_bank}/{sp.name}"
        s3.upload_file(
            str(sp), BUCKET, key,
            ExtraArgs={
                "ContentType": "image/png",
                "CacheControl": "public, max-age=31536000, immutable",
            },
        )
        return sp.name

    print(f"Uploading to r2://{BUCKET}/{tet_bank}/  ({WORKERS} threads) …")
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(_upload_one, sp): sp for sp in sprites}
        for fut in as_completed(futures):
            try:
                fut.result()
                ok += 1
                if ok % 250 == 0:
                    print(f"  {ok}/{len(sprites)} uploaded…", flush=True)
            except Exception as e:
                print(f"  [FAIL] {futures[fut].name}: {e}", flush=True)
                fail += 1

    print(f"\nDone. {ok} uploaded, {fail} failed.")


def main():
    p = argparse.ArgumentParser(description='Upload sprites to R2 tet-questionbank bucket')
    p.add_argument('--tet-bank', default='tgtet_maths_science_telugu')
    p.add_argument('--dry-run', action='store_true', help='Show what would be uploaded, no actual upload')
    args = p.parse_args()
    upload(args.tet_bank, args.dry_run)


if __name__ == '__main__':
    main()
