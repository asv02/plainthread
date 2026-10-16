import { getProduct } from "@/data/products";
import { isShopSize, MAX_LINE_QTY, MAX_ORDER_QTY } from "@/data/shop";
import { shippingPaise } from "@/lib/shop/config";
import { calculateGst, payableTotalPaise, type TaxBreakdown } from "@/lib/shop/tax";
import type { CartLine } from "@/lib/shop/types";
import { formatPrice } from "@/lib/utils";

export const ELIGIBILITY_TYPES = ["MIN_CART_VALUE", "MIN_QUANTITY"] as const;
export type EligibilityType = (typeof ELIGIBILITY_TYPES)[number];

/** COUPON plus exactly two digits (01–99). Three or more digits is ambiguous. */
const COUPON_CODE = /^[A-Z]+([0-9]{1,2})$/;

export class CouponConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponConfigError";
  }
}

export type CouponConfig = {
  id?: string;
  code: string;
  discountPercent: number;
  eligibilityType: EligibilityType;
  minCartValuePaise: number | null;
  minQuantity: number | null;
  /** Empty means every active product. A non-empty list limits eligibility to those product slugs (all size SKUs). */
  eligibleProductSlugs: string[];
  isEnabled: boolean;
};

export type SkuPriceRow = {
  product_slug: string;
  size: string;
  sku: string;
  price_paise: number;
  name?: string;
};

export type QuotedLine = {
  product_slug: string;
  size: string;
  sku: string;
  qty: number;
  unit_price_paise: number;
  discount_paise: number;
  name: string;
  eligible: boolean;
};

export type CouponEvaluation = {
  code: string;
  discountPercent: number;
  eligibilityType: EligibilityType;
  applied: boolean;
  message: string | null;
  eligibleSubtotalPaise: number;
  eligibleQuantity: number;
};

export type CartQuote = {
  items: QuotedLine[];
  subtotalPaise: number;
  eligibleSubtotalPaise: number;
  eligibleQuantity: number;
  discountPaise: number;
  shippingPaise: number;
  tax: TaxBreakdown;
  totalPaise: number;
  coupon: CouponEvaluation | null;
  couponSnapshot: CouponSnapshot | null;
};

export type CouponSnapshot = {
  code: string;
  discount_percent: number;
  eligibility_type: EligibilityType;
  min_cart_value_paise: number | null;
  min_quantity: number | null;
  eligible_product_slugs: string[];
  eligible_subtotal_paise: number;
  eligible_quantity: number;
  discount_paise: number;
};

export function normalizeCouponCode(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function couponSuffixPercent(code: string) {
  const normalized = normalizeCouponCode(code);
  const match = COUPON_CODE.exec(normalized);
  if (!match) return null;
  return Number(match[1]);
}

/** Rejects codes whose suffix does not exactly equal the stored integer percentage. */
export function assertCouponCodeMatchesPercent(code: string, discountPercent: number) {
  const normalized = normalizeCouponCode(code);
  const suffix = couponSuffixPercent(normalized);
  if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 99) {
    throw new CouponConfigError("Discount percentage must be a whole number from 1 to 99.");
  }
  if (suffix == null) {
    throw new CouponConfigError(
      "Coupon code must be letters followed by a 1-2 digit discount number, e.g. PLAIN5 (5%) or SAVE25 (25%). PLAIN123 is ambiguous and is rejected.",
    );
  }
  if (suffix !== discountPercent) {
    throw new CouponConfigError(
      `${normalized} must use ${suffix}% because the code suffix is the discount. It does not match ${discountPercent}%.`,
    );
  }
  return { code: normalized, discountPercent };
}

