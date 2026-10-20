import { ProductCard } from "@/components/product/ProductCard";
import { ClarityPageView } from "@/components/analytics/ClarityPageView";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { products } from "@/data/products";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Shop Premium Oversized Essentials",
  description:
    "Shop Plain Thread oversized essentials. 220 GSM combed cotton tees in Black, White, and Pink. Size, add to cart, and checkout on this site.",
  path: "/shop",
});

export default function ShopPage() {
  return (
    <div className="container-px py-8 sm:py-10 md:py-16">
      <ClarityPageView event="view_collection" />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Shop" }]} />
      <FadeIn>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl">Shop</h1>
        <p className="mt-4 max-w-2xl text-base text-secondary sm:text-lg">
          Premium oversized essentials. Pick a colour and size, then checkout here.
        </p>
      </FadeIn>

      <div className="mt-10 grid gap-8 sm:mt-14 sm:grid-cols-2 sm:gap-10 md:grid-cols-3">
        {products.map((product, index) => (
          <ProductCard key={product.slug} product={product} index={index} />
        ))}
      </div>

      <FadeIn>
        <div className="mt-14 border border-border p-6 text-center sm:mt-20 sm:p-8 md:p-12">
          <h2 className="font-serif text-2xl sm:text-3xl">Need fit help?</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-secondary sm:text-base">
            Oversized by design. Check the size guide, then buy on this site.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button href="/size-guide">Size Guide</Button>
            <Button href="/care-guide" variant="secondary">
              Care Guide
            </Button>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
