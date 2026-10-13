import { getOrderByPublicId } from "@/lib/shop/orders";
import { getCustomerFromCookie } from "@/lib/shop/customers";
import { toPublicOrder } from "@/lib/shop/serialize";
import {
  jsonWithOrderAccess,
  orderAuthorized,
  readOrderAccessToken,
} from "@/lib/shop/order-access";
import { NextResponse } from "next/server";
import { log } from "@/lib/log";

export async function GET(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const queryToken = new URL(request.url).searchParams.get("token") ?? "";
  const cookieToken = await readOrderAccessToken(publicId);
  const token = queryToken || cookieToken;
  log.info("get-order", "start", { publicId, hasToken: Boolean(token) });
  const payload = await getOrderByPublicId(publicId);
  const user = await getCustomerFromCookie();
  const auth = orderAuthorized(payload, token, user);
  if (!payload || !auth.ok) {
    log.info("get-order", "not found or unauthorized", {
      publicId,
      tokenOk: auth.tokenOk,
      sessionOk: auth.sessionOk,
    });
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  log.info("get-order", "loaded", {
    publicId,
    status: payload.order.status,
    paymentStatus: payload.order.payment_status,
    paymentMethod: payload.order.payment_method,
    via: auth.tokenOk ? "token" : "session",
  });
  return jsonWithOrderAccess(
    { order: toPublicOrder(payload) },
    payload.order.public_id,
    payload.order.access_token,
  );
}
