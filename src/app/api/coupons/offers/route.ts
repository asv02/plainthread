import { NextResponse } from "next/server";
import { offerCondition } from "@/lib/shop/coupon";
import { listCoupons } from "@/lib/shop/coupon-store";

export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get("productSlug")?.trim() ?? "";
    if (!slug) return NextResponse.json({ offers: [] });
    const coupons = await listCoupons();
    const offers = coupons
      .filter(
        (coupon) =>
          coupon.isEnabled &&
          (coupon.eligibleProductSlugs.length === 0 || coupon.eligibleProductSlugs.includes(slug)),
      )
      .map((coupon) => ({
        code: coupon.code,
        discountPercent: coupon.discountPercent,
        eligibilityType: coupon.eligibilityType,
        minCartValuePaise: coupon.minCartValuePaise,
        minQuantity: coupon.minQuantity,
        condition: offerCondition(coupon),
      }));
    return NextResponse.json({ offers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load offers";
    return NextResponse.json({ error: message, offers: [] }, { status: 500 });
  }
}
