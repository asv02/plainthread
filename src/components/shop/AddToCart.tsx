"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHOP_SIZES } from "@/data/shop";
import { useShop } from "@/components/shop/ShopProvider";
import { getProduct } from "@/data/products";
import { catalogProductId } from "@/lib/meta/catalog";
import { trackAddToCart } from "@/lib/meta-pixel-client";
import { cn, formatPrice } from "@/lib/utils";

export function AddToCart({
  productSlug,
  productName,
}: {
  productSlug: string;
  productName: string;
}) {
  const router = useRouter();
  const { addItem, setCheckoutIntent, stockFor, pricePaiseFor, variantsLoaded } = useShop();
  const [size, setSize] = useState<(typeof SHOP_SIZES)[number]>("M");
  const [message, setMessage] = useState("");
  const stock = stockFor(productSlug, size);
  const soldOut = stock === 0;
  const product = getProduct(productSlug);
  const unitPaise = pricePaiseFor(productSlug, size);

  function selectSize(option: (typeof SHOP_SIZES)[number]) {
    setSize(option);
    setMessage("");
  }

  return (
    <div className="space-y-4">
      <p className="flex items-baseline gap-3 text-lg">
        {product?.compareAtPrice != null && (
          <span className="text-sm text-secondary line-through">
            {formatPrice(product.compareAtPrice)}
          </span>
        )}
        <span className="text-foreground">
          {unitPaise != null
            ? formatPrice(unitPaise / 100)
            : variantsLoaded
              ? "Price unavailable"
              : "Loading price…"}
        </span>
      </p>
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Size</p>
          <Link href="/size-guide" className="text-xs text-secondary underline underline-offset-4">
            Size guide
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SHOP_SIZES.map((option) => {
            const optionStock = stockFor(productSlug, option);
            const unavailable = optionStock === 0;
            return (
              <button
                key={option}
                type="button"
                disabled={unavailable}
                onClick={() => selectSize(option)}
                className={cn(
                  "min-w-12 border px-3 py-2 text-sm",
                  size === option
                    ? "border-foreground bg-button text-white"
                    : "border-border bg-card",
                  unavailable && "cursor-not-allowed opacity-40",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-secondary">
          {stock == null
            ? "Checking stock…"
            : soldOut
              ? "Sold out in this size"
              : `${stock} left in ${size}`}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={soldOut || stock == null}
          onClick={() => {
            setCheckoutIntent({ type: "buyNow", productSlug, size });
            router.push("/checkout");
          }}
          className="inline-flex flex-1 items-center justify-center bg-button px-6 py-3.5 text-sm tracking-wide text-white disabled:opacity-40"
        >
          Buy now
        </button>
        <button
          type="button"
          disabled={soldOut || stock == null}
          onClick={() => {
            const result = addItem(productSlug, size, 1);
            if (result.added && product) {
              trackAddToCart({
                id: catalogProductId(productSlug),
                quantity: result.qtyAdded,
                itemPriceRupees: (unitPaise ?? Math.round(product.price * 100)) / 100,
              });
              setMessage(`${productName} · ${size} added to cart`);
            } else if (stock != null) {
              setMessage(`Only ${stock} left in ${size} — that is the most you can order.`);
            } else {
              setMessage("You already have the maximum of this item in your cart.");
            }
          }}
          className="inline-flex flex-1 items-center justify-center border border-foreground px-6 py-3.5 text-sm tracking-wide disabled:opacity-40"
        >
          Add to cart
        </button>
      </div>
      {message && <p className="text-sm text-secondary">{message}</p>}
    </div>
  );
}
