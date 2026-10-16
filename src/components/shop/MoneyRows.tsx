"use client";

import { formatPrice } from "@/lib/utils";
import type { TaxBreakdown } from "@/lib/shop/tax";

export function MoneyRows({
  goodsPaise,
  discountPaise = 0,
  couponCode,
  shippingPaise,
  tax,
  totalPaise,
}: {
  goodsPaise: number;
  discountPaise?: number;
  couponCode?: string | null;
  shippingPaise: number;
  tax: Pick<
    TaxBreakdown,
    "taxPaise" | "taxPercent" | "taxKind" | "cgstPaise" | "sgstPaise" | "igstPaise" | "inclusive" | "taxablePaise"
  >;
  totalPaise: number;
}) {
  const half = tax.taxPercent / 2;
  return (
    <div className="space-y-2 text-sm">
      <p className="flex justify-between gap-4">
        <span>Subtotal</span>
        <span>{formatPrice(goodsPaise / 100)}</span>
      </p>
      {discountPaise > 0 && (
        <p className="flex justify-between gap-4">
          <span>Coupon{couponCode ? ` ${couponCode}` : ""}</span>
          <span>-{formatPrice(discountPaise / 100)}</span>
        </p>
      )}
      {tax.inclusive && (
        <p className="flex justify-between gap-4 text-secondary">
          <span>Taxable value</span>
          <span>{formatPrice(tax.taxablePaise / 100)}</span>
        </p>
      )}
      {tax.taxKind === "cgst_sgst" ? (
        <>
          <p className="flex justify-between gap-4">
            <span>CGST ({half}%)</span>
            <span>{formatPrice(tax.cgstPaise / 100)}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span>SGST ({half}%)</span>
            <span>{formatPrice(tax.sgstPaise / 100)}</span>
          </p>
        </>
      ) : (
        <p className="flex justify-between gap-4">
          <span>GST / IGST ({tax.taxPercent}%)</span>
          <span>{formatPrice(tax.taxPaise / 100)}</span>
        </p>
      )}
      {shippingPaise > 0 && (
        <p className="flex justify-between gap-4">
          <span>Shipping</span>
          <span>{formatPrice(shippingPaise / 100)}</span>
        </p>
      )}
      <p className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
        <span>Total</span>
        <span>{formatPrice(totalPaise / 100)}</span>
      </p>
      {tax.inclusive && (
        <p className="text-xs text-secondary">Listed prices include GST.</p>
      )}
    </div>
  );
}
