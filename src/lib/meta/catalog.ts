/** Product-level catalog IDs. Size/SKU variants are not distinct catalog items yet. */
export const META_CONTENT_TYPE = "product" as const;
export const META_CONTENT_CATEGORY = "Oversized T-Shirts";
export const META_CURRENCY = "INR" as const;

export function catalogProductId(productSlug: string) {
  return productSlug.trim();
}

export type MetaContentItem = {
  id: string;
  quantity: number;
  item_price: number;
};

export function paiseToRupees(paise: number) {
  return Math.round(paise) / 100;
}
