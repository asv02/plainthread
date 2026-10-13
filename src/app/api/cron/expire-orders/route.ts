import { expireStaleOrders } from "@/lib/shop/orders";
import { retryPendingRefunds, retryUnsentPaidEmails } from "@/lib/shop/complete-payment";
import { cronAuthorized } from "@/lib/shop/cron-auth";
import { processMetaOutbox, reconcilePurchaseOutbox } from "@/lib/meta/outbox";
import { NextResponse } from "next/server";
import { errMessage, log } from "@/lib/log";

async function run(request: Request) {
  if (!cronAuthorized(request)) {
    log.info("cron", "unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  log.info("cron", "start", { path: "/api/cron/expire-orders" });
  try {
    log.info("cron", "expire stale holds");
    const expired = await expireStaleOrders();
    log.info("cron", "retry unpaid emails");
    const emailed = await retryUnsentPaidEmails();
    log.info("cron", "retry pending refunds");
    const refunded = await retryPendingRefunds();
    let metaReconciled = 0;
    let meta = { claimed: 0, sent: 0, retried: 0, dead: 0 };
    try {
      metaReconciled = await reconcilePurchaseOutbox();
      meta = await processMetaOutbox(20);
    } catch (error) {
      log.error("cron", "meta outbox failed", { error: errMessage(error) });
    }
    log.info("cron", "done", { expired, emailed, refunded, metaReconciled, meta });
    return NextResponse.json({ ok: true, expired, emailed, refunded, metaReconciled, meta });
  } catch (error) {
    log.error("cron", "failed", { error: errMessage(error) });
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
