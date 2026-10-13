import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { ProductCard } from "@/components/product/ProductCard";
import { FaqList } from "@/components/ui/FaqList";
import { JsonLd } from "@/components/seo/JsonLd";
import { products } from "@/data/products";
import { reviews, whyPoints } from "@/data/content";
import { siteFaqs } from "@/data/faqs";
import { faqSchema } from "@/lib/schema";
import { buildMetadata } from "@/lib/seo";
import { siteConfig } from "@/data/site";

export const metadata = buildMetadata({
  title: "Premium Oversized T-Shirts | Plain Thread",
  description: siteConfig.description,
  path: "/",
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={faqSchema(siteFaqs.slice(0, 6))} />

      {/* HERO — preserve the existing copy and add the 15% editorial badge */}
      <section className="plain-thread-hero relative overflow-hidden border-b border-border bg-[#f8f2e9]">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 20% 20%, rgba(255,255,255,.94) 0%, rgba(255,255,255,.38) 42%, transparent 72%), linear-gradient(115deg, #fbf7f0 0%, #f4eadc 100%)",
          }}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 620 820"
          preserveAspectRatio="xMidYMid slice"
          className="plain-thread-hero-botanical pointer-events-none absolute -right-20 -top-10 h-[115%] w-[62%] text-[#77674f] opacity-[0.2] blur-[1px] sm:right-0 sm:w-[55%]"
          fill="none"
        >
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M650 -30 C520 100 590 205 460 320 S410 520 270 650 S180 760 110 860" />
            <path d="M560 95 C490 50 450 58 420 105 C475 126 520 122 560 95Z" fill="currentColor" fillOpacity=".36" stroke="none" />
            <path d="M510 175 C440 138 398 155 380 203 C435 220 478 209 510 175Z" fill="currentColor" fillOpacity=".34" stroke="none" />
            <path d="M485 264 C545 210 589 226 606 267 C565 298 521 295 485 264Z" fill="currentColor" fillOpacity=".3" stroke="none" />
            <path d="M430 345 C360 300 319 318 300 364 C353 384 399 378 430 345Z" fill="currentColor" fillOpacity=".32" stroke="none" />
            <path d="M405 438 C465 385 510 403 526 445 C484 476 441 469 405 438Z" fill="currentColor" fillOpacity=".3" stroke="none" />
            <path d="M345 525 C280 486 240 505 220 550 C271 570 315 563 345 525Z" fill="currentColor" fillOpacity=".32" stroke="none" />
            <path d="M300 620 C360 566 405 582 423 625 C383 657 337 653 300 620Z" fill="currentColor" fillOpacity=".3" stroke="none" />
            <path d="M235 706 C170 665 132 686 112 729 C162 749 205 742 235 706Z" fill="currentColor" fillOpacity=".3" stroke="none" />
          </g>
        </svg>
        <div className="container-px relative z-10 grid min-h-[min(88vh,820px)] items-center gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-6">
          <div className="relative z-10">
            <FadeIn>
              <p className="font-serif text-[1.75rem] tracking-[0.12em] text-foreground sm:text-5xl md:text-6xl">
                PLAIN THREAD
              </p>
            </FadeIn>
            <FadeIn delay={0.08}>
              <h1 className="mt-6 max-w-3xl font-serif text-[1.65rem] leading-tight text-foreground sm:mt-8 sm:text-4xl md:text-5xl">
                Premium Oversized T-Shirts Made With 220 GSM Combed Cotton
              </h1>
            </FadeIn>
            <FadeIn delay={0.14}>
              <p className="mt-5 max-w-xl text-base leading-7 text-secondary sm:mt-6 sm:text-lg sm:leading-8">
                Oversized Essentials, Made Better. Minimal. Comfortable. Built to Last.
              </p>
            </FadeIn>
            <FadeIn delay={0.2}>
              <p className="mt-4 text-[0.7rem] tracking-[0.14em] text-secondary uppercase sm:text-sm sm:tracking-[0.18em]">
                220 GSM · 100% Combed Cotton · Chemical Safe
              </p>
            </FadeIn>
            <FadeIn delay={0.26}>
              <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row">
                <Button href="/collections/oversized-tshirts">Shop Collection</Button>
                <Button href="/why-plain-thread" variant="secondary">
                  Why Plain Thread
                </Button>
              </div>
            </FadeIn>
          </div>

          <FadeIn delay={0.18}>
            <div className="relative mx-auto flex w-full max-w-[390px] items-center justify-center py-3 sm:py-6 lg:max-w-none lg:py-0">
              <div
                className="plain-thread-discount-seal flex aspect-square w-[min(72vw,330px)] flex-col items-center justify-center rounded-full text-center sm:w-[min(42vw,360px)] lg:w-[min(30vw,360px)]"
                role="img"
                aria-label="Flat 15 percent off on all T-shirts"
              >
                <span className="pl-[0.42em] text-xs font-medium tracking-[0.42em] text-[#594a3b] sm:text-sm">
                  FLAT
                </span>
                <span className="mt-2 font-serif text-[5.2rem] leading-[0.88] tracking-[-0.07em] text-[#4c3d2e] sm:text-8xl lg:text-[7.5rem]">
                  15%
                </span>
                <span className="mt-1 font-serif text-5xl leading-none tracking-[0.02em] text-[#4c3d2e] sm:text-6xl lg:text-7xl">
                  OFF
                </span>
                <span className="mt-5 pl-[0.28em] text-[0.62rem] font-medium tracking-[0.2em] text-[#594a3b] sm:text-xs sm:tracking-[0.28em] sm:pl-[0.28em]">
                  ON ALL T-SHIRTS
                </span>
                <span className="mt-3 h-px w-8 bg-[#9d8973]" aria-hidden="true" />
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* COLLECTION */}
      <section className="container-px py-16 sm:py-24 md:py-32">
        <FadeIn>
          <p className="text-xs uppercase tracking-[0.2em] text-secondary">Our Collection</p>
          <h2 className="mt-3 font-serif text-3xl text-foreground sm:text-4xl md:text-5xl">
            Three essentials. One standard.
          </h2>
          <p className="mt-4 max-w-xl text-secondary">
            Black. White. Pink. Each crafted with the same 220 GSM combed cotton —
            choose colour, not compromise.
          </p>
        </FadeIn>
        <div className="mt-10 grid gap-8 sm:mt-14 sm:grid-cols-2 md:grid-cols-3 md:gap-10">
          {products.map((product, index) => (
            <ProductCard key={product.slug} product={product} index={index} />
          ))}
        </div>
      </section>

      {/* WHY */}
      <section className="border-y border-border bg-muted/50 py-16 sm:py-24 md:py-32">
        <div className="container-px">
          <FadeIn>
            <h2 className="font-serif text-3xl text-foreground sm:text-4xl md:text-5xl">Why Plain Thread</h2>
            <p className="mt-4 max-w-2xl text-secondary">
              Humans buy outcomes — not specifications. Softness, structure, breathability,
              and a silhouette that stays true.
            </p>
          </FadeIn>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {whyPoints.map((point, i) => (
              <FadeIn key={point.title} delay={i * 0.05}>
                <div className="border border-border bg-card p-6 shadow-[var(--shadow)]">
                  <div className="flex items-start gap-3">
                    <Check className="mt-1 shrink-0 text-foreground" size={18} />
                    <div>
                      <h3 className="font-serif text-2xl">{point.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-secondary">{point.detail}</p>
                    </div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
          <div className="mt-10">
            <Button href="/why-plain-thread" variant="ghost">
              Read the full story →
            </Button>
          </div>
        </div>
      </section>

      {/* FEATURED PRODUCT */}
      <section className="container-px py-16 sm:py-24 md:py-32">
        <div className="grid items-center gap-8 sm:gap-12 lg:grid-cols-2">
          <FadeIn>
            <div className="relative aspect-[2/3] overflow-hidden bg-[#f5f5f5] shadow-[var(--shadow)]">
              <Image
                src={products[0].images[0].src}
                alt={products[0].images[0].alt}
                fill
                className="object-contain object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            </div>
          </FadeIn>
          <FadeIn delay={0.1}>
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">Featured</p>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl md:text-5xl">{products[0].name}</h2>
            <p className="mt-2 tracking-widest">★★★★★</p>
            <p className="mt-6 text-lg leading-8 text-secondary">
              Made for everyday comfort. No loud branding. No unnecessary graphics. Only
              timeless essentials.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-foreground">
              {products[0].outcomes.slice(0, 4).map((item) => (
                <li key={item} className="flex gap-3">
                  <Check size={16} className="mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <Button href={`/products/${products[0].slug}`}>View Black Oversized Tee</Button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* HEALTHY FABRIC */}
      <section className="border-y border-border py-16 sm:py-24 md:py-32">
        <div className="container-px grid gap-10 lg:grid-cols-2 lg:items-end">
          <FadeIn>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl">Healthy Fabric</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-secondary">
              Combed cotton removes short fibres that cause roughness. Chemical-safe dyes
              stay gentle on skin. 220 GSM gives structure without relying on synthetics.
            </p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["220 GSM", "Premium mid-weight"],
                ["100% Cotton", "No polyester blend"],
                ["Combed", "Smoother yarn"],
                ["Pre-shrunk", "Fit that lasts"],
              ].map(([title, copy]) => (
                <div key={title} className="border border-border p-5">
                  <p className="font-serif text-xl">{title}</p>
                  <p className="mt-2 text-secondary">{copy}</p>
                </div>
              ))}
            </div>
            <Link
              href="/fabric"
              className="mt-6 inline-block text-sm underline underline-offset-4"
            >
              Explore the fabric story →
            </Link>
          </FadeIn>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="container-px py-16 sm:py-24 md:py-32">
        <FadeIn>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl">What people notice</h2>
        </FadeIn>
        <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {reviews.map((review, i) => (
            <FadeIn key={review.author} delay={i * 0.05}>
              <blockquote className="h-full border border-border bg-card p-6 shadow-[var(--shadow)]">
                <p className="text-sm tracking-widest">{"★".repeat(review.rating)}</p>
                <p className="mt-4 text-sm leading-7 text-secondary">&ldquo;{review.text}&rdquo;</p>
                <footer className="mt-6 text-sm text-foreground">— {review.author}</footer>
              </blockquote>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* SHOP CTA */}
      <section className="border-y border-border bg-foreground text-white">
        <div className="container-px py-14 text-center sm:py-20 md:py-28">
          <FadeIn>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl">Shop Now</h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-white/70 sm:text-base">
              Choose your colour, pick a size, and checkout on this site. Prepaid UPI, cards, and netbanking.
            </p>
            <div className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <Button
                href="/shop"
                className="bg-white text-foreground hover:bg-white/90"
              >
                Explore Collection
              </Button>
              <Button
                href="/collections/oversized-tshirts"
                variant="secondary"
                className="border-white bg-transparent text-white hover:bg-white/10"
              >
                View Oversized Tees
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-px py-16 sm:py-24 md:py-32">
        <FadeIn>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl">FAQ</h2>
          <p className="mt-4 text-secondary">Straight answers before you buy.</p>
        </FadeIn>
        <div className="mt-10">
          <FaqList items={siteFaqs.slice(0, 6)} />
        </div>
        <div className="mt-8">
          <Button href="/faq" variant="ghost">
            See all FAQs →
          </Button>
        </div>
      </section>
    </>
  );
}
