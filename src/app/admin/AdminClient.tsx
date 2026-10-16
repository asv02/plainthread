"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminOrder } from "@/lib/shop/types";
import type { CouponConfig, EligibilityType } from "@/lib/shop/coupon";
import { offerCondition } from "@/lib/shop/coupon";
import { formatPrice } from "@/lib/utils";

type Variant = {
  sku: string;
  product_slug: string;
  size: string;
  stock: number;
  price_paise?: number | null;
};

type CouponForm = {
  id?: string;
  code: string;
  discountPercent: string;
  eligibilityType: EligibilityType;
  minCartRupees: string;
  minQuantity: string;
  eligibleProductSlugs: string[];
  isEnabled: boolean;
  allProducts: boolean;
};

const emptyCoupon: CouponForm = {
  code: "",
  discountPercent: "",
  eligibilityType: "MIN_CART_VALUE",
  minCartRupees: "",
  minQuantity: "",
  eligibleProductSlugs: [],
  isEnabled: true,
  allProducts: true,
};

function parcelLabel(order: AdminOrder) {
  return order.parcel_status ?? "pending";
}

function currentOrderStatus(order: AdminOrder) {
  const parcel = parcelLabel(order);
  const holdExpired =
    !order.payment_method &&
    order.status === "open" &&
    order.hold_expires_at &&
    new Date(order.hold_expires_at).getTime() < Date.now();

  if (order.status === "cancelled") {
    if (order.payment_status === "refunded") {
      return { label: "Cancelled · refunded", tone: "bad" as const };
    }
    if (order.payment_status === "refund_pending") {
      return { label: "Cancelled · refund pending", tone: "warn" as const };
    }
    if (order.cancel_reason === "hold_expired" || holdExpired) {
      return { label: "Cancelled · hold expired", tone: "bad" as const };
    }
    return { label: "Cancelled", tone: "bad" as const };
  }

  if (order.payment_status === "refunded") {
    return { label: "Refunded", tone: "bad" as const };
  }
  if (order.payment_status === "refund_pending") {
    return { label: "Refund pending", tone: "warn" as const };
  }

  if (!order.payment_method) {
    if (holdExpired) return { label: "Hold expired (restocking)", tone: "warn" as const };
    if (order.failure_reason) {
      return { label: "Payment failed · awaiting retry", tone: "warn" as const };
    }
    return { label: "Awaiting payment", tone: "warn" as const };
  }

  if (order.payment_method === "prepaid" && order.payment_status === "paid") {
    if (parcel === "pending") return { label: "Paid · ready to ship", tone: "ok" as const };
    if (parcel === "shipped") return { label: "Paid · shipped", tone: "ok" as const };
    if (parcel === "delivered") return { label: "Paid · delivered", tone: "ok" as const };
    if (parcel === "returned") return { label: "Paid · returned", tone: "warn" as const };
  }

  if (order.payment_method === "prepaid") {
    if (order.failure_reason) {
      return { label: "Prepaid · payment failed", tone: "warn" as const };
    }
    return { label: "Prepaid · awaiting payment", tone: "warn" as const };
  }

  if (order.payment_method === "cod") {
    if (order.payment_status === "pending_payment") {
      if (parcel === "pending") return { label: "COD · awaiting dispatch", tone: "warn" as const };
      if (parcel === "shipped") return { label: "COD · shipped", tone: "ok" as const };
      if (parcel === "delivered") return { label: "COD · delivered · collect cash", tone: "warn" as const };
    }
    return { label: `COD · ${parcel}`, tone: "neutral" as const };
  }

  return {
    label: `${order.payment_status.replaceAll("_", " ")} · ${parcel}`,
    tone: "neutral" as const,
  };
}

function toneClass(tone: "neutral" | "warn" | "ok" | "bad") {
  if (tone === "ok") return "border-emerald-700 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-700 bg-amber-50 text-amber-900";
  if (tone === "bad") return "border-red-700 bg-red-50 text-red-900";
  return "border-border bg-muted text-foreground";
}

