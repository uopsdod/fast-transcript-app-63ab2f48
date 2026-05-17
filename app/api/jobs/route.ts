import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  // 1. Authenticate the caller via the cookie session.
  //    We use the publishable key here — the caller is the signed-in user,
  //    and any DB access through this client is RLS-gated.
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

  const body = (await req.json().catch(() => ({}))) as {
    video_source_url?: string;
    topic?: string | null;
    language?: string;
  };
  if (!body.video_source_url) {
    return NextResponse.json(
      { error: "video_source_url required" },
      { status: 400 },
    );
  }

  // 2. M2 credit floor check (cheap pre-check at the API edge).
  //    Reject submissions from users with < 1 credit before doing any DB
  //    writes. The precise per-video check (minutes vs balance) runs on the
  //    worker, where the actual duration is known via yt-dlp. This is the
  //    two-layer billing pattern: cheap + fast at the edge, precise +
  //    authoritative in the worker.
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_balance")
    .eq("id", user.id)
    .single();
  if (!profile || Number(profile.credits_balance) < 1) {
    return NextResponse.json(
      {
        error: "insufficient credits — please buy more at /credits",
        code: "insufficient_credits",
      },
      { status: 402 },
    );
  }

  // 3. Use the Supabase Secret key for the insert. The caller was already
  //    authenticated above. The Secret key bypasses RLS so we can write
  //    `user_id = user.id` directly without a policy round-trip.
  //    SUPABASE_SECRET_KEY is server-only and must NEVER be prefixed with
  //    NEXT_PUBLIC_ — that would leak it to the browser bundle.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .insert({
      user_id: user.id,
      video_source_url: body.video_source_url,
      topic: body.topic ?? null,
      language: body.language ?? "zh",
      status: "pending",
    })
    .select()
    .single();
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  const { data: session, error: sessErr } = await admin
    .from("job_sessions")
    .insert({ job_id: job.id, session_number: 1 })
    .select()
    .single();
  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  await admin
    .from("jobs")
    .update({ current_session_id: session.id })
    .eq("id", job.id);

  return NextResponse.json({ job_id: job.id });
}
