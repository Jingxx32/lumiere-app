#!/usr/bin/env python3
"""
Generate TTS audio for TCF Compréhension orale questions.

Audio content per question type:
  image          : option A → 1s silence → B → C → D
                   (options shown as "Proposition A" placeholder; must be spoken)
  spoken_options : transcript (question sentence) → 1s → option A → B → C → D
                   (options shown as "Réponse A" placeholder; must be spoken)
  dialogue       : transcript only
                   (options shown as text on screen; no need to speak them)

Output: public/media/tcf/audio/test{N}/{level}/q{NN:02d}.wav
DB:     tcf_questions.audio_path ← /media/tcf/audio/test{N}/{level}/q{NN:02d}.wav

Usage:
  python3 scripts/generate-tcf-audio.py              # test 1, levels A1 A2 B1
  python3 scripts/generate-tcf-audio.py --test 1 --levels A1
  python3 scripts/generate-tcf-audio.py --dry-run    # print plan, no API calls
"""

import argparse
import io
import os
import re
import sys
import time
import wave
from pathlib import Path

from num2words import num2words

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from openai import OpenAI

# ── Config ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
load_dotenv(PROJECT_ROOT / ".env")

MODEL  = "gpt-4o-mini-tts"
VOICE  = "alloy"
SILENCE_S = 1.0   # pause between segments (seconds)
RATE_LIMIT_SLEEP = 0.4  # seconds between API calls

OUTPUT_BASE = PROJECT_ROOT / "public" / "media" / "tcf" / "audio"

# ── Audio helpers ──────────────────────────────────────────────────────────────

TTS_INSTRUCTIONS = (
    "Vous êtes un locuteur natif français du Canada. "
    "Prononcez ce texte naturellement en français, y compris tous les chiffres et nombres."
)

def tts_wav(client: OpenAI, text: str) -> bytes:
    """Call TTS API and return raw WAV bytes."""
    resp = client.audio.speech.create(
        model=MODEL,
        voice=VOICE,
        input=text,
        response_format="wav",
        instructions=TTS_INSTRUCTIONS,
    )
    return resp.content


def silence_wav(duration_s: float, sample_rate: int = 24000,
                channels: int = 1, sample_width: int = 2) -> bytes:
    """Generate a silent WAV clip."""
    n_frames = int(duration_s * sample_rate)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00" * n_frames * channels * sample_width)
    return buf.getvalue()


def concat_wavs(parts: list[bytes]) -> bytes:
    """Concatenate WAV files; uses params from the first file (no nframes pre-set)."""
    if len(parts) == 1:
        return parts[0]

    with wave.open(io.BytesIO(parts[0])) as first:
        n_channels  = first.getnchannels()
        sample_width = first.getsampwidth()
        frame_rate  = first.getframerate()

    buf = io.BytesIO()
    with wave.open(buf, "wb") as out:
        # Set params individually — avoids pre-setting nframes which causes header overflow
        out.setnchannels(n_channels)
        out.setsampwidth(sample_width)
        out.setframerate(frame_rate)
        for part in parts:
            with wave.open(io.BytesIO(part)) as r:
                out.writeframes(r.readframes(r.getnframes()))
    return buf.getvalue()


# ── Text segments per question type ───────────────────────────────────────────

def _num_fr(n: int) -> str:
    return num2words(n, lang='fr')

def normalize(text: str) -> str:
    """Fix formatting and convert numbers/times to French words for clean TTS."""
    # Newlines → space
    text = text.replace('\n', ' ')
    # Add space after sentence-ending punctuation when directly followed by a letter
    text = re.sub(r'([.!?])([A-ZÀ-ÿa-z])', r'\1 \2', text)
    # Time: 14h30 → quatorze heures trente, 20h30 → vingt heures trente
    def expand_time(m):
        h, mn = int(m.group(1)), int(m.group(2))
        h_fr = _num_fr(h)
        return f"{h_fr} heures {_num_fr(mn)}" if mn else f"{h_fr} heures"
    text = re.sub(r'\b(\d{1,2})h(\d{2})\b', expand_time, text)
    # Standalone integers (not part of a larger word): 200 → deux cents
    def expand_int(m):
        return _num_fr(int(m.group()))
    text = re.sub(r'\b\d+\b', expand_int, text)
    # Collapse multiple spaces
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


