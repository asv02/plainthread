import { NextResponse } from "next/server";
import { verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { completeCapturedPayment } from "@/lib/shop/complete-payment";
import { getOrderByPublicId } from "@/lib/shop/orders";
import { getCustomerFromCookie } from "@/lib/shop/customers";
import { simulatedPaymentsAllowed } from "@/lib/shop/config";
import { toPublicOrder } from "@/lib/shop/serialize";
import {
  jsonWithOrderAccess,
  orderAuthorized,
  readOrderAccessToken,
} from "@/lib/shop/order-access";
import { errMessage, startFlow } from "@/lib/log";

export async function POST(request: Request) {
  const flow = startFlow("verify-payment", { path: "/api/checkout/verify" });
  try {
    const body = (await request.json()) as {
      publicId?: string;
      accessToken?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      simulate?: boolean;
      cod?: boolean;
    };

    flow.step("request received", {
      publicId: body.publicId,
      simulate: Boolean(body.simulate),
      cod: Boolean(body.cod),
      hasSignature: Boolean(body.razorpay_signature),
      hasPaymentId: Boolean(body.razorpay_payment_id),
      hasOrderId: Boolean(body.razorpay_order_id),
    });

    const publicId = body.publicId ?? "";
    const [payload, cookieToken, user] = await Promise.all([
      getOrderByPublicId(publicId),
      readOrderAccessToken(publicId),
      getCustomerFromCookie(),
    ]);
    const auth = orderAuthorized(payload, body.accessToken || cookieToken, user);
    if (!payload || !auth.ok) {
      flow.fail("order not found or access token mismatch", { publicId: body.publicId });
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    flow.step("order loaded", {
      publicId: payload.order.public_id,
      status: payload.order.status,
      paymentStatus: payload.order.payment_status,
      paymentMethod: payload.order.payment_method,
      razorpayOrderId: payload.order.razorpay_order_id,
      totalPaise: payload.order.total_paise,
    });

    if (payload.order.payment_method === "cod" || payload.order.payment_status === "paid") {
      flow.done("already confirmed", {
        publicId: payload.order.public_id,
        paymentMethod: payload.order.payment_method,
        paymentStatus: payload.order.payment_status,
      });
      return jsonWithOrderAccess(
        {
          result: payload.order.payment_method === "cod" ? "cod_confirmed" : "already_paid",
          order: toPublicOrder(payload),
        },
        payload.order.public_id,
        payload.order.access_token,
      );
    }

    if (body.simulate) {
      flow.step("simulate path");
      if (!simulatedPaymentsAllowed()) {
        flow.fail("simulate blocked");
        return NextResponse.json({ error: "Simulated payments are disabled" }, { status: 403 });
      }
      const result = await completeCapturedPayment(
        payload.order.id,
        `sim_${payload.order.public_id}`,
      );
      flow.done("simulate complete", {
        publicId: payload.order.public_id,
        result: result.result,
      });
      if (result.result === "late_payment") {
        return jsonWithOrderAccess(
          {
            result: "late_payment",
            error:
              "This payment arrived after the order was cancelled. It is being refunded automatically.",
            order: result.payload ? toPublicOrder(result.payload) : undefined,
          },
          result.payload?.order.public_id ?? payload.order.public_id,
          result.payload?.order.access_token ?? payload.order.access_token,
          { status: 409 },
        );
      }
      if (!result.payload) {
        flow.fail("simulate missing payload", { publicId: payload.order.public_id });
        return NextResponse.json({ error: "Could not confirm payment" }, { status: 409 });
      }
      return jsonWithOrderAccess(
        {
          result: result.result,
          order: toPublicOrder(result.payload),
        },
        result.payload.order.public_id,
        result.payload.order.access_token,
      );
    }

    const fieldsMissing =
      !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature;
    if (fieldsMissing) {
      if (body.cod) {
        flow.fail("COD is disabled", { publicId: payload.order.public_id });
        return NextResponse.json(
          { error: "Cash on delivery is not available. Please pay with UPI, card, or netbanking." },
          { status: 400 },
        );
      }
      flow.fail("missing Razorpay signature fields", { publicId: payload.order.public_id });
      return NextResponse.json(
        { error: "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature" },
        { status: 400 },
      );
    }

    flow.step("verifying checkout HMAC", {
      publicId: payload.order.public_id,
      razorpayOrderId: body.razorpay_order_id,
      paymentId: body.razorpay_payment_id,
    });
    const ok = verifyCheckoutSignature({
      razorpayOrderId: body.razorpay_order_id ?? "",
      razorpayPaymentId: body.razorpay_payment_id ?? "",
      razorpaySignature: body.razorpay_signature ?? "",
    });
    if (!ok) {
      flow.fail("invalid checkout signature", { publicId: payload.order.public_id });
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }
    flow.step("checkout signature valid");

    if (
      payload.order.razorpay_order_id &&
      payload.order.razorpay_order_id !== body.razorpay_order_id
    ) {
      flow.fail("Razorpay order id mismatch", {
        publicId: payload.order.public_id,
        expected: payload.order.razorpay_order_id,
        received: body.razorpay_order_id,
      });
      return NextResponse.json({ error: "Payment does not match this order" }, { status: 400 });
    }

    flow.step("marking order paid", {
      publicId: payload.order.public_id,
      paymentId: body.razorpay_payment_id,
    });
    const result = await completeCapturedPayment(
      payload.order.id,
      body.razorpay_payment_id ?? "",
    );
    if (result.result === "late_payment") {
      flow.done("late payment; refund path", {
        publicId: payload.order.public_id,
        result: result.result,
      });
      return jsonWithOrderAccess(
        {
          result: "late_payment",
          error:
            "This payment arrived after the order was cancelled. It is being refunded automatically.",
          order: result.payload ? toPublicOrder(result.payload) : undefined,
        },
        result.payload?.order.public_id ?? payload.order.public_id,
        result.payload?.order.access_token ?? payload.order.access_token,
        { status: 409 },
      );
    }

    if (!result.payload) {
      flow.fail("missing payload after capture", {
        publicId: payload.order.public_id,
        result: result.result,
      });
      return NextResponse.json({ error: "Could not confirm payment" }, { status: 409 });
    }

    flow.done("payment confirmed", {
      publicId: payload.order.public_id,
      result: result.result,
      paymentStatus: result.payload.order.payment_status,
    });
    return jsonWithOrderAccess(
      {
        result: result.result,
        order: toPublicOrder(result.payload),
      },
      result.payload.order.public_id,
      result.payload.order.access_token,
    );
  } catch (error) {
    flow.fail("failed", { error: errMessage(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 400 },
    );
  }
}
