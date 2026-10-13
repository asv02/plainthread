import { META_PIXEL_ID } from "@/lib/meta-pixel";
import { hashedUserData } from "@/lib/meta/hash";
import { validateFbc, validateFbp } from "@/lib/meta/fbp-fbc";
import {
  customDataLooksSafe,
  eventTimeWithinWindow,
  isEligiblePaidPurchase,
  orderEventSourceUrl,
  paidAtUnixSeconds,
  purchaseCustomData,
  purchaseEventId,
  PURCHASE_EVENT_NAME,
  shouldEnqueueCapiPurchase,
} from "@/lib/meta/events";
import type { OrderPayload } from "@/lib/shop/types";
import { log } from "@/lib/log";

export function graphApiVersion() {
  const raw = (process.env.META_GRAPH_API_VERSION || "v25.0").trim();
  return /^v\d+\.\d+$/.test(raw) ? raw : "v25.0";
}

function accessToken() {
  return (process.env.META_CAPI_ACCESS_TOKEN || "").trim();
}

function testEventCode() {
  if (process.env.NODE_ENV === "production") return "";
  return (process.env.META_CAPI_TEST_EVENT_CODE || "").trim();
}

export type CapiSendResult =
  | { ok: true; httpStatus: number }
  | { ok: false; httpStatus: number; retry: boolean; code: string };

export type CapiGraphEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string>;
  custom_data?: Record<string, unknown>;
};

export function graphEventsUrl() {
  return `https://graph.facebook.com/${graphApiVersion()}/${META_PIXEL_ID}/events`;
}

export function buildGraphRequestBody(events: CapiGraphEvent[]) {
  const body: Record<string, unknown> = {
    data: events,
    access_token: accessToken(),
  };
  const testCode = testEventCode();
  if (testCode) body.test_event_code = testCode;
  return body;
}

export async function sendCapiEvents(events: CapiGraphEvent[]): Promise<CapiSendResult> {
  const token = accessToken();
  if (!token) {
    return { ok: false, httpStatus: 0, retry: true, code: "missing_access_token" };
  }
  if (events.length === 0) {
    return { ok: false, httpStatus: 0, retry: false, code: "empty" };
  }

  const body = buildGraphRequestBody(events);
  let response: Response;
  try {
    response = await fetch(graphEventsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, httpStatus: 0, retry: true, code: "network" };
  }

  let json: {
    events_received?: number;
    error?: { message?: string; code?: number; type?: string };
  } = {};
  try {
    json = (await response.json()) as typeof json;
  } catch {
    json = {};
  }

  const errorCode = json.error?.code != null ? String(json.error.code) : json.error?.type || "";
  const eventId = events[0]?.event_id;
  if (!response.ok) {
    const retry = response.status === 429 || response.status >= 500;
    log.error("meta-capi", "graph error", {
      httpStatus: response.status,
      code: errorCode || "http_error",
      eventId,
      eventName: events[0]?.event_name,
    });
    return {
      ok: false,
      httpStatus: response.status,
      retry,
      code: errorCode || "http_error",
    };
  }
  if ((json.events_received ?? 0) < 1) {
    log.error("meta-capi", "graph accepted http but no events_received", {
      httpStatus: response.status,
      eventId,
    });
    return { ok: false, httpStatus: response.status, retry: false, code: "no_events_received" };
  }
  log.info("meta-capi", "event accepted", {
    eventId,
    eventName: events[0]?.event_name,
    httpStatus: response.status,
  });
  return { ok: true, httpStatus: response.status };
}

export function buildPurchaseCapiEvent(payload: OrderPayload) {
  const { order, items } = payload;
  if (!shouldEnqueueCapiPurchase(order) && !isEligiblePaidPurchase(order)) {
    return null;
  }
  if (!shouldEnqueueCapiPurchase(order)) return null;
  if (!order.paid_at) return null;
  const eventTime = paidAtUnixSeconds(order.paid_at);
  if (eventTime == null || !eventTimeWithinWindow(eventTime)) return null;
  const customData = purchaseCustomData(
    { ...order, public_id: order.public_id },
    items,
  );
  if (!customDataLooksSafe(customData) || !customData.order_id) return null;

  const userData: Record<string, string> = {
    ...hashedUserData({
      email: order.email,
      phone: order.phone,
      userId: order.user_id,
      city: order.city,
      state: order.state,
      pincode: order.pincode,
      country: "in",
    }),
  };
  const fbp = validateFbp(order.meta_fbp);
  const fbc = validateFbc(order.meta_fbc);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (order.meta_client_ip_address) userData.client_ip_address = order.meta_client_ip_address;
  if (order.meta_client_user_agent) userData.client_user_agent = order.meta_client_user_agent;

  return {
    event_name: PURCHASE_EVENT_NAME,
    event_time: eventTime,
    event_id: purchaseEventId(order.public_id),
    action_source: "website" as const,
    event_source_url: orderEventSourceUrl(order.public_id),
    user_data: userData,
    custom_data: customData,
  } satisfies CapiGraphEvent;
}

export async function sendCapiPurchase(payload: OrderPayload): Promise<CapiSendResult> {
  const event = buildPurchaseCapiEvent(payload);
  if (!event) {
    return { ok: false, httpStatus: 0, retry: false, code: "ineligible" };
  }
  return sendCapiEvents([event]);
}
