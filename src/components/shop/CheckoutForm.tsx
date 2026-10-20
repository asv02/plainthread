"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useShop } from "@/components/shop/ShopProvider";
import { getProduct } from "@/data/products";
import { formatPrice } from "@/lib/utils";
import { siteConfig } from "@/data/site";
import { MoneyRows } from "@/components/shop/MoneyRows";
import { CouponField } from "@/components/shop/CouponField";
import { usePricingQuote } from "@/components/shop/usePricingQuote";
import { InitiateCheckoutPixel } from "@/components/analytics/InitiateCheckoutPixel";
import { trackClarityEvent } from "@/lib/clarity";
import { trackCouponApplied } from "@/lib/meta-pixel-client";
import { readAdConsentFromCookieString } from "@/lib/meta/consent";
import { readBrowserMetaCookies } from "@/lib/meta/fbp-fbc";
import type { PublicOrder } from "@/lib/shop/types";

type CheckoutResponse = {
  error?: string;
  provider?: "razorpay" | "simulate";
  alreadyPaid?: boolean;
  order?: PublicOrder;
  keyId?: string | null;
  razorpayOrderId?: string | null;
  order_id?: string | null;
  amountPaise?: number;
  amount?: number;
  currency?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

function newCheckoutKey() {
  return crypto.randomUUID();
}

function marketingConsentGranted() {
  if (typeof document === "undefined") return false;
  return readAdConsentFromCookieString(document.cookie) === "granted";
}

async function loadCheckoutIdentity() {
  const res = await fetch("/api/checkout/identity", { cache: "no-store" });
  const data = (await res.json()) as {
    email?: string | null;
    accountEmails?: string[] | null;
    phoneVerified?: boolean;
  };
  const accountEmails = Array.isArray(data.accountEmails)
    ? data.accountEmails.map((value) => value.trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    verifyEmail: typeof data.email === "string" ? data.email : null,
    accountEmails,
    phoneVerified: Boolean(data.phoneVerified),
  };
}

async function pollOrder(publicId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await fetch(`/api/orders/${publicId}`, { cache: "no-store" });
    const data = (await res.json()) as CheckoutResponse;
    if (data.order && (data.order.paymentMethod || data.order.paymentStatus === "paid")) {
      return data.order;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return null;
}

export function CheckoutForm() {
  const router = useRouter();
  const {
    items,
    clearCart,
    refreshStock,
    hydrated,
    couponCode,
    clearCoupon,
    checkoutIntent,
    setCheckoutIntent,
  } = useShop();
  const [notice, setNotice] = useState("");
  const busy = useRef(false);
  const keyRef = useRef<string>(newCheckoutKey());
  const [identity, setIdentity] = useState<{
    verifyEmail: string | null;
    accountEmails: string[];
    phoneVerified: boolean;
  }>({ verifyEmail: null, accountEmails: [], phoneVerified: false });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [phoneOtpEnabled, setPhoneOtpEnabled] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [otpBusy, setOtpBusy] = useState<"email" | "phone" | null>(null);

  const checkoutLines = useMemo(() => {
    if (!hydrated) return [];
    if (checkoutIntent.type === "buyNow") {
      return [{ productSlug: checkoutIntent.productSlug, size: checkoutIntent.size, qty: 1 }];
    }
    return items;
  }, [hydrated, checkoutIntent, items]);
  const intentPayload = useMemo(
    () =>
      checkoutIntent.type === "buyNow"
        ? { type: "BUY_NOW" as const, product_slug: checkoutIntent.productSlug, size: checkoutIntent.size }
        : { type: "CART_CHECKOUT" as const },
    [checkoutIntent],
  );
  const checkoutLinesKey = JSON.stringify(checkoutLines);

  useEffect(() => {
    keyRef.current = newCheckoutKey();
  }, [checkoutLinesKey, couponCode, checkoutIntent]);

  useEffect(() => {
    if (window.Razorpay) setCheckoutReady(true);
  }, []);

  useEffect(() => {
    void fetch("/api/checkout/otp", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { phone?: boolean }) => setPhoneOtpEnabled(Boolean(data.phone)))
      .catch(() => setPhoneOtpEnabled(false));
  }, []);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    pincode: "",
  });

  const normalizedFormEmail = form.email.trim().toLowerCase();
  const accountEmail = identity.accountEmails[0] ?? null;
  const emailSwitchWarning = Boolean(
    accountEmail && normalizedFormEmail && normalizedFormEmail !== accountEmail,
  );
  const emailVerified = Boolean(
    normalizedFormEmail &&
      ((identity.verifyEmail && identity.verifyEmail === normalizedFormEmail) ||
        identity.accountEmails.includes(normalizedFormEmail)),
  );
  const phoneVerified = identity.phoneVerified;

  useEffect(() => {
    void loadCheckoutIdentity()
      .then((next) => {
        setIdentity(next);
        const trustedEmail = next.verifyEmail ?? next.accountEmails[0] ?? null;
        if (trustedEmail) {
          setForm((current) => (current.email ? current : { ...current, email: trustedEmail }));
        }
      })
      .catch(() => undefined);
  }, []);

  const { quote, error: quoteError, loading: quoteLoading, setError: setQuoteError } = usePricingQuote({
    lines: checkoutLines,
    couponCode,
    destinationState: form.state,
    checkoutIntent: intentPayload,
  });

  useEffect(() => {
    if (couponCode && quote?.coupon && !quote.coupon.applied) {
      setQuoteError(quote.coupon.message || "Coupon could not be applied");
      clearCoupon();
    }
  }, [couponCode, quote, clearCoupon, setQuoteError]);

  const couponTrackedKey = useRef("");
  useEffect(() => {
    if (!quote?.coupon?.applied) return;
    const key = `${quote.coupon.code}|${checkoutLinesKey}|${quote.discountPaise}`;
    if (couponTrackedKey.current === key) return;
    couponTrackedKey.current = key;
    trackClarityEvent("coupon_applied");
    trackCouponApplied({
      couponCode: quote.coupon.code,
      discountRupees: quote.discountPaise / 100,
      valueRupees: quote.totalPaise / 100,
    });
  }, [quote, checkoutLinesKey]);

  const priced = useMemo(() => {
    return checkoutLines.map((item) => {
      const product = getProduct(item.productSlug);
      const quoted = quote?.items.find(
        (line) => line.product_slug === item.productSlug && line.size === item.size,
      );
      return {
        ...item,
        name: quoted?.name ?? product?.name ?? item.productSlug,
        linePaise: quoted ? quoted.unit_price_paise * quoted.qty : null,
        image: product?.images[0]?.src,
      };
    });
  }, [checkoutLines, quote]);
  const totals = quote;

  function goToOrder(order: PublicOrder) {
    if (checkoutIntent.type === "buyNow") {
      // Buy now never touched the cart, so the cart stays; only the one-off flow resets.
      setCheckoutIntent({ type: "cart" });
    } else {
      clearCart();
    }
    router.push(`/orders/${order.publicId}`);
  }

  async function sendCode(channel: "email" | "phone") {
    setError("");
    setOtpBusy(channel);
    try {
      const res = await fetch("/api/checkout/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          destination: channel === "email" ? form.email : form.phone,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not send code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setOtpBusy(null);
    }
  }

  async function confirmCode(channel: "email" | "phone") {
    setError("");
    setOtpBusy(channel);
    try {
      const res = await fetch("/api/checkout/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          destination: channel === "email" ? form.email : form.phone,
          code: channel === "email" ? emailCode : phoneCode,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        emailVerified?: boolean;
        phoneVerified?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Could not verify code");
      setIdentity(await loadCheckoutIdentity());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setOtpBusy(null);
    }
  }

  const canPay = emailVerified && (!phoneOtpEnabled || phoneVerified);

  async function onPay() {
    if (busy.current || !quote || quoteLoading || !canPay) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const cookies = readBrowserMetaCookies();
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: keyRef.current,
          items: checkoutLines,
          checkoutIntent: intentPayload,
          couponCode: quote.coupon?.applied ? quote.coupon.code : undefined,
          expectedTotalPaise: quote.totalPaise,
          customer: form,
          marketingConsent: marketingConsentGranted(),
          fbp: cookies.fbp,
          fbc: cookies.fbc,
        }),
      });
      const data = (await res.json()) as CheckoutResponse;
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (data.alreadyPaid && data.order) {
        goToOrder(data.order);
        return;
      }

      if (data.provider === "simulate" && data.order) {
        const verify = await fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicId: data.order.publicId,
            simulate: true,
          }),
        });
        const verified = (await verify.json()) as CheckoutResponse;
        if (!verify.ok || !verified.order) {
          throw new Error(verified.error || "Could not confirm test payment");
        }
        goToOrder(verified.order);
        return;
      }

      if (!window.Razorpay) {
        throw new Error("Payment widget is still loading. Try again.");
      }

      const publicId = data.order?.publicId ?? "";
      const razorpayOrderId = data.order_id || data.razorpayOrderId;
      if (!razorpayOrderId) {
        throw new Error("Payment order was not created. Try again.");
      }

      const razorpay = new window.Razorpay({
        key: data.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: data.amountPaise ?? data.amount,
        currency: data.currency || "INR",
        name: siteConfig.name,
        description: `Order ${publicId}`,
        order_id: razorpayOrderId,
        one_click_checkout: true,
        show_coupons: false,
        config: {
          display: {
            hide: [{ method: "cod" }],
          },
        },
        prefill: {
          name: form.name,
          email: form.email,
          contact: form.phone,
        },
        theme: { color: "#111111" },
        modal: {
          ondismiss: () => {
            trackClarityEvent("payment_window_closed");
            void (async () => {
              const confirmed = await pollOrder(publicId);
              if (confirmed) {
                goToOrder(confirmed);
                return;
              }
              setError(
                "Payment window closed. If you did not finish paying, this order is held for 2 minutes — click Pay again. If you already paid, keep this page or check email.",
              );
              setLoading(false);
              busy.current = false;
            })();
          },
        },
        handler: async (response: {
          razorpay_order_id?: string;
          razorpay_payment_id?: string;
          razorpay_signature?: string;
        }) => {
          if (response.razorpay_signature && response.razorpay_order_id && response.razorpay_payment_id) {
            const verify = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                publicId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verified = (await verify.json()) as CheckoutResponse & { result?: string };
            if (verified.result === "late_payment") {
              setError(verified.error || "Payment was refunded because the order was cancelled.");
              setLoading(false);
              busy.current = false;
              return;
            }
            if (!verify.ok || !verified.order) {
              setError(verified.error || "Payment received. Confirming… keep this page open.");
              setLoading(false);
              busy.current = false;
              return;
            }
            goToOrder(verified.order);
            return;
          }

          setError("Payment is still confirming. Keep this page open or check your email.");
          setLoading(false);
          busy.current = false;
        },
      });
      razorpay.on("payment.failed", (response) => {
        trackClarityEvent("payment_failed");
        setError(
          response.error?.description ||
            "Payment failed. You can retry in the checkout window, or wait 2 minutes for the hold to end.",
        );
      });
      razorpay.open();
      trackClarityEvent("payment_initiated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      await refreshStock();
      setLoading(false);
      busy.current = false;
    }
  }

  if (!hydrated) {
    return <p className="text-secondary">Loading checkout…</p>;
  }

  if (checkoutLines.length === 0) {
    return <p className="text-secondary">Your cart is empty.</p>;
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <InitiateCheckoutPixel
        items={checkoutLines}
        totalPaise={totals?.totalPaise ?? null}
        hydrated={hydrated}
        checkoutType={checkoutIntent.type}
      />
      <Script
        src="https://checkout.razorpay.com/v1/magic-checkout.js"
        strategy="afterInteractive"
        onLoad={() => setCheckoutReady(true)}
      />
      <form
        data-clarity-ignore
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onPay();
        }}
      >
        {(
          [
            ["name", "Full name"],
            ["address_line1", "Address"],
            ["address_line2", "Apartment, landmark (optional)"],
            ["city", "City"],
            ["state", "State"],
            ["pincode", "PIN code"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-secondary">{label}</span>
            <input
              required={key !== "address_line2"}
              value={form[key]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [key]: event.target.value }))
              }
              className="mt-1 w-full border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground"
            />
          </label>
        ))}
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="text-secondary">Email</span>
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => {
                setEmailCode("");
                setForm((current) => ({ ...current, email: event.target.value }));
              }}
              className="mt-1 w-full border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground"
            />
          </label>
          {emailVerified ? (
            <p className="text-xs text-secondary">Email verified.</p>
          ) : (
            <div className="space-y-2">
              {emailSwitchWarning && (
                <p className="text-xs text-secondary">
                  Different from your signed-in email ({accountEmail}). Verifying this code signs you out of that
                  account and uses {normalizedFormEmail} everywhere.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={otpBusy !== null}
                onClick={() => void sendCode("email")}
                className="border border-foreground px-3 py-2 text-xs disabled:opacity-50"
              >
                {otpBusy === "email" ? "Sending…" : "Send email code"}
              </button>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value)}
                className="w-32 border border-border bg-card px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={otpBusy !== null || emailCode.length < 6}
                onClick={() => void confirmCode("email")}
                className="border border-foreground px-3 py-2 text-xs disabled:opacity-50"
              >
                Verify email
              </button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="text-secondary">Mobile number</span>
            <input
              required
              inputMode="tel"
              value={form.phone}
              onChange={(event) => {
                setPhoneCode("");
                setForm((current) => ({ ...current, phone: event.target.value }));
              }}
              className="mt-1 w-full border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground"
            />
          </label>
          {phoneOtpEnabled ? (
            phoneVerified ? (
              <p className="text-xs text-secondary">Mobile number verified.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={otpBusy !== null}
                  onClick={() => void sendCode("phone")}
                  className="border border-foreground px-3 py-2 text-xs disabled:opacity-50"
                >
                  {otpBusy === "phone" ? "Sending…" : "Send SMS code"}
                </button>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={phoneCode}
                  onChange={(event) => setPhoneCode(event.target.value)}
                  className="w-32 border border-border bg-card px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={otpBusy !== null || phoneCode.length < 6}
                  onClick={() => void confirmCode("phone")}
                  className="border border-foreground px-3 py-2 text-xs disabled:opacity-50"
                >
                  Verify mobile
                </button>
              </div>
            )
          ) : (
            <p className="text-xs text-secondary">
              Used for delivery updates.
            </p>
          )}
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={loading || !checkoutReady || !quote || quoteLoading || !canPay}
          className="inline-flex w-full items-center justify-center bg-button px-6 py-3.5 text-sm tracking-wide text-white disabled:opacity-50"
        >
          {loading
            ? "Processing…"
            : !checkoutReady
              ? "Loading payment…"
            : !canPay
              ? phoneOtpEnabled
                ? "Verify email and mobile to continue"
                : "Verify email to continue"
            : `Pay ${formatPrice((totals?.totalPaise ?? 0) / 100)}`}
        </button>
        <p className="text-xs leading-5 text-secondary">
          Stock is held for 2 minutes after you start checkout.Returns are accepted within
          7 days of the delivered date.{" "}
          <a href="/shipping-returns" className="underline underline-offset-2">
            Shipping &amp; returns
          </a>
        </p>
      </form>

      <aside className="h-fit border border-border p-5">
        <h2 className="font-serif text-2xl">Order</h2>
        {checkoutIntent.type === "buyNow" && (
          <p className="mt-2 text-xs text-secondary">
            Buying one {checkoutIntent.size} as a one-time order. Your cart is kept for later.
          </p>
        )}
        <ul className="mt-4 space-y-3 text-sm">
          {priced.map((item) => (
            <li key={`${item.productSlug}-${item.size}`} className="flex justify-between gap-4">
              <span>
                {item.name} · {item.size} × {item.qty}
              </span>
              <span>{item.linePaise != null ? formatPrice(item.linePaise / 100) : "…"}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <CouponField
            lines={checkoutLines}
            destinationState={form.state}
            checkoutIntent={intentPayload}
            quote={quote}
            onNotice={(value) => {
              setNotice(value);
              setQuoteError("");
            }}
          />
          {(notice || quoteError) && <p className="text-sm text-red-700">{notice || quoteError}</p>}
          {quoteLoading && <p className="text-sm text-secondary">Updating total…</p>}
          {totals && (
            <MoneyRows
              goodsPaise={totals.subtotalPaise}
              discountPaise={totals.coupon?.applied ? totals.discountPaise : 0}
              couponCode={totals.coupon?.applied ? totals.coupon.code : null}
              shippingPaise={totals.shippingPaise}
              tax={totals.tax}
              totalPaise={totals.totalPaise}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
