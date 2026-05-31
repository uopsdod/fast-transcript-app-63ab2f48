# M4 worker image — Whisper transcription pipeline as a Fargate container.
# Built by AWS CodeBuild from the GitHub repo (no local Docker, no EC2 in the build path).
# The worker shells out to ffmpeg/ffprobe + yt-dlp, so they're baked in here.
FROM python:3.12-slim

# ffmpeg ships ffprobe too. --no-install-recommends keeps the image small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first (better layer caching).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker.py .

# JOB_ID + Supabase + OpenAI creds are injected at runtime via the Lambda's
# RunTask containerOverrides[].environment — nothing baked in.
CMD ["python", "worker.py"]
