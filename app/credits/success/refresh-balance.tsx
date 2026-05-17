"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

// Manual re-fetch in case the webhook is still in flight when the user lands
// here. router.refresh() re-runs the server component and shows the new balance
// without a full page reload.
export function RefreshBalance() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
    >
      {pending ? "Refreshing…" : "Refresh balance"}
    </Button>
  );
}
