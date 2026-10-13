import { refundRazorpayPayment } from "@/lib/payments/razorpay";
import { sendPaidOrderEmails } from "@/lib/email/send";
import {
  finalizeRefundCancel,
  getOrderPayloadById,
  listOrdersNeedingPaidEmail,
  listOrdersNeedingRefund,
  markOrderPaid,
} from "@/lib/shop/orders";
import { razorpayConfigured } from "@/lib/shop/config";
import { isConfirmedOrder } from "@/lib/shop/serialize";
import type { OrderPayload } from "@/lib/shop/types";
import { errMessage, log, startFlow } from "@/lib/log";
import { enqueuePurchaseOutbox, processMetaOutbox } from "@/lib/meta/outbox";

function storedPaymentId(result: {
  razorpay_payment_id?: string | null;
  payload?: OrderPayload;
}) {
  return result.razorpay_payment_id || result.payload?.order.razorpay_payment_id || null;
}

function alreadyRefunded(error: unknown) {
  const message = errMessage(error).toLowerCase();
  return (
    message.includes("fully refunded") ||
    message.includes("already refunded") ||
    message.includes("refund has already been")
  );
}

function insufficientRefundBalance(error: unknown) {
  const message = errMessage(error).toLowerCase();
  return message.includes("enough balance") || message.includes("refund credit");
}

function refundSpeedForOrder(order: {
  failure_reason: string | null;
  cancel_reason: string | null;
}) {
  if (order.failure_reason === "late_payment" || order.cancel_reason === "hold_expired") {
    return "optimum" as const;
  }
  return "normal" as const;
}

async function refundCapturedPayment(
  paymentId: string,
  amountPaise: number | undefined,
  reason: string,
  speed: "normal" | "optimum" = "normal",
) {
  if (!razorpayConfigured() || !paymentId || paymentId.startsWith("sim_") || !amountPaise) {
    log.info("complete-payment", "refund skipped", {
      reason,
      paymentId,
      amountPaise,
      speed,
      configured: razorpayConfigured(),
      simulated: Boolean(paymentId?.startsWith("sim_")),
    });
    return;
  }
  log.info("complete-payment", "refund starting", { reason, paymentId, amountPaise, speed });
  try {
    const refundId = await refundRazorpayPayment(paymentId, amountPaise, speed);
    log.info("complete-payment", "refund finished", { reason, paymentId, refundId, amountPaise, speed });
  } catch (error) {
    if (alreadyRefunded(error)) {
      log.info("complete-payment", "refund already processed at Razorpay", { reason, paymentId });
      return;
    }
    if (speed === "optimum" && insufficientRefundBalance(error)) {
      log.info("complete-payment", "instant refund needs credits; falling back to normal", {
        reason,
        paymentId,
        amountPaise,
      });
      const refundId = await refundRazorpayPayment(paymentId, amountPaise, "normal");
      log.info("complete-payment", "refund finished", {
        reason,
        paymentId,
        refundId,
        amountPaise,
        speed: "normal",
      });
      return;
    }
    throw error;
  }
}

async function refundAndMarkComplete(
  orderId: string,
  paymentId: string | null | undefined,
  amountPaise: number | undefined,
  reason: string,
  speed: "normal" | "optimum" = "normal",
) {
  if (!paymentId) return;
  await refundCapturedPayment(paymentId, amountPaise, reason, speed);
  await finalizeRefundCancel(orderId);
}

export async function deliverPaidOrderEmails(orderId: string) {
  log.info("complete-payment", "emails start", { orderId });
  const payload = await getOrderPayloadById(orderId);
  if (!payload || !isConfirmedOrder(payload.order)) {
    log.info("complete-payment", "emails skipped; order not confirmed", { orderId });
    return;
  }
  const result = await sendPaidOrderEmails(payload);
  log.info("complete-payment", "emails done", {
    publicId: payload.order.public_id,
    customer: result.customer,
    ops: result.ops,
  });
}

