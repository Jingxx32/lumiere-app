#!/usr/bin/env python3
"""
Extract the question images for TCF Compréhension orale image-type questions
from a Member PDF, skipping logos/thumbnails.

Large images (max dimension ≥ 500px) appear once per image-type question, in
document order. We assign them to the test's image-type questions (ordered by
order_index, queried from the DB), then run backfill-image-paths.ts to wire them up.

Output: public/media/tcf/test{N}/q{NN:02d}.png

Usage:
  python3 scripts/extract-tcf-images.py --test 2
  python3 scripts/extract-tcf-images.py --test 2 --dry-run
"""

import argparse
import os
import sys
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF
import psycopg2
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
load_dotenv(PROJECT_ROOT / ".env")

_PDF_DIR = os.environ.get("TCF_LISTENING_DIR")
if not _PDF_DIR:
    sys.exit("TCF_LISTENING_DIR is not set — point it at your local listening PDF + audio folder.")
PDF_DIR = Path(_PDF_DIR)
OUTPUT_BASE = PROJECT_ROOT / "public" / "media" / "tcf"
MIN_DIM = 500  # px — anything smaller is a logo / decorative thumbnail


def find_pdf(test_number: int) -> Path:
    for f in PDF_DIR.iterdir():
        name = unicodedata.normalize("NFC", f.name)
        if not name.lower().endswith(".pdf"):
            continue
        if "member" not in name.lower() or "orale" not in name.lower():
            continue
        toks = name.lower().replace("(", " ").replace(")", " ").split()
        if "test" in toks:
            i = toks.index("test")
            if i + 1 < len(toks) and toks[i + 1].isdigit() and int(toks[i + 1]) == test_number:
                return f
    sys.exit(f"No Member PDF found for test {test_number}")


def image_question_indexes(test_number: int) -> list[int]:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("""
        SELECT q.order_index
        FROM tcf_questions q JOIN tcf_sets s ON s.id = q.set_id
        WHERE s.test_number = %s AND s.skill = 'listening' AND q.type = 'image'
        ORDER BY q.order_index
    """, [test_number])
    idxs = [r[0] for r in cur.fetchall()]
    cur.close(); conn.close()
    return idxs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    pdf = find_pdf(args.test)
    img_qs = image_question_indexes(args.test)
    print(f"Test {args.test}: {len(img_qs)} image questions {img_qs}")
    print(f"PDF: {pdf.name}")

    doc = fitz.open(pdf)
    big = []  # (page, xref)
    seen = set()
    for pno in range(doc.page_count):
        for img in doc[pno].get_images(full=True):
            xref = img[0]
            if xref in seen:
                continue
            seen.add(xref)
            pix = fitz.Pixmap(doc, xref)
            if max(pix.width, pix.height) >= MIN_DIM:
                big.append((pno + 1, xref, pix.width, pix.height))

    print(f"Found {len(big)} large images (≥{MIN_DIM}px)")
    if len(big) != len(img_qs):
        print(f"⚠ Mismatch: {len(big)} images vs {len(img_qs)} image questions. "
              f"Review mapping before writing.")

    out_dir = OUTPUT_BASE / f"test{args.test}"
    pairs = list(zip(img_qs, big))
    for qidx, (pno, xref, w, h) in pairs:
        rel = f"/media/tcf/test{args.test}/q{qidx:02d}.png"
        print(f"  Q{qidx:02d} ← page {pno} image {w}x{h}  → {rel}")

    if args.dry_run:
        print("\n[dry-run] no files written.")
        return

    out_dir.mkdir(parents=True, exist_ok=True)
    for qidx, (pno, xref, w, h) in pairs:
        pix = fitz.Pixmap(doc, xref)
        if pix.n - pix.alpha >= 4:  # CMYK → RGB
            pix = fitz.Pixmap(fitz.csRGB, pix)
        out_path = out_dir / f"q{qidx:02d}.png"
        pix.save(out_path)
        print(f"  ✓ {out_path.relative_to(PROJECT_ROOT)} ({out_path.stat().st_size // 1024} KB)")

    print("\nDone. Now run: npx tsx scripts/backfill-image-paths.ts")


if __name__ == "__main__":
    main()
