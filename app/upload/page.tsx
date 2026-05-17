import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { UploadForm } from "./upload-form";
import { SummaryCell } from "./summary-cell";

type JobRow = {
  id: string;
  created_at: string;
  video_source_url: string;
  status: "pending" | "downloading" | "transcribe" | "done";
  current_session_id: string | null;
};

function StatusBadge({ status }: { status: JobRow["status"] }) {
  // Color buckets per the M1 skill:
  //   pending / downloading → neutral
  //   transcribe            → blue (in progress)
  //   done                  → primary (sage green, tied to the design system)
  const styles =
    status === "done"
      ? "bg-primary/15 text-primary border-primary/30"
      : status === "transcribe"
        ? "bg-blue-100 text-blue-800 border-blue-200"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, created_at, video_source_url, status, current_session_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Pull the cached summaries (if any) for the user's recent jobs in a
  // single follow-up query. RLS on job_sessions restricts this to rows
  // whose parent job belongs to the caller.
  const sessionIds = (jobs ?? [])
    .map((j) => j.current_session_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const summaryByJobId = new Map<string, string | null>();
  if (sessionIds.length > 0) {
    const { data: sessions } = await supabase
      .from("job_sessions")
      .select("id, summary_txt_content")
      .in("id", sessionIds);
    for (const j of jobs ?? []) {
      if (!j.current_session_id) continue;
      const s = sessions?.find((row) => row.id === j.current_session_id);
      summaryByJobId.set(j.id, s?.summary_txt_content ?? null);
    }
  }

  const rows = (jobs ?? []) as JobRow[];

  return (
    <div className="min-h-screen bg-hero">
      <AppHeader activeNav="transcriptions" />

      <main className="container mx-auto px-6 py-12">
        <div className="animate-fade-up mx-auto max-w-3xl space-y-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transcriptions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{user.email}</span>
            </p>
          </div>

          <section
            aria-labelledby="jobs-heading"
            className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur"
          >
            <h2 id="jobs-heading" className="text-lg font-semibold">
              Recent jobs
            </h2>

            {rows.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No transcriptions yet. Submit your first video below.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Created</th>
                      <th className="py-2 pr-3 font-medium">URL</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Transcript</th>
                      <th className="py-2 font-medium">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((j) => (
                      <tr key={j.id} className="border-b border-border/60 last:border-b-0">
                        <td className="py-3 pr-3 whitespace-nowrap text-muted-foreground">
                          {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                        </td>
                        <td className="py-3 pr-3">
                          <span className="font-mono text-xs text-foreground/80">
                            {truncate(j.video_source_url, 50)}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={j.status} />
                        </td>
                        <td className="py-3 pr-3">
                          {j.status === "done" ? (
                            <a
                              href={`/api/jobs/${j.id}/transcript`}
                              download={`transcript-${j.id.slice(0, 8)}.txt`}
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              <Download className="h-3.5 w-3.5" />
                              .txt
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <SummaryCell
                            jobId={j.id}
                            initialSummary={summaryByJobId.get(j.id) ?? null}
                            status={j.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            aria-labelledby="submit-heading"
            className="rounded-2xl border border-border bg-card/70 p-6 backdrop-blur"
          >
            <h2 id="submit-heading" className="text-lg font-semibold">
              Submit a new video
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Whisper will return a clean transcript in about three minutes.
            </p>
            <div className="mt-6">
              <UploadForm />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
