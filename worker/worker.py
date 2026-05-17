"""
M2 worker: M1 + Stripe credits.

Polls one job at a time. Before downloading + Whisper:
  1. Probes the video duration with yt-dlp (no download) — or ffprobe for
     local-file inputs — and rounds up to whole minutes.
  2. Reads the user's profiles.credits_balance.
  3. If minutes > balance → marks the job `insufficient_credits`, writes a
     zero-amount ledger row explaining why, and exits without calling Whisper
     (so the user is never billed and no Whisper minutes are wasted).
  4. Otherwise runs the M1 pipeline as before, then on `done` writes a
     `deduction` ledger row (amount = -minutes, with job_id) and decrements
     profiles.credits_balance.

The deduction is two writes (insert ledger, update balance). The ledger is
the source of truth; balance is a derived cache that can be reconstructed
from `SELECT SUM(amount) FROM credit_transactions WHERE user_id = ...`.

Started by distributor.py (one Popen per pending job). Reads JOB_ID from env.
Reads OPENAI_API_KEY / SUPABASE_URL / SUPABASE_SECRET_KEY from AWS Secrets
Manager — the EC2's IAM instance profile grants `secretsmanager:GetSecretValue`
on exactly those three secret names, so no credentials ever live on disk.
"""
import os
import sys
import math
import subprocess
import tempfile
from pathlib import Path

import boto3
from openai import OpenAI
from supabase import create_client


def _get_secret(client, name: str) -> str:
    """Fetch one Secrets Manager secret by name (returns the SecretString)."""
    return client.get_secret_value(SecretId=name)["SecretString"]


def _load_secrets() -> dict[str, str]:
    """Pull the three M1 secrets from AWS Secrets Manager."""
    sm = boto3.client("secretsmanager")
    return {
        "OPENAI_API_KEY": _get_secret(sm, "openai-api-key"),
        "SUPABASE_URL": _get_secret(sm, "supabase-url"),
        "SUPABASE_SECRET_KEY": _get_secret(sm, "supabase-secret-key"),
    }


_secrets = _load_secrets()
db = create_client(_secrets["SUPABASE_URL"], _secrets["SUPABASE_SECRET_KEY"])
openai_client = OpenAI(api_key=_secrets["OPENAI_API_KEY"])

# OpenAI Whisper has a 25 MB file-size limit. 10 minutes of 64 kbps mono mp3 ~= 4.8 MB,
# safely under the limit. Long videos get split into 600-second chunks.
CHUNK_SECONDS = 600


def get_job(job_id: str) -> dict:
    return db.table("jobs").select("*").eq("id", job_id).single().execute().data


def update_job(job_id: str, **fields) -> None:
    db.table("jobs").update({**fields, "updated_at": "now()"}).eq("id", job_id).execute()


def update_session(session_id: str, **fields) -> None:
    db.table("job_sessions").update(fields).eq("id", session_id).execute()


def download_video(url: str, dest_dir: Path) -> Path:
    """yt-dlp for URLs; pass through for local file paths."""
    if url.startswith(("http://", "https://")):
        out_template = str(dest_dir / "video.%(ext)s")
        subprocess.run(["yt-dlp", "-o", out_template, url], check=True)
        return next(dest_dir.glob("video.*"))
    return Path(url).expanduser().resolve()


def to_mp3(video_path: Path, dest_dir: Path) -> Path:
    """Convert any video/audio container to 64 kbps mono 16 kHz mp3 (Whisper-friendly)."""
    mp3 = dest_dir / "audio.mp3"
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-ac", "1",
            "-ar", "16000", "-ab", "64k",
            "-acodec", "libmp3lame",
            str(mp3),
        ],
        check=True,
        capture_output=True,
    )
    return mp3


def get_duration_seconds(audio_path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(out.stdout.strip())


def probe_duration_minutes(video_source: str) -> int:
    """
    Probe the video's duration WITHOUT downloading. Returns ceil(seconds / 60).
    Minimum of 1, so a 17-second clip still costs 1 credit (no rounding down
    to free).

    URLs: yt-dlp's `--print duration` fetches metadata only.
    Local paths: ffprobe directly. We don't have a download to skip in that
    case anyway, so the cost saving doesn't apply — only correctness does.
    """
    if video_source.startswith(("http://", "https://")):
        out = subprocess.run(
            ["yt-dlp", "--print", "duration", "--no-warnings", video_source],
            check=True,
            capture_output=True,
            text=True,
        )
        seconds = float(out.stdout.strip())
    else:
        seconds = get_duration_seconds(Path(video_source).expanduser().resolve())
    return max(1, math.ceil(seconds / 60))


def get_user_balance(user_id: str) -> float:
    """
    Reads profiles.credits_balance. Returns 0.0 if the row is missing — the
    handle_new_user trigger creates a row on signup, so a missing profile here
    means the trigger was disabled or the row was manually deleted; either way
    treating that as zero blocks transcription, which is the safer default.
    """
    res = (
        db.table("profiles")
        .select("credits_balance")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        return 0.0
    return float(res.data["credits_balance"])


def mark_insufficient(job_id: str, user_id: str, minutes: int, balance: float) -> None:
    """
    Pre-Whisper short-circuit: tell the user why, without spending Whisper
    minutes or downloading the video. The ledger row has amount=0 so it
    shows up in the user's transaction history alongside real charges with
    no balance impact, and the worker's done so it returns immediately.
    """
    description = (
        f"Insufficient credits — video is {minutes} min, balance is {balance:g} cr"
    )
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": 0,
        "type": "deduction",
        "description": description,
        "job_id": job_id,
    }).execute()
    update_job(job_id, status="insufficient_credits")


