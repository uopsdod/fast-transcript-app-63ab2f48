import Stripe from "stripe";

// STRIPE_SECRET_KEY (sandbox `sk_test_...`) is set in Vercel Production env.
// Pinning the apiVersion isolates us from upstream Stripe SDK bumps — when
// the lockfile floats to a newer Stripe SDK months from now, the API shape
// the server speaks doesn't drift unless we explicitly bump this string.
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-03-25.dahlia",
});