export function parseCouponDraft(
  input: {
    code?: unknown;
    discountPercent?: unknown;
    eligibilityType?: unknown;
    minCartValuePaise?: unknown;
    minQuantity?: unknown;
    eligibleProductSlugs?: unknown;
    isEnabled?: unknown;
  },
  options?: { knownSlugs?: string[] },
): CouponConfig {
  const code = typeof input.code === "string" ? input.code : "";
  const discountPercent = Number(input.discountPercent);
  const matched = assertCouponCodeMatchesPercent(code, discountPercent);
  const eligibilityType = input.eligibilityType;
  if (eligibilityType !== "MIN_CART_VALUE" && eligibilityType !== "MIN_QUANTITY") {
    throw new CouponConfigError("Choose a minimum cart value or a minimum quantity.");
  }

  const known = options?.knownSlugs;
  const slugs = Array.isArray(input.eligibleProductSlugs) ? input.eligibleProductSlugs : [];
  const eligibleProductSlugs: string[] = [];
  for (const slug of slugs) {
    if (typeof slug !== "string" || !slug.trim()) {
      throw new CouponConfigError("Eligible products must be product slugs.");
    }
    const trimmed = slug.trim();
    const knownProduct = Boolean(getProduct(trimmed)) || Boolean(known?.includes(trimmed));
    if (!knownProduct) {
      throw new CouponConfigError("Eligible products must be existing product slugs.");
    }
    if (!eligibleProductSlugs.includes(trimmed)) eligibleProductSlugs.push(trimmed);
  }

  let minCartValuePaise: number | null = null;
  let minQuantity: number | null = null;
  if (eligibilityType === "MIN_CART_VALUE") {
    const value = Number(input.minCartValuePaise);
    if (!Number.isInteger(value) || value < 1) {
      throw new CouponConfigError("Minimum cart value must be a positive amount in paise.");
    }
    if (input.minQuantity != null && input.minQuantity !== "") {
      throw new CouponConfigError("A minimum-cart-value coupon does not use a quantity threshold.");
    }
    minCartValuePaise = value;
  } else {
    const value = Number(input.minQuantity);
    if (!Number.isInteger(value) || value < 1) {
      throw new CouponConfigError("Minimum quantity must be a positive whole number of items.");
    }
    if (input.minCartValuePaise != null && input.minCartValuePaise !== "") {
      throw new CouponConfigError("A minimum-quantity coupon does not use a cart-value threshold.");
    }
    minQuantity = value;
  }

  return {
    code: matched.code,
    discountPercent: matched.discountPercent,
    eligibilityType,
    minCartValuePaise,
    minQuantity,
    eligibleProductSlugs,
    isEnabled: input.isEnabled !== false,
  };
}

export function assertCouponCodeAvailable(existingCodes: string[], code: string, currentCode?: string) {
  const normalized = normalizeCouponCode(code);
  const current = currentCode ? normalizeCouponCode(currentCode) : null;
  if (existingCodes.some((existing) => normalizeCouponCode(existing) === normalized && normalized !== current)) {
    throw new CouponConfigError("A coupon with this code already exists.");
  }
  return normalized;
}

export function adminCouponMutationStatus(isAdminUser: boolean) {
  return isAdminUser ? null : 401;
}

export function offerCondition(coupon: Pick<CouponConfig, "eligibilityType" | "minCartValuePaise" | "minQuantity">) {
  if (coupon.eligibilityType === "MIN_CART_VALUE") {
    return `Minimum order value: ${formatPrice((coupon.minCartValuePaise ?? 0) / 100)}`;
  }
  const qty = coupon.minQuantity ?? 0;
  return `Buy at least ${qty} eligible ${qty === 1 ? "item" : "items"}`;
}

export function percentDiscountPaise(basePaise: number, percent: number) {
  if (!Number.isInteger(percent) || percent < 1 || percent > 99) return 0;
  if (!Number.isInteger(basePaise) || basePaise < 1) return 0;
  const discount = Math.round((basePaise * percent) / 100);
  return Math.min(basePaise, Math.max(0, discount));
}

export function allocateDiscountPaise(
  lines: Array<{ key: string; merchandisePaise: number; eligible: boolean }>,
  discountPaise: number,
) {
  const result = new Map<string, number>();
  for (const line of lines) result.set(line.key, 0);
  const eligible = lines.filter((line) => line.eligible && line.merchandisePaise > 0);
  const base = eligible.reduce((sum, line) => sum + line.merchandisePaise, 0);
  const capped = Math.min(Math.max(0, discountPaise), base);
  if (capped === 0 || base === 0) return result;

  const shares = eligible.map((line) => {
    const exact = (capped * line.merchandisePaise) / base;
    const floor = Math.floor(exact);
    return { key: line.key, floor, fraction: exact - floor };
  });
  let leftover = capped - shares.reduce((sum, share) => sum + share.floor, 0);
  shares.sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key));
  for (const share of shares) {
    if (leftover <= 0) break;
    share.floor += 1;
    leftover -= 1;
  }
  for (const share of shares) result.set(share.key, share.floor);
  return result;
}

