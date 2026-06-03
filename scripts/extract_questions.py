#!/usr/bin/env python3
"""
TET Paper 2 – Question Extractor  (v4)
=======================================
Processes all 20xx*.pdf answer-key files in papers/ and writes:

  question_bank/
    CDP/ Telugu/ English/ Mathematics/ Science/
      {paper}_Q{num:03d}_{id}/
        question.png          – question image (passage merged above for COMP Qs)
        option1.png … option4.png  – option images (absent for text-option Qs)
        metadata.json
    questions.json            – master index consumed by build_qb_index.py

Images are compressed in-place with pngquant + optipng immediately after
writing (skipped silently if the tools are not installed).

Subject ranges (TET Paper 2 standard):
  Q1-30 CDP  ·  Q31-60 Telugu  ·  Q61-90 English
  Q91-120 Mathematics  ·  Q121-150 Science

Key design notes
----------------
* Questions are images embedded in PDFs, extracted via PyMuPDF (fitz).
* Subject is determined solely by question number range (see above).
* Comprehension questions: shared passage image is merged vertically above
  the sub-question image using PIL.
* Answer detection (primary): the option label "1"/"2"/"3"/"4" rendered in
  green text in the Options section – reliable across page boundaries.
* Answer detection (fallback): green tick icon (tg > tr in pixel samples)
  matched to the nearest option image by Y position – used when text-colour
  method returns nothing (some older papers).
* Icon filter: w < 20 AND h < 20 → icon (never background). Handles 2026
  papers whose option images are wide-but-short.
* Background xref filter: images appearing on > 5 pages = decorations,
  excluded (page header/footer logos, watermarks).
* Ad-page filter: text-free pages with a unique large image (e.g. the
  decorative full-page image before Q1 in 2026 papers) are excluded.
* Page-render fallback: questions whose options are plain text (not embedded
  images) are saved as a single rendered PNG, clipped to the NEXT question's
  header on the same page so the render never spans multiple questions.

Usage
-----
  python extract_questions.py                  # all PDFs in papers/
  python extract_questions.py --pdf <file>     # single PDF (merges into questions.json)
  python extract_questions.py --validate       # validate question_bank only
"""

import fitz
import re, json, argparse, io, subprocess
from pathlib import Path
from collections import Counter
from PIL import Image


# ── Paths ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR   = Path(__file__).parent
REPO_ROOT    = SCRIPT_DIR.parent
PDF_DIR      = REPO_ROOT / "papers"
OUTPUT_DIR   = REPO_ROOT / "question_bank"
QB_JSON_PATH = OUTPUT_DIR / "questions.json"

SUBJECT_ORDER = ['CDP', 'Telugu', 'English', 'Mathematics', 'Science']

# ── Patterns ───────────────────────────────────────────────────────────────────
Q_PATTERN = re.compile(
    r'Question Number\s*:\s*(\d+)\s+Question Id\s*:\s*(\d+)'
)
COMP_PATTERN = re.compile(
    r'Question Id\s*:\s*(\d+)\s+Question Type\s*:\s*COMPREHENSION'
    r'.*?Question Numbers\s*:\s*\((\d+)\s+to\s+(\d+)\)',
    re.DOTALL
)

ICON_MAX_PX = 20     # pixels: tick/cross icons are ≤ 20×20; content images larger
OPTS_WINDOW = 500    # points: search window below "Options :" for coloured labels


# ── Helpers ────────────────────────────────────────────────────────────────────

def subject_from_qnum(q_num: int) -> str:
    """TET Paper 2 fixed structure: subject determined by question number."""
    if q_num <= 30:  return 'CDP'
    if q_num <= 60:  return 'Telugu'
    if q_num <= 90:  return 'English'
    if q_num <= 120: return 'Mathematics'
    return 'Science'


def paper_info(filename: str) -> dict:
    stem = Path(filename).stem
    m = re.match(r'(\d{4})-(\w+)-(\d+)-Shift(\d)', stem)
    if m:
        yr, mon, day, sh = m.groups()
        return dict(paper_id=stem, year=yr, month=mon, day=day, shift=sh,
                    date=f"{day} {mon} {yr}")
    return dict(paper_id=stem, year='', month='', day='', shift='', date=stem)


