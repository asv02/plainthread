"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useShop } from "@/components/shop/ShopProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import type { CartQuote, EligibleCouponOffer } from "@/lib/shop/coupon";
import type { CartLine } from "@/lib/shop/types";

export function CouponField({
  lines,
  destinationState,
  checkoutIntent,
  quote,
  onNotice,
}: {
  lines: CartLine[];
  destinationState?: string;
  checkoutIntent?: unknown;
  quote: CartQuote | null;
  onNotice: (message: string) => void;
}) {
  const { couponCode, setCouponCode, clearCoupon } = useShop();
  const [offers, setOffers] = useState<EligibleCouponOffer[] | null>(null);
  const [offersFailed, setOffersFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const applied = Boolean(couponCode && quote?.coupon?.applied && quote.coupon.code === couponCode);
  const linesKey = JSON.stringify(lines);
  const intentKey = checkoutIntent ? JSON.stringify(checkoutIntent) : "";

  useEffect(() => {
    if (lines.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setOffers(null);
        setOffersFailed(false);
        try {
          const res = await fetch("/api/coupons/eligible", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({ items: lines, destinationState }),
          });
          const data = (await res.json()) as { offers?: EligibleCouponOffer[]; error?: string };
          if (!res.ok || !data.offers) throw new Error(data.error || "Could not load coupons");
          if (!controller.signal.aborted) {
            setOffers(data.offers);
            setOffersFailed(data.offers.length === 0 && Boolean(data.error));
          }
        } catch {
          if (!controller.signal.aborted) {
            setOffers([]);
            setOffersFailed(true);
          }
        }
      })();
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey, intentKey, destinationState]);

  async function apply(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    if (lines.length === 0) {
      onNotice("Add a product before applying a coupon.");
      return;
    }
    setBusy(true);
    onNotice("");
    try {
      const res = await fetch("/api/pricing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines,
          couponCode: code,
          destinationState,
          checkoutIntent,
        }),
      });
      const data = (await res.json()) as CartQuote & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not apply coupon");
      if (!data.coupon?.applied) {
        onNotice(data.coupon?.message || "Coupon could not be applied");
        return;
      }
      setCouponCode(data.coupon.code);
      setDraft("");
      onNotice("");
    } catch (err) {
      onNotice(err instanceof Error ? err.message : "Could not apply coupon");
    } finally {
      setBusy(false);
    }
  }

  if (applied && quote?.coupon) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>
          {quote.coupon.code} applied · {quote.coupon.discountPercent}% off eligible items
        </p>
        <button
          type="button"
          className="underline underline-offset-4"
          disabled={busy}
          onClick={() => {
            clearCoupon();
            onNotice("");
          }}
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {offers == null ? (
        <p className="text-xs text-secondary">Checking available coupons…</p>
      ) : offersFailed ? (
        <p className="text-xs text-secondary">Could not load coupon list. Enter a code below.</p>
      ) : offers.length === 0 ? (
        <p className="text-xs text-secondary">No coupons apply to these items right now.</p>
      ) : (
        <Dropdown
          label="Choose a coupon"
          align="start"
          panelClassName="w-full"
          triggerClassName="flex w-full items-center justify-between gap-2 border border-border bg-card px-3 py-2 text-sm tracking-wide transition hover:bg-muted"
          trigger={
            <>
              <span className="text-secondary">Choose a coupon</span>
              <ChevronDown size={16} aria-hidden />
            </>
          }
          items={offers.map((offer) => ({
            label: `${offer.code} · save ${offer.discountPercent}% — ${offer.condition}`,
            disabled: busy,
            onSelect: () => apply(offer.code),
          }))}
        />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.toUpperCase())}
          placeholder="Coupon code"
          aria-label="Coupon code"
          className="w-full border border-border px-3 py-2 text-sm"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="border border-foreground px-4 py-2 text-sm disabled:opacity-40"
        >
          {busy ? "Checking…" : "Apply"}
        </button>
      </form>
    </div>
  );
}