def deduct_credits(user_id: str, job_id: str, minutes: int) -> float:
    """
    Two-write deduction on the happy path: insert the ledger row first
    (source of truth), then update the derived balance. Returns the new
    balance for logging.

    Known race (acceptable for v1): if the same user has two workers running
    concurrently, two read-then-write cycles can clobber each other. The M1
    distributor runs jobs sequentially per user, so this never triggers in
    practice. If we ever introduce parallel workers per user, rewrite this
    as an `UPDATE ... SET credits_balance = credits_balance - $N RETURNING`
    via supabase rpc().
    """
    db.table("credit_transactions").insert({
        "user_id": user_id,
        "amount": -minutes,
        "type": "deduction",
        "description": f"Transcribed {minutes} min video",
        "job_id": job_id,
    }).execute()

    current = get_user_balance(user_id)
    new_balance = max(0.0, current - minutes)
    db.table("profiles").update({
        "credits_balance": new_balance,
        "updated_at": "now()",
    }).eq("id", user_id).execute()
    return new_balance


def split_chunks(mp3_path: Path, dest_dir: Path) -> list[Path]:
    """Split into CHUNK_SECONDS-second chunks (re-encode to keep sizes predictable)."""
    duration = get_duration_seconds(mp3_path)
    n_chunks = max(1, math.ceil(duration / CHUNK_SECONDS))
    chunks = []
    for i in range(n_chunks):
        chunk = dest_dir / f"chunk_{i:03d}.mp3"
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(mp3_path),
                "-ss", str(i * CHUNK_SECONDS),
                "-t", str(CHUNK_SECONDS),
                "-acodec", "libmp3lame",
                "-ab", "64k",
                str(chunk),
            ],
            check=True,
            capture_output=True,
        )
        chunks.append(chunk)
    return chunks


def transcribe_chunk(chunk_path: Path, language: str) -> str:
    with open(chunk_path, "rb") as f:
        return openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="text",
            language=language,
        )


def main() -> None:
    job_id = os.environ["JOB_ID"]
    job = get_job(job_id)
    session_id = job["current_session_id"]
    user_id = job["user_id"]

    # M2 gate: probe duration first, compare to user's balance. Skip Whisper
    # and the (potentially expensive) video download if the user can't afford
    # the job. yt-dlp's --print duration is metadata-only and very cheap.
    minutes = probe_duration_minutes(job["video_source_url"])
    balance = get_user_balance(user_id)
    print(f"[{job_id}] duration probe: {minutes} min · balance: {balance:g} cr")

    if minutes > balance:
        mark_insufficient(job_id, user_id, minutes, balance)
        print(f"[{job_id}] insufficient_credits — need {minutes}, have {balance:g}")
        return

    update_job(job_id, status="downloading")
    print(f"[{job_id}] downloading {job['video_source_url']}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        video = download_video(job["video_source_url"], tmp_path)
        mp3 = to_mp3(video, tmp_path)

        update_job(job_id, status="transcribe")
        chunks = split_chunks(mp3, tmp_path)
        print(f"[{job_id}] transcribing {len(chunks)} chunk(s)")

        full_text = "\n\n".join(
            transcribe_chunk(c, job["language"]) for c in chunks
        )

        update_session(session_id, subtitle_txt_content=full_text)

        # Credit deduction: write ledger row + decrement balance BEFORE flipping
        # status to 'done'. If the deduct fails, the job stays in 'transcribe'
        # status and we know about it in logs — vs flipping 'done' first and
        # finding out later that some users were never charged.
        new_balance = deduct_credits(user_id, job_id, minutes)
        update_job(job_id, status="done")

    print(f"[{job_id}] done — {len(full_text)} chars · new balance: {new_balance:g} cr")


if __name__ == "__main__":
    main()