def is_green_color(color_int: int) -> bool:
    """True if a packed 0xRRGGBB integer is clearly green-dominant."""
    r = (color_int >> 16) & 0xFF
    g = (color_int >> 8)  & 0xFF
    b =  color_int        & 0xFF
    return g > r and g > b and g > 80


def is_green_icon(doc, xref: int, cache: dict) -> bool:
    """
    True if the small icon image is green (correct-answer tick).
    cache is a per-PDF dict – avoids xref collisions across documents.
    """
    if xref in cache:
        return cache[xref]
    pix = fitz.Pixmap(doc, xref)
    if pix.n < 3:
        pix = None; cache[xref] = False; return False
    data = pix.samples
    n    = pix.n
    pix  = None
    tr = sum(data[i]   for i in range(0, len(data), n))
    tg = sum(data[i+1] for i in range(0, len(data), n))
    cache[xref] = tg > tr
    return cache[xref]


def find_correct_by_colored_label(doc, opts_pg, opts_y, y_end=None):
    """
    PRIMARY answer-detection method.

    Scans the options section (starting at opts_y on opts_pg) for the
    single-digit labels "1", "2", "3", "4".  The label rendered in green
    is the correct answer.  Also searches the next page in case the options
    section crosses a page boundary.

    Returns 1–4, or None if no green label is found.
    """
    if opts_pg is None:
        return None

    search_end = y_end if y_end is not None else (opts_y + OPTS_WINDOW)

    for pg_delta in (0, 1):
        pg_idx = opts_pg + pg_delta
        if pg_idx >= doc.page_count:
            break
        page = doc[pg_idx]
        pg_h = page.rect.height

        if pg_delta == 0:
            y0_search = opts_y
            y1_search = min(search_end, pg_h)
        else:
            y0_search = 0
            y1_search = min(search_end - pg_h, pg_h)
            if y1_search <= 0:
                break

        d = page.get_text('dict')
        for block in d['blocks']:
            if block.get('type') != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    by = span['bbox'][1]
                    if by < y0_search or by > y1_search:
                        continue
                    txt = span['text'].strip().rstrip('.')
                    if txt in ('1', '2', '3', '4') and is_green_color(span['color']):
                        return int(txt)
    return None


def merge_images_vertically(doc, xref_top: int, xref_bottom: int, gap: int = 12) -> bytes:
    """Merge two xref images vertically (passage above, sub-question below).
    Returns PNG bytes."""
    def pix_to_pil(xref):
        pix = fitz.Pixmap(doc, xref)
        if pix.n > 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
        pix = None
        return img

    top = pix_to_pil(xref_top)
    bot = pix_to_pil(xref_bottom)
    w   = max(top.width, bot.width)
    canvas = Image.new("RGB", (w, top.height + gap + bot.height), (255, 255, 255))
    canvas.paste(top, (0, 0))
    canvas.paste(bot, (0, top.height + gap))
    buf = io.BytesIO()
    canvas.save(buf, "PNG")
    return buf.getvalue()


# ── Core extractor ─────────────────────────────────────────────────────────────

