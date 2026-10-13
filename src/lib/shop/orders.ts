import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderPayload } from "@/lib/shop/types";
import { log } from "@/lib/log";

function asPayload(data: unknown): OrderPayload {
  const value = data as OrderPayload;
  if (!value?.order?.id) throw new Error("Unexpected order response");
  return value;
}

export async function expireStaleOrders(excludeOrderId?: string) {
  const db = supabaseAdmin();
  const withArg = await db.rpc("expire_stale_orders", {
    p_exclude_id: excludeOrderId ?? null,
  });
  if (!withArg.error) {
    if (typeof withArg.data === "number" && withArg.data > 0) {
      log.info("orders", "expired stale holds", { count: withArg.data });
    }
    return typeof withArg.data === "number" ? withArg.data : 0;
  }
  const unknownArg =
    withArg.error.code === "PGRST202" ||
    /expire_stale_orders\(p_exclude_id\)/i.test(withArg.error.message);
  if (!unknownArg) throw new Error(withArg.error.message);

  log.debug("orders", "expire_stale_orders fallback to no-arg rpc");
  const noArg = await db.rpc("expire_stale_orders");
  if (noArg.error) throw new Error(noArg.error.message);
  return typeof noArg.data === "number" ? noArg.data : 0;
}

export async function checkoutCreate(input: {
  idempotencyKey: string;
  customer: Record<string, string>;
  items: unknown;
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  holdMinutes: number;
  taxRateBps: number;
  taxKind: string;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}) {
  const { data, error } = await supabaseAdmin().rpc("checkout_create", {
    p_idempotency_key: input.idempotencyKey,
    p_customer: input.customer,
    p_items: input.items,
    p_subtotal_paise: input.subtotalPaise,
    p_tax_paise: input.taxPaise,
    p_shipping_paise: input.shippingPaise,
    p_total_paise: input.totalPaise,
    p_hold_minutes: input.holdMinutes,
    p_tax_rate_bps: input.taxRateBps,
    p_tax_kind: input.taxKind,
    p_cgst_paise: input.cgstPaise,
    p_sgst_paise: input.sgstPaise,
    p_igst_paise: input.igstPaise,
  });
  if (error) {
    const message = error.message || "Checkout failed";
    log.error("orders", "checkout_create failed", {
      error: message,
      totalPaise: input.totalPaise,
    });
    if (message.includes("OUT_OF_STOCK")) {
      const err = new Error("That size just sold out. Remove it or pick another size.");
      (err as Error & { code?: string }).code = "OUT_OF_STOCK";
      throw err;
    }
    throw new Error(message.replace(/^.*exception: /i, ""));
  }
  const payload = asPayload(data);
  log.info("orders", "checkout_create", {
    publicId: payload.order.public_id,
    status: payload.order.status,
    paymentStatus: payload.order.payment_status,
    totalPaise: payload.order.total_paise,
    items: payload.items?.length,
  });
  return payload;
}

export async function attachRazorpayOrder(orderId: string, razorpayOrderId: string) {
  const { error } = await supabaseAdmin().rpc("attach_razorpay_order", {
    p_order_id: orderId,
    p_razorpay_order_id: razorpayOrderId,
  });
  if (error) throw new Error(error.message);
  log.info("orders", "attach_razorpay_order", { orderId, razorpayOrderId });
}

export async function markPaymentFailed(orderId: string, reason: string) {
  log.info("orders", "mark_payment_failed", { orderId, reason: reason.slice(0, 120) });
  await supabaseAdmin().rpc("mark_payment_failed", {
    p_order_id: orderId,
    p_reason: reason.slice(0, 300),
  });
}

export async function saveOrderAttribution(
  orderId: string,
  input: {
    marketingConsent: boolean;
    fbp: string | null;
    fbc: string | null;
    ip: string | null;
    userAgent: string | null;
  },
) {
  const { error } = await supabaseAdmin()
    .from("orders")
    .update({
      meta_fbp: input.fbp,
      meta_fbc: input.fbc,
      meta_client_ip_address: input.ip,
      meta_client_user_agent: input.userAgent,
      marketing_consent: input.marketingConsent,
      marketing_consent_at: new Date().toISOString(),
      marketing_consent_source: "checkout",
    })
    .eq("id", orderId);
  if (error) throw new Error(error.message);
}

