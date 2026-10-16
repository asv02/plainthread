import { NextResponse } from "next/server";
import { refundRazorpayPayment } from "@/lib/payments/razorpay";
import { razorpayConfigured } from "@/lib/shop/config";
import {
  cancelCustomerOrder,
  finalizeRefundCancel,
  getOrderByPublicId,
} from "@/lib/shop/orders";
import { getCustomerFromCookie } from "@/lib/shop/customers";
import { toPublicOrder } from "@/lib/shop/serialize";
import { jsonWithOrderAccess, orderSessionAuthorized } from "@/lib/shop/order-access";
import { errMessage, startFlow } from "@/lib/log";
import { siteConfig } from "@/data/site";

export async function POST(
  request: Request,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params;
  const flow = startFlow("cancel-order", { path: "/api/orders/[publicId]/cancel", publicId });
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const [payload, user] = await Promise.all([
      getOrderByPublicId(publicId),
      getCustomerFromCookie(),
    ]);
    const auth = await orderSessionAuthorized(payload, user);
    if (!payload || !auth.ok) {
      flow.fail("not found or not signed in", { publicId, signedIn: auth.signedIn });
      if (!auth.signedIn) {
        return NextResponse.json({ error: "Sign in to cancel this order." }, { status: 401 });
      }
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    flow.step("order loaded", {
      publicId,
      status: payload.order.status,
      paymentStatus: payload.order.payment_status,
      paymentMethod: payload.order.payment_method,
      totalPaise: payload.order.total_paise,
    });

    const result = await cancelCustomerOrder(
      payload.order.id,
      body.reason || "customer_cancelled",
    );
    flow.step("cancel rpc result", {
      publicId,
      result: result.result,
      reason: body.reason || "customer_cancelled",
    });

    if (result.result === "already_cancelled") {
      flow.fail("already cancelled", { publicId });
      return NextResponse.json(
        {
          error: "This order is already cancelled.",
          result: result.result,
          order: result.payload ? toPublicOrder(result.payload) : undefined,
        },
        { status: 409 },
      );
    }

    if (result.result === "not_cancellable") {
      flow.fail("not pending; cancel rejected", {
        publicId,
        parcel: payload.order.parcel_status,
      });
      return NextResponse.json(
        {
          error: `This order can no longer be cancelled here. Email ${siteConfig.email} with the order ID, then follow Shipping & Returns.`,
          result: result.result,
          redirect: "/shipping-returns",
          order: result.payload ? toPublicOrder(result.payload) : undefined,
        },
        { status: 409 },
      );
    }

    if (result.result === "needs_refund") {
      const paymentId = result.razorpay_payment_id;
      if (paymentId && razorpayConfigured() && !paymentId.startsWith("sim_")) {
        try {
          flow.step("normal-speed Razorpay refund", {
            publicId,
            paymentId,
            amountPaise: payload.order.total_paise,
          });
          await refundRazorpayPayment(paymentId, payload.order.total_paise, "normal");
        } catch (error) {
          flow.step("Razorpay refund not completed; leave pending for dashboard or retry", {
            publicId,
            error: errMessage(error),
          });
          return jsonWithOrderAccess(
            {
              result: "needs_refund",
              order: result.payload ? toPublicOrder(result.payload) : undefined,
              error:
                "Order is cancelled. Refund is pending — it will retry at normal speed, or refund this payment from the Razorpay dashboard.",
            },
            payload.order.public_id,
            payload.order.access_token,
          );
        }
      }
      const refunded = await finalizeRefundCancel(payload.order.id);
      flow.done("cancel finalized with refund", { publicId, result: refunded.result });
      return jsonWithOrderAccess(
        {
          result: refunded.result,
          order: refunded.payload ? toPublicOrder(refunded.payload) : undefined,
        },
        payload.order.public_id,
        payload.order.access_token,
      );
    }

    flow.done("cancel complete", { publicId, result: result.result });
    return jsonWithOrderAccess(
      {
        result: result.result,
        order: result.payload ? toPublicOrder(result.payload) : undefined,
      },
      payload.order.public_id,
      payload.order.access_token,
    );
  } catch (error) {
    flow.fail("failed", { error: errMessage(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cancel failed" },
      { status: 400 },
    );
  }
}
