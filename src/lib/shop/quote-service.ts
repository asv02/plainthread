import { loadCouponByCode } from "@/lib/shop/coupon-store";
import { quoteCart, type CartQuote } from "@/lib/shop/coupon";
import { loadSkuPriceRows } from "@/lib/shop/sku-prices";
import type { CartLine } from "@/lib/shop/types";

export async function quoteAuthoritativeCart(
  lines: CartLine[],
  options?: { destinationState?: string; couponCode?: string | null },
): Promise<CartQuote> {
  const rows = await loadSkuPriceRows();
  const raw = options?.couponCode?.trim() ?? "";
  if (!raw) {
    return quoteCart(lines, rows, { destinationState: options?.destinationState });
  }
  const coupon = await loadCouponByCode(raw);
  if (!coupon) {
    return quoteCart(lines, rows, {
      destinationState: options?.destinationState,
      unknownCouponCode: raw,
    });
  }
  return quoteCart(lines, rows, { destinationState: options?.destinationState, coupon });
}
