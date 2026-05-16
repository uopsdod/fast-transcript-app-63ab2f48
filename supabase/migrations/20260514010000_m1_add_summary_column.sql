-- Adds summary_txt_content to job_sessions for ChatGPT-generated summaries.
-- Nullable; lazily populated when the user clicks "Summarize" on /upload.
alter table public.job_sessions
  add column summary_txt_content text;
