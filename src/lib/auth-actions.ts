"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Module-level server actions reusable across server components. Was inlined
// in app/app/page.tsx and app/upload/page.tsx before M2; extracted so the
// shared <AppHeader /> can drive sign-out from any page without duplicating.

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
