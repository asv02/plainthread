import Link from "next/link";
import { ClarityPageView } from "@/components/analytics/ClarityPageView";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { FadeIn } from "@/components/ui/FadeIn";
import { StarRating } from "@/components/ui/StarRating";
import { JsonLd } from "@/components/seo/JsonLd";
import { products } from "@/data/products";
import { formatPrice } from "@/lib/utils";
import { formatPaise, offerDisplay, rupeesToPaise, savingsLabel } from "@/lib/shop/price-display";
import { breadcrumbSchema } from "@/lib/schema";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Oversized T-Shirts Collection | Plain Thread",
  description:
    "Explore the Plain Thread oversized t-shirts collection — Black, White, and Pink essentials in 220 GSM combed cotton.",
  path: "/collections/oversized-tshirts",
});

export default function CollectionPage() {
  return (
    <>
      <ClarityPageView event="view_collection" />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Collections", path: "/collections/oversized-tshirts" },
          { name: "Oversized T-Shirts", path: "/collections/oversized-tshirts" },
        ])}
      />
      <div className="container-px py-10 md:py-16">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Collections" },
            { name: "Oversized T-Shirts" },
          ]}
        />
        <FadeIn>
          <h1 className="font-serif text-4xl md:text-5xl">Oversized T-Shirts</h1>
          <p className="mt-4 max-w-2xl text-secondary">
            Large premium cards. Each colour links to its own product URL for stronger
            internal linking and SEO.
          </p>
        </FadeIn>

        <div className="mt-14 space-y-16">
          {products.map((product, index) => {
            const offer = offerDisplay(rupeesToPaise(product.price), product.compareAtPrice);
            const saving = savingsLabel(offer);
            return (
              <FadeIn key={product.slug} delay={index * 0.05}>
                <Link
                  href={`/products/${product.slug}`}
                  className="group grid items-center gap-8 border-b border-border pb-16 lg:grid-cols-2"
                >
                  <div className="relative aspect-[2/3] overflow-hidden bg-[#f5f5f5] shadow-[var(--shadow)]">
                    <Image
                      src={product.images[0].src}
                      alt={product.images[0].alt}
                      fill
                      className="object-contain object-center transition duration-700 [@media(hover:hover)]:group-hover:scale-[1.03]"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-secondary">
                      {product.color}
                    </p>
                    <h2 className="mt-3 font-serif text-3xl sm:text-4xl">
                      {product.color} Oversized Tee
                    </h2>
                    <StarRating rating={product.rating} reviewCount={product.reviewCount} className="mt-3" />
                    <p className="mt-4 text-secondary">220 GSM · Premium Combed Cotton</p>
                    <p className="mt-4 flex items-baseline gap-2 text-lg">
                      <span className="text-foreground">{formatPrice(product.price)}</span>
                      {offer?.referencePaise != null && (
                        <span className="text-sm text-secondary line-through">
                          <span className="sr-only">Reference price </span>
                          {formatPaise(offer.referencePaise)}
                        </span>
                      )}
                    </p>
                    {saving && (
                      <p className="mt-1 text-sm text-secondary">
                        Save {saving.rupees}
                        {saving.percent >= 1 ? ` (${saving.percent}%)` : ""}
                      </p>
                    )}
                    <p className="mt-6 max-w-md leading-7 text-secondary">{product.description}</p>
                    <p className="mt-8 text-sm underline-offset-4 group-hover:underline">
                      View Details →
                    </p>
                  </div>
                </Link>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </>
  );
}
