"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Product } from "@/data/products";
import { formatPrice } from "@/lib/utils";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      whileHover={{ y: -8 }}
      className="group [@media(hover:none)]:transform-none"
    >
      <Link href={`/products/${product.slug}`} className="block">
        <div className="overflow-hidden bg-[#f5f5f5] shadow-[var(--shadow)]">
          <div className="relative aspect-[2/3] overflow-hidden">
            <Image
              src={product.images[0].src}
              alt={product.images[0].alt}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-contain object-center transition duration-700 [@media(hover:hover)]:group-hover:scale-[1.03]"
            />
          </div>
        </div>
        <div className="pt-4 sm:pt-5">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">{product.color}</p>
          <h3 className="mt-2 font-serif text-xl text-foreground sm:text-2xl">Oversized Tee</h3>
          <p className="mt-1 text-sm text-secondary">220 GSM</p>
          <p className="mt-2 flex items-baseline gap-2 text-sm">
            {product.compareAtPrice != null && (
              <span className="text-secondary line-through">{formatPrice(product.compareAtPrice)}</span>
            )}
            <span className="text-foreground">{formatPrice(product.price)}</span>
          </p>
          <p
            className="mt-2 text-sm tracking-widest text-foreground"
            aria-label={`${product.rating} out of 5 stars`}
          >
            {"★".repeat(5)}
          </p>
          <p className="mt-4 text-sm text-foreground transition group-hover:underline group-hover:underline-offset-4">
            View Details →
          </p>
        </div>
      </Link>
    </motion.article>
  );
}
