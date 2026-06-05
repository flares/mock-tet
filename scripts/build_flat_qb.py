#!/usr/bin/env python3
"""
build_flat_qb.py — Collect existing question_bank sprites into a flat qb/ folder.

Reads question_bank/questions.json + per-question sprite.png / metadata.json,
writes to qb/<tet_bank>/:
  Q<id>_sprite.png     — copy of the compressed sprite
  Q<id>_metadata.json  — metadata with tet_type, stream, tet_bank added

Sprite coords in metadata.json take precedence; if absent (pre-sprite extraction),
they are computed from individual PNG dimensions (same layout as build_sprite()).

This folder is gitignored — it is a local staging area before R2 upload.
Run this before upload_sprites.py or build_qb_index.py.

Usage:
  python3 scripts/build_flat_qb.py
"""

import json, shutil, argparse
from pathlib import Path
from PIL import Image

REPO_ROOT     = Path(__file__).resolve().parent.parent
QB_JSON       = REPO_ROOT / "question_bank" / "questions.json"
QB_BASE       = REPO_ROOT / "qb"
SUBJECT_ORDER = ['CDP', 'Telugu', 'English', 'Mathematics', 'Science']


def build(tet_bank: str, tet_type: str, stream: str) -> None:
    out_dir = QB_BASE / tet_bank
    out_dir.mkdir(parents=True, exist_ok=True)

    qb = json.loads(QB_JSON.read_text(encoding='utf-8'))
    ok = skip = 0

    for subj in SUBJECT_ORDER:
        for q in qb.get(subj, []):
            q_id  = q.get('q_id', '')
            qpath = Path(q.get('question', ''))
            if not q_id or not qpath.parts:
                skip += 1
                continue

            src_dir    = REPO_ROOT / qpath.parent
            sprite_src = src_dir / 'sprite.png'
            meta_src   = src_dir / 'metadata.json'

            if not sprite_src.exists():
                print(f'  [SKIP] Q{q_id}: sprite.png missing in {src_dir.name}')
                skip += 1
                continue

            shutil.copy2(sprite_src, out_dir / f'Q{q_id}_sprite.png')

            # Get sprite coords: prefer metadata.json; compute from PNGs if absent
            sprite_coords = {}
            if meta_src.exists():
                try:
                    sprite_coords = json.loads(
                        meta_src.read_text(encoding='utf-8')
                    ).get('sprite', {})
                except Exception:
                    pass

            if not sprite_coords:
                # Compute from individual PNG dimensions (matches build_sprite layout)
                y = 0
                for key in ['question', 'option1', 'option2', 'option3', 'option4']:
                    png = src_dir / f'{key}.png'
                    if not png.exists():
                        break
                    try:
                        with Image.open(png) as img:
                            sprite_coords[key] = {'y': y, 'h': img.height, 'w': img.width}
                            y += img.height
                    except Exception:
                        break

            flat_meta = {
                'q_num':                     q['q_num'],
                'q_id':                      q_id,
                'subject':                   q['subject'],
                'correct_answer':            q['correct_answer'],
                'paper_id':                  q['paper'],
                'year':                      q.get('year', ''),
                'month':                     q.get('month', ''),
                'day':                       q.get('day', ''),
                'shift':                     q.get('shift', ''),
                'date':                      q.get('date', ''),
                'is_comprehension':          q.get('is_comprehension', False),
                'options_in_question_image': q.get('options_in_question_image', False),
                'legacy_question_path':      q['question'],
                'tet_type':                  tet_type,
                'stream':                    stream,
                'tet_bank':                  tet_bank,
                'sprite':                    sprite_coords,
            }
            (out_dir / f'Q{q_id}_metadata.json').write_text(
                json.dumps(flat_meta, ensure_ascii=False, indent=2), encoding='utf-8')
            ok += 1

    print(f'Done. {ok} sprites collected  →  qb/{tet_bank}/  ({skip} skipped)')


def main():
    p = argparse.ArgumentParser(description='Collect sprites into flat qb/ structure')
    p.add_argument('--tet-bank', default='tgtet_maths_science_telugu')
    p.add_argument('--tet-type', default='TGTET')
    p.add_argument('--stream',   default='Maths_Science_Telugu')
    args = p.parse_args()
    build(args.tet_bank, args.tet_type, args.stream)


if __name__ == '__main__':
    main()
