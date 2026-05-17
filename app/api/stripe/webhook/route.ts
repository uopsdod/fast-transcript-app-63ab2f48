import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/stripe/webhook
//
// The webhook is the SOLE source of credit-balance changes for purchases.
// /credits/success is UX-only and never credits the user.
//
// Hard rules (don't reorder these):
//  1. Read the RAW body via req.text() — Stripe's HMAC is computed over the
//     exact byte stream. req.json() mutates whitespace and breaks verification.
//  2. Service-role Supabase client — Stripe is the caller, no auth cookie.
//  3. The UNIQUE INDEX on credit_transactions.stripe_payment_intent_id is
//     what protects against double-credit on Stripe retries. Catch the unique
//     violation (Postgres error code 23505) and return 200 — that's idempotency
//     working, not a failure.
//  4. Two writes (insert ledger, update balance). The ledger is the source
//     of truth; the balance is a derived cache. If the second write fails,
//     the balance can be reconciled from credit_transactions.
//  5. Never 200 before signature verification — Stripe interprets non-200
//     as "retry". Verifying first means a bad signature gets a real 400.
//
// Edge runtime note: Next 16 App Router defaults to Node runtime for route
// handlers; `stripe` requires Node so we don't override.

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new NextResponse("no signature", { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return new NextResponse("webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error("stripe webhook signature verification failed", err);
    return new NextResponse("invalid signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, unpaid: true });
  }

  const userId = session.metadata?.user_id;
  const productId = session.metadata?.product_id;
  const credits = Number(session.metadata?.credits);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!userId || !productId || !Number.isFinite(credits) || !paymentIntentId) {
    console.error("stripe webhook missing required fields", {
      userId,
      productId,
      credits,
      paymentIntentId,
    });
    return new NextResponse("missing metadata", { status: 400 });
  }

  const svc = createServiceClient();

  // Step 1 — insert ledger row. The UNIQUE INDEX makes duplicate webhook
  // deliveries safe: a retry hits 23505 and we treat it as success.
  const { error: insertErr } = await svc.from("credit_transactions").insert({
    user_id: userId,
    amount: credits,
    type: "purchase",
    description: `Purchased ${credits} credits`,
    stripe_payment_intent_id: paymentIntentId,
  });
  if (insertErr) {
    // Postgres unique_violation. supabase-js surfaces it as { code: '23505' }.
    if (insertErr.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("stripe webhook ledger insert failed", insertErr);
    return new NextResponse("db insert failed", { status: 500 });
  }

  // Step 2 — increment derived balance.
  const { data: profile, error: readErr } = await svc
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .single();
  if (readErr) {
    console.error("stripe webhook profile read failed", readErr);
    return new NextResponse("balance read failed", { status: 500 });
  }

  const newBalance = Number(profile?.credits_balance ?? 0) + credits;
  const { error: updateErr } = await svc
    .from("profiles")
    .update({ credits_balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateErr) {
    console.error("stripe webhook balance update failed", updateErr);
    return new NextResponse("balance update failed", { status: 500 });
  }

  return NextResponse.json({
    received: true,
    credited: credits,
    new_balance: newBalance,
  });
}
