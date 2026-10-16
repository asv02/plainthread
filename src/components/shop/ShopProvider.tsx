"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isShopSize, MAX_LINE_QTY, MAX_ORDER_QTY } from "@/data/shop";
import type { CartLine } from "@/lib/shop/types";

function normalizeCart(items: CartLine[]): CartLine[] {
  const next: CartLine[] = [];
  let remaining = MAX_ORDER_QTY;
  for (const item of items) {
    if (!item?.productSlug || !isShopSize(item.size)) continue;
    const qty = Math.min(
      MAX_LINE_QTY,
      Math.max(0, Math.floor(Number(item.qty) || 0)),
    );
    if (qty < 1 || remaining < 1) continue;
    const take = Math.min(qty, remaining);
    remaining -= take;
    next.push({ productSlug: item.productSlug, size: item.size, qty: take });
  }
  return next;
}

const STORAGE_KEY = "plain-thread-cart-v1";
const COUPON_KEY = "plain-thread-coupon-v1";
const INTENT_KEY = "plain-thread-checkout-intent-v1";

export type CheckoutIntent =
  | { type: "cart" }
  | { type: "buyNow"; productSlug: string; size: string };

function sameIntent(a: CheckoutIntent, b: CheckoutIntent) {
  if (a.type !== b.type) return false;
  if (a.type === "cart" || b.type === "cart") return true;
  return a.productSlug === b.productSlug && a.size === b.size;
}

function normalizeIntent(raw: unknown): CheckoutIntent {
  if (raw && typeof raw === "object") {
    const value = raw as { type?: unknown; productSlug?: unknown; size?: unknown };
    if (
      value.type === "buyNow" &&
      typeof value.productSlug === "string" &&
      value.productSlug &&
      typeof value.size === "string" &&
      isShopSize(value.size)
    ) {
      return { type: "buyNow", productSlug: value.productSlug, size: value.size };
    }
  }
  return { type: "cart" };
}

type VariantStock = {
  product_slug: string;
  size: string;
  sku: string;
  stock: number;
  price_paise?: number | null;
};

export type AddItemResult = {
  added: boolean;
  qtyAdded: number;
  productSlug: string;
  size: string;
};

