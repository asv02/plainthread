export type TaxKind = "igst" | "cgst_sgst";

export type TaxBreakdown = {
  taxablePaise: number;
  taxPaise: number;
  taxRateBps: number;
  taxPercent: number;
  taxKind: TaxKind;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  inclusive: boolean;
};

function envNumber(keys: string[], fallback: number) {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function envFlag(keys: string[], fallback: boolean) {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw == null || raw === "") continue;
    return raw === "true" || raw === "1";
  }
  return fallback;
}

export function gstRatePercent() {
  return Math.min(28, Math.max(0, envNumber(["NEXT_PUBLIC_GST_RATE_PERCENT", "GST_RATE_PERCENT"], 5)));
}

export function gstInclusive() {
  return envFlag(["NEXT_PUBLIC_GST_INCLUSIVE", "GST_INCLUSIVE"], false);
}

export function gstOriginState() {
  return normalizeState(process.env.GST_ORIGIN_STATE ?? "");
}

export function normalizeState(value: string) {
  const raw = value.trim().toLowerCase().replace(/\./g, "");
  const aliases: Record<string, string> = {
    mh: "maharashtra",
    maharastra: "maharashtra",
    dl: "delhi",
    nct: "delhi",
    "nct of delhi": "delhi",
    ka: "karnataka",
    tn: "tamil nadu",
    tg: "telangana",
    ap: "andhra pradesh",
    gj: "gujarat",
    rj: "rajasthan",
    up: "uttar pradesh",
    wb: "west bengal",
    hr: "haryana",
    pb: "punjab",
    kl: "kerala",
    mp: "madhya pradesh",
    cg: "chhattisgarh",
    br: "bihar",
    od: "odisha",
    or: "odisha",
    as: "assam",
    uk: "uttarakhand",
    ua: "uttarakhand",
    hp: "himachal pradesh",
    jk: "jammu and kashmir",
    ga: "goa",
  };
  return aliases[raw] || raw;
}

export function calculateGst(input: {
  goodsPaise: number;
  shippingPaise: number;
  destinationState?: string;
}): TaxBreakdown {
  const rate = gstRatePercent();
  const inclusive = gstInclusive();
  const rateBps = Math.round(rate * 100);
  const origin = gstOriginState();
  const destination = normalizeState(input.destinationState ?? "");
  const sameState = Boolean(origin && destination && origin === destination);
  const taxKind: TaxKind = sameState ? "cgst_sgst" : "igst";

  const listed = Math.max(0, input.goodsPaise) + Math.max(0, input.shippingPaise);
  let taxablePaise: number;
  let taxPaise: number;

  if (rateBps === 0 || listed === 0) {
    taxablePaise = listed;
    taxPaise = 0;
  } else if (inclusive) {
    taxPaise = Math.round((listed * rateBps) / (10000 + rateBps));
    taxablePaise = listed - taxPaise;
  } else {
    taxablePaise = listed;
    taxPaise = Math.round((listed * rateBps) / 10000);
  }

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (taxKind === "cgst_sgst") {
    cgstPaise = Math.floor(taxPaise / 2);
    sgstPaise = taxPaise - cgstPaise;
  } else {
    igstPaise = taxPaise;
  }

  return {
    taxablePaise,
    taxPaise,
    taxRateBps: rateBps,
    taxPercent: rate,
    taxKind,
    cgstPaise,
    sgstPaise,
    igstPaise,
    inclusive,
  };
}

export function payableTotalPaise(goodsPaise: number, shippingPaise: number, tax: TaxBreakdown) {
  if (tax.inclusive) return goodsPaise + shippingPaise;
  return goodsPaise + shippingPaise + tax.taxPaise;
}

export function taxLinesFromStored(order: {
  subtotalPaise: number;
  discountPaise?: number;
  taxPaise: number;
  taxRateBps: number;
  taxKind: TaxKind;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  shippingPaise: number;
  totalPaise: number;
}) {
  const discountPaise = order.discountPaise ?? 0;
  const netGoods = order.subtotalPaise - discountPaise;
  const inclusive = order.totalPaise === netGoods + order.shippingPaise;
  const taxablePaise = inclusive
    ? netGoods + order.shippingPaise - order.taxPaise
    : netGoods + order.shippingPaise;
  return {
    goodsPaise: order.subtotalPaise,
    discountPaise,
    shippingPaise: order.shippingPaise,
    totalPaise: order.totalPaise,
    tax: {
      taxablePaise,
      taxPaise: order.taxPaise,
      taxRateBps: order.taxRateBps,
      taxPercent: order.taxRateBps / 100,
      taxKind: order.taxKind,
      cgstPaise: order.cgstPaise,
      sgstPaise: order.sgstPaise,
      igstPaise: order.igstPaise,
      inclusive,
    } satisfies TaxBreakdown,
  };
}
