"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AD_CONSENT_COOKIE,
  AD_CONSENT_EVENT,
  AD_CONSENT_OPEN_EVENT,
  getNamedCookie,
  parseConsentRecord,
  type AdConsent,
} from "@/lib/meta/consent";
import { persistAdConsent } from "@/lib/meta/consent-browser";

function subscribeConsent(onChange: () => void) {
  window.addEventListener(AD_CONSENT_EVENT, onChange);
  return () => window.removeEventListener(AD_CONSENT_EVENT, onChange);
}

export function CookieConsent() {
  const titleId = useId();
  const descId = useId();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const cookieRaw = useSyncExternalStore(
    subscribeConsent,
    () => getNamedCookie(document.cookie, AD_CONSENT_COOKIE) ?? "",
    () => "",
  );
  const known = parseConsentRecord(cookieRaw || null);
  const [prefsOpen, setPrefsOpen] = useState(false);

  useEffect(() => {
    const reopen = () => setPrefsOpen(true);
    window.addEventListener(AD_CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(AD_CONSENT_OPEN_EVENT, reopen);
  }, []);

  const open = mounted && (known == null || prefsOpen);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "11rem";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && known) setPrefsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.paddingBottom = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, known]);

  function choose(choice: AdConsent) {
    persistAdConsent(choice);
    setPrefsOpen(false);
  }

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
      <section
        role="region"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="pointer-events-auto w-full max-w-lg border border-border bg-background px-4 py-3.5 shadow-[var(--shadow)] sm:px-5 sm:py-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-base tracking-wide text-foreground sm:text-lg">
            Your privacy matters.
          </h2>
          {known ? (
            <button
              type="button"
              onClick={() => setPrefsOpen(false)}
              className="shrink-0 text-xs text-secondary underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              Close
            </button>
          ) : null}
        </div>
        <p id={descId} className="mt-2 text-xs leading-5 text-secondary sm:text-[13px] sm:leading-6">
          We use essential cookies to keep your shopping experience working and, with your
          permission, optional cookies to understand shopping activity and improve our marketing.{" "}
          <Link
            href="/privacy"
            className="text-foreground underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Privacy
          </Link>
        </p>
        {known ? (
          <p className="mt-2 text-[11px] tracking-wide text-secondary">
            Optional cookies are {known.categories.marketing ? "on" : "off"}.
          </p>
        ) : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="border border-foreground px-4 py-2.5 text-xs tracking-wide text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            onClick={() => choose("denied")}
          >
            Reject optional
          </button>
          <button
            type="button"
            className="bg-button px-4 py-2.5 text-xs tracking-wide text-white hover:bg-button-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            onClick={() => choose("granted")}
          >
            Accept all
          </button>
        </div>
      </section>
    </div>
  );
}

export function openCookieConsent() {
  window.dispatchEvent(new Event(AD_CONSENT_OPEN_EVENT));
}
