import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses RLS — only call from server-only code (API
// routes, webhooks, background tasks). SUPABASE_SECRET_KEY is server-only;
// it must NEVER be prefixed with NEXT_PUBLIC_ or referenced in a client
// component, or it would leak to the browser bundle.
//
// Built lazily so importing this module doesn't crash on missing env at
// module-load time (Next bundles route files at build, where the env may
// not yet be present).

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