def extract_pdf(pdf_path: Path) -> list:
    doc  = fitz.open(str(pdf_path))
    meta = paper_info(pdf_path.name)

    # ── Pre-scan A: background/decoration xrefs (appear on > 5 pages) ───────────
    # We count every image to determine how many pages each xref appears on.
    # BG_XREFS: large images (≥ ICON_MAX_PX) on > 5 pages = watermarks/headers.
    # all_xref_pg_count: used below to distinguish reused icons (tick/cross,
    # same xref on many pages) from genuine small content images (unique xref).
    #
    # Dimensions are cached per xref so each pixmap is opened exactly once,
    # regardless of how many pages the xref appears on.
    xref_dims        = {}          # xref → (w, h)  — populated lazily, once each
    xref_pg_count    = Counter()   # non-icon images only  → BG_XREFS
    all_xref_pg_count = Counter()  # every image           → icon disambiguation
    for pg in range(len(doc)):
        seen_pg = set()
        for img in doc[pg].get_images(full=True):
            xref = img[0]
            if xref in seen_pg:
                continue
            seen_pg.add(xref)
            all_xref_pg_count[xref] += 1
            if xref not in xref_dims:
                pix = fitz.Pixmap(doc, xref)
                xref_dims[xref] = (pix.width, pix.height)
                pix = None
            w, h = xref_dims[xref]
            if w >= ICON_MAX_PX and h >= ICON_MAX_PX:
                xref_pg_count[xref] += 1
    BG_XREFS = {x for x, c in xref_pg_count.items() if c > 5}

    # ── Pre-scan B: ad/blank pages – text-free pages with a unique large image ───
    # 2026 papers contain a full-page decorative image between the Q1 header and
    # Q1's options.  Without this filter that image gets assigned to Q1 and
    # displaces the real option images.
    ad_xrefs = set()
    for pg in range(len(doc)):
        if doc[pg].get_text().strip() == '':
            for img in doc[pg].get_images(full=True):
                xref = img[0]
                if xref_pg_count.get(xref, 0) <= 1:   # unique to this one page
                    ad_xrefs.add(xref)

    # ── Pre-scan C: comprehension passages ───────────────────────────────────────
    comp_q_to_passage_xref = {}
    passage_xrefs          = set()
    page_texts = [doc[i].get_text() for i in range(len(doc))]

    for pg_idx, full_text in enumerate(page_texts):
        for m in COMP_PATTERN.finditer(full_text):
            start_q, end_q = int(m.group(2)), int(m.group(3))

            comp_y = None
            for blk in doc[pg_idx].get_text("blocks"):
                if blk[6] == 0 and 'COMPREHENSION' in blk[4]:
                    comp_y = blk[1]
                    break
            if comp_y is None:
                continue

            candidates = []
            for search_pg in [pg_idx, pg_idx + 1]:
                if search_pg >= len(doc):
                    break
                for img in doc[search_pg].get_images(full=True):
                    xref = img[0]
                    if xref in BG_XREFS:
                        continue
                    pix = fitz.Pixmap(doc, xref)
                    w, h = pix.width, pix.height
                    pix  = None
                    if w < ICON_MAX_PX or h < ICON_MAX_PX:
                        continue
                    rects = doc[search_pg].get_image_rects(xref)
                    for r in rects:
                        effective_y = r.y0 if search_pg == pg_idx else -1
                        if search_pg == pg_idx and r.y0 <= comp_y:
                            continue
                        candidates.append((search_pg, effective_y, r.width * r.height, xref))
                if candidates:
                    break

            if not candidates:
                continue
            candidates.sort(key=lambda c: -c[2])
            passage_xref = candidates[0][3]
            passage_xrefs.add(passage_xref)
            for q in range(start_q, end_q + 1):
                comp_q_to_passage_xref[q] = passage_xref

    # ── Pass 1: build global event list ──────────────────────────────────────────
    events = []

    for pg_idx in range(len(doc)):
        page   = doc[pg_idx]
        blocks = page.get_text("blocks")

        for blk in blocks:
            if blk[6] != 0:
                continue
            y0, text = blk[1], blk[4]
            for qnum_s, qid_s in Q_PATTERN.findall(text):
                events.append(('question', pg_idx, y0, int(qnum_s), qid_s))
            if 'Options :' in text or 'Options:' in text:
                events.append(('options', pg_idx, y0))

        seen = set()
        for img in page.get_images(full=True):
            xref = img[0]
            if xref in seen or xref in BG_XREFS or xref in passage_xrefs or xref in ad_xrefs:
                continue
            seen.add(xref)
            w, h = xref_dims.get(xref, (0, 0))   # reuse cached dimensions
            for r in page.get_image_rects(xref):
                # Classify as icon only if the image is small AND the same
                # xref is reused across multiple pages (tick/cross marks).
                # Small images unique to one page are genuine content images
                # (e.g. short text like "Yes", "1.5" rendered as a tiny PNG).
                is_icon = (w < ICON_MAX_PX and h < ICON_MAX_PX
                           and all_xref_pg_count.get(xref, 0) > 1)
                if is_icon:
                    events.append(('icon',    pg_idx, r.y0, xref))
                else:
                    events.append(('content', pg_idx, r.y0, xref))

    events.sort(key=lambda e: (e[1], e[2]))

    # ── Pass 2: assign images and options-anchors to questions ───────────────────
    questions = {}
    active_q  = None

    for ev in events:
        etype = ev[0]

        if etype == 'question':
            q_num, q_id = ev[3], ev[4]
            active_q    = q_num
            if q_num not in questions:
                questions[q_num] = dict(
                    q_num          = q_num,
                    q_id           = q_id,
                    subject        = subject_from_qnum(q_num),
                    correct_answer = None,
                    passage_xref   = comp_q_to_passage_xref.get(q_num),
                    content_xrefs  = [],
                    icon_xrefs     = [],
                    opts_pg        = None,
                    opts_y         = None,
                    header_pg      = ev[1],
                    header_y       = ev[2],
                    **meta,
                )

        elif etype == 'options' and active_q is not None:
            qd = questions[active_q]
            if qd['opts_pg'] is None:           # record only the FIRST "Options :"
                qd['opts_pg'] = ev[1]
                qd['opts_y']  = ev[2]

        elif etype == 'content' and active_q is not None:
            questions[active_q]['content_xrefs'].append((ev[1], ev[2], ev[3]))

        elif etype == 'icon' and active_q is not None:
            questions[active_q]['icon_xrefs'].append((ev[1], ev[2], ev[3]))

    # ── Pass 3: correct answers ───────────────────────────────────────────────────
    icon_color_cache = {}   # fresh per PDF – avoids xref collisions across docs

    for qd in questions.values():
        # PRIMARY: green-coloured option label in the Options section.
        # Works reliably even when options span a page boundary.
        ans = find_correct_by_colored_label(doc, qd['opts_pg'], qd['opts_y'])
        if ans is not None:
            qd['correct_answer'] = ans
            continue

        # FALLBACK: green tick icon closest (by Y) to an option image.
        # Used when the primary method finds nothing (e.g. 2026 greyscale papers
        # or older papers where the label colour isn't set in the PDF).
        imgs = qd['content_xrefs']
        if len(imgs) < 5:
            continue
        option_entries = imgs[1:5]
        for (_pg, icon_y, icon_xref) in qd['icon_xrefs']:
            if is_green_icon(doc, icon_xref, icon_color_cache):
                best = min(range(len(option_entries)),
                           key=lambda i: abs(icon_y - option_entries[i][1]))
                qd['correct_answer'] = best + 1
                break

    # ── Pass 4: next-header boundaries ───────────────────────────────────────────
    # Needed by the page-render fallback to avoid capturing the next question.
    sorted_qs = sorted(questions.values(), key=lambda q: (q['header_pg'], q['header_y']))
    for i, qd in enumerate(sorted_qs):
        if i + 1 < len(sorted_qs):
            nxt = sorted_qs[i + 1]
            qd['next_header_pg'] = nxt['header_pg']
            qd['next_header_y']  = nxt['header_y']
        else:
            qd['next_header_pg'] = None
            qd['next_header_y']  = None

    doc.close()
    return list(questions.values())


