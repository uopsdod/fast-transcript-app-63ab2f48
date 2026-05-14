import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/jobs/<jobId>/transcript
//
// Streams the user's transcript as text/plain with Content-Disposition:
// attachment, so a click on the /upload page triggers a file download.
//
// Authorization: uses the cookie-session client (publishable key). RLS
// policies on jobs + job_sessions restrict reads to rows owned by the
// authenticated user, so we don't manually filter by user_id here — a
// missing row from another user's job will just look like a 404 to the
// caller, which is what we want.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .select("id, current_session_id, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!job.current_session_id) {
    return NextResponse.json({ error: "no session" }, { status: 404 });
  }

  const { data: session, error: sessErr } = await supabase
    .from("job_sessions")
    .select("subtitle_txt_content")
    .eq("id", job.current_session_id)
    .maybeSingle();
  if (sessErr || !session || !session.subtitle_txt_content) {
    // 425 Too Early — transcript not ready yet (job still pending/downloading/transcribe)
    return NextResponse.json(
      { error: "transcript not ready" },
      { status: 425 },
    );
  }

  const filename = `transcript-${job.id.slice(0, 8)}.txt`;
  return new NextResponse(session.subtitle_txt_content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Transcripts can change if a job is re-run; don't let intermediaries cache.
      "Cache-Control": "private, no-store",
    },
  });
}
