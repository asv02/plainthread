"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

type VariantStock = {
  product_slug: string;
  size: string;
  sku: string;
  stock: number;
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
  hydrated: boolean;
  addItem: (productSlug: string, size: string, qty?: number) => AddItemResult;
  setQty: (productSlug: string, size: string, qty: number) => void;
  removeItem: (productSlug: string, size: string) => void;
  clearCart: () => void;
  stockFor: (productSlug: string, size: string) => number | null;
  refreshStock: () => Promise<void>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [variants, setVariants] = useState<VariantStock[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(normalizeCart(JSON.parse(raw) as CartLine[]));
    } catch {
      setItems([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, ready]);

  const refreshStock = useCallback(async () => {
    const res = await fetch("/api/variants", { cache: "no-store" });
    const data = (await res.json()) as { variants?: VariantStock[] };
    setVariants(data.variants ?? []);
  }, []);

  useEffect(() => {
    void refreshStock();
  }, [refreshStock]);

  const addItem = useCallback((productSlug: string, size: string, qty = 1): AddItemResult => {
    let result: AddItemResult = { added: false, qtyAdded: 0, productSlug, size };
    setItems((current) => {
      const used = current.reduce((sum, item) => {
        if (item.productSlug === productSlug && item.size === size) return sum;
        return sum + item.qty;
      }, 0);
      const existing = current.find(
        (item) => item.productSlug === productSlug && item.size === size,
      );
      const nextQty = Math.min(
        MAX_LINE_QTY,
        MAX_ORDER_QTY - used,
        (existing?.qty ?? 0) + qty,
      );
      const qtyAdded = nextQty - (existing?.qty ?? 0);
      result = { added: qtyAdded > 0, qtyAdded, productSlug, size };
      if (qtyAdded < 1) return current;
      const next = existing
        ? current.map((item) =>
            item.productSlug === productSlug && item.size === size
              ? { ...item, qty: nextQty }
              : item,
          )
        : [...current, { productSlug, size, qty: nextQty }];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    return result;
  }, []);

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
      const nextQty = Math.min(MAX_LINE_QTY, MAX_ORDER_QTY - used, Math.floor(qty));
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
  }, []);

  const removeItem = useCallback((productSlug: string, size: string) => {
    setItems((current) =>
      current.filter((item) => !(item.productSlug === productSlug && item.size === size)),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const stockFor = useCallback(
    (productSlug: string, size: string) => {
      const row = variants.find(
        (variant) => variant.product_slug === productSlug && variant.size === size,
      );
      return row ? row.stock : null;
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
      hydrated: ready,
      addItem,
      setQty,
      removeItem,
      clearCart,
      stockFor,
      refreshStock,
    }),
    [items, count, variants, ready, addItem, setQty, removeItem, clearCart, stockFor, refreshStock],
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used within ShopProvider");
  return ctx;
}