# ── Page-render helpers ───────────────────────────────────────────────────────

def render_page_region(doc, pg_idx: int, y0: float,
                       y1=None, x0: float = 0.0,
                       scale: float = 2.0) -> bytes:
    """Render a rectangular slice of a page as PNG bytes.

    x0 lets callers skip the option-number label and tick/cross icon on the
    left edge when rendering individual text-option images.
    """
    page     = doc[pg_idx]
    y_top    = max(0, y0 - 4)
    y_bottom = y1 if y1 is not None else page.rect.height
    # Guard: clip must have positive height; fall back to page bottom if not.
    if y_bottom <= y_top:
        y_bottom = page.rect.height
    clip     = fitz.Rect(x0, y_top, page.rect.width, y_bottom)
    mat      = fitz.Matrix(scale, scale)
    pix      = page.get_pixmap(matrix=mat, clip=clip)
    data     = pix.tobytes("png")
    pix      = None
    return data


def find_option_text_regions(doc, opts_pg, opts_y,
                             next_q_pg=None, next_q_y=None):
    """
    For text-option questions, locate the four option label spans ("1"–"4")
    after the "Options :" line and return a list of four
    (pg_idx, y_top, y_bottom) tuples — one per option — suitable for
    render_page_region().  Returns None if fewer than 4 labels are found.

    Searches up to 3 pages starting from (opts_pg, opts_y).  Hard stop at
    (next_q_pg, next_q_y) so we never bleed into the next question.
    """
    if opts_pg is None:
        return None

    # int(1-4) → (pg_idx, y_top, x_content)
    # x_content = left edge of the actual option content (after label + icon)
    label_positions = {}

    # Cumulative page-height offset so we can enforce OPTS_WINDOW regardless
    # of how many page boundaries lie within it.
    cumulative_offset = 0.0

    for pg_delta in range(3):           # search at most 3 pages
        pg_idx = opts_pg + pg_delta
        if pg_idx >= doc.page_count:
            break
        page = doc[pg_idx]
        pg_h = page.rect.height

        y0_s = opts_y if pg_delta == 0 else 0.0

        # Hard stop: next question is on this page
        if next_q_pg is not None and pg_idx == next_q_pg and next_q_y is not None:
            y1_s = next_q_y - 5
        else:
            # Soft stop: OPTS_WINDOW points past opts_y (across pages)
            window_remaining = OPTS_WINDOW - cumulative_offset
            y1_s = min(pg_h, y0_s + window_remaining)

        if y1_s <= y0_s:
            break

        # Collect all text spans in the search window for this page.
        page_spans = []
        for block in page.get_text('dict')['blocks']:
            if block.get('type') != 0:
                continue
            for line in block['lines']:
                for span in line['spans']:
                    by = span['bbox'][1]
                    if y0_s <= by <= y1_s:
                        page_spans.append(span)

        for span in page_spans:
            by   = span['bbox'][1]
            txt  = span['text'].strip().rstrip('.')
            if txt in ('1', '2', '3', '4'):
                num = int(txt)
                if num not in label_positions:
                    label_x2  = span['bbox'][2]
                    label_y   = span['bbox'][1]
                    # x_content: leftmost span on the same line that comes
                    # AFTER the label and isn't another bare digit.
                    # "Same line" = y-centres within 8 pts.
                    same_line_after = [
                        s for s in page_spans
                        if s['bbox'][0] > label_x2
                        and abs(s['bbox'][1] - label_y) < 8
                        and s['text'].strip() not in ('', '1', '2', '3', '4')
                    ]
                    if same_line_after:
                        x_content = min(s['bbox'][0] for s in same_line_after)
                    else:
                        # Fallback: skip label width + ~25 pts for icon
                        x_content = label_x2 + 25
                    label_positions[num] = (pg_idx, label_y, x_content)

        if len(label_positions) == 4:
            break

        # Advance the cumulative offset by the slice we just searched
        cumulative_offset += (y1_s - y0_s)

        # If we've already hit the hard stop page, no need to go further
        if next_q_pg is not None and pg_idx == next_q_pg:
            break

    if len(label_positions) < 4:
        return None

    # Build (pg, y0, y1, x0) regions: each option ends just before the next label.
    regions = []
    for i in range(1, 5):
        if i not in label_positions:
            return None
        pg_idx, y_top, x_content = label_positions[i]
        if i < 4:
            nxt_pg, nxt_y, _ = label_positions[i + 1]
            # Same page → clip just before next label; different page → page bottom
            y_bottom = (nxt_y - 3) if nxt_pg == pg_idx else None
        else:
            # Last option: stop at next question (page-aware) or page bottom
            if next_q_pg is not None and next_q_y is not None and next_q_pg == pg_idx:
                y_bottom = next_q_y - 5
            else:
                y_bottom = None
        regions.append((pg_idx, max(0, y_top - 3), y_bottom, x_content))

    return regions


