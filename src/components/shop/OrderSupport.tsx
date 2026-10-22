import Link from "next/link";
import { orderSupportCopy } from "@/lib/shop/order-support";

/**
 * Compact trust summary for the purchase decision. Each line restates a shipped
 * source of truth — /shipping-returns for delivery and returns, the order page
 * for cancellation — and src/lib/shop/order-support.test.ts asserts that no
 * transit window, response time or unsupported channel is claimed.
 */
export function OrderSupport() {
  const copy = orderSupportCopy();
  return (
    <section
      aria-labelledby="order-support-heading"
      className="mt-6 border border-border bg-card p-4 sm:p-5"
    >
      <h2
        id="order-support-heading"
        className="text-xs font-medium uppercase tracking-[0.18em] text-secondary"
      >
        {copy.heading}
      </h2>
      <p className="mt-3 text-sm leading-6 text-foreground">
        {copy.contactLead}{" "}
        <a
          href={copy.phoneHref}
          className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          {copy.phone}
        </a>
        .
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-secondary">
        <li>
          {copy.delivery} See{" "}
          <Link
            href="/shipping-returns"
            className="text-foreground underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Shipping &amp; Returns
          </Link>
          .
        </li>
        <li>{copy.returns}</li>
        <li>{copy.cancellation}</li>
      </ul>
    </section>
  );
}
