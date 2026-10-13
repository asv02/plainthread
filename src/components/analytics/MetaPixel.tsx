import { Suspense } from "react";
import { MetaPixelLoader } from "@/components/analytics/MetaPixelLoader";
import { MetaPixelPageView } from "@/components/analytics/MetaPixelPageView";

/**
 * Meta Pixel — loads only after advertising consent.
 * Initial PageView comes from MetaPixelLoader; App Router navigations
 * are tracked by MetaPixelPageView.
 */
export function MetaPixel() {
  return (
    <>
      <MetaPixelLoader />
      <Suspense fallback={null}>
        <MetaPixelPageView />
      </Suspense>
    </>
  );
}
