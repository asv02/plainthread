import { AddToCart } from "@/components/shop/AddToCart";
import { ProductOffers } from "@/components/shop/ProductOffers";
import { ViewContentPixel } from "@/components/analytics/ViewContentPixel";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { FaqList } from "@/components/ui/FaqList";
import { FadeIn } from "@/components/ui/FadeIn";
import { JsonLd } from "@/components/seo/JsonLd";
import { getAllPosts } from "@/lib/blog";
import { getProduct, getRelatedProducts, products } from "@/data/products";
import { productFaqs } from "@/data/faqs";
import { loadVariantRows } from "@/lib/shop/sku-prices";
import { breadcrumbSchema, productSchema, type ProductSchemaCommerce } from "@/lib/schema";
import { buildMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return {};
  return buildMetadata({
    title: product.seo.title,
    description: product.seo.description,
    path: `/products/${product.slug}`,
    image: product.images[0].src,
    imageWidth: 853,
    imageHeight: 1280,
  });
}

async function loadCommerceFacts(slug: string): Promise<ProductSchemaCommerce> {
  try {
    const rows = (await loadVariantRows()).filter((row) => row.product_slug === slug);
    const priced = rows
      .map((row) => row.price_paise)
      .filter((paise): paise is number => paise != null && paise > 0);
    return {
      ...(priced.length > 0 ? { pricePaise: Math.min(...priced) } : {}),
      ...(rows.length > 0 ? { inStock: rows.some((row) => row.stock > 0) } : {}),
    };
  } catch {
    // Static catalog fallback keeps the page renderable without the database.
    return {};
  }
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  // Structured-data commerce facts come from the variants table when reachable;
  // when not, availability is omitted rather than asserted (see schema.ts).
  const commerce = await loadCommerceFacts(product.slug);

  const related = getRelatedProducts(slug);
  const posts = getAllPosts().slice(0, 3);

  return (
    <>
      <JsonLd
        data={[
          productSchema(product, commerce),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Products", path: "/products" },
            { name: product.name, path: `/products/${product.slug}` },
          ]),
        ]}
      />

      <article className="container-px py-8 sm:py-10 md:py-16">
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Products", href: "/products" },
            { name: product.shortName },
          ]}
        />

        {/* Hero: larger image column so full-body photos read clearly */}
        <div className="grid gap-8 md:gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start lg:gap-12 xl:gap-16">
          <div className="min-w-0">
            <ProductGallery product={product} />
          </div>

          <FadeIn delay={0.08} className="min-w-0 lg:sticky lg:top-24">
            <p className="text-xs uppercase tracking-[0.22em] text-secondary">
              {product.color}
            </p>
            <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl md:text-5xl">
              {product.name}
            </h1>
            <p className="mt-3 font-serif text-xl text-secondary sm:text-2xl">{product.headline}</p>
            <p className="mt-4 tracking-widest" aria-label={`${product.rating} stars`}>
              {"★".repeat(5)}{" "}
              <span className="text-sm tracking-normal text-secondary">
                {product.rating} · {product.reviewCount} reviews
              </span>
            </p>
            <p className="mt-2 text-sm text-secondary">
              {product.gsm} GSM · {product.fabric} · {product.fit}
            </p>

            <ViewContentPixel
              slug={product.slug}
              name={product.name}
              priceRupees={product.price}
            />
            <div className="mt-8">
              <AddToCart productSlug={product.slug} productName={product.name} />
              <ProductOffers productSlug={product.slug} />
            </div>

            <p className="mt-8 text-lg leading-8 text-secondary">
              Made for everyday comfort. No loud branding. No unnecessary graphics. Only
              timeless essentials.
            </p>

            <ul className="mt-8 space-y-3">
              {product.outcomes.map((item) => (
                <li key={item} className="flex gap-3 text-sm">
                  <Check size={16} className="mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>

            <ul className="mt-8 grid grid-cols-1 gap-3 text-sm text-secondary sm:grid-cols-2">
              {product.specs.map((spec) => (
                <li key={spec} className="border border-border px-3 py-2.5">
                  {spec}
                </li>
              ))}
            </ul>
          </FadeIn>
        </div>

        {/* About — long form for SEO */}
        <section className="mt-24 max-w-3xl">
          <h2 className="font-serif text-3xl md:text-4xl">About this tee</h2>
          <div className="prose-pt mt-6 whitespace-pre-line">{product.about}</div>
        </section>

        {/* Fabric */}
        <section className="mt-20 border-t border-border pt-16">
          <h2 className="font-serif text-3xl md:text-4xl">Why 220 GSM?</h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-secondary">
            Most fashion tees sit around 160–180 GSM and feel thin quickly. Our 220 GSM
            combed cotton keeps an oversized silhouette structured, breathes through the
            day, and stays soft after washing. Combed fibres, side seams, drop shoulders —
            details that show up in how it wears, not in a logo.
          </p>
          <Link href="/fabric" className="mt-6 inline-block text-sm underline underline-offset-4">
            Read the full fabric guide →
          </Link>
        </section>

        {/* Styling */}
        <section className="mt-20">
          <h2 className="font-serif text-3xl md:text-4xl">How to style it</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {product.styling.map((item) => (
              <li key={item} className="border border-border px-4 py-3 text-sm text-secondary">
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Care + Size links */}
        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          <Link href="/size-guide" className="border border-border p-6 transition hover:shadow-[var(--shadow)]">
            <h3 className="font-serif text-2xl">Size Guide</h3>
            <p className="mt-2 text-sm text-secondary">S to XXL · oversized fit chart</p>
          </Link>
          <Link href="/care-guide" className="border border-border p-6 transition hover:shadow-[var(--shadow)]">
            <h3 className="font-serif text-2xl">Care Guide</h3>
            <p className="mt-2 text-sm text-secondary">Cold wash · shade dry · lasting colour</p>
          </Link>
        </section>

        {/* FAQ */}
        <section className="mt-20">
          <h2 className="font-serif text-3xl md:text-4xl">Product FAQs</h2>
          <div className="mt-8">
            <FaqList items={productFaqs} />
          </div>
        </section>

        {/* Related articles */}
        {posts.length > 0 && (
          <section className="mt-20">
            <h2 className="font-serif text-3xl md:text-4xl">Related articles</h2>
            <ul className="mt-8 space-y-4">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group flex flex-col border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-serif text-xl group-hover:underline group-hover:underline-offset-4">
                      {post.title}
                    </span>
                    <span className="mt-1 text-sm text-secondary sm:mt-0">{post.category}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Related products */}
        <section className="mt-20">
          <h2 className="font-serif text-3xl md:text-4xl">More colours</h2>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            {related.map((p, i) => (
              <ProductCard key={p.slug} product={p} index={i} />
            ))}
          </div>
        </section>
      </article>
    </>
  );
}
