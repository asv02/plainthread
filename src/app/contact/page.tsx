import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { FadeIn } from "@/components/ui/FadeIn";
import { siteConfig } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Contact Plain Thread",
  description:
    "Contact Plain Thread for product questions, sizing help, or order support. Call the founder, speak to Akash Suryavanshi on 8090178921, email hello@plainthread.in, or message us on Instagram.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className="container-px py-10 md:py-16">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Contact" }]} />
      <FadeIn>
        <h1 className="font-serif text-4xl md:text-5xl">Contact</h1>
        <p className="mt-4 max-w-xl text-secondary">
          Questions about fit, fabric, marketplace listings, or a return within 7
          days of delivery? We are here.
        </p>
      </FadeIn>

      <div className="mt-12 max-w-3xl space-y-6">
        <a href={`tel:${siteConfig.support.phone}`} className="block border border-border p-6 transition hover:shadow-[var(--shadow)]">
          <p className="text-xs uppercase tracking-[0.18em] text-secondary">Call the founder</p>
          <p className="mt-3 font-serif text-2xl">
            {siteConfig.support.phone}
          </p>
          <p className="mt-2 text-sm text-secondary">
            {siteConfig.support.name} — {siteConfig.support.role}
          </p>
        </a>

        <div className="grid gap-6 md:grid-cols-2">
          <a
            href={`mailto:${siteConfig.email}`}
            className="border border-border p-6 transition hover:shadow-[var(--shadow)]"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-secondary">Email</p>
            <p className="mt-3 font-serif text-2xl">{siteConfig.email}</p>
          </a>
          <a
            href={siteConfig.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-border p-6 transition hover:shadow-[var(--shadow)]"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-secondary">Instagram</p>
            <p className="mt-3 font-serif text-2xl">@plainthread.in</p>
          </a>
        </div>
      </div>
    </div>
  );
}