def segments(q: dict) -> list[str]:
    """Return ordered list of text strings to speak for this question."""
    qtype   = q["type"]
    options = q["options"]          # list[str], len 4
    trans   = q["transcript"] or ""

    if qtype == "image":
        # options are not shown on screen → speak A B C D
        return [normalize(opt) for opt in options if opt.strip()]

    if qtype == "spoken_options":
        # transcript (question) + options (not shown on screen)
        parts = []
        if trans.strip():
            parts.append(normalize(trans))
        parts.extend(normalize(opt) for opt in options if opt.strip())
        return parts

    if qtype == "dialogue":
        # options shown as text → only speak transcript
        return [normalize(trans)] if trans.strip() else []

    return []


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test",   type=int, default=1, help="Test number (default: 1)")
    parser.add_argument("--levels", nargs="+", default=["A1", "A2", "B1"],
                        help="Levels to process (default: A1 A2 B1)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print plan only, no API calls or file writes")
    parser.add_argument("--force", action="store_true",
                        help="Re-generate even if file already exists")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    api_key = os.environ.get("OPENAI_API_KEY")

    if not db_url:
        sys.exit("DATABASE_URL not set")
    if not api_key and not args.dry_run:
        sys.exit("OPENAI_API_KEY not set")

    client = OpenAI(api_key=api_key) if not args.dry_run else None

    conn = psycopg2.connect(db_url)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Fetch questions for the requested test + levels
    level_placeholders = ",".join(["%s"] * len(args.levels))
    cur.execute(f"""
        SELECT q.id, q.order_index, q.level, q.type,
               q.options, q.transcript, q.audio_path
        FROM tcf_questions q
        JOIN tcf_sets s ON s.id = q.set_id
        WHERE s.test_number = %s
          AND s.skill = 'listening'
          AND q.level IN ({level_placeholders})
        ORDER BY q.order_index
    """, [args.test, *args.levels])

    questions = cur.fetchall()
    print(f"Found {len(questions)} questions (test {args.test}, levels {args.levels})\n")

    silence = silence_wav(SILENCE_S) if not args.dry_run else None
    updated = 0

    for q in questions:
        segs = segments(q)
        level = q["level"]
        idx   = q["order_index"]

        if not segs:
            print(f"  Q{idx:02d} ({q['type']:14s}) — no audio content, skipping")
            continue

        out_dir  = OUTPUT_BASE / f"test{args.test}" / level
        out_path = out_dir / f"q{idx:02d}.wav"
        rel_path = f"/media/tcf/audio/test{args.test}/{level}/q{idx:02d}.wav"

        print(f"  Q{idx:02d} [{level}] ({q['type']:14s}) — {len(segs)} segment(s)")
        for i, s in enumerate(segs):
            print(f"         {i+1}. {s[:80]}{'…' if len(s)>80 else ''}")

        if args.dry_run:
            continue

        # Skip if already generated (unless --force)
        if out_path.exists() and q["audio_path"] == rel_path and not args.force:
            print(f"         ✓ already exists, skipping\n")
            continue

        out_dir.mkdir(parents=True, exist_ok=True)

        wav_parts: list[bytes] = []
        for i, text in enumerate(segs):
            wav_data = tts_wav(client, text)
            wav_parts.append(wav_data)
            if i < len(segs) - 1:
                wav_parts.append(silence)
            time.sleep(RATE_LIMIT_SLEEP)

        final_wav = concat_wavs(wav_parts)
        out_path.write_bytes(final_wav)

        # Update DB
        cur.execute(
            "UPDATE tcf_questions SET audio_path = %s WHERE id = %s",
            (rel_path, q["id"]),
        )
        conn.commit()
        updated += 1

        kb = len(final_wav) // 1024
        print(f"         ✓ saved ({kb} KB) → {rel_path}\n")

    cur.close()
    conn.close()

    if not args.dry_run:
        print(f"Done. {updated}/{len(questions)} questions generated.")
    else:
        print(f"\n[dry-run] Would generate {sum(1 for q in questions if segments(q))} audio files.")


if __name__ == "__main__":
    main()
