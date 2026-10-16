import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { expireStaleOrders } from "@/lib/shop/orders";
import { errMessage, log } from "@/lib/log";

export async function GET() {
  try {
    log.info("variants", "start");
    await expireStaleOrders();
    log.info("variants", "expired stale holds");
    const { data, error } = await supabaseAdmin()
      .from("variants")
      .select("product_slug, size, sku, stock, price_paise")
      .order("product_slug")
      .order("size");
    if (error) throw new Error(error.message);
    log.info("variants", "loaded", { count: (data ?? []).length });
    return NextResponse.json({ variants: data ?? [] });
  } catch (error) {
    log.error("variants", "failed", { error: errMessage(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load stock" },
      { status: 500 },
    );
  }
}
