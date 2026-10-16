import {
  catalogProductId,
  META_CONTENT_CATEGORY,
  META_CONTENT_TYPE,
  META_CURRENCY,
  paiseToRupees,
  type MetaContentItem,
} from "@/lib/meta/catalog";
import { siteConfig } from "@/data/site";

export const PIXEL_EVENT_NAMES = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "CouponApplied",
  "Purchase",
] as const;

export type PixelEventName = (typeof PIXEL_EVENT_NAMES)[number];

export const PURCHASE_EVENT_NAME = "Purchase" as const;

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
  "coupon_code",
  "discount",
]);

export function isPixelEventName(value: string): value is PixelEventName {
  return (PIXEL_EVENT_NAMES as readonly string[]).includes(value);
}

export function pickCustomData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!CUSTOM_KEYS.has(key) || value == null) continue;
    out[key] = value;
  }
  return out;
}

export function newMetaEventId(prefix: string) {
  const rand =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
}

export function eventIdPrefix(event: PixelEventName) {
  switch (event) {
    case "PageView":
      return "pv";
    case "ViewContent":
      return "vc";
    case "AddToCart":
      return "atc";
    case "InitiateCheckout":
      return "ic";
    case "CouponApplied":
      return "coupon";
    case "Purchase":
      return "purchase";
  }
}

export function isValidMetaEventId(value: string) {
  return /^[A-Za-z0-9._-]{8,64}$/.test(value);
}

export function viewContentCustomData(input: {
  id: string;
  name: string;
  priceRupees: number;
  category?: string;
}) {
  return {
    content_ids: [input.id],
    content_type: META_CONTENT_TYPE,
    content_name: input.name,
    content_category: input.category ?? META_CONTENT_CATEGORY,
    contents: [{ id: input.id, quantity: 1, item_price: input.priceRupees }],
    value: input.priceRupees,
    currency: META_CURRENCY,
  };
}

export function addToCartCustomData(input: {
  id: string;
  quantity: number;
  itemPriceRupees: number;
}) {
  return {
    content_ids: [input.id],
    content_type: META_CONTENT_TYPE,
    contents: [{ id: input.id, quantity: input.quantity, item_price: input.itemPriceRupees }],
    value: input.itemPriceRupees * input.quantity,
    currency: META_CURRENCY,
  };
}

export function initiateCheckoutCustomData(input: {
  contents: MetaContentItem[];
  value: number;
}) {
  const numItems = input.contents.reduce((sum, item) => sum + item.quantity, 0);
  return {
    content_ids: input.contents.map((item) => item.id),
    content_type: META_CONTENT_TYPE,
    contents: input.contents,
    value: input.value,
    currency: META_CURRENCY,
    num_items: numItems,
  };
}

export function purchaseEventId(publicId: string) {
  return `purchase_${publicId}`;
}

export function orderEventSourceUrl(publicId: string) {
  return `${siteConfig.domain}/orders/${publicId}`;
}

export type PurchaseLikeOrder = {
  status: string;
  payment_status: string;
  payment_method: string | null;
  paid_at: string | null;
  razorpay_payment_id?: string | null;
  public_id?: string;
  total_paise: number;
  tax_paise?: number | null;
  shipping_paise?: number | null;
  currency?: string | null;
  marketing_consent?: boolean | null;
};

export type PurchaseLikeItem = {
  product_slug?: string;
  productSlug?: string;
  qty: number;
  unit_price_paise?: number;
  unitPricePaise?: number;
};

export function isSimulatedPayment(paymentId: string | null | undefined) {
  return Boolean(paymentId?.startsWith("sim_"));
}

export function isEligiblePaidPurchase(order: PurchaseLikeOrder) {
  return (
    order.status === "open" &&
    order.payment_status === "paid" &&
    order.payment_method === "prepaid" &&
    Boolean(order.paid_at) &&
    !isSimulatedPayment(order.razorpay_payment_id)
  );
}

export function shouldEnqueueCapiPurchase(order: PurchaseLikeOrder) {
  return isEligiblePaidPurchase(order) && order.marketing_consent === true;
}

export function contentsFromItems(items: PurchaseLikeItem[]): MetaContentItem[] {
  return items
    .map((item) => {
      const slug = item.product_slug || item.productSlug || "";
      const id = catalogProductId(slug);
      const qty = item.qty;
      const paise = item.unit_price_paise ?? item.unitPricePaise ?? 0;
      if (!id || !Number.isFinite(qty) || qty < 1) return null;
      return { id, quantity: qty, item_price: paiseToRupees(paise) };
    })
    .filter((row): row is MetaContentItem => Boolean(row));
}

export function purchaseCustomData(order: PurchaseLikeOrder, items: PurchaseLikeItem[]) {
  const contents = contentsFromItems(items);
  const numItems = contents.reduce((sum, item) => sum + item.quantity, 0);
  return {
    content_ids: contents.map((item) => item.id),
    content_type: META_CONTENT_TYPE,
    contents,
    value: paiseToRupees(order.total_paise),
    currency: order.currency || META_CURRENCY,
    order_id: order.public_id ?? "",
    num_items: numItems,
    tax: paiseToRupees(order.tax_paise ?? 0),
    shipping: paiseToRupees(order.shipping_paise ?? 0),
  };
}

const SECRET_KEY = /token|otp|signature|password|secret|authorization|cookie/i;
const CONTACT_VALUE = /@|[0-9]{10,}/;

export function customDataLooksSafe(data: Record<string, unknown>) {
  const json = JSON.stringify(data);
  if (SECRET_KEY.test(json)) return false;
  if (json.includes("access_token") || json.includes("accessToken")) return false;
  for (const [key, value] of Object.entries(data)) {
    if (SECRET_KEY.test(key)) return false;
    if (typeof value === "string" && CONTACT_VALUE.test(value) && key !== "order_id") {
      return false;
    }
  }
  return true;
}

export function paidAtUnixSeconds(paidAt: string) {
  const ms = Date.parse(paidAt);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

/** Meta generally accepts website events within 7 days. */
export function eventTimeWithinWindow(unixSeconds: number, now = Date.now()) {
  const ageMs = now - unixSeconds * 1000;
  return ageMs >= -5 * 60 * 1000 && ageMs <= 7 * 24 * 60 * 60 * 1000;
}
