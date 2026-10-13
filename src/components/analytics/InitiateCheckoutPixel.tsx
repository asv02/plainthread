"use client";

import { useEffect, useRef } from "react";
import { catalogProductId, paiseToRupees } from "@/lib/meta/catalog";
import { PIXEL_READY_EVENT, trackInitiateCheckout } from "@/lib/meta-pixel-client";
import { AD_CONSENT_EVENT } from "@/lib/meta/consent";
import { getProduct } from "@/data/products";
import type { CartLine } from "@/lib/shop/types";

export function InitiateCheckoutPixel({
  items,
  totalPaise,
  hydrated,
}: {
  items: CartLine[];
  totalPaise: number | null;
  hydrated: boolean;
}) {
  const lastKey = useRef("");

  useEffect(() => {
    function trySend() {
      if (!hydrated || items.length === 0 || totalPaise == null || totalPaise <= 0) return;
      const contents = items.map((item) => {
        const product = getProduct(item.productSlug);
        return {
          id: catalogProductId(item.productSlug),
          quantity: item.qty,
          item_price: product?.price ?? 0,
        };
      });
      if (contents.some((item) => !item.id || item.item_price <= 0)) return;
      const key = `${contents.map((c) => `${c.id}:${c.quantity}`).join(",")}|${totalPaise}`;
      if (lastKey.current === key) return;
      try {
        if (sessionStorage.getItem(`pt_meta_ic_${key}`)) {
          lastKey.current = key;
          return;
        }
      } catch {
        // ignore
      }
      if (!trackInitiateCheckout({ contents, value: paiseToRupees(totalPaise) })) return;
      lastKey.current = key;
      try {
        sessionStorage.setItem(`pt_meta_ic_${key}`, "1");
      } catch {
        // ignore
      }
    }

    trySend();
    window.addEventListener(AD_CONSENT_EVENT, trySend);
    window.addEventListener(PIXEL_READY_EVENT, trySend);
    return () => {
      window.removeEventListener(AD_CONSENT_EVENT, trySend);
      window.removeEventListener(PIXEL_READY_EVENT, trySend);
    };
  }, [hydrated, items, totalPaise]);

  return null;
}
