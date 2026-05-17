import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";

export default async function AppShellPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-hero">
      <AppHeader activeNav="dashboard" />
      <main className="container mx-auto px-6 py-20">
        <div className="animate-fade-up mx-auto max-w-2xl rounded-2xl border border-border bg-card/60 p-10 backdrop-blur">
          <h1 className="text-3xl font-bold tracking-tight">
            Hi <span className="text-gradient">{user.email}</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Head over to{" "}
            <Link href="/upload" className="text-primary hover:underline">
              Transcriptions
            </Link>{" "}
            to submit a video for processing.
          </p>
        </div>
      </main>
    </div>
  );
}
