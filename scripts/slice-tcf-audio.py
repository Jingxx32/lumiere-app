#!/usr/bin/env python3
"""
Slice a TCF Compréhension orale test mp3 into per-question clips, using the
cached Whisper word-timestamp transcription to locate each question.

Alignment:
  - Each DB question gets a "head signature" — the first few words actually
    spoken at its start:
      image          → "regardez l image {N}"   (announced)
      spoken_options → first words of the question (transcript)
      dialogue       → first words of the dialogue (transcript)
  - We scan the Whisper word stream monotonically (questions are in order) and
    match each head to find its start time. Whisper mis-hearings are tolerated
    via fuzzy ratio; question text itself always comes from the DB, never Whisper.
  - Clip i spans [start_i − pad, start_{i+1} − pad]; the last ends at audio end.
    Adjacent clips touch, so inter-question pauses are preserved.

Slicing uses the ORIGINAL mp3 (full quality), re-encoded for sample-accurate cuts.

Output: public/media/tcf/audio/test{N}/{level}/q{NN:02d}.mp3
DB:     tcf_questions.audio_path ← /media/tcf/audio/test{N}/{level}/q{NN:02d}.mp3

Usage:
  python3 scripts/slice-tcf-audio.py --test 2 --dry-run   # print plan, no writes
  python3 scripts/slice-tcf-audio.py --test 2             # slice + update DB
  python3 scripts/slice-tcf-audio.py --test 2 --force     # overwrite existing
"""

import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
load_dotenv(PROJECT_ROOT / ".env")

_PDF_DIR = os.environ.get("TCF_LISTENING_DIR")
if not _PDF_DIR:
    sys.exit("TCF_LISTENING_DIR is not set — point it at your local listening PDF + audio folder.")
PDF_DIR = Path(_PDF_DIR)
CACHE_DIR = PROJECT_ROOT / "scripts" / ".tcf-cache"
OUTPUT_BASE = PROJECT_ROOT / "public" / "media" / "tcf" / "audio"

HEAD_LEN = 7          # words in a head signature
LEAD_PAD = 0.35       # seconds of lead-in kept before each detected start
MIN_RATIO = 0.5       # below this a match is flagged low-confidence
SEARCH_WIN = 700      # words to scan forward when locating a head (argmax within)


# ── text normalisation ─────────────────────────────────────────────────────────

def norm(text: str) -> list[str]:
    """Lowercase, strip accents/punct, return word tokens."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")  # drop accents
    text = text.lower().replace("’", " ").replace("'", " ")
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return text.split()


# ── file discovery ─────────────────────────────────────────────────────────────

def find_mp3(test_number: int) -> Path:
    for f in PDF_DIR.iterdir():
        name = unicodedata.normalize("NFC", f.name)
        if not name.lower().endswith(".mp3"):
            continue
        if "member" not in name.lower() or "orale" not in name.lower():
            continue
        tokens = name.lower().replace("(", " ").replace(")", " ").split()
        if "test" in tokens:
            ti = tokens.index("test")
            if ti + 1 < len(tokens) and tokens[ti + 1].isdigit() and int(tokens[ti + 1]) == test_number:
                return f
    sys.exit(f"No Member mp3 found for test {test_number}")


# ── alignment ──────────────────────────────────────────────────────────────────
#
# Greedy per-question head matching collapses when a question's DB transcript is
# garbled (common at C1/C2): the head fails to match locally and the cursor jumps
# to noise, cascading. Instead we GLOBALLY align the full expected word sequence
# (all questions' known texts, in order) against the Whisper word stream with one
# difflib pass. Even a garbled question stays pinned between its well-matched
# neighbours, so positions can never collapse to the end.

def ref_words(q: dict) -> list[str]:
    """Words actually spoken at/after this question's start, from DB (not Whisper).
       image          → 'regardez l image N' + the 4 options (read aloud)
       spoken_options → question (transcript) + the 4 options (read aloud)
       dialogue       → the transcript (dialogue + question sentence)"""
    if q["type"] == "image":
        src = f"regardez l image {q['order_index']} " + " ".join(q["options"] or [])
    elif q["type"] == "spoken_options":
        src = (q["transcript"] or "") + " " + " ".join(q["options"] or [])
    else:
        src = q["transcript"] or " ".join(q["options"] or [])
    return norm(src)


def align_starts(questions: list[dict], words: list[dict], words_norm: list[str]) -> list[dict]:
    """Return one dict per question: {q, start, coverage}. start = audio time of the
    question's first spoken word; coverage = fraction of its expected words aligned."""
    # Build expected sequence + per-word owner (question position).
    expected: list[str] = []
    owner: list[int] = []
    first_exp: list[int] = []   # first expected index of each question
    for qi, q in enumerate(questions):
        rw = ref_words(q)
        first_exp.append(len(expected))
        for w in rw:
            expected.append(w)
            owner.append(qi)

    # Global alignment: map each matched expected index → observed (Whisper) index.
    sm = difflib.SequenceMatcher(None, words_norm, expected, autojunk=False)
    exp2obs: dict[int, int] = {}
    for i, j, size in sm.get_matching_blocks():
        for k in range(size):
            exp2obs[j + k] = i + k

    # For each question, the first aligned word at/after its expected start.
    next_exp = [first_exp[i + 1] if i + 1 < len(first_exp) else len(expected)
                for i in range(len(first_exp))]
    raw = []  # (obs_idx or None, coverage)
    for qi in range(len(questions)):
        lo, hi = first_exp[qi], next_exp[qi]
        obs_idx = None
        for e in range(lo, hi):
            if e in exp2obs:
                obs_idx = exp2obs[e]
                break
        covered = sum(1 for e in range(lo, hi) if e in exp2obs)
        coverage = covered / max(1, hi - lo)
        raw.append((obs_idx, coverage))

    # Fill any unmatched starts by interpolating between resolved neighbours; clamp
    # to be monotonically non-decreasing so clips never overlap or invert.
    n = len(questions)
    obs_idx = [r[0] for r in raw]
    for qi in range(n):
        if obs_idx[qi] is None:
            prev = next((obs_idx[j] for j in range(qi - 1, -1, -1) if obs_idx[j] is not None), 0)
            nxt = next((obs_idx[j] for j in range(qi + 1, n) if obs_idx[j] is not None), len(words) - 1)
            obs_idx[qi] = (prev + nxt) // 2
    for qi in range(1, n):
        if obs_idx[qi] <= obs_idx[qi - 1]:
            obs_idx[qi] = min(obs_idx[qi - 1] + 1, len(words) - 1)

    out = []
    for qi, q in enumerate(questions):
        out.append({"q": q, "word_idx": obs_idx[qi],
                    "start": float(words[obs_idx[qi]]["start"]),
                    "ratio": raw[qi][1]})
    return out


