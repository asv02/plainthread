import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { FadeIn } from "@/components/ui/FadeIn";
import { siteConfig } from "@/data/site";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Privacy Policy",
  description: "Privacy policy for Plain Thread — how we handle information on plainthread.in.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="container-px py-10 md:py-16">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Privacy" }]} />
      <FadeIn>
        <h1 className="font-serif text-4xl md:text-5xl">Privacy Policy</h1>
      </FadeIn>
      <div className="prose-pt mt-10 max-w-3xl">
        <p>
          {siteConfig.name} sells oversized essentials on this website. When you check out
          here we collect your name, email, phone, and delivery address to fulfil the order.
          Payments are processed by Razorpay.
        </p>
        <h2>Cookies and advertising measurement</h2>
        <p>
          <strong>Essential</strong> cookies and storage keep the cart, checkout, login,
          and order-access cookie working. These stay on whether or not you accept optional
          cookies.
        </p>
        <p>
          <strong>Marketing</strong> cookies are optional. If you choose Accept all, we load
          the Meta Pixel in your browser and, for prepaid paid orders, may send a matching
          Purchase event to Meta’s Conversions API. Matching uses hashed email and phone,
          plus Meta cookies (_fbp/_fbc) when present. We do not send that matching data if
          you chose Reject optional.
        </p>
        <p>
          We do not treat closing the browser, navigating, or ignoring the notice as
          consent. Change your choice anytime from Cookie Preferences in the footer.
          Rejecting optional cookies stops new Pixel events and expires Meta browser IDs
          we can reach. Server Purchase events use the consent cookie recorded at checkout
          for that order, not a later browser click alone.
        </p>
        <p>
          Attribution identifiers and outbox delivery logs are kept only as long as
          needed to send and reconcile events (target: 90 days), then should be purged.
        </p>
        <h2>Information we may collect</h2>
        <p>
          If you email us or interact with analytics tools (such as Meta Pixel when you
          accept cookies), basic usage and device information may be processed to measure
          traffic, ad performance, and respond to enquiries. Order access credentials are
          stored in an HttpOnly cookie, not in the page URL.
        </p>
        <h2>Payment processor</h2>
        <p>
          Razorpay processes prepaid and cash-on-delivery checkouts. Their privacy policy
          applies to payment data they collect.
        </p>
        <h2>Contact</h2>
        <p>
          For privacy questions, email{" "}
          <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>.
        </p>
      </div>
    </div>
  );
}
