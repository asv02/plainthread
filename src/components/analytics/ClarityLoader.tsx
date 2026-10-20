"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AD_CONSENT_EVENT, readAdConsentFromCookieString } from "@/lib/meta/consent";
import {
  hasSensitiveQuery,
  hasStartedClarityThisSession,
  isClarityInitialized,
  revokeClarity,
  startClarityTracking,
  trackClarityPageView,
} from "@/lib/clarity";

function readConsent() {
  if (typeof document === "undefined") return null;
  return readAdConsentFromCookieString(document.cookie);
}

/**
 * Microsoft Clarity — loads only after advertising consent, never in the
 * critical path: initialization waits for idle time or the first real user
 * interaction, whichever comes first. One loader in the root layout; the
 * script tag itself is deduplicated by id.
 */
export function ClarityLoader() {
  const pathname = usePathname();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setGranted(readConsent() === "granted");
    sync();
    window.addEventListener(AD_CONSENT_EVENT, sync);
    return () => window.removeEventListener(AD_CONSENT_EVENT, sync);
  }, []);

  useEffect(() => {
    if (granted === null) return;
    if (!granted) {
      if (hasStartedClarityThisSession()) revokeClarity();
      return;
    }
    if (isClarityInitialized()) return;

    let idleHandle = -1;
    let done = false;
    const begin = () => {
      if (done) return;
      done = true;
      if (idleHandle !== -1 && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      startClarityTracking();
    };
    const start = () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      begin();
    };

    if ("requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(start, { timeout: 4000 });
    }
    const idleTimer = window.setTimeout(start, 5000);
    window.addEventListener("load", start);
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("load", start);
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      if (!done && idleHandle !== -1 && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, [granted]);

  // Clarity records a pageview only on real document loads; App Router
  // transitions need this marker so journeys stay readable in recordings.
  // The initial path is skipped — the SDK already recorded it on load.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (!isClarityInitialized() || hasSensitiveQuery()) return;
    trackClarityPageView(pathname);
  }, [pathname]);

  return null;
}