type ShopContextValue = {
  items: CartLine[];
  count: number;
  variants: VariantStock[];
  variantsLoaded: boolean;
  hydrated: boolean;
  couponCode: string | null;
  checkoutIntent: CheckoutIntent;
  setCheckoutIntent: (intent: CheckoutIntent) => void;
  addItem: (productSlug: string, size: string, qty?: number) => AddItemResult;
  setQty: (productSlug: string, size: string, qty: number) => void;
  removeItem: (productSlug: string, size: string) => void;
  clearCart: () => void;
  setCouponCode: (code: string) => void;
  clearCoupon: () => void;
  stockFor: (productSlug: string, size: string) => number | null;
  pricePaiseFor: (productSlug: string, size?: string) => number | null;
  refreshStock: () => Promise<void>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const itemsRef = useRef<CartLine[]>([]);
  const [variants, setVariants] = useState<VariantStock[]>([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);
  const [couponCode, setCouponState] = useState<string | null>(null);
  const [checkoutIntent, setIntentState] = useState<CheckoutIntent>({ type: "cart" });
  const intentRef = useRef<CheckoutIntent>({ type: "cart" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(normalizeCart(JSON.parse(raw) as CartLine[]));
      const savedCoupon = sessionStorage.getItem(COUPON_KEY);
      if (savedCoupon) setCouponState(savedCoupon);
      const savedIntent = sessionStorage.getItem(INTENT_KEY);
      if (savedIntent) {
        const loaded = normalizeIntent(JSON.parse(savedIntent) as unknown);
        intentRef.current = loaded;
        setIntentState(loaded);
      }
    } catch {
      setItems([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const variantsRef = useRef<VariantStock[]>([]);

  useEffect(() => {
    variantsRef.current = variants;
  }, [variants]);

  useEffect(() => {
    if (!ready) return;
    if (couponCode) sessionStorage.setItem(COUPON_KEY, couponCode);
    else sessionStorage.removeItem(COUPON_KEY);
  }, [couponCode, ready]);

  const refreshStock = useCallback(async () => {
    try {
      const res = await fetch("/api/variants", { cache: "no-store" });
      const data = (await res.json()) as { variants?: VariantStock[] };
      setVariants(data.variants ?? []);
    } finally {
      setVariantsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshStock();
  }, [refreshStock]);

  const stockOf = useCallback((productSlug: string, size: string) => {
    const row = variantsRef.current.find(
      (variant) => variant.product_slug === productSlug && variant.size === size,
    );
    return row ? row.stock : null;
  }, []);

  const addItem = useCallback((productSlug: string, size: string, qty = 1): AddItemResult => {
    const current = itemsRef.current;
    const used = current.reduce((sum, item) => {
      if (item.productSlug === productSlug && item.size === size) return sum;
      return sum + item.qty;
    }, 0);
    const existing = current.find(
      (item) => item.productSlug === productSlug && item.size === size,
    );
    const stock = stockOf(productSlug, size);
    const nextQty = Math.min(
      MAX_LINE_QTY,
      MAX_ORDER_QTY - used,
      stock != null ? stock : MAX_LINE_QTY,
      (existing?.qty ?? 0) + qty,
    );
    const qtyAdded = nextQty - (existing?.qty ?? 0);
    const result = { added: qtyAdded > 0, qtyAdded, productSlug, size };
    if (qtyAdded < 1) return result;
    const next = existing
      ? current.map((item) =>
          item.productSlug === productSlug && item.size === size
            ? { ...item, qty: nextQty }
            : item,
        )
      : [...current, { productSlug, size, qty: nextQty }];
    itemsRef.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setItems(next);
    return result;
  }, [stockOf]);

  const setQty = useCallback((productSlug: string, size: string, qty: number) => {
    setItems((current) => {
      if (qty < 1) {
        return current.filter(
          (item) => !(item.productSlug === productSlug && item.size === size),
        );
      }
      const used = current.reduce((sum, item) => {
        if (item.productSlug === productSlug && item.size === size) return sum;
        return sum + item.qty;
      }, 0);
      const existingQty = current.find(
        (item) => item.productSlug === productSlug && item.size === size,
      )?.qty ?? 0;
      const stock = stockOf(productSlug, size);
      const requested = Math.floor(qty);
      const capped = stock != null && requested > stock
        ? Math.max(stock, existingQty)
        : requested;
      const nextQty = Math.min(MAX_LINE_QTY, MAX_ORDER_QTY - used, capped);
      if (nextQty < 1) {
        return current.filter(
          (item) => !(item.productSlug === productSlug && item.size === size),
        );
      }
      return current.map((item) =>
        item.productSlug === productSlug && item.size === size
          ? { ...item, qty: nextQty }
          : item,
      );
    });
  }, [stockOf]);

  const removeItem = useCallback((productSlug: string, size: string) => {
    setItems((current) =>
      current.filter((item) => !(item.productSlug === productSlug && item.size === size)),
    );
  }, []);

  const setCheckoutIntent = useCallback((next: CheckoutIntent) => {
    if (sameIntent(intentRef.current, next)) return;
    intentRef.current = next;
    try {
      if (next.type === "buyNow") sessionStorage.setItem(INTENT_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(INTENT_KEY);
    } catch {
      // ignore
    }
    setIntentState(next);
    // Flows stay isolated: a coupon picked for one checkout never carries into the other.
    setCouponState(null);
  }, []);

  const clearCart = useCallback(() => {
    itemsRef.current = [];
    setItems([]);
    setCouponState(null);
    setCheckoutIntent({ type: "cart" });
  }, [setCheckoutIntent]);

  const setCouponCode = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
    setCouponState(normalized || null);
  }, []);

  const clearCoupon = useCallback(() => setCouponState(null), []);

  const stockFor = useCallback(
    (productSlug: string, size: string) => {
      const row = variants.find(
        (variant) => variant.product_slug === productSlug && variant.size === size,
      );
      return row ? row.stock : null;
    },
    [variants],
  );

  const pricePaiseFor = useCallback(
    (productSlug: string, size?: string) => {
      const matches = variants.filter(
        (variant) =>
          variant.product_slug === productSlug &&
          Number.isInteger(variant.price_paise) &&
          (variant.price_paise ?? 0) > 0,
      );
      if (size) {
        return matches.find((variant) => variant.size === size)?.price_paise ?? null;
      }
      return matches[0]?.price_paise ?? null;
    },
    [variants],
  );

  const count = useMemo(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      count,
      variants,
      variantsLoaded,
      hydrated: ready,
      couponCode,
      checkoutIntent,
      setCheckoutIntent,
      addItem,
      setQty,
      removeItem,
      clearCart,
      setCouponCode,
      clearCoupon,
      stockFor,
      pricePaiseFor,
      refreshStock,
    }),
    [
      items,
      count,
      variants,
      variantsLoaded,
      ready,
      couponCode,
      checkoutIntent,
      setCheckoutIntent,
      addItem,
      setQty,
      removeItem,
      clearCart,
      setCouponCode,
      clearCoupon,
      stockFor,
      pricePaiseFor,
      refreshStock,
    ],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}