# ── Image compression ─────────────────────────────────────────────────────────

def compress_png(path: Path) -> None:
    """Compress a PNG in-place with pngquant 4 + optipng. No-op if tools missing."""
    tmp = Path(str(path) + '.tmp.png')
    try:
        subprocess.run(
            ['pngquant', '4', '--strip', '--force', '--skip-if-larger',
             '--output', str(tmp), str(path)],
            capture_output=True, check=False,
        )
        if tmp.exists():
            tmp.replace(path)
        subprocess.run(
            ['optipng', '-o2', '-strip', 'all', '-quiet', str(path)],
            capture_output=True, check=False,
        )
    except FileNotFoundError:
        pass  # compression tools not installed — skip silently


# ── Image saver ───────────────────────────────────────────────────────────────

def save_images(questions: list, pdf_path: Path, out_dir: Path) -> list:
    """Save all question images and return records suitable for questions.json."""
    doc     = fitz.open(str(pdf_path))
    records = []

    def save_pix(xref, path: Path):
        pix = fitz.Pixmap(doc, xref)
        if pix.n > 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        with open(path, 'wb') as f:
            f.write(pix.tobytes("png"))
        pix = None
        compress_png(path)

    def write_bytes(data: bytes, path: Path):
        with open(path, 'wb') as f:
            f.write(data)
        compress_png(path)

    def rel(path: Path) -> str:
        return path.relative_to(REPO_ROOT).as_posix()

    for qd in questions:
        imgs         = qd['content_xrefs']
        passage_xref = qd.get('passage_xref')
        min_imgs     = 4 if passage_xref else 5

        if len(imgs) < min_imgs:
            # ── Text-option fallback ──────────────────────────────────────────
            # The question image is embedded; only the four options are plain
            # text.  Try to render each option region as its own PNG so that
            # the output format matches every other question.
            if qd.get('header_pg') is None or passage_xref:
                print(f"  [WARN] Q{qd['q_num']} ({qd['paper_id']}): "
                      f"only {len(imgs)} images – skipping")
                continue

            next_pg  = qd.get('next_header_pg')
            next_y   = qd.get('next_header_y')
            opts_pg  = qd.get('opts_pg')
            opts_y   = qd.get('opts_y')
            y_end    = ((next_y - 5)
                        if next_pg is not None and next_y is not None
                        else None)

            q_dir = (out_dir / qd['subject']
                     / f"{qd['paper_id']}_Q{qd['q_num']:03d}_{qd['q_id']}")
            q_dir.mkdir(parents=True, exist_ok=True)

            # question.png — use embedded image when available
            if len(imgs) >= 1:
                save_pix(imgs[0][2], q_dir / 'question.png')
            else:
                q_y1 = (opts_y - 5) if opts_y is not None else y_end
                write_bytes(
                    render_page_region(doc, qd['header_pg'], qd['header_y'], y1=q_y1),
                    q_dir / 'question.png',
                )

            # option1–4.png — render each text-option region separately
            option_regions = find_option_text_regions(
                doc, opts_pg, opts_y,
                next_q_pg=next_pg, next_q_y=next_y)

            options_in_image = False
            if option_regions:
                for i, (opg, oy0, oy1, ox0) in enumerate(option_regions, start=1):
                    write_bytes(
                        render_page_region(doc, opg, oy0, y1=oy1, x0=ox0),
                        q_dir / f'option{i}.png',
                    )
            else:
                # Truly can't split — save full region and flag it.
                print(f"  [WARN] Q{qd['q_num']} ({qd['paper_id']}): "
                      f"can't locate option labels – rendering full region")
                write_bytes(
                    render_page_region(doc, qd['header_pg'], qd['header_y'], y1=y_end),
                    q_dir / 'question.png',
                )
                options_in_image = True

            meta_out = {k: v for k, v in qd.items()
                        if k not in ('content_xrefs', 'icon_xrefs',
                                     'passage_xref', 'header_pg', 'header_y',
                                     'opts_pg', 'opts_y',
                                     'next_header_pg', 'next_header_y')}
            meta_out['is_comprehension']          = False
            meta_out['options_in_question_image'] = options_in_image
            with open(q_dir / 'metadata.json', 'w', encoding='utf-8') as f:
                json.dump(meta_out, f, indent=2, ensure_ascii=False)

            qd['_used_fallback'] = True
            option_paths = ([] if options_in_image
                            else [rel(q_dir / f'option{i}.png') for i in range(1, 5)])
            records.append(_make_record(qd, q_dir, False, options_in_image, option_paths))
            continue

        # ── Normal path: all images embedded ─────────────────────────────────
        q_dir = (out_dir / qd['subject']
                 / f"{qd['paper_id']}_Q{qd['q_num']:03d}_{qd['q_id']}")
        q_dir.mkdir(parents=True, exist_ok=True)

        # question.png
        q_xref = imgs[0][2]
        if passage_xref:
            write_bytes(merge_images_vertically(doc, passage_xref, q_xref),
                        q_dir / 'question.png')
        else:
            save_pix(q_xref, q_dir / 'question.png')

        # option1–4.png
        for i, (_pg, _y, xref) in enumerate(imgs[1:5], start=1):
            save_pix(xref, q_dir / f'option{i}.png')

        # metadata.json
        meta_out = {k: v for k, v in qd.items()
                    if k not in ('content_xrefs', 'icon_xrefs', 'passage_xref',
                                 'opts_pg', 'opts_y',
                                 'next_header_pg', 'next_header_y')}
        meta_out['is_comprehension'] = passage_xref is not None
        with open(q_dir / 'metadata.json', 'w', encoding='utf-8') as f:
            json.dump(meta_out, f, indent=2, ensure_ascii=False)

        option_paths = [rel(q_dir / f'option{i}.png') for i in range(1, 5)]
        records.append(_make_record(qd, q_dir,
                                    is_comprehension=passage_xref is not None,
                                    options_in_image=False,
                                    option_paths=option_paths))

    doc.close()
    return records


