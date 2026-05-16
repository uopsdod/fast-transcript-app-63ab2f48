"use client";

import { useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type JobStatus = "pending" | "downloading" | "transcribe" | "done";

export function SummaryCell({
  jobId,
  initialSummary,
  status,
}: {
  jobId: string;
  initialSummary: string | null;
  status: JobStatus;
}) {
  const [summary, setSummary] = useState<string | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  if (status !== "done") {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const onClick = async () => {
    // If we already have a cached summary, just open the modal.
    if (summary) {
      setOpen(true);
      return;
    }

    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/summarize`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: string;
        cached?: boolean;
        error?: string;
      };
      if (!res.ok || !body.summary) {
        const msg = body.error ?? `Request failed (HTTP ${res.status})`;
        toast.error(msg);
        setOpen(false);
        return;
      }
      setSummary(body.summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Working…
          </>
        ) : summary ? (
          <>
            <FileText className="h-3.5 w-3.5" />
            View
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Summarize
          </>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Summary</DialogTitle>
            <DialogDescription>
              {loading
                ? "Generating with gpt-4o-mini…"
                : "Cached after first generation — open again any time at no cost."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {summary ?? (loading ? "" : "(no content)")}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
