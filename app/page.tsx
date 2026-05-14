import Link from "next/link";
import { Sparkles, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Sparkles,
    title: "高準確度逐字稿",
    en: "High-accuracy transcripts",
    body: "Powered by OpenAI Whisper. Native support for Chinese and English with punctuation, speakers, and timestamps preserved.",
  },
  {
    icon: Clock,
    title: "三分鐘交付",
    en: "Three-minute turnaround",
    body: "Processed in the background — keep working. We email you the moment your transcript is ready to download.",
  },
  {
    icon: ShieldCheck,
    title: "可商用授權",
    en: "Commercial-use ready",
    body: "You own every word. Repurpose into blog posts, course notes, subtitles, or searchable archives — no strings attached.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-hero">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
          <span className="font-semibold tracking-tight">Video Speed Reader</span>
        </div>
        <Button asChild variant="default" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
          <Link href="/sign-in">Sign in / 登入</Link>
        </Button>
      </header>

      <main>
        <section className="container mx-auto px-6 pb-24 pt-16 text-center md:pt-28">
          <div className="animate-fade-up mx-auto max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              Whisper-powered transcription · 中英雙語
            </span>
            <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-7xl">
              <span className="text-gradient">Video Speed Reader</span>
            </h1>
            <p className="mt-8 text-2xl font-medium md:text-3xl">
              上傳影片,三分鐘內拿到逐字稿。
            </p>
            <p className="mt-3 text-lg text-muted-foreground">
              Upload your video, get a clean transcript in three minutes.
            </p>
            <div className="mt-10 flex justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
              >
                <Link href="/sign-up">Get started — free</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sign-in">I have an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-6 pb-32">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f, i) => (
              <article
                key={f.title}
                className="animate-fade-up rounded-2xl border border-border bg-card/60 p-8 backdrop-blur transition hover:border-primary/50 hover:shadow-glow"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.en}</p>
                <p className="mt-3 text-sm leading-relaxed text-foreground/80">{f.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © 2026 Video Speed Reader
      </footer>
    </div>
  );
}