function when(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN");
}

export function AdminClient() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [coupons, setCoupons] = useState<CouponConfig[]>([]);
  const [couponForm, setCouponForm] = useState<CouponForm>(emptyCoupon);
  const [couponError, setCouponError] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    const data = (await res.json()) as {
      variants?: Variant[];
      orders?: AdminOrder[];
      coupons?: CouponConfig[];
      couponsError?: string | null;
    };
    setVariants(data.variants ?? []);
    setCoupons(data.coupons ?? []);
    if (data.couponsError) setCouponError(data.couponsError);
    setOrders(data.orders ?? []);
    setAuthed(true);
    setUpdatedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!authed) return;
    const timer = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [authed, load]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError("Invalid password");
      return;
    }
    await load();
  }

  async function savePrice(sku: string, rupees: string) {
    if (!/^\d+(\.\d{1,2})?$/.test(rupees.trim())) {
      setError("Enter a price in rupees with up to two decimals.");
      return;
    }
    const pricePaise = Math.round(Number(rupees) * 100);
    const res = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "price", sku, pricePaise }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Could not update price");
      return;
    }
    setError("");
    await load();
  }

  function editCoupon(coupon: CouponConfig) {
    setCouponForm({
      id: coupon.id,
      code: coupon.code,
      discountPercent: String(coupon.discountPercent),
      eligibilityType: coupon.eligibilityType,
      minCartRupees: coupon.minCartValuePaise ? String(coupon.minCartValuePaise / 100) : "",
      minQuantity: coupon.minQuantity ? String(coupon.minQuantity) : "",
      eligibleProductSlugs: coupon.eligibleProductSlugs,
      isEnabled: coupon.isEnabled,
      allProducts: coupon.eligibleProductSlugs.length === 0,
    });
    setCouponError("");
  }

  async function saveCoupon(event: React.FormEvent) {
    event.preventDefault();
    setCouponError("");
    if (!couponForm.allProducts && couponForm.eligibleProductSlugs.length === 0) {
      setCouponError("Select at least one product, or choose all products.");
      return;
    }
    const minCartValuePaise =
      couponForm.eligibilityType === "MIN_CART_VALUE" && /^\d+(\.\d{1,2})?$/.test(couponForm.minCartRupees.trim())
        ? Math.round(Number(couponForm.minCartRupees) * 100)
        : null;
    const res = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "coupon",
        coupon: {
          id: couponForm.id,
          code: couponForm.code,
          discountPercent: Number(couponForm.discountPercent),
          eligibilityType: couponForm.eligibilityType,
          minCartValuePaise,
          minQuantity:
            couponForm.eligibilityType === "MIN_QUANTITY" ? Number(couponForm.minQuantity) : null,
          eligibleProductSlugs: couponForm.allProducts ? [] : couponForm.eligibleProductSlugs,
          isEnabled: couponForm.isEnabled,
        },
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setCouponError(data.error || "Could not save coupon");
      return;
    }
    setCouponForm(emptyCoupon);
    await load();
  }

  const productSlugs = [...new Set(variants.map((variant) => variant.product_slug))];

  async function saveStock(sku: string, stock: number) {
    await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "stock", sku, stock }),
    });
    await load();
  }

  async function setParcel(orderId: string, parcel: string) {
    await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "parcel", orderId, parcel }),
    });
    await load();
  }

  async function setPayment(orderId: string, payment: string) {
    await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "payment", orderId, payment }),
    });
    await load();
  }

  if (!authed) {
    return (
      <form onSubmit={(event) => void login(event)} className="max-w-sm space-y-4">
        <label className="block text-sm">
          Admin password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full border border-border px-3 py-2.5"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="bg-button px-5 py-3 text-sm text-white">
          Enter
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-12">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <section>
        <h2 className="font-serif text-2xl">Inventory</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2">SKU</th>
                <th>Product</th>
                <th>Size</th>
                <th>Price (₹)</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr key={variant.sku} className="border-b border-border">
                  <td className="py-2">{variant.sku}</td>
                  <td>{variant.product_slug}</td>
                  <td>{variant.size}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      defaultValue={
                        variant.price_paise ? (variant.price_paise / 100).toFixed(2) : ""
                      }
                      className="w-24 border border-border px-2 py-1"
                      onBlur={(event) => void savePrice(variant.sku, event.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      defaultValue={variant.stock}
                      className="w-20 border border-border px-2 py-1"
                      onBlur={(event) =>
                        void saveStock(variant.sku, Number(event.target.value))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-serif text-2xl">Coupons</h2>
        <p className="mt-2 max-w-2xl text-sm text-secondary">
          One eligibility rule per coupon. An empty product list means every product. The code is letters plus a 1-2 digit discount number, for example PLAIN5 for 5% or SAVE25 for 25%.
        </p>
        {couponError && <p className="mt-3 text-sm text-red-700">{couponError}</p>}
        <form onSubmit={(event) => void saveCoupon(event)} className="mt-4 grid max-w-xl gap-3 text-sm">
          <input
            value={couponForm.code}
            onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })}
            placeholder="PLAIN5"
            aria-label="Coupon code"
            className="border border-border px-3 py-2"
          />
          <input
            value={couponForm.discountPercent}
            onChange={(event) => setCouponForm({ ...couponForm, discountPercent: event.target.value })}
            placeholder="Percentage"
            aria-label="Discount percentage"
            className="border border-border px-3 py-2"
          />
          <select
            value={couponForm.eligibilityType}
            onChange={(event) =>
              setCouponForm({
                ...couponForm,
                eligibilityType: event.target.value as EligibilityType,
              })
            }
            className="border border-border px-3 py-2"
          >
            <option value="MIN_CART_VALUE">Minimum cart value</option>
            <option value="MIN_QUANTITY">Minimum quantity</option>
          </select>
          {couponForm.eligibilityType === "MIN_CART_VALUE" ? (
            <input
              value={couponForm.minCartRupees}
              onChange={(event) => setCouponForm({ ...couponForm, minCartRupees: event.target.value })}
              placeholder="Minimum cart value in rupees"
              aria-label="Minimum cart value in rupees"
              className="border border-border px-3 py-2"
            />
          ) : (
            <input
              value={couponForm.minQuantity}
              onChange={(event) => setCouponForm({ ...couponForm, minQuantity: event.target.value })}
              placeholder="Minimum quantity"
              aria-label="Minimum quantity"
              className="border border-border px-3 py-2"
            />
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={couponForm.allProducts}
              onChange={(event) => setCouponForm({ ...couponForm, allProducts: event.target.checked })}
            />
            All products
          </label>
          {!couponForm.allProducts && (
            <div className="space-y-1">
              {productSlugs.map((slug) => (
                <label key={slug} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={couponForm.eligibleProductSlugs.includes(slug)}
                    onChange={(event) => {
                      const eligibleProductSlugs = event.target.checked
                        ? [...couponForm.eligibleProductSlugs, slug]
                        : couponForm.eligibleProductSlugs.filter((item) => item !== slug);
                      setCouponForm({ ...couponForm, eligibleProductSlugs });
                    }}
                  />
                  {slug}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={couponForm.isEnabled}
              onChange={(event) => setCouponForm({ ...couponForm, isEnabled: event.target.checked })}
            />
            Enabled
          </label>
          <button type="submit" className="w-fit bg-button px-4 py-2 text-white">
            {couponForm.id ? "Update coupon" : "Create coupon"}
          </button>
        </form>
        <ul className="mt-6 space-y-2 text-sm">
          {coupons.map((coupon) => (
            <li key={coupon.id ?? coupon.code} className="flex flex-wrap items-center justify-between gap-3 border border-border px-3 py-2">
              <span>
                {coupon.code} · {coupon.discountPercent}% · {offerCondition(coupon)} ·{" "}
                {coupon.isEnabled ? "Enabled" : "Disabled"}
                {coupon.eligibleProductSlugs.length > 0
                  ? ` · ${coupon.eligibleProductSlugs.join(", ")}`
                  : " · All products"}
              </span>
              <button type="button" className="underline underline-offset-4" onClick={() => editCoupon(coupon)}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-serif text-2xl">Orders</h2>
          <p className="text-xs text-secondary">
            Live from database
            {updatedAt ? ` · refreshed ${when(updatedAt)}` : ""} · every 8s
          </p>
        </div>
        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-secondary">No orders yet.</p>
        ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((order) => {
            const live = currentOrderStatus(order);
            const parcel = parcelLabel(order);
            return (
            <li key={order.id} className="border border-border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="font-medium">
                    {order.public_id} · {formatPrice(order.total_paise / 100)}
                  </p>
                  <p
                    className={`inline-flex border px-2 py-1 text-xs tracking-wide ${toneClass(live.tone)}`}
                  >
                    {live.label}
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-secondary">
                    <dt>Order</dt>
                    <dd>{order.status}</dd>
                    <dt>Payment</dt>
                    <dd>
                      {order.payment_method ?? "not placed"} ·{" "}
                      {order.payment_status.replaceAll("_", " ")}
                    </dd>
                    <dt>Parcel</dt>
                    <dd>{parcel}</dd>
                    <dt>Created</dt>
                    <dd>{when(order.created_at)}</dd>
                    {order.paid_at && (
                      <>
                        <dt>Paid</dt>
                        <dd>{when(order.paid_at)}</dd>
                      </>
                    )}
                    {!order.payment_method && order.status === "open" && order.hold_expires_at && (
                      <>
                        <dt>Hold until</dt>
                        <dd>{when(order.hold_expires_at)}</dd>
                      </>
                    )}
                    {order.cancelled_at && (
                      <>
                        <dt>Cancelled</dt>
                        <dd>
                          {when(order.cancelled_at)}
                          {order.cancel_reason ? ` · ${order.cancel_reason}` : ""}
                        </dd>
                      </>
                    )}
                    {order.failure_reason && (
                      <>
                        <dt>Last error</dt>
                        <dd>{order.failure_reason}</dd>
                      </>
                    )}
                  </dl>
                </div>
                {order.status === "open" && order.parcel_status === "pending" && order.payment_method && (
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => void setParcel(order.id, "shipped")}
                  >
                    Mark shipped
                  </button>
                )}
                {order.status === "open" && order.parcel_status === "shipped" && (
                  <>
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => void setParcel(order.id, "delivered")}
                    >
                      Mark delivered
                    </button>
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => void setParcel(order.id, "returned")}
                    >
                      Mark returned
                    </button>
                  </>
                )}
                {order.status === "open" && order.parcel_status === "delivered" && (
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    onClick={() => void setParcel(order.id, "returned")}
                  >
                    Mark returned
                  </button>
                )}
                {order.status === "open" &&
                  order.payment_method === "prepaid" &&
                  order.parcel_status === "returned" &&
                  (order.payment_status === "paid" || order.payment_status === "refund_pending") && (
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      onClick={() => void setPayment(order.id, "refunded")}
                    >
                      Mark refunded
                    </button>
                  )}
              </div>
              <p className="mt-2">
                {order.customer_name} · {order.email} · {order.phone}
              </p>
              <p className="mt-1 text-secondary">
                {order.address_line1}
                {order.address_line2 ? `, ${order.address_line2}` : ""}
                <br />
                {order.city}, {order.state} {order.pincode}
              </p>
              <ul className="mt-2 text-secondary">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.name} · {item.size} × {item.qty} · {item.sku}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-secondary">
                Mail: customer {order.customer_email_sent_at ? "sent" : "pending"} · ops{" "}
                {order.ops_email_sent_at ? "sent" : "pending"}
                {order.razorpay_payment_id ? ` · ${order.razorpay_payment_id}` : ""}
              </p>
            </li>
            );
          })}
        </ul>
        )}
      </section>
    </div>
  );
}
