"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function UploadForm() {
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState("");
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("zh");
  const [loading, setLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setInlineError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_source_url: videoUrl,
          topic: topic || null,
          language,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        job_id?: string;
        error?: string;
      };
      if (!res.ok) {
        const msg = body.error ?? `Request failed (HTTP ${res.status})`;
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Job queued — refresh in a minute to see progress.");
      setVideoUrl("");
      setTopic("");
      setLanguage("zh");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="video_source_url">Video URL</Label>
        <Input
          id="video_source_url"
          type="url"
          required
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">
          Topic <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="topic"
          type="text"
          placeholder="e.g. Tech podcast — useful context for the model"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="language">Language</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger id="language" className="w-full">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh">中文 (zh)</SelectItem>
            <SelectItem value="en">English (en)</SelectItem>
            <SelectItem value="ja">日本語 (ja)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {inlineError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {inlineError}
        </p>
      )}

      <Button
        type="submit"
        disabled={loading || !videoUrl}
        className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
      >
        {loading ? "Submitting…" : "Transcribe"}
      </Button>
    </form>
  );
}
