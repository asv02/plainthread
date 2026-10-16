import { getOrderByPublicId } from "@/lib/shop/orders";
import { getCustomerFromCookie } from "@/lib/shop/customers";
import { toPublicOrder } from "@/lib/shop/serialize";
import { jsonWithOrderAccess, orderSessionAuthorized } from "@/lib/shop/order-access";
import { NextResponse } from "next/server";
import { log } from "@/lib/log";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  log.info("get-order", "start", { publicId });
  const [payload, user] = await Promise.all([
    getOrderByPublicId(publicId),
    getCustomerFromCookie(),
  ]);
  const auth = await orderSessionAuthorized(payload, user);
  if (!payload || !auth.ok) {
    log.info("get-order", "denied", { publicId, signedIn: auth.signedIn });
    if (!auth.signedIn) {
      return NextResponse.json({ error: "Sign in to view this order." }, { status: 401 });
    }
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  log.info("get-order", "loaded", {
    publicId,
    status: payload.order.status,
    paymentStatus: payload.order.payment_status,
    paymentMethod: payload.order.payment_method,
    via: "session",
  });
  return jsonWithOrderAccess(
    { order: toPublicOrder(payload) },
    payload.order.public_id,
    payload.order.access_token,
  );
}
