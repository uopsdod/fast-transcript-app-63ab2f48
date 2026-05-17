import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

// Shared authenticated-app header. Renders the brand, top nav, the M2
// credits balance pill, and a sign-out button. Server component because it
// reads the user's profile balance — re-renders on every server navigation
// so the badge stays in sync after a deduction or purchase.
//
// Logged-out callers get a brand-only header (no nav, no balance, no
// sign-out). Use <AppHeader /> from any authenticated page; pass
// activeNav to highlight the current section.

type AppHeaderProps = {
  activeNav?: "dashboard" | "transcriptions" | "credits";
};

const navLinkBase = "text-sm transition-colors";
const navLinkActive = "font-medium text-foreground";
const navLinkInactive = "text-muted-foreground hover:text-foreground";

function navClass(active: boolean): string {
  return `${navLinkBase} ${active ? navLinkActive : navLinkInactive}`;
}

export async function AppHeader({ activeNav }: AppHeaderProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance: number | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .single();
    balance = profile ? Number(profile.credits_balance) : null;
  }

  return (
    <header className="border-b border-border">
      <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary shadow-glow" />
          <span className="font-semibold tracking-tight">
            Video Speed Reader
          </span>
        </Link>
        {user && (
          <nav className="flex items-center gap-4">
            <Link href="/app" className={navClass(activeNav === "dashboard")}>
              Dashboard
            </Link>
            <Link
              href="/upload"
              className={navClass(activeNav === "transcriptions")}
            >
              Transcriptions
            </Link>
            <Link href="/credits" className={navClass(activeNav === "credits")}>
              Credits
            </Link>
            {balance !== null && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs backdrop-blur">
                <span className="text-muted-foreground">Credits</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {balance}
                </span>
                <Link
                  href="/credits"
                  className="text-primary hover:underline"
                  aria-label="Buy more credits"
                >
                  Buy more
                </Link>
              </span>
            )}
            <form action={signOut}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
