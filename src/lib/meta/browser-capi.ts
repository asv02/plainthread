import { siteConfig } from "@/data/site";
import { isMarketingConsentGrantedFromHeader } from "@/lib/meta/consent";
import { validateFbc, validateFbp } from "@/lib/meta/fbp-fbc";
import { requestUserAgent, trustedClientIp } from "@/lib/meta/ip";
import {
  customDataLooksSafe,
  isPixelEventName,
  isValidMetaEventId,
  pickCustomData,
  type PixelEventName,
} from "@/lib/meta/events";
import type { CapiGraphEvent } from "@/lib/meta-capi";

export type BrowserCapiRequest = {
  event_name: PixelEventName;
  event_id: string;
  event_source_url: string;
  custom_data?: Record<string, unknown>;
  fbp?: string | null;
  fbc?: string | null;
};

export type BrowserCapiParseResult =
  | { ok: true; value: BrowserCapiRequest }
  | { ok: false; code: string };

const MAX_BODY = 8_192;
const BLOCKED_KEYS = /email|phone|token|otp|password|secret|name|address|user/i;

export function sanitizeEventSourceUrl(raw: unknown, requestUrl: string) {
  const fallback = `${new URL(siteConfig.domain).origin}/`;
  const allowed = new Set<string>([new URL(siteConfig.domain).origin]);
  try {
    allowed.add(new URL(requestUrl).origin);
  } catch {
    // ignore
  }
  const publicSite = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (publicSite) {
    try {
      allowed.add(new URL(publicSite).origin);
    } catch {
      // ignore
    }
  }
  if (typeof raw !== "string" || raw.length > 512) return fallback;
  try {
    const url = new URL(raw);
    if (!allowed.has(url.origin)) return fallback;
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 512);
  } catch {
    return fallback;
  }
}

export function parseBrowserCapiBody(raw: unknown): BrowserCapiParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, code: "invalid_json" };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (BLOCKED_KEYS.test(key) && key !== "event_name" && key !== "event_id") {
      return { ok: false, code: "blocked_field" };
    }
  }
  if (typeof body.event_name !== "string" || !isPixelEventName(body.event_name)) {
    return { ok: false, code: "event_name" };
  }
  if (typeof body.event_id !== "string" || !isValidMetaEventId(body.event_id)) {
    return { ok: false, code: "event_id" };
  }
  let customData: Record<string, unknown> | undefined;
  if (body.custom_data != null) {
    if (typeof body.custom_data !== "object" || Array.isArray(body.custom_data)) {
      return { ok: false, code: "custom_data" };
    }
    customData = pickCustomData(body.custom_data as Record<string, unknown>);
    if (!customDataLooksSafe(customData)) return { ok: false, code: "unsafe_custom_data" };
  }
  return {
    ok: true,
    value: {
      event_name: body.event_name,
      event_id: body.event_id,
      event_source_url: typeof body.event_source_url === "string" ? body.event_source_url : "",
      custom_data: customData,
      fbp: typeof body.fbp === "string" ? body.fbp : null,
      fbc: typeof body.fbc === "string" ? body.fbc : null,
    },
  };
}

export function buildBrowserCapiEvent(
  parsed: BrowserCapiRequest,
  request: Request,
): CapiGraphEvent | { error: string } {
  if (!isMarketingConsentGrantedFromHeader(request.headers.get("cookie"))) {
    return { error: "consent" };
  }
  const userData: Record<string, string> = {};
  const fbp = validateFbp(parsed.fbp);
  const fbc = validateFbc(parsed.fbc);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  const ip = trustedClientIp(request);
  const ua = requestUserAgent(request);
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;

  const event: CapiGraphEvent = {
    event_name: parsed.event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: parsed.event_id,
    action_source: "website",
    event_source_url: sanitizeEventSourceUrl(parsed.event_source_url, request.url),
    user_data: userData,
  };
  if (parsed.custom_data && Object.keys(parsed.custom_data).length > 0) {
    event.custom_data = parsed.custom_data;
  }
  return event;
}

export async function readCapiJsonBody(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { ok: false as const, code: "too_large" };
  if (!text) return { ok: false as const, code: "invalid_json" };
  try {
    return { ok: true as const, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false as const, code: "invalid_json" };
  }
}
