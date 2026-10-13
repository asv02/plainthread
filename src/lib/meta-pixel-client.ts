"use client";

import { readAdConsentFromCookieString } from "@/lib/meta/consent";
import { readBrowserMetaCookies } from "@/lib/meta/fbp-fbc";
import {
  addToCartCustomData,
  eventIdPrefix,
  initiateCheckoutCustomData,
  newMetaEventId,
  pickCustomData,
  type PixelEventName,
  viewContentCustomData,
} from "@/lib/meta/events";
import type { MetaContentItem } from "@/lib/meta/catalog";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Window["fbq"];
  }
}

export const PIXEL_READY_EVENT = "pt-meta-pixel-ready";

type Queued = {
  event: PixelEventName;
  params?: Record<string, unknown>;
  eventID: string;
};

const queue: Queued[] = [];
const MAX_QUEUE = 20;
const postedEventIds = new Set<string>();

function consentGranted() {
  if (typeof document === "undefined") return false;
  return readAdConsentFromCookieString(document.cookie) === "granted";
}

function hasSensitiveQuery() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("token") || params.get("otp") || params.get("access_token"));
}

export { pickCustomData };

function currentSourceUrl() {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function postBrowserCapi(item: Queued) {
  if (typeof window === "undefined") return;
  if (postedEventIds.has(item.eventID)) return;
  postedEventIds.add(item.eventID);
  if (postedEventIds.size > 80) {
    const first = postedEventIds.values().next().value;
    if (first) postedEventIds.delete(first);
  }
  const cookies = readBrowserMetaCookies();
  const body = JSON.stringify({
    event_name: item.event,
    event_id: item.eventID,
    event_source_url: currentSourceUrl(),
    custom_data: item.params,
    fbp: cookies.fbp,
    fbc: cookies.fbc,
  });
  void fetch("/api/meta/capi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}

function callFbq(item: Queued) {
  if (typeof window.fbq !== "function") return false;
  window.fbq("track", item.event, item.params ?? {}, { eventID: item.eventID });
  postBrowserCapi(item);
  return true;
}

export function flushMetaPixelQueue() {
  while (queue.length > 0 && typeof window.fbq === "function") {
    const next = queue.shift();
    if (next) callFbq(next);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PIXEL_READY_EVENT));
  }
}

export function clearMetaPixelQueue() {
  queue.length = 0;
}

/**
 * Record an event. If the Pixel stub is not ready yet, queue it and flush
 * after MetaPixelLoader installs fbq. Returns false only when consent or
 * a sensitive URL blocks the event.
 */
export function trackMetaEvent(
  event: PixelEventName,
  data?: Record<string, unknown>,
  eventID?: string,
) {
  try {
    if (!consentGranted()) return false;
    if (hasSensitiveQuery()) return false;
    const params = data ? pickCustomData(data) : undefined;
    const id = eventID && eventID.length >= 8 ? eventID : newMetaEventId(eventIdPrefix(event));
    const item: Queued = { event, params, eventID: id };
    if (typeof window.fbq !== "function") {
      if (queue.length < MAX_QUEUE) queue.push(item);
      return true;
    }
    callFbq(item);
    return true;
  } catch {
    return false;
  }
}

export type ViewContentInput = {
  id: string;
  name: string;
  priceRupees: number;
  category?: string;
};

export function trackViewContent(input: ViewContentInput, eventID?: string) {
  if (!input.id || !Number.isFinite(input.priceRupees)) return false;
  return trackMetaEvent("ViewContent", viewContentCustomData(input), eventID);
}

export function trackAddToCart(
  input: {
    id: string;
    quantity: number;
    itemPriceRupees: number;
  },
  eventID?: string,
) {
  if (!input.id || input.quantity < 1) return false;
  return trackMetaEvent("AddToCart", addToCartCustomData(input), eventID);
}

export function trackInitiateCheckout(
  input: {
    contents: MetaContentItem[];
    value: number;
  },
  eventID?: string,
) {
  if (input.contents.length === 0) return false;
  return trackMetaEvent("InitiateCheckout", initiateCheckoutCustomData(input), eventID);
}

export function trackPurchase(input: Record<string, unknown>, eventID: string) {
  return trackMetaEvent("Purchase", input, eventID);
}