function lineKey(slug: string, size: string) {
  return `${slug}:${size}`;
}

export function productEligible(coupon: CouponConfig, productSlug: string) {
  if (coupon.eligibleProductSlugs.length === 0) return true;
  return coupon.eligibleProductSlugs.includes(productSlug);
}

function shortfallMessage(coupon: CouponConfig, eligibleSubtotalPaise: number, eligibleQuantity: number) {
  if (coupon.eligibilityType === "MIN_CART_VALUE") {
    const gap = (coupon.minCartValuePaise ?? 0) - eligibleSubtotalPaise;
    if (eligibleSubtotalPaise <= 0) {
      return `${coupon.code} only applies to selected products.`;
    }
    return `Add ${formatPrice(gap / 100)} more in eligible products to apply ${coupon.code}.`;
  }
  const gap = (coupon.minQuantity ?? 0) - eligibleQuantity;
  if (eligibleQuantity <= 0 && coupon.eligibleProductSlugs.length > 0) {
    return `${coupon.code} only applies to selected products.`;
  }
  const noun = gap === 1 ? "item" : "items";
  return `Add ${gap} more eligible ${noun} to apply ${coupon.code}.`;
}

export function quoteCart(
  lines: CartLine[],
  priceRows: SkuPriceRow[],
  options?: {
    destinationState?: string;
    coupon?: CouponConfig | null;
    /** Set when the shopper submitted a code that does not exist. */
    unknownCouponCode?: string | null;
  },
): CartQuote {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Cart is empty");
  }

  const prices = new Map<string, SkuPriceRow>();
  for (const row of priceRows) {
    if (!row?.product_slug || !row.size || !row.sku) continue;
    if (!Number.isInteger(row.price_paise) || row.price_paise < 1) continue;
    prices.set(lineKey(row.product_slug, row.size), row);
  }

  const merged = new Map<string, CartLine>();
  for (const line of lines) {
    if (!line?.productSlug || !isShopSize(line.size)) {
      throw new Error("Invalid product or size");
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) {
      throw new Error("Invalid quantity");
    }
    const key = lineKey(line.productSlug, line.size);
    const prev = merged.get(key);
    const nextQty = (prev?.qty ?? 0) + qty;
    if (nextQty > MAX_LINE_QTY) throw new Error("Quantity limit reached");
    merged.set(key, { productSlug: line.productSlug, size: line.size, qty: nextQty });
  }

  const draft: Array<QuotedLine & { key: string }> = [];
  let subtotal = 0;
  let totalQty = 0;
  for (const line of merged.values()) {
    const row = prices.get(lineKey(line.productSlug, line.size));
    if (!row) throw new Error("Unknown product");
    totalQty += line.qty;
    if (totalQty > MAX_ORDER_QTY) throw new Error("Order quantity limit reached");
    const product = getProduct(line.productSlug);
    subtotal += row.price_paise * line.qty;
    draft.push({
      key: lineKey(line.productSlug, line.size),
      product_slug: line.productSlug,
      size: line.size,
      sku: row.sku,
      qty: line.qty,
      unit_price_paise: row.price_paise,
      discount_paise: 0,
      name: row.name || product?.name || line.productSlug,
      eligible: false,
    });
  }

  const coupon = options?.coupon ?? null;
  let evaluation: CouponEvaluation | null = null;
  let discountPaise = 0;

  if (options?.unknownCouponCode) {
    const code = normalizeCouponCode(options.unknownCouponCode);
    evaluation = {
      code: code || "COUPON",
      discountPercent: 0,
      eligibilityType: "MIN_CART_VALUE",
      applied: false,
      message: "Enter a valid coupon code.",
      eligibleSubtotalPaise: 0,
      eligibleQuantity: 0,
    };
  } else if (coupon) {
    let consistent = true;
    try {
      assertCouponCodeMatchesPercent(coupon.code, coupon.discountPercent);
    } catch {
      consistent = false;
    }
    for (const line of draft) {
      line.eligible = consistent && coupon.isEnabled && productEligible(coupon, line.product_slug);
    }
    const eligibleSubtotalPaise = draft.reduce(
      (sum, line) => sum + (line.eligible ? line.unit_price_paise * line.qty : 0),
      0,
    );
    const eligibleQuantity = draft.reduce((sum, line) => sum + (line.eligible ? line.qty : 0), 0);
    const meets =
      consistent &&
      coupon.isEnabled &&
      (coupon.eligibilityType === "MIN_CART_VALUE"
        ? eligibleSubtotalPaise >= (coupon.minCartValuePaise ?? Number.POSITIVE_INFINITY)
        : eligibleQuantity >= (coupon.minQuantity ?? Number.POSITIVE_INFINITY));

    if (!consistent || !coupon.isEnabled) {
      evaluation = {
        code: normalizeCouponCode(coupon.code),
        discountPercent: coupon.discountPercent,
        eligibilityType: coupon.eligibilityType,
        applied: false,
        message: `${normalizeCouponCode(coupon.code)} is not active.`,
        eligibleSubtotalPaise,
        eligibleQuantity,
      };
    } else if (!meets) {
      evaluation = {
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        eligibilityType: coupon.eligibilityType,
        applied: false,
        message: shortfallMessage(coupon, eligibleSubtotalPaise, eligibleQuantity),
        eligibleSubtotalPaise,
        eligibleQuantity,
      };
    } else {
      discountPaise = percentDiscountPaise(eligibleSubtotalPaise, coupon.discountPercent);
      const shares = allocateDiscountPaise(
        draft.map((line) => ({
          key: line.key,
          merchandisePaise: line.unit_price_paise * line.qty,
          eligible: line.eligible,
        })),
        discountPaise,
      );
      for (const line of draft) line.discount_paise = shares.get(line.key) ?? 0;
      evaluation = {
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        eligibilityType: coupon.eligibilityType,
        applied: true,
        message: null,
        eligibleSubtotalPaise,
        eligibleQuantity,
      };
    }
  }

  const netGoods = subtotal - discountPaise;
  const shipping = shippingPaise();
  const tax = calculateGst({
    goodsPaise: netGoods,
    shippingPaise: shipping,
    destinationState: options?.destinationState,
  });
  const totalPaise = payableTotalPaise(netGoods, shipping, tax);
  const eligibleSubtotalPaise =
    evaluation?.eligibleSubtotalPaise ??
    draft.reduce((sum, line) => sum + line.unit_price_paise * line.qty, 0);
  const eligibleQuantity = evaluation?.eligibleQuantity ?? draft.reduce((sum, line) => sum + line.qty, 0);

  const couponSnapshot: CouponSnapshot | null =
    coupon && evaluation?.applied
      ? {
          code: coupon.code,
          discount_percent: coupon.discountPercent,
          eligibility_type: coupon.eligibilityType,
          min_cart_value_paise: coupon.minCartValuePaise,
          min_quantity: coupon.minQuantity,
          eligible_product_slugs: [...coupon.eligibleProductSlugs],
          eligible_subtotal_paise: evaluation.eligibleSubtotalPaise,
          eligible_quantity: evaluation.eligibleQuantity,
          discount_paise: discountPaise,
        }
      : null;

  return {
    items: draft.map(({ key: _key, ...line }) => line),
    subtotalPaise: subtotal,
    eligibleSubtotalPaise,
    eligibleQuantity,
    discountPaise,
    shippingPaise: shipping,
    tax,
    totalPaise,
    coupon: evaluation,
    couponSnapshot,
  };
}

