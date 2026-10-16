import type { CouponConfig } from "@/lib/shop/coupon";
import { normalizeCouponCode } from "@/lib/shop/coupon";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CouponRow = {
  id: string;
  code: string;
  discount_percent: number;
  eligibility_type: "MIN_CART_VALUE" | "MIN_QUANTITY";
  min_cart_value_paise: number | null;
  min_quantity: number | null;
  eligible_product_slugs: string[] | null;
  is_enabled: boolean;
};

export function couponFromRow(row: CouponRow): CouponConfig {
  return {
    id: row.id,
    code: row.code,
    discountPercent: row.discount_percent,
    eligibilityType: row.eligibility_type,
    minCartValuePaise: row.min_cart_value_paise,
    minQuantity: row.min_quantity,
    eligibleProductSlugs: row.eligible_product_slugs ?? [],
    isEnabled: row.is_enabled,
  };
}

export async function listCoupons() {
  const { data, error } = await supabaseAdmin()
    .from("coupons")
    .select(
      "id, code, discount_percent, eligibility_type, min_cart_value_paise, min_quantity, eligible_product_slugs, is_enabled",
    )
    .order("code");
  if (error) throw new Error(error.message);
  return ((data ?? []) as CouponRow[]).map(couponFromRow);
}

export async function loadCouponByCode(rawCode: string) {
  const code = normalizeCouponCode(rawCode);
  if (!code) return null;
  const { data, error } = await supabaseAdmin()
    .from("coupons")
    .select(
      "id, code, discount_percent, eligibility_type, min_cart_value_paise, min_quantity, eligible_product_slugs, is_enabled",
    )
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return couponFromRow(data as CouponRow);
}

export function couponInsert(coupon: CouponConfig) {
  return {
    code: coupon.code,
    discount_percent: coupon.discountPercent,
    eligibility_type: coupon.eligibilityType,
    min_cart_value_paise: coupon.minCartValuePaise,
    min_quantity: coupon.minQuantity,
    eligible_product_slugs: coupon.eligibleProductSlugs,
    is_enabled: coupon.isEnabled,
  };
}
