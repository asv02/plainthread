import { NextResponse } from "next/server";
import { quoteAuthoritativeCart } from "@/lib/shop/quote-service";
import { assertCheckoutIntentMatchesLines, parseCheckoutIntent } from "@/lib/shop/coupon";
import type { CartLine } from "@/lib/shop/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: CartLine[];
      couponCode?: string;
      destinationState?: string;
      checkoutIntent?: unknown;
    };
    const items = body.items ?? [];
    assertCheckoutIntentMatchesLines(parseCheckoutIntent(body.checkoutIntent), items);
    const quote = await quoteAuthoritativeCart(items, {
      destinationState: typeof body.destinationState === "string" ? body.destinationState : undefined,
      couponCode: typeof body.couponCode === "string" ? body.couponCode : null,
    });
    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not price cart";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