export type CheckoutIntentPayload =
  | { type: "BUY_NOW"; product_slug: string; size: string }
  | { type: "CART_CHECKOUT" };

export class CheckoutIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutIntentError";
  }
}

export function parseCheckoutIntent(raw: unknown): CheckoutIntentPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { type?: unknown; product_slug?: unknown; size?: unknown };
  if (value.type === "CART_CHECKOUT") return { type: "CART_CHECKOUT" };
  if (value.type === "BUY_NOW") {
    if (
      typeof value.product_slug !== "string" ||
      !value.product_slug.trim() ||
      typeof value.size !== "string" ||
      !isShopSize(value.size)
    ) {
      throw new CheckoutIntentError("Invalid buy-now checkout intent.");
    }
    return { type: "BUY_NOW", product_slug: value.product_slug.trim(), size: value.size };
  }
  return null;
}

/** A BUY_NOW checkout carries exactly one unit of the selected SKU and nothing else. */
export function assertCheckoutIntentMatchesLines(
  intent: CheckoutIntentPayload | null,
  lines: CartLine[],
) {
  if (!intent || intent.type === "CART_CHECKOUT") return;
  const totalQty = lines.reduce((sum, line) => {
    if (line.productSlug !== intent.product_slug || line.size !== intent.size) {
      throw new CheckoutIntentError("Buy-now checkout can only contain the selected item.");
    }
    return sum + Number(line.qty);
  }, 0);
  if (lines.length !== 1 || totalQty !== 1 || Number(lines[0]?.qty) !== 1) {
    throw new CheckoutIntentError("Buy now purchases exactly one item.");
  }
}

