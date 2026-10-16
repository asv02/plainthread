"use client";

import { useEffect, useState } from "react";

type Offer = {
  code: string;
  discountPercent: number;
  condition: string;
};

export function ProductOffers({ productSlug }: { productSlug: string }) {
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/coupons/offers?productSlug=${encodeURIComponent(productSlug)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await res.json()) as { offers?: Offer[] };
        if (!controller.signal.aborted) setOffers(data.offers ?? []);
      } catch {
        if (!controller.signal.aborted) setOffers([]);
      }
    })();
    return () => controller.abort();
  }, [productSlug]);

  if (offers.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs uppercase tracking-[0.18em] text-secondary">Available offers</p>
      {offers.map((offer) => (
        <div key={offer.code} className="border border-border px-4 py-3 text-sm">
          <p className="font-medium">
            {offer.code} — Save {offer.discountPercent}%
          </p>
          <p className="mt-1 text-secondary">{offer.condition}</p>
          <p className="mt-1 text-xs text-secondary">Apply the code at checkout.</p>
        </div>
      ))}
    </div>
  );
}
