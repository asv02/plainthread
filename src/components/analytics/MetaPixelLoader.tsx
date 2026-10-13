"use client";

import { useEffect, useRef, useState } from "react";
import { META_PIXEL_ID } from "@/lib/meta-pixel";
import { AD_CONSENT_EVENT, readAdConsentFromCookieString } from "@/lib/meta/consent";
import { expireOptionalMetaCookies } from "@/lib/meta/consent-browser";
import { clearMetaPixelQueue, flushMetaPixelQueue } from "@/lib/meta-pixel-client";

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: unknown;
};

function readConsent() {
  if (typeof document === "undefined") return null;
  return readAdConsentFromCookieString(document.cookie);
}

function installFbqStub() {
  if (typeof window.fbq === "function") return;
  const fbq = function (...args: unknown[]) {
    if (typeof fbq.callMethod === "function") {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as FbqFn;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.push = fbq;
  window.fbq = fbq;
  window._fbq = fbq;
}

export function MetaPixelLoader() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const sync = () => setGranted(readConsent() === "granted");
    sync();
    window.addEventListener(AD_CONSENT_EVENT, sync);
    return () => window.removeEventListener(AD_CONSENT_EVENT, sync);
  }, []);

  useEffect(() => {
    if (granted === null) return;
    if (!granted) {
      clearMetaPixelQueue();
      expireOptionalMetaCookies();
      if (initialized.current && typeof window.fbq === "function") {
        window.fbq("consent", "revoke");
      }
      return;
    }

    installFbqStub();

    if (!initialized.current) {
      initialized.current = true;
      if (!document.querySelector("script[data-pt-fbevents]")) {
        const script = document.createElement("script");
        script.async = true;
        script.src = "https://connect.facebook.net/en_US/fbevents.js";
        script.dataset.ptFbevents = "1";
        document.head.appendChild(script);
      }
      window.fbq?.("consent", "grant");
      window.fbq?.("init", META_PIXEL_ID);
      window.fbq?.("track", "PageView");
    } else {
      window.fbq?.("consent", "grant");
    }

    flushMetaPixelQueue();
  }, [granted]);

  return null;
}
