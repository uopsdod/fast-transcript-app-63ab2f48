import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { UploadForm } from "./upload-form";

type JobRow = {
  id: string;
  created_at: string;
  video_source_url: string;
  status: "pending" | "downloading" | "transcribe" | "done";
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
    .select("id, created_at, video_source_url, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  const rows = (jobs ?? []) as JobRow[];

  return (
    <div className="min-h-screen bg-hero">
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
            <span className="font-semibold tracking-tight">Video Speed Reader</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/app"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>

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
                      <th className="py-2 font-medium">Transcript</th>
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
                        <td className="py-3">
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
