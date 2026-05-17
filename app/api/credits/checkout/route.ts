import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

// POST /api/credits/checkout
// Body: { product_id: string }
// Flow:
//   1. Require an authenticated user (cookie-bound supabase client).
//   2. Look up the credit_products row (RLS allows reading active products).
//   3. Build success/cancel URLs from the request Origin so the same route
//      works on the current Vercel URL AND a future custom domain (M3) with
//      no code change.
//   4. Create a Stripe Checkout Session with metadata that the webhook
//      will use to credit the right user.
//   5. Return { url } — the client redirects the browser to Stripe.

type CheckoutBody = { product_id?: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as CheckoutBody;
  if (!body.product_id) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  const { data: product, error: productErr } = await supabase
    .from("credit_products")
    .select("id, name, credits, price_usd, stripe_price_id, active")
    .eq("id", body.product_id)
    .eq("active", true)
    .maybeSingle();

  if (productErr) {
    return NextResponse.json({ error: productErr.message }, { status: 500 });
  }
  if (!product || !product.stripe_price_id) {
    return NextResponse.json(
      { error: "product not available" },
      { status: 400 },
    );
  }

  const origin =
    req.headers.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "";
  if (!origin) {
    return NextResponse.json(
      { error: "could not resolve site origin" },
      { status: 500 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: product.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: `${origin}/credits/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/credits`,
      // Stripe metadata values are strings — be explicit so the worker contract
      // is honest about what the webhook receives.
      metadata: {
        user_id: user.id,
        product_id: product.id,
        credits: String(product.credits),
      },
      // Surfaces our user.id on the PaymentIntent + Charge — useful in the
      // Stripe dashboard when triaging a support ticket.
      client_reference_id: user.id,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "stripe returned no session url" },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "stripe error";
    console.error("stripe checkout create failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
