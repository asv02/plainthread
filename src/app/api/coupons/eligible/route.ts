import { NextResponse } from "next/server";
import { eligibleCheckoutCoupons } from "@/lib/shop/coupon";
import { listCoupons } from "@/lib/shop/coupon-store";
import { loadSkuPriceRows } from "@/lib/shop/sku-prices";
import type { CartLine } from "@/lib/shop/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: CartLine[];
      destinationState?: string;
    };
    const [coupons, rows] = await Promise.all([listCoupons(), loadSkuPriceRows()]);
    const offers = eligibleCheckoutCoupons(body.items ?? [], rows, coupons, {
      destinationState: typeof body.destinationState === "string" ? body.destinationState : undefined,
    });
    return NextResponse.json({ offers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load offers";
    return NextResponse.json({ error: message, offers: [] }, { status: 400 });
  }
}
