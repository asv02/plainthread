import { formatPrice } from "@/lib/utils";

/**
 * Display-side price math. Amounts stay in integer paise, which is the unit the
 * quote engine, the checkout route and `variants.price_paise` use, so a shown
 * saving cannot drift from the amount actually charged.
 */

export type OfferDisplay = {
  currentPaise: number;
  /** Null when there is no defensible reference price to strike through. */
  referencePaise: number | null;
  savingsPaise: number;
  savingsPercent: number;
};

export function rupeesToPaise(rupees: number | null | undefined): number | null {
  if (typeof rupees !== "number" || !Number.isFinite(rupees) || rupees <= 0) return null;
  const paise = Math.round(rupees * 100);
  return paise > 0 ? paise : null;
}

/**
 * `compareAtRupees` is only a valid reference while it exceeds what the customer
 * actually pays; once a variant is priced at or above it, striking it through
 * would invent a saving, so the reference disappears with the saving.
 */
export function offerDisplay(
  currentPaise: number | null | undefined,
  compareAtRupees?: number | null,
): OfferDisplay | null {
  if (typeof currentPaise !== "number" || !Number.isInteger(currentPaise) || currentPaise < 1) {
    return null;
  }
  const referencePaise = rupeesToPaise(compareAtRupees);
  if (referencePaise == null || referencePaise <= currentPaise) {
    return { currentPaise, referencePaise: null, savingsPaise: 0, savingsPercent: 0 };
  }
  const savingsPaise = referencePaise - currentPaise;
  return {
    currentPaise,
    referencePaise,
    savingsPaise,
    // Floored, never rounded up: a shown discount must not overstate the real one.
    savingsPercent: Math.floor((savingsPaise * 100) / referencePaise),
  };
}

/** Only the parts of an offer that are true get rendered; empty means show nothing extra. */
export function savingsLabel(offer: OfferDisplay | null): { rupees: string; percent: number } | null {
  if (!offer || offer.referencePaise == null || offer.savingsPaise < 1) return null;
  return { rupees: formatPaise(offer.savingsPaise), percent: offer.savingsPercent };
}

export function formatPaise(paise: number): string {
  return formatPrice(paise / 100);
}
