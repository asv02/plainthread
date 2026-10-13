import {
  catalogProductId,
  META_CONTENT_TYPE,
  META_CURRENCY,
  paiseToRupees,
  type MetaContentItem,
} from "@/lib/meta/catalog";
import { siteConfig } from "@/data/site";

export const PURCHASE_EVENT_NAME = "Purchase" as const;

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
