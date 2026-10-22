import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { FadeIn } from "@/components/ui/FadeIn";
import { SizeGuideContent } from "@/components/shop/SizeGuideContent";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Size Guide | Oversized T-Shirt Fit",
  description:
    "Plain Thread oversized t-shirt size guide — garment measurements in cm for S to XXL including flat chest, chest circumference, length, shoulder, and sleeve.",
  path: "/size-guide",
});

export default function SizeGuidePage() {
  return (
    <div className="container-px py-8 sm:py-10 md:py-16">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Size Guide" }]} />
      <FadeIn>
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl">Size Guide</h1>
        <div className="mt-6 max-w-3xl">
          <SizeGuideContent />
        </div>
      </FadeIn>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button href="/shop">Shop Collection</Button>
        <Button href="/care-guide" variant="secondary">
          Care Guide
        </Button>
      </div>
    </div>
  );
}
