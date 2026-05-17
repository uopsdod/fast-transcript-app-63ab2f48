import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { BuyButton } from "./buy-button";

// Server component: reads balance + 3 active products + 50 recent ledger rows.
// All reads are RLS-gated via the cookie-bound supabase client, so a user can
// only see their own profile + transactions; credit_products is gated by an
// `active = true` policy. No service-role key on this page.

type Product = {
  id: string;
  name: string;
  credits: number;
  price_usd: number;
  stripe_price_id: string | null;
};

type Transaction = {
  id: string;
  amount: number;
  type: "purchase" | "deduction" | "signup_bonus" | "admin_grant";
  description: string | null;
  created_at: string;
};

function bonusBadge(product: Product, baseline: Product): number {
  // 10cr / $10 baseline = 1 credit per dollar. A tier giving 1.5 credits per
  // dollar shows "+50%" — the "bonus credits" framing the skill describes.
  if (product.id === baseline.id) return 0;
  const ratio =
    product.credits / product.price_usd / (baseline.credits / baseline.price_usd);
  return Math.round((ratio - 1) * 100);
}

function transactionColor(type: Transaction["type"]): string {
  switch (type) {
    case "purchase":
      return "text-primary";
    case "signup_bonus":
      return "text-accent-foreground";
    case "deduction":
      return "text-muted-foreground";
    case "admin_grant":
      return "text-primary-glow";
  }
}

function formatAmount(amount: number, type: Transaction["type"]): string {
  if (type === "deduction") return `-${Math.abs(Number(amount))}`;
  return `+${Number(amount)}`;
}

export default async function CreditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [{ data: profile }, { data: products }, { data: transactions }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", user.id)
        .single(),
      supabase
        .from("credit_products")
        .select("id, name, credits, price_usd, stripe_price_id")
        .eq("active", true)
        .order("price_usd"),
      supabase
        .from("credit_transactions")
        .select("id, amount, type, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const balance = Number(profile?.credits_balance ?? 0);
  const productList = (products ?? []) as Product[];
  const txList = (transactions ?? []) as Transaction[];
  const baseline = productList[0]; // cheapest = baseline

  return (
    <div className="min-h-screen bg-hero">
      <AppHeader activeNav="credits" />

      <main className="container mx-auto max-w-5xl px-6 py-12">
        {/* Balance card */}
        <section className="animate-fade-up rounded-2xl border border-border bg-card/60 p-8 backdrop-blur">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Your balance
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-bold tracking-tight text-gradient">
              {balance}
            </span>
            <span className="text-lg text-muted-foreground">credits</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            1 credit = 1 minute of video. Signup bonus is 30 credits.
          </p>
        </section>

        {/* Tier cards */}
        <section className="mt-10">
          <h2 className="text-2xl font-semibold tracking-tight">
            Buy more credits
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One-time purchases. Credits never expire.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {productList.map((p) => {
              const bonus = baseline ? bonusBadge(p, baseline) : 0;
              const perCredit = p.price_usd / p.credits;
              const disabled = !p.stripe_price_id;
              return (
                <div
                  key={p.id}
                  className="relative flex flex-col rounded-2xl border border-border bg-card/60 p-6 backdrop-blur"
                >
                  {bonus > 0 && (
                    <span className="absolute -top-3 right-4 rounded-full bg-gradient-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-glow">
                      +{bonus}% bonus
                    </span>
                  )}
                  <h3 className="text-xl font-semibold tracking-tight">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-3xl font-bold text-foreground">
                    ${Number(p.price_usd).toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ${perCredit.toFixed(3)} per credit
                  </p>
                  <div className="mt-6">
                    <BuyButton
                      productId={p.id}
                      label={`Buy ${p.credits} credits`}
                      disabled={disabled}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Transaction history */}
        <section className="mt-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            Transaction history
          </h2>
          <div className="mt-4 rounded-2xl border border-border bg-card/60 backdrop-blur">
            {txList.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground">
                No transactions yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {txList.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-center justify-between gap-4 px-6 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        {tx.description ?? tx.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString()} · {tx.type}
                      </p>
                    </div>
                    <span
                      className={`text-base font-semibold tabular-nums ${transactionColor(
                        tx.type,
                      )}`}
                    >
                      {formatAmount(Number(tx.amount), tx.type)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Test mode — payments processed in Stripe sandbox.{" "}
          <Link href="/upload" className="text-primary hover:underline">
            Back to transcriptions
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
