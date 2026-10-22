import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { FadeIn } from "@/components/ui/FadeIn";
import { siteConfig } from "@/data/site";
import { buildMetadata } from "@/lib/seo";
import { RETURN_WINDOW_DAYS } from "@/lib/shop/order-support";

export const metadata = buildMetadata({
  title: "Shipping & Returns",
  description:
    "Plain Thread ships with Delhivery. Returns are accepted within 7 days of the delivered date. Reverse pickup is arranged through iThink Logistics.",
  path: "/shipping-returns",
});

export default function ShippingReturnsPage() {
  return (
    <div className="container-px py-10 md:py-16">
      <Breadcrumbs
        items={[{ name: "Home", href: "/" }, { name: "Shipping & Returns" }]}
      />
      <FadeIn>
        <h1 className="font-serif text-4xl md:text-5xl">Shipping & Returns</h1>
        <p className="mt-4 max-w-2xl text-secondary">
          You can return an order after it has been delivered — not only before
          dispatch. The window is {RETURN_WINDOW_DAYS} days from the delivered
          date.
        </p>
      </FadeIn>

      <div className="prose-pt mt-10 max-w-3xl">
        <h2>Delivery</h2>
        <p>
          Website orders are shipped with Delhivery. Transit time depends on your
          PIN code. You will get tracking once the shipment is handed over.
        </p>

        <h2>Returns after delivery</h2>
        <p>
          If the tee does not work for you after Delhivery marks it delivered,
          you may request a return within{" "}
          <strong>{RETURN_WINDOW_DAYS} days of the delivered date</strong>.
          The garment must be unused, unwashed, and in original condition with
          tags attached.
        </p>
        <p>
          Marketplace orders (Amazon or Flipkart) follow that marketplace&apos;s
          return rules, not this page.
        </p>

        <h2>How a return is collected</h2>
        <p>
          Reverse pickup is arranged through our logistics partner,{" "}
          <strong>iThink Logistics</strong>. Email{" "}
          <a href={`mailto:${siteConfig.email}?subject=Return%20request`}>
            {siteConfig.email}
          </a>{" "}
          with your order ID, delivered date, and reason. We will schedule a
          pickup at the delivery address. Do not ship the parcel back on your
          own unless we ask you to.
        </p>

        <h2>Refunds</h2>
        <p>
          After the return is picked up and inspected, prepaid orders are refunded
          to the original Razorpay method (admin marks the payment refunded). Pickup
          is not a refund by itself.
        </p>

        <h2>Cancellations before dispatch</h2>
        <p>
          You can cancel from your order link while the parcel is still pending.
          Closing Magic Checkout does not cancel a completed prepaid charge.
        </p>
        <p>
          Once it is shipped or delivered, do not cancel from the order page.
          Email{" "}
          <a href={`mailto:${siteConfig.email}?subject=Cancel%20or%20return%20request`}>
            {siteConfig.email}
          </a>{" "}
          with your order ID. After delivery, use the return policy on this page.
        </p>

        <p>
          Questions? See the <Link href="/faq">FAQ</Link> or{" "}
          <Link href="/contact">contact us</Link>.
        </p>
      </div>
    </div>
  );
}