export type EligibleCouponOffer = {
  code: string;
  discountPercent: number;
  discountPaise: number;
  condition: string;
};

/** Server-side filter: coupons that actually apply to these exact lines, best first. */
export function eligibleCheckoutCoupons(
  lines: CartLine[],
  priceRows: SkuPriceRow[],
  coupons: CouponConfig[],
  options?: { destinationState?: string },
): EligibleCouponOffer[] {
  if (!Array.isArray(lines) || lines.length === 0) return [];
  // Throws for invalid/unknown lines so the caller surfaces a real error instead of an empty list.
  quoteCart(lines, priceRows, { destinationState: options?.destinationState });
  const offers: EligibleCouponOffer[] = [];
  for (const coupon of coupons) {
    if (!coupon.isEnabled) continue;
    if (!lines.some((line) => productEligible(coupon, line.productSlug))) continue;
    const quote = quoteCart(lines, priceRows, { coupon });
    if (quote.coupon?.applied && quote.discountPaise > 0) {
      offers.push({
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        discountPaise: quote.discountPaise,
        condition: offerCondition(coupon),
      });
    }
  }
  return offers.sort((a, b) => b.discountPaise - a.discountPaise || a.code.localeCompare(b.code));
}

export function reviewedTotalMismatch(expected: unknown, actualPaise: number) {
  if (expected == null || expected === "") return null;
  const value = typeof expected === "number" ? expected : Number(expected);
  if (!Number.isInteger(value) || value !== actualPaise) {
    return "The total changed. Review the updated amount before paying.";
  }
  return null;
}

export function paymentAmount(totalPaise: number) {
  return { amountPaise: totalPaise, currency: "INR" as const };
}

export type MagicLine = {
  sku: string;
  variant_id: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
  offer_price: number;
  image_url?: string;
};

/** Line offer prices are integers and sum to the payable paise Razorpay charges. */
export function buildMagicLineItems(
  items: Array<{
    sku: string;
    product_slug: string;
    size: string;
    name: string;
    qty: number;
    unit_price_paise: number;
    discount_paise?: number;
  }>,
  totalPaise: number,
  imageUrl?: (productSlug: string) => string | undefined,
): MagicLine[] {
  const lines: MagicLine[] = [];
  let assigned = 0;
  let adjustment = 0;

  for (const item of items) {
    const gross = item.unit_price_paise * item.qty;
    const discount = Math.min(gross, Math.max(0, item.discount_paise ?? 0));
    const net = gross - discount;
    const offer = Math.floor(net / item.qty);
    const image = imageUrl?.(item.product_slug);
    if (offer < 1) {
      lines.push({
        sku: item.sku,
        variant_id: `${item.product_slug}:${item.size}`,
        name: item.name,
        description: item.name,
        quantity: 1,
        price: item.unit_price_paise,
        offer_price: net,
        image_url: image,
      });
      assigned += net;
      continue;
    }
    const leftover = net - offer * item.qty;
    adjustment += leftover;
    assigned += offer * item.qty;
    lines.push({
      sku: item.sku,
      variant_id: `${item.product_slug}:${item.size}`,
      name: item.name,
      description: item.name,
      quantity: item.qty,
      price: item.unit_price_paise,
      offer_price: offer,
      image_url: image,
    });
  }

  adjustment += totalPaise - (assigned + adjustment);
  if (adjustment > 0) {
    lines.push({
      sku: "PT-TAX-SHIP",
      variant_id: "tax-shipping",
      name: "GST and shipping",
      description: "GST and shipping",
      quantity: 1,
      price: adjustment,
      offer_price: adjustment,
    });
    assigned += adjustment;
  }

  if (assigned !== totalPaise) {
    throw new Error("Payment line items do not match the payable amount");
  }
  return lines;
}
