import { NextResponse } from "next/server";
import {
  attachRazorpayOrder,
  cancelCustomerOrder,
  checkoutCreate,
  saveOrderAttribution,
} from "@/lib/shop/orders";
import { jsonWithOrderAccess } from "@/lib/shop/order-access";
import { validateFbc, validateFbp } from "@/lib/meta/fbp-fbc";
import { isMarketingConsentGrantedFromHeader } from "@/lib/meta/consent";
import { requestUserAgent, trustedClientIp } from "@/lib/meta/ip";
import { priceCart, validateCustomer } from "@/lib/shop/pricing";
import {
  razorpayConfigError,
  razorpayConfigured,
  razorpayKeyMode,
  razorpayModeSetting,
  razorpayPublicKeyId,
  simulatedPaymentsAllowed,
  storefrontUrl,
  stockHoldMinutes,
} from "@/lib/shop/config";
import { createRazorpayOrder, RazorpayRequestError } from "@/lib/payments/razorpay";
import { isConfirmedOrder, toPublicOrder } from "@/lib/shop/serialize";
import type { CartLine, OrderPayload } from "@/lib/shop/types";
import { errMessage, startFlow } from "@/lib/log";
import { assertCheckoutVerified } from "@/lib/shop/otp";
import { upsertCustomer } from "@/lib/shop/customers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getProduct } from "@/data/products";

