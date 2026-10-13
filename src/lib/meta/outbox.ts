import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendCapiPurchase } from "@/lib/meta-capi";
import {
  isEligiblePaidPurchase,
  purchaseEventId,
  shouldEnqueueCapiPurchase,
} from "@/lib/meta/events";
import type { DbOrder, OrderPayload } from "@/lib/shop/types";
import { errMessage, log } from "@/lib/log";

export type OutboxRow = {
  id: string;
  event_name: string;
  event_id: string;
  order_id: string;
  status: string;
  attempt_count: number;
};

function backoffSeconds(attempt: number) {
  const base = Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 15);
  return base + jitter;
}

export async function enqueuePurchaseOutbox(orderId: string) {
  const { error } = await supabaseAdmin().rpc("enqueue_meta_purchase", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
}

export async function reconcilePurchaseOutbox() {
  const { data, error } = await supabaseAdmin().rpc("reconcile_meta_purchase_outbox");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

async function loadPayload(orderId: string): Promise<OrderPayload | null> {
  const db = supabaseAdmin();
  const { data: order, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) return null;
  const { data: items, error: itemsError } = await db
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  if (itemsError) throw new Error(itemsError.message);
  return { order: order as DbOrder, items: items ?? [] };
}

async function markOutbox(
  id: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin()
    .from("meta_event_outbox")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function processMetaOutbox(limit = 10) {
  const db = supabaseAdmin();
  const { data: claimed, error } = await db.rpc("claim_meta_event_outbox", {
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  const rows = (claimed ?? []) as OutboxRow[];
  let sent = 0;
  let retried = 0;
  let dead = 0;
  for (const row of rows) {
    try {
      const payload = await loadPayload(row.order_id);
      const order = payload?.order;
      if (!payload || !order || !shouldEnqueueCapiPurchase(order) || !isEligiblePaidPurchase(order)) {
        await markOutbox(row.id, {
          status: "dead_letter",
          last_error_code: "ineligible",
        });
        dead += 1;
        continue;
      }
      const result = await sendCapiPurchase(payload);
      if (result.ok) {
        await markOutbox(row.id, {
          status: "sent",
          sent_at: new Date().toISOString(),
          last_http_status: result.httpStatus,
          last_error_code: null,
        });
        sent += 1;
        continue;
      }
      const attempts = row.attempt_count + 1;
      if (!result.retry || attempts >= 8) {
        await markOutbox(row.id, {
          status: "dead_letter",
          attempt_count: attempts,
          last_http_status: result.httpStatus || null,
          last_error_code: result.code.slice(0, 80),
        });
        log.error("meta-outbox", "dead letter", {
          eventId: purchaseEventId(order.public_id),
          code: result.code,
        });
        dead += 1;
        continue;
      }
      const next = new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString();
      await markOutbox(row.id, {
        status: "retry",
        attempt_count: attempts,
        next_attempt_at: next,
        last_http_status: result.httpStatus || null,
        last_error_code: result.code.slice(0, 80),
      });
      retried += 1;
    } catch (error) {
      const attempts = row.attempt_count + 1;
      await markOutbox(row.id, {
        status: attempts >= 8 ? "dead_letter" : "retry",
        attempt_count: attempts,
        next_attempt_at: new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
        last_error_code: "worker_error",
      });
      log.error("meta-outbox", "worker error", { error: errMessage(error), id: row.id });
      if (attempts >= 8) dead += 1;
      else retried += 1;
    }
  }
  return { claimed: rows.length, sent, retried, dead };
}
