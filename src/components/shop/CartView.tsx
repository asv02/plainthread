"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { getProduct } from "@/data/products";
import { useShop } from "@/components/shop/ShopProvider";
import { formatPrice } from "@/lib/utils";
import { MoneyRows } from "@/components/shop/MoneyRows";
import { QtyStepper } from "@/components/shop/QtyStepper";
import { usePricingQuote } from "@/components/shop/usePricingQuote";
import { MAX_LINE_QTY } from "@/data/shop";
import { trackClarityEvent } from "@/lib/clarity";
import { useClarityMountEvent } from "@/components/analytics/ClarityPageView";

export function CartView() {
  const router = useRouter();
  const { items, setQty, removeItem, pricePaiseFor, variantsLoaded, stockFor, setCheckoutIntent } = useShop();
  const { quote, error, loading } = usePricingQuote({ lines: items });
  useClarityMountEvent("view_cart");
  const rows = items.map((item) => {
    const product = getProduct(item.productSlug);
    const paise = pricePaiseFor(item.productSlug, item.size);
    const quoted = quote?.items.find(
      (line) => line.product_slug === item.productSlug && line.size === item.size,
    );
    return {
      ...item,
      name: product?.name ?? item.productSlug,
      unitPaise: quoted?.unit_price_paise ?? paise,
      image: product?.images[0]?.src,
    };
  });

  if (rows.length === 0) {
    return (
      <div className="border border-border p-8 text-center">
        <p className="text-secondary">Your cart is empty.</p>
        <Link href="/shop" className="mt-4 inline-block underline underline-offset-4">
          Continue shopping
        </Link>
      </div>
    );
  }

  const message = error;

  return (
    <div className="space-y-8">
      <ul className="divide-y divide-border border border-border">
        {rows.map((item) => (
          <li key={`${item.productSlug}-${item.size}`} className="flex gap-4 p-4 sm:p-5">
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="h-24 w-20 object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-sm text-secondary">Size {item.size}</p>
              <p className="mt-1 text-sm">
                {item.unitPaise != null
                  ? formatPrice(item.unitPaise / 100)
                  : variantsLoaded
                    ? "Price unavailable"
                    : "Loading price…"}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <QtyStepper
                  value={item.qty}
                  min={1}
                  max={Math.min(MAX_LINE_QTY, Math.max(item.qty, stockFor(item.productSlug, item.size) ?? MAX_LINE_QTY))}
                  onChange={(qty) => {
                    setQty(item.productSlug, item.size, qty);
                    if (qty !== item.qty) trackClarityEvent("cart_quantity_updated");
                  }}
                />
                <button
                  type="button"
                  className="text-sm underline underline-offset-4"
                  onClick={() => {
                    removeItem(item.productSlug, item.size);
                    trackClarityEvent("remove_from_cart");
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-sm space-y-4">
          <p className="text-xs text-secondary">Coupons are applied at checkout.</p>
          {message && <p className="text-sm text-red-700">{message}</p>}
          {loading && <p className="text-sm text-secondary">Updating total…</p>}
          {quote && (
            <MoneyRows
              goodsPaise={quote.subtotalPaise}
              discountPaise={0}
              couponCode={null}
              shippingPaise={quote.shippingPaise}
              tax={quote.tax}
              totalPaise={quote.totalPaise}
            />
          )}
        </div>
        {quote ? (
          <button
            type="button"
            onClick={() => {
              setCheckoutIntent({ type: "cart" });
              router.push("/checkout");
            }}
            className="inline-flex items-center justify-center bg-button px-6 py-3.5 text-sm tracking-wide text-white"
          >
            Checkout · {formatPrice(quote.totalPaise / 100)}
          </button>
        ) : (
          <p className="text-sm text-secondary">{loading ? "Calculating total…" : "Fix the cart to checkout."}</p>
        )}
      </div>
    </div>
  );
}
