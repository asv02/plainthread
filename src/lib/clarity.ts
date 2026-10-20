"use client";

/**
 * Microsoft Clarity facade — one centralized module for init, custom events
 * and session tags. Application components never call window.clarity directly.
 *
 * Behaviour:
 * - No project id, dev server, or SSR → Clarity is never loaded, nothing throws.
 * - Events that happen before the tag script is ready go into a small bounded
 *   queue (dropped oldest-first) and are replayed once it is.
 * - Event names and tag keys come from closed allowlists; tag values must pass
 *   the Meta PII scanner reused here, so emails/phones/tokens can never ship.
 */

import { customDataLooksSafe } from "@/lib/meta/events";

export const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "";

export const CLARITY_EVENTS = [
  // Discovery
  "view_home",
  "view_collection",
  "view_product",
  "view_content",
  // Consideration
  "product_image_interaction",
  "product_size_selected",
  "size_guide_opened",
  "add_to_cart",
  "view_cart",
  "remove_from_cart",
  "cart_quantity_updated",
  // Purchase intent & checkout
  "buy_now_clicked",
  "begin_checkout",
  "coupon_applied",
  "payment_initiated",
  "payment_window_closed",
  "payment_failed",
  "purchase_completed",
  "order_cancelled",
] as const;

export type ClarityEventName = (typeof CLARITY_EVENTS)[number];

export const CLARITY_TAG_KEYS = ["product_color", "checkout_type"] as const;

export type ClarityTagKey = (typeof CLARITY_TAG_KEYS)[number];

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

type QueuedCall = { args: unknown[] };

const MAX_QUEUE = 20;
const queue: QueuedCall[] = [];
const pendingTags = new Map<ClarityTagKey, string>();
let initStarted = false;
let scriptReady = false;
let revoked = false;

function clarityApi(): ((...args: unknown[]) => void) | null {
  if (typeof window === "undefined") return null;
  const fn = (window as { clarity?: unknown }).clarity;
  return typeof fn === "function" ? (fn as (...args: unknown[]) => void) : null;
}

function enqueue(args: unknown[]) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ args });
}

/** Creates the official stub + async tag script exactly once per document. */
export function initClarity(projectId = CLARITY_PROJECT_ID): boolean {
  if (initStarted || typeof window === "undefined" || typeof document === "undefined") {
    return initStarted;
  }
  if (!projectId || process.env.NODE_ENV === "development") return false;
  initStarted = true;
  try {
    if (typeof window.clarity !== "function") {
      const stub = function (...args: unknown[]) {
        (stub.q = stub.q || []).push(args);
      } as ClarityFn;
      window.clarity = stub;
    }
    if (!document.getElementById("clarity-script")) {
      const script = document.createElement("script");
      script.async = true;
      script.id = "clarity-script";
      script.src = `https://www.clarity.ms/tag/${projectId}`;
      document.head.appendChild(script);
    }
    scriptReady = true;
    // A fresh init means a fresh consent decision (deny at load, accept later
    // in the same document), so the withdrawn gate must reopen.
    revoked = false;
    for (const [key, value] of pendingTags) window.clarity("set", key, value);
    pendingTags.clear();
    while (queue.length > 0) {
      const next = queue.shift();
      if (next) window.clarity(...next.args);
    }
    return true;
  } catch {
    return false;
  }
}

export function isClarityActive() {
  return initStarted && !revoked;
}

let trackingStarted = false;

/** Idempotent consent-granted entry point used by the loader. */
export const CLARITY_READY_EVENT = "pt-clarity-ready";

export function startClarityTracking(projectId = CLARITY_PROJECT_ID): boolean {
  if (trackingStarted) {
    // Re-grant after an in-page withdrawal: the loaded SDK restarts tracking
    // when consent is passed again; our gate reopens with it.
    if (revoked) {
      const fn = clarityApi();
      if (fn) fn("consent", true);
      revoked = false;
    }
    return true;
  }
  const ok = initClarity(projectId);
  if (ok) {
    trackingStarted = true;
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem("pt_clarity_started", "1");
    } catch {
      // sessionStorage can be blocked
    }
    window.dispatchEvent(new Event(CLARITY_READY_EVENT));
  }
  return ok;
}

export function hasSensitiveQuery() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get("token") || params.get("otp") || params.get("access_token"));
  } catch {
    return false;
  }
}

export function trackClarityEvent(event: ClarityEventName): boolean {
  if (revoked || !isClarityActive()) return false;
  if (hasSensitiveQuery()) return false;
  try {
    const fn = clarityApi();
    if (!fn) {
      enqueue(["event", event]);
      return true;
    }
    fn("event", event);
    return true;
  } catch {
    return false;
  }
}

/** Path-only navigation marker; never receives query strings or hashes. */
export function trackClarityPageView(path: string): boolean {
  if (revoked || !isClarityActive()) return false;
  const clean = path.split(/[?#]/)[0] ?? "/";
  try {
    const fn = clarityApi();
    const args: unknown[] = ["set", "page", clean];
    if (!fn) {
      enqueue(args);
      return true;
    }
    fn(...args);
    return true;
  } catch {
    return false;
  }
}

export function clampTagValue(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "unknown";
}

/** Tags ride their own small map so a set-before-init is not lost or duplicated. */
export function setClarityTag(key: ClarityTagKey, value: string): boolean {
  if (revoked || !isClarityActive()) return false;
  // Scan the raw value before sanitising, so PII never gets through by being
  // mangled into a non-matching shape.
  if (!customDataLooksSafe({ [key]: value })) return false;
  const safeValue = clampTagValue(value);
  try {
    const fn = clarityApi();
    if (!fn) {
      pendingTags.set(key, safeValue);
      return true;
    }
    fn("set", key, safeValue);
    return true;
  } catch {
    return false;
  }
}

/** Consent withdrawal: clears Clarity cookies and stops all future tracking. */
export function revokeClarity(): boolean {
  revoked = true;
  queue.length = 0;
  pendingTags.clear();
  try {
    const fn = clarityApi();
    if (fn) fn("consent", false);
    return true;
  } catch {
    return false;
  }
}

export function _resetClarityForTests() {
  queue.length = 0;
  pendingTags.clear();
  initStarted = false;
  scriptReady = false;
  revoked = false;
  trackingStarted = false;
}

export function _clarityQueueLengthForTests() {
  return queue.length;
}

export function _isClarityScriptReadyForTests() {
  return scriptReady;
}

/**
 * Per-document state. Module state is wiped by a full page load, so every new
 * document needs its own stub + tag script.
 */
export function isClarityInitialized() {
  return initStarted;
}

/**
 * Tab-session state, used only to decide whether a consent withdrawal has
 * anything to revoke. Never use it to skip initialization: that would leave
 * every page after the landing page with no `window.clarity` at all.
 */
export function hasStartedClarityThisSession() {
  if (initStarted) return true;
  try {
    if (typeof sessionStorage !== "undefined") {
      return sessionStorage.getItem("pt_clarity_started") === "1";
    }
    return false;
  } catch {
    return false;
  }
}
