"use client";

import { useEffect, useRef } from "react";
import { AD_CONSENT_EVENT } from "@/lib/meta/consent";
import {
  CLARITY_READY_EVENT,
  setClarityTag,
  trackClarityEvent,
  type ClarityEventName,
  type ClarityTagKey,
} from "@/lib/clarity";

/**
 * Fires one Clarity event once per mount. Clarity initializes after idle, so
 * a mount that happens before it must retry when consent or the ready event
 * arrives — otherwise the very first page of a session records nothing.
 * Never duplicates within one mount.
 */
export function useClarityMountEvent(
  event: ClarityEventName,
  options?: { tagKey?: ClarityTagKey; tagValue?: string; enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const tagKey = options?.tagKey;
  const tagValue = options?.tagValue;
  const sent = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    function trySend() {
      if (sent.current) return;
      if (!trackClarityEvent(event)) return;
      if (tagKey && tagValue) setClarityTag(tagKey, tagValue);
      sent.current = true;
    }
    trySend();
    window.addEventListener(AD_CONSENT_EVENT, trySend);
    window.addEventListener(CLARITY_READY_EVENT, trySend);
    return () => {
      window.removeEventListener(AD_CONSENT_EVENT, trySend);
      window.removeEventListener(CLARITY_READY_EVENT, trySend);
    };
  }, [event, enabled, tagKey, tagValue]);
}

/** JSX mount point for server components; same once-per-mount semantics. */
export function ClarityPageView({
  event,
  tagKey,
  tagValue,
}: {
  event: ClarityEventName;
  tagKey?: ClarityTagKey;
  tagValue?: string;
}) {
  useClarityMountEvent(event, { tagKey, tagValue });
  return null;
}
