import { Resend } from "resend";
import { siteConfig } from "@/data/site";
import { siteUrl } from "@/lib/shop/config";
import { markOrderEmailSent } from "@/lib/shop/orders";
import { toPublicOrder } from "@/lib/shop/serialize";
import { errMessage, log } from "@/lib/log";
import { taxLinesFromStored } from "@/lib/shop/tax";
import type { OrderPayload } from "@/lib/shop/types";
import { formatPrice } from "@/lib/utils";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function money(paise: number) {
  return formatPrice(paise / 100);
}

function invoiceHtml(payload: OrderPayload, kind: "customer" | "ops") {
  const order = toPublicOrder(payload);
  const lines = taxLinesFromStored(order);
  const tax = lines.tax;
  const address = [
    order.addressLine1,
    order.addressLine2,
    `${order.city}, ${order.state} ${order.pincode}`,
  ]
    .filter(Boolean)
    .map((part) => escapeHtml(part as string))
    .join("<br/>");

  const items = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #efefef;">
          ${escapeHtml(item.name)} · ${escapeHtml(item.size)} × ${item.qty}
          <div style="color:#666;font-size:12px;">${escapeHtml(item.sku)}</div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #efefef;text-align:right;">
          ${money(item.unitPricePaise * item.qty)}
        </td>
      </tr>`,
    )
    .join("");

  const taxRows =
    tax.taxKind === "cgst_sgst"
      ? `<tr><td>CGST (${tax.taxPercent / 2}%)</td><td style="text-align:right;">${money(tax.cgstPaise)}</td></tr>
         <tr><td>SGST (${tax.taxPercent / 2}%)</td><td style="text-align:right;">${money(tax.sgstPaise)}</td></tr>`
      : `<tr><td>GST / IGST (${tax.taxPercent}%)</td><td style="text-align:right;">${money(tax.taxPaise)}</td></tr>`;

  const orderUrl = `${siteUrl()}/orders/${order.publicId}?token=${payload.order.access_token}`;
  const isCod = payload.order.payment_method === "cod";
  const heading =
    kind === "customer"
      ? isCod
        ? "COD order confirmed"
        : "Payment invoice"
      : isCod
        ? "New COD order"
        : "New paid order";
  const intro =
    kind === "customer"
      ? isCod
        ? `Thanks ${escapeHtml(order.customerName)}. Cash on delivery is confirmed for order <strong>${escapeHtml(order.publicId)}</strong>. Pay the courier when it arrives.`
        : `Thanks ${escapeHtml(order.customerName)}. We received your payment for order <strong>${escapeHtml(order.publicId)}</strong>.`
      : isCod
        ? `Order <strong>${escapeHtml(order.publicId)}</strong> is COD and pending dispatch.`
        : `Order <strong>${escapeHtml(order.publicId)}</strong> is paid and ready to dispatch.`;

  return `
  <div style="font-family:Georgia,serif;color:#111;max-width:560px;margin:0 auto;">
    <p style="letter-spacing:0.18em;font-size:12px;text-transform:uppercase;">${escapeHtml(siteConfig.name)}</p>
    <h1 style="font-size:28px;font-weight:normal;">${heading}</h1>
    <p>${intro}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:24px;">${items}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
      <tr><td>Subtotal</td><td style="text-align:right;">${money(lines.goodsPaise)}</td></tr>
      ${
        lines.discountPaise
          ? `<tr><td>Coupon${order.couponCode ? ` ${escapeHtml(order.couponCode)}` : ""}</td><td style="text-align:right;">-${money(lines.discountPaise)}</td></tr>`
          : ""
      }
      ${taxRows}
      ${
        lines.shippingPaise
          ? `<tr><td>Shipping</td><td style="text-align:right;">${money(lines.shippingPaise)}</td></tr>`
          : ""
      }
      <tr><td style="padding-top:8px;"><strong>${isCod ? "Total due on delivery" : "Total paid"}</strong></td><td style="text-align:right;padding-top:8px;"><strong>${money(lines.totalPaise)}</strong></td></tr>
    </table>
    <p style="margin-top:24px;color:#666;font-size:14px;line-height:1.6;">
      ${address}<br/>
      ${escapeHtml(order.phone)} · ${escapeHtml(order.email)}
    </p>
    ${
      payload.order.razorpay_payment_id
        ? `<p style="font-size:12px;color:#666;">Razorpay payment ${escapeHtml(payload.order.razorpay_payment_id)}</p>`
        : ""
    }
    ${
      kind === "customer"
        ? `<p><a href="${escapeHtml(orderUrl)}">View your order</a></p>`
        : `<p>Open /admin to mark shipped after iThink pickup is created.</p>`
    }
  </div>`;
}

function resendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function fromAddress() {
  return process.env.EMAIL_FROM || `Plain Thread <${siteConfig.email}>`;
}

export async function sendOtpEmail(email: string, code: string) {
  const resend = resendClient();
  if (!resend) throw new Error("Email is not configured yet.");
  log.info("email", "otp send start");
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: email,
    subject: `${code} is your Plain Thread checkout code`,
    html: `
      <div style="font-family:Georgia,serif;color:#111;max-width:480px;margin:0 auto;">
        <p style="letter-spacing:0.18em;font-size:12px;text-transform:uppercase;">${escapeHtml(siteConfig.name)}</p>
        <h1 style="font-size:28px;font-weight:normal;">Checkout code</h1>
        <p>Use this code to confirm your email. It expires in 10 minutes.</p>
        <p style="font-size:32px;letter-spacing:0.2em;">${escapeHtml(code)}</p>
      </div>`,
  });
  if (error) {
    log.error("email", "otp send failed", { error: errMessage(error) });
    throw new Error("Could not send the email code.");
  }
  log.info("email", "otp sent");
}

function opsInbox() {
  return process.env.ORDER_NOTIFY_EMAIL || siteConfig.email;
}

export async function sendPaidOrderEmails(payload: OrderPayload) {
  const resend = resendClient();
  if (!resend) {
    log.info("email", "RESEND_API_KEY missing; skipped", { publicId: payload.order.public_id });
    return { customer: false, ops: false };
  }

  const order = toPublicOrder(payload);
  const isCod = payload.order.payment_method === "cod";
  const from = fromAddress();
  const customerDone = Boolean(payload.order.customer_email_sent_at);
  const opsDone = Boolean(payload.order.ops_email_sent_at);
  const htmlCustomer = invoiceHtml(payload, "customer");
  const htmlOps = invoiceHtml(payload, "ops");

  log.info("email", "paid emails start", {
    publicId: payload.order.public_id,
    isCod,
    customerDone,
    opsDone,
  });
  const jobs: Array<Promise<{ kind: "customer" | "ops"; ok: boolean }>> = [];
  if (!customerDone) {
    jobs.push(
      resend.emails
        .send({
          from,
          to: order.email,
          subject: isCod
            ? `COD order ${order.publicId} · ${siteConfig.name}`
            : `Invoice ${order.publicId} · ${siteConfig.name}`,
          html: htmlCustomer,
        })
        .then((result) => ({ kind: "customer" as const, ok: !result.error }))
        .catch((error) => {
          log.error("email", "customer send failed", { error: errMessage(error) });
          return { kind: "customer" as const, ok: false };
        }),
    );
  }
  if (!opsDone) {
    jobs.push(
      resend.emails
        .send({
          from,
          to: opsInbox(),
          subject: isCod
            ? `COD ${order.publicId} · ${order.customerName}`
            : `Order paid ${order.publicId} · ${order.customerName}`,
          html: htmlOps,
        })
        .then((result) => ({ kind: "ops" as const, ok: !result.error }))
        .catch((error) => {
          log.error("email", "ops send failed", { error: errMessage(error) });
          return { kind: "ops" as const, ok: false };
        }),
    );
  }

  const results = await Promise.all(jobs);
  for (const result of results) {
    if (!result.ok) {
      log.error("email", "send failed", {
        kind: result.kind,
        publicId: payload.order.public_id,
      });
      continue;
    }
    try {
      await markOrderEmailSent(payload.order.id, result.kind);
      log.info("email", "sent", { kind: result.kind, publicId: payload.order.public_id });
    } catch (error) {
      log.error("email", "flag update failed", { error: errMessage(error) });
    }
  }

  return {
    customer: customerDone || results.some((row) => row.kind === "customer" && row.ok),
    ops: opsDone || results.some((row) => row.kind === "ops" && row.ok),
  };
}
