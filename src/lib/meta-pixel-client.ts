"use client";

import { readAdConsentFromCookieString } from "@/lib/meta/consent";
import {
  META_CONTENT_CATEGORY,
  META_CONTENT_TYPE,
  META_CURRENCY,
  type MetaContentItem,
} from "@/lib/meta/catalog";

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
  event: "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase";
  params?: Record<string, unknown>;
  eventID?: string;
};

const queue: Queued[] = [];
const MAX_QUEUE = 20;

function consentGranted() {
  if (typeof document === "undefined") return false;
  return readAdConsentFromCookieString(document.cookie) === "granted";
}

function hasSensitiveQuery() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("token") || params.get("otp") || params.get("access_token"));
}

const CUSTOM_KEYS = new Set([
  "content_ids",
  "content_type",
  "content_name",
  "content_category",
  "contents",
  "value",
  "currency",
  "num_items",
  "order_id",
  "tax",
  "shipping",
]);

export function pickCustomData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!CUSTOM_KEYS.has(key) || value == null) continue;
    out[key] = value;
  }
  return out;
}

function callFbq(item: Queued) {
  if (typeof window.fbq !== "function") return false;
  if (item.eventID) {
    window.fbq("track", item.event, item.params ?? {}, { eventID: item.eventID });
  } else if (item.params) {
    window.fbq("track", item.event, item.params);
  } else {
    window.fbq("track", item.event);
  }
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
  event: Queued["event"],
  data?: Record<string, unknown>,
  eventID?: string,
) {
  try {
    if (!consentGranted()) return false;
    if (hasSensitiveQuery()) return false;
    const params = data ? pickCustomData(data) : undefined;
    const item: Queued = { event, params, eventID };
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

export function trackViewContent(input: ViewContentInput) {
  if (!input.id || !Number.isFinite(input.priceRupees)) return false;
  return trackMetaEvent("ViewContent", {
    content_ids: [input.id],
    content_type: META_CONTENT_TYPE,
    content_name: input.name,
    content_category: input.category ?? META_CONTENT_CATEGORY,
    contents: [{ id: input.id, quantity: 1, item_price: input.priceRupees }],
    value: input.priceRupees,
    currency: META_CURRENCY,
  });
}

export function trackAddToCart(input: {
  id: string;
  quantity: number;
  itemPriceRupees: number;
}) {
  if (!input.id || input.quantity < 1) return false;
  return trackMetaEvent("AddToCart", {
    content_ids: [input.id],
    content_type: META_CONTENT_TYPE,
    contents: [
      { id: input.id, quantity: input.quantity, item_price: input.itemPriceRupees },
    ] satisfies MetaContentItem[],
    value: input.itemPriceRupees * input.quantity,
    currency: META_CURRENCY,
  });
}

export function trackInitiateCheckout(input: {
  contents: MetaContentItem[];
  value: number;
}) {
  if (input.contents.length === 0) return false;
  const numItems = input.contents.reduce((sum, item) => sum + item.quantity, 0);
  return trackMetaEvent("InitiateCheckout", {
    content_ids: input.contents.map((item) => item.id),
    content_type: META_CONTENT_TYPE,
    contents: input.contents,
    value: input.value,
    currency: META_CURRENCY,
    num_items: numItems,
  });
}

export function trackPurchase(input: Record<string, unknown>, eventID: string) {
  return trackMetaEvent("Purchase", input, eventID);
}