export async function retryUnsentPaidEmails() {
  let orders;
  try {
    orders = await listOrdersNeedingPaidEmail(20);
  } catch (error) {
    log.error("complete-payment", "paid email retry skipped", { error: errMessage(error) });
    return 0;
  }
  log.info("complete-payment", "paid email retry", { count: orders.length });
  for (const order of orders) {
    try {
      await deliverPaidOrderEmails(order.id);
    } catch (error) {
      log.error("complete-payment", "paid email retry failed", {
        publicId: order.public_id,
        error: errMessage(error),
      });
    }
  }
  return orders.length;
}

export async function retryPendingRefunds() {
  let orders;
  try {
    orders = await listOrdersNeedingRefund(20);
  } catch (error) {
    log.error("complete-payment", "refund retry skipped", { error: errMessage(error) });
    return 0;
  }
  log.info("complete-payment", "refund retry", { count: orders.length });
  let refunded = 0;
  for (const order of orders) {
    try {
      await refundAndMarkComplete(
        order.id,
        order.razorpay_payment_id,
        order.total_paise,
        "retry_pending",
        refundSpeedForOrder(order),
      );
      refunded += 1;
    } catch (error) {
      log.error("complete-payment", "refund retry failed", {
        publicId: order.public_id,
        paymentId: order.razorpay_payment_id,
        error: errMessage(error),
      });
    }
  }
  return refunded;
}

export async function completeCodOrder(orderId: string, paymentId: string | null) {
  const flow = startFlow("complete-payment", { kind: "cod", orderId, paymentId });
  flow.fail("COD is disabled");
  return { result: "cod_disabled" as const, payload: undefined };
}

export async function completeCapturedPayment(orderId: string, paymentId: string) {
  const flow = startFlow("complete-payment", { kind: "captured", orderId, paymentId });
  flow.step("mark_order_paid rpc");
  const result = await markOrderPaid(orderId, paymentId);
  const payload = result.payload;
  const amountPaise = payload?.order.total_paise;
  const existingPaymentId = storedPaymentId(result);
  flow.step("rpc result", {
    result: result.result,
    publicId: payload?.order.public_id,
    paymentStatus: payload?.order.payment_status,
    storedPaymentId: existingPaymentId,
    amountPaise,
  });

  if (result.result === "paid" || result.result === "already_paid") {
    await Promise.all([
      (async () => {
        try {
          flow.step("send paid emails");
          await deliverPaidOrderEmails(orderId);
        } catch (error) {
          log.error("complete-payment", "payment emails failed", {
            error: errMessage(error),
            orderId,
          });
        }
      })(),
      (async () => {
        try {
          await enqueuePurchaseOutbox(orderId);
          await processMetaOutbox(5);
        } catch (error) {
          log.error("complete-payment", "meta purchase outbox failed", {
            error: errMessage(error),
            orderId,
          });
        }
      })(),
    ]);
  }

  if (
    result.result === "already_paid" &&
    paymentId &&
    existingPaymentId &&
    paymentId !== existingPaymentId
  ) {
    try {
      flow.step("duplicate capture; refund new payment", {
        newPaymentId: paymentId,
        existingPaymentId,
      });
      await refundCapturedPayment(paymentId, amountPaise, "duplicate_capture", "optimum");
    } catch (error) {
      flow.fail("duplicate capture refund failed", {
        error: errMessage(error),
        paymentId,
      });
    }
  }

  if (result.result === "late_payment") {
    if (payload?.order.payment_status === "refunded") {
      flow.step("late payment already refunded", { paymentId });
    } else {
      try {
        flow.step("late payment after cancel; refunding", { paymentId, amountPaise });
        await refundAndMarkComplete(orderId, paymentId, amountPaise, "late_payment", "optimum");
      } catch (error) {
        flow.fail("late payment refund failed", {
          error: errMessage(error),
          paymentId,
        });
      }
    }
  }

  flow.done("capture complete", {
    result: result.result,
    publicId: payload?.order.public_id,
  });
  return result;
}
