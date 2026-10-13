"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackMetaEvent } from "@/lib/meta-pixel-client";

/**
 * Fires Meta Pixel PageView on App Router client navigations.
 * Skips the first render so it does not duplicate the loader PageView.
 */
export function MetaPixelPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    trackMetaEvent("PageView");
  }, [pathname, searchParams]);

  return null;
}
