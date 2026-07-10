#!/usr/bin/env python3
"""
Batch-import TCF Compréhension orale tests end-to-end:
  1. import text  (npx tsx scripts/import-tcf-listening.ts N)
  2. transcribe   (python scripts/transcribe-tcf.py --test N)   [cached, billed once]
  3. slice audio  (python scripts/slice-tcf-audio.py --test N --force)
  4. extract imgs (python scripts/extract-tcf-images.py --test N) + backfill

Resumable: transcription is cached; re-running skips paid Whisper calls.
Continues on per-test failure and prints a summary at the end.

Usage:
  python3 scripts/batch-tcf.py --from 3 --to 42
  python3 scripts/batch-tcf.py --tests 3 4 5
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("PATH", "")
os.environ["PATH"] = "/opt/homebrew/bin:" + os.environ["PATH"]


def run(cmd: list[str], label: str) -> tuple[bool, str]:
    print(f"    $ {' '.join(cmd)}")
    p = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    if p.returncode != 0:
        print(f"    ✗ {label} FAILED (exit {p.returncode})")
        print("    " + out.strip().replace("\n", "\n    ")[-1500:])
    return p.returncode == 0, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="frm", type=int)
    ap.add_argument("--to", dest="to", type=int)
    ap.add_argument("--tests", type=int, nargs="+")
    args = ap.parse_args()

    if args.tests:
        tests = args.tests
    elif args.frm and args.to:
        tests = list(range(args.frm, args.to + 1))
    else:
        sys.exit("Specify --tests N... or --from A --to B")

    summary = []  # (test, parsed, imgs_written, low_conf, status)

    for n in tests:
        print(f"\n{'='*60}\nTest {n}\n{'='*60}")
        rec = {"test": n, "parsed": "?", "imgs": "?", "low": "?", "status": "ok"}

        ok, out = run(["npx", "tsx", "scripts/import-tcf-listening.ts", str(n)], "import")
        if not ok:
            rec["status"] = "import-failed"; summary.append(rec); continue
        m = re.search(r"Parsed (\d+) questions", out)
        rec["parsed"] = int(m.group(1)) if m else "?"

        ok, out = run(["python3", "scripts/transcribe-tcf.py", "--test", str(n)], "transcribe")
        if not ok:
            rec["status"] = "transcribe-failed"; summary.append(rec); continue

        ok, out = run(["python3", "scripts/slice-tcf-audio.py", "--test", str(n), "--force"], "slice")
        if not ok:
            rec["status"] = "slice-failed"; summary.append(rec); continue
        m = re.search(r"Low-confidence matches[^Q]*Q\[([^\]]*)\]", out)
        rec["low"] = m.group(1) if m else ""

        ok, out = run(["python3", "scripts/extract-tcf-images.py", "--test", str(n)], "images")
        if ok:
            rec["imgs"] = len(re.findall(r"^\s+✓ ", out, re.M))
            if "⚠ Mismatch" in out:
                rec["status"] = "ok (img-mismatch)"
        else:
            rec["status"] = "ok (img-failed)"

        run(["npx", "tsx", "scripts/backfill-image-paths.ts"], "backfill")
        summary.append(rec)

    # ── summary table ──
    print(f"\n\n{'='*60}\nSUMMARY\n{'='*60}")
    print(f"{'test':>4} {'parsed':>6} {'imgs':>5} {'status':<20} low-confidence")
    for r in summary:
        warn = "" if r["parsed"] == 39 else "  ⚠"
        print(f"{r['test']:>4} {str(r['parsed']):>6}{warn} {str(r['imgs']):>5} "
              f"{r['status']:<20} {r['low']}")
    fails = [r["test"] for r in summary if "failed" in r["status"]]
    if fails:
        print(f"\n⚠ Failed tests: {fails}")
    print(f"\nDone. {len(summary)} tests processed.")


if __name__ == "__main__":
    main()
