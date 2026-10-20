"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/data/products";
import { trackClarityEvent } from "@/lib/clarity";
import { cn } from "@/lib/utils";

export function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const current = product.images[active] ?? product.images[0];

  return (
    <div className="w-full space-y-3 sm:space-y-4">
      {/* Tall frame + object-contain keeps full-body shots visible on all viewports */}
      <div className="relative h-[min(72vh,640px)] w-full overflow-hidden bg-[#f5f5f5] shadow-[var(--shadow)] sm:h-[min(75vh,720px)] lg:h-[min(80vh,860px)]">
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          fill
          priority={active === 0}
          className="object-contain object-center transition duration-500"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 100vw, 58vw"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-5 sm:gap-3 sm:overflow-visible md:grid-cols-4 lg:grid-cols-5">
        {product.images.map((img, index) => (
          <button
            key={img.src}
            type="button"
            onClick={() => {
              setActive(index);
              if (index !== active) trackClarityEvent("product_image_interaction");
            }}
            aria-label={`View image ${index + 1}`}
            aria-pressed={active === index}
            className={cn(
              "relative h-20 w-16 shrink-0 overflow-hidden bg-[#f5f5f5] transition sm:h-auto sm:w-auto sm:aspect-[3/4]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
              active === index
                ? "ring-2 ring-foreground ring-offset-2"
                : "opacity-80 hover:opacity-100",
            )}
          >
            <Image
              src={img.src}
              alt={img.alt}
              fill
              className="object-contain object-center"
              sizes="(max-width: 768px) 64px, 12vw"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
