"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type BuyButtonProps = {
  productId: string;
  label: string;
  disabled?: boolean;
};

export function BuyButton({ productId, label, disabled }: BuyButtonProps) {
  const [pending, setPending] = useState(false);

  async function buy() {
    setPending(true);
    try {
      const res = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Could not start checkout");
        setPending(false);
        return;
      }
      // Hand off to Stripe Checkout. Don't clear pending — we're leaving the page.
      window.location.href = body.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={buy}
      disabled={disabled || pending}
      className="w-full"
    >
      {pending ? "Redirecting…" : label}
    </Button>
  );
}
