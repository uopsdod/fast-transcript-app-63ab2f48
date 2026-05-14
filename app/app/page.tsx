import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function AppShellPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

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
              href="/upload"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Transcriptions
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        </div>
      </header>
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
