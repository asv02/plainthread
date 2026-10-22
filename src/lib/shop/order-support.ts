import { siteConfig } from "@/data/site";

/**
 * The single source of truth for the 7-day return window. /shipping-returns
 * publishes it and the short summaries around the purchase CTA repeat it, so
 * the two cannot drift apart.
 */
export const RETURN_WINDOW_DAYS = 7;

/**
 * Support copy lives here rather than inline in JSX so the honesty constraints
 * the panel is held to — no invented transit window, no response-time or
 * channel claims — are testable.
 */
export function orderSupportCopy() {
  const { support } = siteConfig;
  const contactLead = `Questions about your order? Contact ${support.name}, ${support.role}, on`;
  return {
    heading: "Support & policies",
    contactLead,
    contact: `${contactLead} ${support.phone}.`,
    phone: support.phone,
    phoneHref: `tel:${support.phone}`,
    delivery:
      "Shipped with Delhivery. Transit time depends on your PIN code, so we do not quote a delivery window here.",
    returns: `Returns accepted within ${RETURN_WINDOW_DAYS} days of the delivered date while the tee is unused, unwashed and has its tags attached.`,
    cancellation:
      "Cancel from your order page while the parcel is still pending. Once it ships, email us instead and we will arrange the return.",
  };
}
