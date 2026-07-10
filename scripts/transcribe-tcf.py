#!/usr/bin/env python3
"""
Transcribe a TCF Compréhension orale test mp3 with Whisper, producing
word-level timestamps used later to slice the recording into per-question clips.

Pipeline:
  1. ffmpeg downsample (16 kHz mono mp3) → keeps file under Whisper's 25 MB limit
  2. Whisper (whisper-1) verbose_json + word timestamps, French language hint
  3. Save full result to scripts/.tcf-cache/transcribe-test{N}.json

Usage:
  python3 scripts/transcribe-tcf.py --test 2
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
load_dotenv(PROJECT_ROOT / ".env")

PDF_DIR = Path(
    "<TCF_LISTENING_DIR>"
)
CACHE_DIR = PROJECT_ROOT / "scripts" / ".tcf-cache"


def find_mp3(test_number: int) -> Path:
    """Locate the Member mp3 for a given test number (NFC/NFD safe)."""
    candidates = []
    for f in PDF_DIR.iterdir():
        name = unicodedata.normalize("NFC", f.name)
        if not name.lower().endswith(".mp3"):
            continue
        if "member" not in name.lower() or "orale" not in name.lower():
            continue
        # "... test 2 Member ..." — match the number as a standalone token
        tokens = name.lower().replace("(", " ").replace(")", " ").split()
        if "test" in tokens:
            ti = tokens.index("test")
            if ti + 1 < len(tokens) and tokens[ti + 1].isdigit() and int(tokens[ti + 1]) == test_number:
                candidates.append(f)
    if not candidates:
        sys.exit(f"No Member mp3 found for test {test_number}")
    return candidates[0]


def downsample(src: Path) -> Path:
    """16 kHz mono mp3 → small enough for Whisper's 25 MB cap."""
    out = Path(tempfile.gettempdir()) / f"tcf-test-{src.stem}-16k.mp3"
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-ac", "1", "-ar", "16000",
         "-b:a", "48k", str(out)],
        check=True, capture_output=True,
    )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", type=int, required=True)
    ap.add_argument("--force", action="store_true", help="Re-transcribe even if cache exists")
    args = ap.parse_args()

    out_json = CACHE_DIR / f"transcribe-test{args.test}.json"
    if out_json.exists() and not args.force:
        print(f"✓ cache exists, skipping (use --force to re-transcribe): {out_json}")
        return

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.exit("OPENAI_API_KEY not set")

    mp3 = find_mp3(args.test)
    print(f"Source mp3: {mp3.name} ({mp3.stat().st_size // 1024 // 1024} MB)")

    print("Downsampling (16 kHz mono)…")
    small = downsample(mp3)
    print(f"  → {small} ({small.stat().st_size // 1024 // 1024} MB)")

    print("Transcribing with Whisper (this takes ~1 min)…")
    client = OpenAI(api_key=api_key)
    with open(small, "rb") as fh:
        resp = client.audio.transcriptions.create(
            model="whisper-1",
            file=fh,
            language="fr",
            response_format="verbose_json",
            timestamp_granularities=["word", "segment"],
        )

    data = resp.model_dump()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    words = data.get("words", [])
    print(f"\n✓ Saved → {out_json}")
    print(f"  duration: {data.get('duration', 0):.0f}s")
    print(f"  words:    {len(words)}")
    print(f"\n--- first 400 chars of transcript ---")
    print(data.get("text", "")[:400])
    if words:
        print(f"\n--- first 12 word timestamps ---")
        for w in words[:12]:
            print(f"  {w.get('start', 0):6.2f}–{w.get('end', 0):6.2f}  {w.get('word', '')}")


if __name__ == "__main__":
    main()
