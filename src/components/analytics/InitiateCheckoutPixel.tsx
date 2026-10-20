"use client";

import { useEffect, useRef } from "react";
import { catalogProductId, paiseToRupees } from "@/lib/meta/catalog";
import { newMetaEventId } from "@/lib/meta/events";
import { PIXEL_READY_EVENT, trackInitiateCheckout } from "@/lib/meta-pixel-client";
import { AD_CONSENT_EVENT } from "@/lib/meta/consent";
import { useClarityMountEvent } from "@/components/analytics/ClarityPageView";
import { getProduct } from "@/data/products";
import type { CartLine } from "@/lib/shop/types";

export function InitiateCheckoutPixel({
  items,
  totalPaise,
  hydrated,
  checkoutType,
}: {
  items: CartLine[];
  totalPaise: number | null;
  hydrated: boolean;
  checkoutType?: "cart" | "buyNow";
}) {
  const lastKey = useRef("");
  const eventIds = useRef(new Map<string, string>());

  // Clarity's own copy of this milestone retries against Clarity's readiness
  // instead of the Pixel's, so a slow idle init cannot swallow the event.
  useClarityMountEvent("begin_checkout", {
    tagKey: "checkout_type",
    tagValue: checkoutType,
    enabled: hydrated && items.length > 0 && totalPaise != null && totalPaise > 0,
  });

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
      const eventID = eventIds.current.get(key) ?? newMetaEventId("ic");
      eventIds.current.set(key, eventID);
      if (!trackInitiateCheckout({ contents, value: paiseToRupees(totalPaise) }, eventID)) return;
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
