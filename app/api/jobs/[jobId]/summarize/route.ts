import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

// POST /api/jobs/<jobId>/summarize
//
// Generates (or returns cached) a short summary of the user's transcript
// via OpenAI gpt-4o-mini, in the same language as the original audio.
//
// Authorization model matches /api/jobs:
//   - Cookie-session client (publishable key, RLS-gated) confirms the user
//     owns the job and reads jobs + job_sessions rows. RLS automatically
//     denies access to someone else's transcript, so we don't filter by
//     user_id manually.
//   - SUPABASE_SECRET_KEY admin client writes the summary back to
//     job_sessions. RLS only permits SELECT on job_sessions for users;
//     the secret key bypasses RLS so we can persist the cache.

const LANGUAGE_NAMES: Record<string, string> = {
  zh: "Traditional Chinese (繁體中文)",
  en: "English",
  ja: "Japanese (日本語)",
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, current_session_id, language, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (job.status !== "done") {
    return NextResponse.json(
      { error: "transcript not ready" },
      { status: 425 },
    );
  }
  if (!job.current_session_id) {
    return NextResponse.json({ error: "no session" }, { status: 404 });
  }

  const { data: session, error: sessErr } = await supabase
    .from("job_sessions")
    .select("subtitle_txt_content, summary_txt_content")
    .eq("id", job.current_session_id)
    .maybeSingle();
  if (sessErr || !session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  // Cache hit — return what we already generated. No OpenAI cost.
  if (session.summary_txt_content) {
    return NextResponse.json({
      summary: session.summary_txt_content,
      cached: true,
    });
  }

  if (!session.subtitle_txt_content) {
    return NextResponse.json(
      { error: "transcript content missing" },
      { status: 425 },
    );
  }

  // Generate via OpenAI.
  const langName = LANGUAGE_NAMES[job.language] ?? job.language;
  const systemPrompt = `You are a precise content summarizer. Given a video transcript, write a concise summary that helps a busy reader grasp the video's main message and key takeaways quickly.

The transcript language is: ${langName}. Write your entire summary in this same language — match the script the user sees (Traditional Chinese for zh, English for en, Japanese for ja).

Structure your response exactly as:

TL;DR: <one sentence, maximum 30 words, capturing the video's core message>

Key takeaways:
- <takeaway 1, maximum 25 words>
- <takeaway 2, maximum 25 words>
- <takeaway 3, maximum 25 words>
- <takeaway 4, maximum 25 words, if relevant>
- <takeaway 5, maximum 25 words, if relevant>

Use 3 to 5 takeaways depending on the transcript's density. No preamble before "TL;DR". No closing remarks after the last takeaway. Be information-dense; avoid filler phrases like "this video discusses" or "the speaker explains".`;

  let openaiRes: Response;
  try {
    openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: session.subtitle_txt_content },
        ],
        temperature: 0.3,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "OpenAI request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!openaiRes.ok) {
    const errText = await openaiRes.text().catch(() => "");
    return NextResponse.json(
      {
        error: `OpenAI API error (${openaiRes.status}): ${errText.slice(0, 300)}`,
      },
      { status: 502 },
    );
  }

  const data = (await openaiRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) {
    return NextResponse.json(
      { error: "empty summary from OpenAI" },
      { status: 502 },
    );
  }

  // Cache the summary. Use the admin (secret-key) client because RLS only
  // grants SELECT on job_sessions to end users.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const { error: updateErr } = await admin
    .from("job_sessions")
    .update({ summary_txt_content: summary })
    .eq("id", job.current_session_id);
  if (updateErr) {
    // The summary was generated; we just couldn't cache it. Return it anyway
    // so the user isn't blocked, but flag the write failure for ops visibility.
    console.error("summary cache write failed:", updateErr.message);
  }

  return NextResponse.json({ summary, cached: false });
}
