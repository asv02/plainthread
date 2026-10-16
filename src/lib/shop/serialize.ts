import type { OrderPayload, PublicOrder } from "@/lib/shop/types";

export function isUnconfirmedHold(order: OrderPayload["order"]) {
  return order.status === "open" && order.payment_method == null;
}

export function isConfirmedOrder(order: OrderPayload["order"]) {
  return order.status === "open" && order.payment_method != null;
}

export function toPublicOrder(payload: OrderPayload): PublicOrder {
  const { order, items } = payload;
  return {
    publicId: order.public_id,
    status: order.status,
    paymentMethod: order.payment_method ?? null,
    paymentStatus: order.payment_status,
    parcelStatus: order.parcel_status ?? "pending",
    customerName: order.customer_name,
    email: order.email,
    phone: order.phone,
    addressLine1: order.address_line1,
    addressLine2: order.address_line2,
    city: order.city,
    state: order.state,
    pincode: order.pincode,
    subtotalPaise: order.subtotal_paise,
    taxPaise: order.tax_paise ?? 0,
    taxRateBps: order.tax_rate_bps ?? 0,
    taxKind: order.tax_kind === "cgst_sgst" ? "cgst_sgst" : "igst",
    cgstPaise: order.cgst_paise ?? 0,
    sgstPaise: order.sgst_paise ?? 0,
    igstPaise: order.igst_paise ?? 0,
    shippingPaise: order.shipping_paise,
    discountPaise: order.discount_paise ?? 0,
    couponCode: order.coupon_code ?? null,
    couponPercent: order.coupon_percent ?? null,
    totalPaise: order.total_paise,
    currency: order.currency,
    holdExpiresAt: isUnconfirmedHold(order) ? order.hold_expires_at : null,
    paidAt: order.paid_at,
    createdAt: order.created_at,
    failureReason: order.failure_reason,
    items: items.map((item) => ({
      name: item.name,
      productSlug: item.product_slug,
      size: item.size,
      sku: item.sku,
      qty: item.qty,
      unitPricePaise: item.unit_price_paise,
      discountPaise: item.discount_paise ?? 0,
    })),
    canCancel: order.status === "open" && (order.parcel_status ?? "pending") === "pending",
  };
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