def _make_record(qd: dict, q_dir: Path,
                 is_comprehension: bool, options_in_image: bool,
                 option_paths: list) -> dict:
    rel_q = (q_dir / 'question.png').relative_to(REPO_ROOT).as_posix()
    return {
        "q_num":                    qd['q_num'],
        "q_id":                     qd['q_id'],
        "subject":                  qd['subject'],
        "paper":                    qd['paper_id'],
        "date":                     qd['date'],
        "year":                     qd['year'],
        "month":                    qd['month'],
        "shift":                    qd['shift'],
        "correct_answer":           qd['correct_answer'],
        "is_comprehension":         is_comprehension,
        "options_in_question_image": options_in_image,
        "question":                 rel_q,
        "options":                  option_paths,
    }


# ── questions.json writer ─────────────────────────────────────────────────────

def update_questions_json(new_records: list, paper_ids: set,
                          full_rebuild: bool = False) -> None:
    """Merge new_records into questions.json.

    full_rebuild=True: replace the file entirely (used when processing all PDFs).
    full_rebuild=False: read existing file, drop entries for paper_ids, add new ones.
    """
    if full_rebuild or not QB_JSON_PATH.exists():
        by_subject: dict = {s: [] for s in SUBJECT_ORDER}
    else:
        with open(QB_JSON_PATH, encoding='utf-8') as f:
            by_subject = json.load(f)
        # Ensure all subjects exist in case the file predates a new subject
        for s in SUBJECT_ORDER:
            by_subject.setdefault(s, [])
        # Remove stale entries for the papers being re-extracted
        for subj in by_subject:
            by_subject[subj] = [q for q in by_subject[subj]
                                 if q.get('paper') not in paper_ids]

    for rec in new_records:
        by_subject.setdefault(rec['subject'], []).append(rec)

    for subj in by_subject:
        by_subject[subj].sort(key=lambda q: (q.get('paper', ''), q.get('q_num', 0)))

    with open(QB_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(by_subject, f, ensure_ascii=False, indent=2)

    total = sum(len(v) for v in by_subject.values())
    print(f"wrote {QB_JSON_PATH.relative_to(REPO_ROOT)}: {total} questions total")


# ── Validation ────────────────────────────────────────────────────────────────

def validate_question_bank(out_dir: Path) -> bool:
    """
    Scan every question folder under out_dir and check that it contains the
    required image files.  Rules:
      • If metadata.json has  options_in_question_image = true  → only
        question.png is required (options are baked into the rendered image).
      • Otherwise → question.png + option1.png + option2.png + option3.png
        + option4.png must all be present.

    Prints a grouped report and returns True if everything is OK, False if any
    folders are incomplete.
    """
    REQUIRED_FULL     = {'question.png', 'option1.png', 'option2.png',
                         'option3.png', 'option4.png'}
    REQUIRED_FALLBACK = {'question.png'}

    problems: dict[str, list[str]] = {}
    total_checked = 0
    total_bad     = 0

    for subject_dir in sorted(out_dir.iterdir()):
        if not subject_dir.is_dir():
            continue
        for q_dir in sorted(subject_dir.iterdir()):
            if not q_dir.is_dir():
                continue

            total_checked += 1
            meta_path = q_dir / 'metadata.json'

            options_in_image = False
            if meta_path.exists():
                try:
                    with open(meta_path, encoding='utf-8') as f:
                        meta = json.load(f)
                    options_in_image = meta.get('options_in_question_image', False)
                except Exception:
                    pass

            required = REQUIRED_FALLBACK if options_in_image else REQUIRED_FULL
            present  = {p.name for p in q_dir.iterdir() if p.is_file()}
            missing  = required - present

            if missing:
                total_bad += 1
                parts    = q_dir.name.split('_Q', 1)
                paper_id = parts[0] if parts else q_dir.name
                miss_str = ', '.join(sorted(missing))
                problems.setdefault(paper_id, []).append(
                    f"    {q_dir.name}  →  missing: {miss_str}"
                )

    print("\n" + "═" * 60)
    print("  QUESTION BANK VALIDATION")
    print("═" * 60)
    print(f"  Folders checked : {total_checked}")
    print(f"  Complete        : {total_checked - total_bad}")
    print(f"  Incomplete      : {total_bad}")
    print("─" * 60)

    if not problems:
        print("  ✓  All question folders are complete.\n")
    else:
        print("  ✗  Incomplete folders (grouped by paper):\n")
        for paper_id in sorted(problems):
            print(f"  [{paper_id}]  ({len(problems[paper_id])} issue(s))")
            for line in problems[paper_id]:
                print(line)
            print()

    print("═" * 60 + "\n")
    return total_bad == 0


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Extract TET Paper 2 questions from PDF answer-key files.')
    parser.add_argument('--pdf', help='Process a single PDF (full path or filename in papers/)')
    parser.add_argument('--validate', action='store_true',
                        help='Validate the question_bank without re-extracting')
    args = parser.parse_args()

    if args.validate:
        if not OUTPUT_DIR.exists():
            print(f"[ERROR] question_bank not found: {OUTPUT_DIR}")
            return
        ok = validate_question_bank(OUTPUT_DIR)
        raise SystemExit(0 if ok else 1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.pdf:
        p = Path(args.pdf)
        pdf_files = [p if p.is_absolute() else PDF_DIR / p]
        full_rebuild = False
    else:
        pdf_files    = sorted(PDF_DIR.glob('20*.pdf'))
        full_rebuild = True

    print(f"Processing {len(pdf_files)} PDF(s)  ->  {OUTPUT_DIR}\n")

    all_records = []
    all_paper_ids: set[str] = set()
    total = 0

    for pdf_path in pdf_files:
        print(f"  {pdf_path.name} ...", end=' ', flush=True)
        questions = extract_pdf(pdf_path)
        records   = save_images(questions, pdf_path, OUTPUT_DIR)

        valid    = sum(1 for q in questions
                       if len(q['content_xrefs']) >= (4 if q.get('passage_xref') else 5)
                       or q.get('_used_fallback'))
        fallback = sum(1 for q in questions if q.get('_used_fallback'))
        comp     = sum(1 for q in questions if q.get('passage_xref'))
        subjs    = sorted(set(q['subject'] for q in questions))
        total   += valid

        fb_str = (f"  {fallback} page-rendered") if fallback else ""
        print(f"{valid} questions  ({comp} comprehension{fb_str})  {subjs}")

        all_records.extend(records)
        all_paper_ids.update(r['paper'] for r in records)

    print(f"\nDone. Total extracted: {total}")

    update_questions_json(all_records, all_paper_ids, full_rebuild=full_rebuild)
    validate_question_bank(OUTPUT_DIR)


if __name__ == '__main__':
    main()