export async function markOrderPaid(orderId: string, paymentId: string | null) {
  const { data, error } = await supabaseAdmin().rpc("mark_order_paid", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw new Error(error.message);
  const paid = data as {
    result: string;
    razorpay_payment_id?: string | null;
    payload?: OrderPayload;
  };
  log.info("orders", "mark_order_paid", { orderId, result: paid.result });
  return paid;
}

export async function confirmCodOrder(orderId: string, paymentId: string | null) {
  const { data, error } = await supabaseAdmin().rpc("confirm_cod_order", {
    p_order_id: orderId,
    p_payment_id: paymentId,
  });
  if (error) throw new Error(error.message);
  const confirmed = data as {
    result: string;
    payload?: OrderPayload;
  };
  log.info("orders", "confirm_cod_order", { orderId, result: confirmed.result });
  return confirmed;
}

export async function cancelCustomerOrder(orderId: string, reason: string) {
  const { data, error } = await supabaseAdmin().rpc("cancel_customer_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  log.info("orders", "cancel_customer_order", {
    orderId,
    reason,
    result: (data as { result?: string } | null)?.result,
  });
  return data as {
    result: string;
    razorpay_payment_id?: string | null;
    payload?: OrderPayload;
    status?: string;
  };
}

export async function finalizeRefundCancel(orderId: string) {
  const { data, error } = await supabaseAdmin().rpc("finalize_refund_cancel", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  log.info("orders", "finalize_refund_cancel", {
    orderId,
    result: (data as { result?: string } | null)?.result,
  });
  return data as { result: string; payload?: OrderPayload };
}

export async function getOrderByPublicId(publicId: string) {
  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from("orders")
    .select("*")
    .eq("public_id", publicId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;
  await expireStaleOrders(order.id);
  const [itemsResult, freshResult] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", order.id),
    db.from("orders").select("*").eq("id", order.id).maybeSingle(),
  ]);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  return {
    order: (freshResult.data ?? order) as OrderPayload["order"],
    items: itemsResult.data ?? [],
  } as OrderPayload;
}

export async function getOrderPayloadById(orderId: string) {
  const db = supabaseAdmin();
  const { data: order, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;
  const { data: items, error: itemsError } = await db
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);
  if (itemsError) throw new Error(itemsError.message);
  return { order, items: items ?? [] } as OrderPayload;
}

export async function listOrdersNeedingRefund(limit = 20) {
  const db = supabaseAdmin();
  const { data: orders, error } = await db
    .from("orders")
    .select("*")
    .eq("payment_status", "refund_pending")
    .not("razorpay_payment_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (orders ?? []) as OrderPayload["order"][];
}

export async function listOrdersNeedingPaidEmail(limit = 20) {
  const db = supabaseAdmin();
  const { data: orders, error } = await db
    .from("orders")
    .select("*")
    .eq("status", "open")
    .not("payment_method", "is", null)
    .or("customer_email_sent_at.is.null,ops_email_sent_at.is.null")
    .order("paid_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (orders ?? []) as OrderPayload["order"][];
}

export async function markOrderEmailSent(orderId: string, kind: "customer" | "ops") {
  const column = kind === "customer" ? "customer_email_sent_at" : "ops_email_sent_at";
  const { error } = await supabaseAdmin()
    .from("orders")
    .update({ [column]: new Date().toISOString() })
    .eq("id", orderId)
    .is(column, null);
  if (error) throw new Error(error.message);
}

export async function getOrderByRazorpayPaymentId(paymentId: string) {
  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from("orders")
    .select("*")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;
  const { data: items } = await db.from("order_items").select("*").eq("order_id", order.id);
  return { order, items: items ?? [] } as OrderPayload;
}

export async function getOrderByRazorpayOrderId(razorpayOrderId: string) {
  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from("orders")
    .select("*")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;
  const { data: items } = await db.from("order_items").select("*").eq("order_id", order.id);
  return { order, items: items ?? [] } as OrderPayload;
}

export async function recordPaymentEvent(input: {
  orderId?: string | null;
  eventType: string;
  providerEventId?: string | null;
  payload: unknown;
}) {
  if (!input.providerEventId) return { duplicate: false };
  const { error } = await supabaseAdmin().from("payment_events").insert({
    order_id: input.orderId ?? null,
    event_type: input.eventType,
    provider_event_id: input.providerEventId,
    payload: input.payload,
  });
  if (error?.code === "23505") {
    log.info("orders", "payment_event duplicate", {
      eventType: input.eventType,
      providerEventId: input.providerEventId,
    });
    return { duplicate: true };
  }
  if (error) throw new Error(error.message);
  log.info("orders", "payment_event stored", {
    eventType: input.eventType,
    providerEventId: input.providerEventId,
    orderId: input.orderId ?? null,
  });
  return { duplicate: false };
}