export async function POST(request: Request) {
  const flow = startFlow("checkout", { path: "/api/checkout" });
  try {
    const body = (await request.json()) as {
      idempotencyKey?: string;
      items?: CartLine[];
      customer?: Parameters<typeof validateCustomer>[0];
      verifyToken?: string;
      marketingConsent?: boolean;
      fbp?: string;
      fbc?: string;
    };

    const idempotencyKey = body.idempotencyKey?.trim() ?? "";
    if (idempotencyKey.length < 8) {
      flow.fail("rejected: missing idempotency key");
      return NextResponse.json({ error: "Missing checkout key" }, { status: 400 });
    }
    flow.step("idempotency key accepted", {
      idempotencyKeyPrefix: idempotencyKey.slice(0, 8),
      cartLines: body.items?.length ?? 0,
    });

    const customer = validateCustomer(body.customer ?? {});
    flow.step("customer validated", {
      state: customer.state,
      pincode: customer.pincode,
    });

    await assertCheckoutVerified({
      token: body.verifyToken,
      email: customer.email,
      phone: customer.phone,
    });
    flow.step("email/otp session verified");

    const paymentsError = razorpayConfigError();
    if (paymentsError && !simulatedPaymentsAllowed()) {
      flow.fail("payments misconfigured", {
        error: paymentsError,
        razorpayMode: razorpayModeSetting(),
        keyMode: razorpayKeyMode(),
      });
      return NextResponse.json({ error: paymentsError }, { status: 503 });
    }
    flow.step("payment provider checked", {
      razorpayMode: razorpayModeSetting(),
      keyMode: razorpayKeyMode(),
      configured: razorpayConfigured(),
      simulate: simulatedPaymentsAllowed(),
    });

    const priced = priceCart(body.items ?? [], { destinationState: customer.state });
    flow.step("cart priced", {
      lines: priced.items.map((item) => `${item.product_slug}:${item.size}x${item.qty}`),
      subtotalPaise: priced.subtotalPaise,
      taxPaise: priced.tax.taxPaise,
      taxKind: priced.tax.taxKind,
      shippingPaise: priced.shippingPaise,
      totalPaise: priced.totalPaise,
      holdMinutes: stockHoldMinutes(),
    });

    const payload = await checkoutCreate({
      idempotencyKey,
      customer,
      items: priced.items,
      subtotalPaise: priced.subtotalPaise,
      taxPaise: priced.tax.taxPaise,
      shippingPaise: priced.shippingPaise,
      totalPaise: priced.totalPaise,
      holdMinutes: stockHoldMinutes(),
      taxRateBps: priced.tax.taxRateBps,
      taxKind: priced.tax.taxKind,
      cgstPaise: priced.tax.cgstPaise,
      sgstPaise: priced.tax.sgstPaise,
      igstPaise: priced.tax.igstPaise,
    });
    flow.step("stock held and order row created", {
      publicId: payload.order.public_id,
      status: payload.order.status,
      paymentStatus: payload.order.payment_status,
      totalPaise: payload.order.total_paise,
      reused: payload.order.razorpay_order_id ? true : false,
    });

    try {
      const marketingConsent = isMarketingConsentGrantedFromHeader(
        request.headers.get("cookie"),
      );
      await saveOrderAttribution(payload.order.id, {
        marketingConsent,
        fbp: marketingConsent ? validateFbp(typeof body.fbp === "string" ? body.fbp : null) : null,
        fbc: marketingConsent ? validateFbc(typeof body.fbc === "string" ? body.fbc : null) : null,
        ip: marketingConsent ? trustedClientIp(request) : null,
        userAgent: marketingConsent ? requestUserAgent(request) : null,
      });
    } catch (error) {
      flow.debug("attribution save skipped", { error: errMessage(error) });
    }

    try {
      const userId = await upsertCustomer({
        email: payload.order.email,
        phone: payload.order.phone,
        name: payload.order.customer_name,
      });
      if (!payload.order.user_id) {
        await supabaseAdmin().from("orders").update({ user_id: userId }).eq("id", payload.order.id);
        payload.order.user_id = userId;
      }
      flow.step("order linked to user", { publicId: payload.order.public_id, userId });
    } catch (error) {
      flow.debug("user link skipped", { error: errMessage(error) });
    }

    if (isConfirmedOrder(payload.order)) {
      flow.done("already confirmed; skip new payment", {
        publicId: payload.order.public_id,
        paymentMethod: payload.order.payment_method,
        paymentStatus: payload.order.payment_status,
      });
      return jsonWithOrderAccess(
        {
          alreadyPaid: payload.order.payment_status === "paid" || payload.order.payment_method === "cod",
          order: toPublicOrder(payload),
        },
        payload.order.public_id,
        payload.order.access_token,
      );
    }

    if (!razorpayConfigured()) {
      if (!simulatedPaymentsAllowed()) {
        flow.step("payments missing; restocking");
        await cancelCustomerOrder(payload.order.id, "payments_not_configured");
        flow.fail("payments not configured after hold");
        return NextResponse.json(
          { error: paymentsError || "Payments are not configured yet. Add Razorpay keys to go live." },
          { status: 503 },
        );
      }

      flow.done("simulate provider ready", { publicId: payload.order.public_id });
      return jsonWithOrderAccess(
        {
          provider: "simulate",
          order: toPublicOrder(payload),
          keyId: null,
          razorpayOrderId: null,
          amountPaise: payload.order.total_paise,
        },
        payload.order.public_id,
        payload.order.access_token,
      );
    }

    let razorpayOrderId = payload.order.razorpay_order_id;
    if (!razorpayOrderId) {
      try {
        const lineItems = magicLineItems(payload);
        flow.step("creating Razorpay Magic Checkout order", {
          publicId: payload.order.public_id,
          amountPaise: payload.order.total_paise,
          lineItems: lineItems.length,
        });
        const razorpayOrder = await createRazorpayOrder({
          amountPaise: payload.order.total_paise,
          receipt: payload.order.public_id,
          notes: {
            public_id: payload.order.public_id,
            email: payload.order.email,
          },
          lineItems,
        });
        razorpayOrderId = razorpayOrder.order_id;
        flow.step("Razorpay order created", {
          publicId: payload.order.public_id,
          razorpayOrderId,
          amount: razorpayOrder.amount,
        });
        await attachRazorpayOrder(payload.order.id, razorpayOrderId);
        flow.step("Razorpay order id saved on local order", {
          publicId: payload.order.public_id,
          razorpayOrderId,
        });
      } catch (error) {
        flow.step("Razorpay create failed; restocking", {
          publicId: payload.order.public_id,
          error: errMessage(error),
        });
        await cancelCustomerOrder(payload.order.id, "razorpay_create_failed");
        throw error;
      }
    } else {
      flow.step("reusing existing Razorpay order", {
        publicId: payload.order.public_id,
        razorpayOrderId,
      });
    }

    flow.done("checkout ready for Magic Checkout", {
      publicId: payload.order.public_id,
      razorpayOrderId,
      amountPaise: payload.order.total_paise,
    });
    return jsonWithOrderAccess(
      {
        provider: "razorpay",
        order: toPublicOrder(payload),
        keyId: razorpayPublicKeyId(),
        razorpayOrderId,
        order_id: razorpayOrderId,
        amount: payload.order.total_paise,
        amountPaise: payload.order.total_paise,
        currency: "INR",
      },
      payload.order.public_id,
      payload.order.access_token,
    );
  } catch (error) {
    if (error instanceof RazorpayRequestError) {
      flow.fail("razorpay error", { error: error.message, status: error.status });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Checkout failed";
    const status = message.includes("sold out") ? 409 : 400;
    flow.fail("failed", { error: message, status });
    return NextResponse.json({ error: message }, { status });
  }
}

function magicLineItems(payload: OrderPayload) {
  const origin = storefrontUrl();
  const lines = payload.items.map((item) => {
    const product = getProduct(item.product_slug);
    const image = product?.images[0]?.src;
    return {
      sku: item.sku,
      variant_id: `${item.product_slug}:${item.size}`,
      name: item.name,
      description: item.name,
      quantity: item.qty,
      price: item.unit_price_paise,
      offer_price: item.unit_price_paise,
      image_url: image ? `${origin}${image.startsWith("/") ? image : `/${image}`}` : undefined,
    };
  });
  const goods = payload.items.reduce((sum, item) => sum + item.unit_price_paise * item.qty, 0);
  const extra = payload.order.total_paise - goods;
  if (extra > 0) {
    lines.push({
      sku: "PT-TAX-SHIP",
      variant_id: "tax-shipping",
      name: "GST and shipping",
      description: "GST and shipping",
      quantity: 1,
      price: extra,
      offer_price: extra,
      image_url: undefined,
    });
  }
  return lines;
}
