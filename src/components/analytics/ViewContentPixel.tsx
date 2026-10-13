"use client";

import { useEffect, useRef } from "react";
import { catalogProductId } from "@/lib/meta/catalog";
import { PIXEL_READY_EVENT, trackViewContent } from "@/lib/meta-pixel-client";
import { AD_CONSENT_EVENT } from "@/lib/meta/consent";

function storageKey(slug: string) {
  return `pt_meta_viewcontent_${slug}`;
}

export function ViewContentPixel({
  slug,
  name,
  priceRupees,
}: {
  slug: string;
  name: string;
  priceRupees: number;
}) {
  const sent = useRef(false);

  useEffect(() => {
    function trySend() {
      if (sent.current) return;
      try {
        if (sessionStorage.getItem(storageKey(slug))) {
          sent.current = true;
          return;
        }
      } catch {
        // sessionStorage can be blocked
      }
      const id = catalogProductId(slug);
      if (!id || !Number.isFinite(priceRupees)) return;
      if (!trackViewContent({ id, name, priceRupees })) return;
      sent.current = true;
      try {
        sessionStorage.setItem(storageKey(slug), "1");
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
  }, [slug, name, priceRupees]);

  return null;
}
