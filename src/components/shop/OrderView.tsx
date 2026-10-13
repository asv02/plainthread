"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { MoneyRows } from "@/components/shop/MoneyRows";
import { taxLinesFromStored } from "@/lib/shop/tax";
import { siteConfig } from "@/data/site";
import { isEligiblePaidPurchase, purchaseCustomData, purchaseEventId } from "@/lib/meta/events";
import { PIXEL_READY_EVENT, trackPurchase } from "@/lib/meta-pixel-client";
import { AD_CONSENT_EVENT } from "@/lib/meta/consent";
import type { PublicOrder } from "@/lib/shop/types";

function cancelMailto(publicId: string, parcelStatus: string) {
  const subject = encodeURIComponent(`Cancel or return request ${publicId}`);
  const body = encodeURIComponent(
    `Order ${publicId}\nParcel status: ${parcelStatus}\n\nPlease help cancel this order or arrange a return.`,
  );
  return `mailto:${siteConfig.email}?subject=${subject}&body=${body}`;
}

function asPurchaseOrder(order: PublicOrder) {
  return {
    status: order.status,
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod,
    paid_at: order.paidAt,
    public_id: order.publicId,
    total_paise: order.totalPaise,
    tax_paise: order.taxPaise,
    shipping_paise: order.shippingPaise,
    currency: order.currency,
  };
}

export function OrderView({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const purchaseSent = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/${publicId}`, { cache: "no-store" });
    const data = (await res.json()) as {
      order?: PublicOrder;
      error?: string;
    };
    if (!res.ok || !data.order) {
      setError(data.error || "Order not found");
      return null;
    }
    setOrder(data.order);
    setError("");
    return data.order;
  }, [publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!order || order.paymentStatus !== "pending_payment" || order.status !== "open") return;
    let cancelled = false;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 12) {
        window.clearInterval(timer);
        return;
      }
      void load().then((next) => {
        if (cancelled || next?.paymentStatus === "paid") window.clearInterval(timer);
      });
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [order, load]);

  useEffect(() => {
    function trySend() {
      if (!order || purchaseSent.current) return;
      const eligible = isEligiblePaidPurchase(asPurchaseOrder(order));
      if (!eligible) return;
      const eventID = purchaseEventId(order.publicId);
      try {
        if (sessionStorage.getItem(`pt_meta_purchase_${eventID}`)) {
          purchaseSent.current = true;
          return;
        }
      } catch {
        // ignore
      }
      if (!trackPurchase(purchaseCustomData(asPurchaseOrder(order), order.items), eventID)) {
        return;
      }
      purchaseSent.current = true;
      try {
        sessionStorage.setItem(`pt_meta_purchase_${eventID}`, "1");
      } catch {
        // ignore
      }
    }
    trySend();
    window.addEventListener(AD_CONSENT_EVENT, trySend);
    window.addEventListener(PIXEL_READY_EVENT, trySend);
    return () => {
      window.removeEventListener(AD_CONSENT_EVENT, trySend);
      window.removeEventListener(PIXEL_READY_EVENT, trySend);
    };
  }, [order]);

  function emailAndGoToReturns(parcelStatus: string) {
    window.open(cancelMailto(publicId, parcelStatus));
    router.push("/shipping-returns");
  }

  async function cancel() {
    if (!order) return;
    setWorking(true);
    setError("");
    if (order.status === "cancelled") {
      setError("This order is already cancelled.");
      setWorking(false);
      return;
    }
    if ((order.parcelStatus ?? "pending") !== "pending") {
      emailAndGoToReturns(order.parcelStatus);
      setWorking(false);
      return;
    }
    try {
      const res = await fetch(`/api/orders/${publicId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "customer_cancelled" }),
      });
      const data = (await res.json()) as {
        order?: PublicOrder;
        error?: string;
        result?: string;
      };
      if (data.result === "not_cancellable") {
        emailAndGoToReturns(data.order?.parcelStatus ?? order.parcelStatus);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Could not cancel");
      if (data.order) setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setWorking(false);
    }
  }

  if (!order && !error) return <p className="text-secondary">Loading order…</p>;
  if (!order) {
    return (
      <p className="text-secondary">
        {error}{" "}
        <a href="/account" className="underline underline-offset-2">
          Sign in
        </a>{" "}
        with your checkout email to view this order.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm uppercase tracking-[0.18em] text-secondary">
        {order.paymentMethod === "cod" ? "Cash on delivery" : order.paymentMethod === "prepaid" ? "Prepaid" : "Awaiting payment"}
        {" · "}
        {order.paymentStatus.replaceAll("_", " ")}
        {" · parcel "}
        {order.parcelStatus}
      </p>
      <h1 className="font-serif text-4xl">{order.publicId}</h1>
      <ul className="divide-y divide-border border border-border">
        {order.items.map((item) => (
          <li key={`${item.sku}`} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <span>
              {item.name} · {item.size} × {item.qty}
            </span>
            <span>{formatPrice((item.unitPricePaise * item.qty) / 100)}</span>
          </li>
        ))}
      </ul>
      <MoneyRows {...taxLinesFromStored(order)} />
      <p className="text-sm leading-6 text-secondary">
        {order.customerName}
        <br />
        {order.addressLine1}
        {order.addressLine2 ? `, ${order.addressLine2}` : ""}
        <br />
        {order.city}, {order.state} {order.pincode}
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {order.status === "open" && (
        <button
          type="button"
          disabled={working}
          onClick={() => void cancel()}
          className="border border-foreground px-5 py-3 text-sm disabled:opacity-50"
        >
          {working
            ? "Cancelling…"
            : (order.parcelStatus ?? "pending") === "pending"
              ? "Cancel order and restock"
              : "Email to cancel or return"}
        </button>
      )}
      {order.parcelStatus === "delivered" && (
        <p className="text-sm leading-6 text-secondary">
          Returns are open for 7 days from the delivered date, including after
          Delhivery has completed delivery. Email{" "}
          <a
            className="underline underline-offset-2"
            href={`mailto:${siteConfig.email}?subject=${encodeURIComponent(`Return request ${order.publicId}`)}`}
          >
            {siteConfig.email}
          </a>{" "}
          with this order ID. Pickup is arranged through iThink Logistics.{" "}
          <a href="/shipping-returns" className="underline underline-offset-2">
            Shipping &amp; returns
          </a>
        </p>
      )}
      {order.status === "cancelled" && (
        <p className="text-sm text-secondary">
          This order is cancelled. Inventory has been returned to stock
          {order.paymentStatus === "refunded" ? " and the payment is refunded." : "."}
        </p>
      )}
    </div>
  );
}
