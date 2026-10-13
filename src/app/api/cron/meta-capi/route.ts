import { cronAuthorized } from "@/lib/shop/cron-auth";
import { processMetaOutbox, reconcilePurchaseOutbox } from "@/lib/meta/outbox";
import { NextResponse } from "next/server";
import { errMessage, log } from "@/lib/log";

async function run(request: Request) {
  const worker = process.env.META_CAPI_WORKER_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const workerOk = Boolean(worker && token && token === worker);
  if (!workerOk && !cronAuthorized(request)) {
    log.info("meta-capi-cron", "unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const reconciled = await reconcilePurchaseOutbox();
    const processed = await processMetaOutbox(20);
    log.info("meta-capi-cron", "done", { reconciled, processed });
    return NextResponse.json({ ok: true, reconciled, processed });
  } catch (error) {
    log.error("meta-capi-cron", "failed", { error: errMessage(error) });
    return NextResponse.json({ error: "Meta outbox failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
