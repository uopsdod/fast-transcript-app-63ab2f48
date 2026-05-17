import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/app-header";
import { RefreshBalance } from "./refresh-balance";

// UX-only page. Stripe redirects here on successful Checkout completion.
// This page does NOT credit the user — the webhook at /api/stripe/webhook is
// the sole source of credit-balance changes. If the user closes the tab
// between paying and being redirected, the webhook still arrives and credits
// land within seconds.

export default async function CreditsSuccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [{ data: profile }, { data: latest }] = await Promise.all([
    supabase
      .from("profiles")
      .select("credits_balance")
      .eq("id", user.id)
      .single(),
    supabase
      .from("credit_transactions")
      .select("amount, description, created_at")
      .eq("user_id", user.id)
      .eq("type", "purchase")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const balance = Number(profile?.credits_balance ?? 0);
  const lastPurchase = latest
    ? {
        amount: Number(latest.amount),
        description: (latest.description as string | null) ?? "Credits purchase",
        createdAt: latest.created_at as string,
      }
    : null;

  return (
    <div className="min-h-screen bg-hero">
      <AppHeader activeNav="credits" />

      <main className="container mx-auto max-w-2xl px-6 py-20">
        <section className="animate-fade-up rounded-2xl border border-border bg-card/60 p-10 text-center backdrop-blur">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-gradient">Purchase complete</span>
          </h1>
          <p className="mt-4 text-muted-foreground">
            Your credits are on their way — Stripe webhooks usually arrive within
            a few seconds.
          </p>

          <div className="mt-8 inline-flex flex-col items-center rounded-xl border border-border bg-background/60 px-10 py-6">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Current balance
            </p>
            <p className="mt-1 text-5xl font-bold tracking-tight text-gradient">
              {balance}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">credits</p>
          </div>

          {lastPurchase && (
            <p className="mt-6 text-sm text-muted-foreground">
              Latest purchase: <span className="font-medium">+{lastPurchase.amount} credits</span>
              {" · "}
              {new Date(lastPurchase.createdAt).toLocaleString()}
            </p>
          )}

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <RefreshBalance />
            <Button asChild variant="outline">
              <Link href="/upload">Back to transcriptions</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