# ── main ────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--test", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        sys.exit("DATABASE_URL not set")

    cache = CACHE_DIR / f"transcribe-test{args.test}.json"
    if not cache.exists():
        sys.exit(f"No transcription cache: {cache}\nRun: python3 scripts/transcribe-tcf.py --test {args.test}")

    tr = json.loads(cache.read_text())
    words = [w for w in tr.get("words", []) if w.get("word")]
    if not words:
        sys.exit("Transcription has no word timestamps.")
    audio_dur = float(tr.get("duration") or words[-1]["end"])
    words_norm = [norm(w["word"])[0] if norm(w["word"]) else "" for w in words]

    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT q.id, q.order_index, q.level, q.type, q.options, q.transcript
        FROM tcf_questions q JOIN tcf_sets s ON s.id = q.set_id
        WHERE s.test_number = %s AND s.skill = 'listening'
        ORDER BY q.order_index
    """, [args.test])
    questions = cur.fetchall()
    print(f"Test {args.test}: {len(questions)} questions, audio {audio_dur:.0f}s, {len(words)} words\n")

    # 1) Globally align all questions' known text to the Whisper word stream.
    starts = align_starts(questions, words, words_norm)
    for s in starts:
        s["head"] = ref_words(s["q"])[:7]

    # 2) Clip boundaries: start_i .. start_{i+1}, with lead pad; last → audio end.
    plan = []
    for i, s in enumerate(starts):
        clip_start = max(0.0, s["start"] - LEAD_PAD)
        if i + 1 < len(starts):
            clip_end = max(clip_start + 0.5, starts[i + 1]["start"] - LEAD_PAD)
        else:
            clip_end = audio_dur
        plan.append({**s, "clip_start": clip_start, "clip_end": clip_end})

    # 3) Print plan
    print(f"{'Q':>3} {'lvl':<3} {'type':<14} {'start':>8} {'end':>8} {'dur':>6} {'fit':>5}  head")
    low = []
    for p in plan:
        q = p["q"]
        dur = p["clip_end"] - p["clip_start"]
        flag = "" if p["ratio"] >= MIN_RATIO else "  ⚠ LOW"
        if p["ratio"] < MIN_RATIO:
            low.append(q["order_index"])
        print(f"{q['order_index']:>3} {q['level']:<3} {q['type']:<14} "
              f"{p['clip_start']:>7.1f}s {p['clip_end']:>7.1f}s {dur:>5.1f}s "
              f"{p['ratio']:>4.2f}{flag}  {' '.join(p['head'])[:42]}")
    if low:
        print(f"\n⚠ Low-confidence matches (verify): Q{low}")

    if args.dry_run:
        print("\n[dry-run] no files written.")
        cur.close(); conn.close()
        return

    # 4) Slice with ffmpeg from the ORIGINAL mp3 (re-encode for accurate cuts)
    mp3 = find_mp3(args.test)
    print(f"\nSlicing from: {mp3.name}")
    updated = 0
    for p in plan:
        q = p["q"]
        idx = q["order_index"]
        level = q["level"]
        out_dir = OUTPUT_BASE / f"test{args.test}" / level
        out_path = out_dir / f"q{idx:02d}.mp3"
        rel = f"/media/tcf/audio/test{args.test}/{level}/q{idx:02d}.mp3"

        if out_path.exists() and not args.force:
            print(f"  Q{idx:02d} exists, skip")
            continue
        out_dir.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", str(mp3),
             "-ss", f"{p['clip_start']:.3f}", "-to", f"{p['clip_end']:.3f}",
             "-c:a", "copy", str(out_path)],
            capture_output=True,
        )
        if result.returncode != 0:
            # fallback: re-encode (some mp3s need this)
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(mp3),
                 "-ss", f"{p['clip_start']:.3f}", "-to", f"{p['clip_end']:.3f}",
                 "-c:a", "libmp3lame", "-b:a", "128k", "-af", "aformat=sample_fmts=fltp",
                 str(out_path)],
                check=True, capture_output=True,
            )
        cur.execute("UPDATE tcf_questions SET audio_path = %s WHERE id = %s", (rel, q["id"]))
        conn.commit()
        kb = out_path.stat().st_size // 1024
        print(f"  Q{idx:02d} [{level}] {p['clip_end']-p['clip_start']:5.1f}s ({kb} KB) → {rel}")
        updated += 1

    cur.close(); conn.close()
    print(f"\nDone. {updated} clips written.")


if __name__ == "__main__":
    main()
