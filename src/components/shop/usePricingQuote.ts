"use client";

import { useEffect, useState } from "react";
import type { CartQuote } from "@/lib/shop/coupon";
import type { CartLine } from "@/lib/shop/types";

export function usePricingQuote(options: {
  lines: CartLine[];
  couponCode?: string | null;
  destinationState?: string;
  checkoutIntent?: unknown;
}) {
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { lines, couponCode = null, destinationState, checkoutIntent } = options;
  const intentKey = checkoutIntent ? JSON.stringify(checkoutIntent) : "";
  const requestKey = `${JSON.stringify(lines)}|${couponCode}|${destinationState ?? ""}|${intentKey}`;

  useEffect(() => {
    if (lines.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/pricing/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({
              items: lines,
              couponCode,
              destinationState,
              checkoutIntent,
            }),
          });
          const data = (await res.json()) as CartQuote & { error?: string };
          if (!res.ok) throw new Error(data.error || "Could not price the checkout");
          if (controller.signal.aborted) return;
          setQuote(data);
        } catch (err) {
          if (controller.signal.aborted) return;
          setQuote(null);
          setError(err instanceof Error ? err.message : "Could not price the checkout");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return {
    quote: lines.length === 0 ? null : quote,
    error,
    loading,
    setError,
  };
}
