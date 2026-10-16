import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SkuPriceRow } from "@/lib/shop/coupon";

export type VariantRow = {
  product_slug: string;
  size: string;
  sku: string;
  stock: number;
  price_paise: number | null;
};

export async function loadVariantRows(): Promise<VariantRow[]> {
  const { data, error } = await supabaseAdmin()
    .from("variants")
    .select("product_slug, size, sku, stock, price_paise")
    .order("product_slug")
    .order("size");
  if (error) throw new Error(error.message);
  return (data ?? []) as VariantRow[];
}

export async function loadSkuPriceRows(): Promise<SkuPriceRow[]> {
  const rows = await loadVariantRows();
  return rows
    .filter((row) => Number.isInteger(row.price_paise) && (row.price_paise ?? 0) > 0)
    .map((row) => ({
      product_slug: row.product_slug,
      size: row.size,
      sku: row.sku,
      price_paise: row.price_paise as number,
    }));
}
