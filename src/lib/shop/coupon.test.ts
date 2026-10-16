import assert from "node:assert/strict";
import test from "node:test";
import {
  adminCouponMutationStatus,
  allocateDiscountPaise,
  assertCouponCodeAvailable,
  assertCouponCodeMatchesPercent,
  assertCheckoutIntentMatchesLines,
  buildMagicLineItems,
  CheckoutIntentError,
  CouponConfigError,
  couponSuffixPercent,
  eligibleCheckoutCoupons,
  parseCheckoutIntent,
  parseCouponDraft,
  paymentAmount,
  percentDiscountPaise,
  quoteCart,
  reviewedTotalMismatch,
  type CouponConfig,
  type CouponSnapshot,
  type SkuPriceRow,
} from "./coupon";

const TEE = 69900;

function row(slug: string, size: string, price = TEE, sku = `${slug}-${size}`): SkuPriceRow {
  return { product_slug: slug, size, sku, price_paise: price };
}

const shirts = [
  row("black-oversized-tshirt", "M", TEE, "PT-BLK-M"),
  row("white-oversized-tshirt", "L", TEE, "PT-WHT-L"),
  row("pink-oversized-tshirt", "S", TEE, "PT-PNK-S"),
  row("hoodie", "M", 129900, "PT-HD-M"),
];

function coupon(partial: Partial<CouponConfig> & Pick<CouponConfig, "code" | "eligibilityType">): CouponConfig {
  return {
    discountPercent: Number(partial.code.slice(-2)),
    minCartValuePaise: null,
    minQuantity: null,
    eligibleProductSlugs: [],
    isEnabled: true,
    ...partial,
  };
}

function withPricingEnv(shippingRupees: string, run: () => void) {
  const previous = {
    shipping: process.env.SHIPPING_RUPEES,
    gst: process.env.GST_RATE_PERCENT,
    gstPublic: process.env.NEXT_PUBLIC_GST_RATE_PERCENT,
    inclusive: process.env.GST_INCLUSIVE,
    inclusivePublic: process.env.NEXT_PUBLIC_GST_INCLUSIVE,
    origin: process.env.GST_ORIGIN_STATE,
  };
  process.env.SHIPPING_RUPEES = shippingRupees;
  process.env.GST_RATE_PERCENT = "5";
  process.env.NEXT_PUBLIC_GST_RATE_PERCENT = "5";
  process.env.GST_INCLUSIVE = "false";
  process.env.NEXT_PUBLIC_GST_INCLUSIVE = "false";
  process.env.GST_ORIGIN_STATE = "karnataka";
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries({
      SHIPPING_RUPEES: previous.shipping,
      GST_RATE_PERCENT: previous.gst,
      NEXT_PUBLIC_GST_RATE_PERCENT: previous.gstPublic,
      GST_INCLUSIVE: previous.inclusive,
      NEXT_PUBLIC_GST_INCLUSIVE: previous.inclusivePublic,
      GST_ORIGIN_STATE: previous.origin,
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("coupon code suffix must match the stored percentage", () => {
  assert.deepEqual(assertCouponCodeMatchesPercent(" coupon10 ", 10), {
    code: "COUPON10",
    discountPercent: 10,
  });
  assert.equal(assertCouponCodeMatchesPercent("COUPON15", 15).code, "COUPON15");
  assert.equal(assertCouponCodeMatchesPercent("COUPON20", 20).discountPercent, 20);
  assert.throws(() => assertCouponCodeMatchesPercent("COUPON10", 20), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("COUPON105", 10), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("COUPON105", 5), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("COUPON00", 0), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("COUPON10", 10.5), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("COUPON10", -10), CouponConfigError);
});

test("coupon codes accept any letters plus a 1-2 digit discount number", () => {
  assert.deepEqual(assertCouponCodeMatchesPercent(" plain5 ", 5), {
    code: "PLAIN5",
    discountPercent: 5,
  });
  assert.equal(assertCouponCodeMatchesPercent("PLAIN5", 5).code, "PLAIN5");
  assert.equal(assertCouponCodeMatchesPercent("SAVE25", 25).discountPercent, 25);
  assert.equal(assertCouponCodeMatchesPercent("NEWUSER1", 1).discountPercent, 1);
  assert.equal(assertCouponCodeMatchesPercent("COUPON10", 10).code, "COUPON10");
  assert.equal(couponSuffixPercent("PLAIN5"), 5);
  assert.equal(couponSuffixPercent("PLAIN25"), 25);
});

test("coupon codes with wrong digit shape are rejected (negatives)", () => {
  assert.throws(() => assertCouponCodeMatchesPercent("PLAIN123", 23), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("PLAIN", 5), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("5PLAIN", 5), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("PLAIN5OFF", 5), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("PLAIN5", 50), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("PLAIN0", 0), CouponConfigError);
  assert.throws(() => assertCouponCodeMatchesPercent("PLAIN-5", 5), CouponConfigError);
  assert.equal(couponSuffixPercent("PLAIN123"), null);
  assert.equal(couponSuffixPercent("SAVE25OFF"), null);
});

test("coupon drafts accept one eligibility mode and reject bad thresholds", () => {
  const knownSlugs = ["black-oversized-tshirt", "white-oversized-tshirt", "hoodie"];
  const value = parseCouponDraft(
    {
      code: "COUPON10",
      discountPercent: 10,
      eligibilityType: "MIN_CART_VALUE",
      minCartValuePaise: 150000,
      eligibleProductSlugs: ["black-oversized-tshirt"],
      isEnabled: true,
    },
    { knownSlugs },
  );
  assert.equal(value.eligibilityType, "MIN_CART_VALUE");
  assert.equal(value.minQuantity, null);
  assert.deepEqual(value.eligibleProductSlugs, ["black-oversized-tshirt"]);

  const quantity = parseCouponDraft({
    code: "COUPON15",
    discountPercent: 15,
    eligibilityType: "MIN_QUANTITY",
    minQuantity: 3,
    isEnabled: false,
  });
  assert.equal(quantity.minCartValuePaise, null);
  assert.equal(quantity.isEnabled, false);

  assert.throws(
    () =>
      parseCouponDraft({
        code: "COUPON10",
        discountPercent: 10,
        eligibilityType: "MIN_CART_VALUE",
        minCartValuePaise: 0,
      }),
    /positive amount/,
  );
  assert.throws(
    () =>
      parseCouponDraft({
        code: "COUPON15",
        discountPercent: 15,
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 1.5,
      }),
    /whole number/,
  );
  assert.throws(
    () =>
      parseCouponDraft({
        code: "COUPON10",
        discountPercent: 10,
        eligibilityType: "MIN_CART_VALUE",
        minCartValuePaise: 150000,
        minQuantity: 3,
      }),
    /does not use a quantity/,
  );
  assert.throws(() => assertCouponCodeAvailable(["COUPON10"], "coupon10"), /already exists/);
  assert.doesNotThrow(() => assertCouponCodeAvailable(["COUPON10"], "COUPON10", "COUPON10"));
  assert.equal(adminCouponMutationStatus(false), 401);
  assert.equal(adminCouponMutationStatus(true), null);
});

test("case A rejects a cart below the minimum value", () => {
  withPricingEnv("0", () => {
    const quote = quoteCart(
      [
        { productSlug: "black-oversized-tshirt", size: "M", qty: 1 },
        { productSlug: "white-oversized-tshirt", size: "L", qty: 1 },
      ],
      shirts,
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_CART_VALUE",
          minCartValuePaise: 150000,
        }),
      },
    );
    assert.equal(quote.subtotalPaise, 139800);
    assert.equal(quote.coupon?.applied, false);
    assert.equal(quote.discountPaise, 0);
    assert.match(quote.coupon?.message ?? "", /Add ₹102 more in eligible products to apply COUPON10/);
  });
});

test("case B applies 10 percent once the cart value threshold is met", () => {
  withPricingEnv("0", () => {
    const quote = quoteCart(
      [{ productSlug: "black-oversized-tshirt", size: "M", qty: 3 }],
      shirts,
      {
        destinationState: "Maharashtra",
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_CART_VALUE",
          minCartValuePaise: 150000,
        }),
      },
    );
    assert.equal(quote.eligibleSubtotalPaise, 209700);
    assert.equal(quote.discountPaise, 20970);
    assert.equal(quote.coupon?.discountPercent, 10);
    assert.equal(quote.items[0]?.discount_paise, 20970);
    const net = 209700 - 20970;
    assert.equal(quote.tax.taxPaise, Math.round((net * 500) / 10000));
    assert.equal(quote.totalPaise, net + quote.tax.taxPaise);
    assert.deepEqual(paymentAmount(quote.totalPaise), {
      amountPaise: quote.totalPaise,
      currency: "INR",
    });
  });
});

test("minimum cart value accepts an exact threshold and ignores shipping", () => {
  withPricingEnv("80", () => {
    const below = quoteCart(
      [{ productSlug: "black-oversized-tshirt", size: "M", qty: 2 }],
      [row("black-oversized-tshirt", "M", 70000, "PT-BLK-M")],
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_CART_VALUE",
          minCartValuePaise: 150000,
        }),
      },
    );
    assert.equal(below.subtotalPaise, 140000);
    assert.equal(below.shippingPaise, 8000);
    assert.equal(below.coupon?.applied, false);

    const exact = quoteCart(
      [{ productSlug: "black-oversized-tshirt", size: "M", qty: 2 }],
      [row("black-oversized-tshirt", "M", 75000, "PT-BLK-M")],
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_CART_VALUE",
          minCartValuePaise: 150000,
        }),
      },
    );
    assert.equal(exact.subtotalPaise, 150000);
    assert.equal(exact.coupon?.applied, true);
    assert.equal(exact.discountPaise, 15000);
  });
});

test("case C sums quantity across eligible lines", () => {
  withPricingEnv("0", () => {
    const quote = quoteCart(
      [
        { productSlug: "black-oversized-tshirt", size: "M", qty: 2 },
        { productSlug: "white-oversized-tshirt", size: "L", qty: 1 },
      ],
      shirts,
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_QUANTITY",
          minQuantity: 3,
        }),
      },
    );
    assert.equal(quote.eligibleQuantity, 3);
    assert.equal(quote.discountPaise, 20970);
    assert.equal(quote.items.reduce((sum, item) => sum + item.discount_paise, 0), 20970);
  });
});

test("case D does not discount ineligible products", () => {
  withPricingEnv("0", () => {
    const quote = quoteCart(
      [
        { productSlug: "black-oversized-tshirt", size: "M", qty: 2 },
        { productSlug: "white-oversized-tshirt", size: "L", qty: 1 },
        { productSlug: "hoodie", size: "M", qty: 1 },
      ],
      shirts,
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_QUANTITY",
          minQuantity: 3,
          eligibleProductSlugs: ["black-oversized-tshirt", "white-oversized-tshirt"],
        }),
      },
    );
    assert.equal(quote.subtotalPaise, 209700 + 129900);
    assert.equal(quote.eligibleSubtotalPaise, 209700);
    assert.equal(quote.eligibleQuantity, 3);
    assert.equal(quote.discountPaise, 20970);
    const hoodie = quote.items.find((item) => item.product_slug === "hoodie");
    assert.equal(hoodie?.eligible, false);
    assert.equal(hoodie?.discount_paise, 0);
  });
});

test("quantity below, equal, and above the threshold", () => {
  withPricingEnv("0", () => {
    const rule = coupon({
      code: "COUPON15",
      eligibilityType: "MIN_QUANTITY",
      minQuantity: 3,
      discountPercent: 15,
    });
    const below = quoteCart([{ productSlug: "black-oversized-tshirt", size: "M", qty: 2 }], shirts, {
      coupon: rule,
    });
    assert.equal(below.coupon?.applied, false);
    assert.match(below.coupon?.message ?? "", /Add 1 more eligible item to apply COUPON15/);

    const exact = quoteCart([{ productSlug: "black-oversized-tshirt", size: "M", qty: 3 }], shirts, {
      coupon: rule,
    });
    assert.equal(exact.coupon?.applied, true);
    assert.equal(exact.discountPaise, percentDiscountPaise(TEE * 3, 15));

    const above = quoteCart(
      [
        { productSlug: "black-oversized-tshirt", size: "M", qty: 2 },
        { productSlug: "white-oversized-tshirt", size: "L", qty: 2 },
      ],
      shirts,
      { coupon: rule },
    );
    assert.equal(above.eligibleQuantity, 4);
    assert.equal(above.coupon?.applied, true);
  });
});

test("database SKU price overrides a stale client price and picks the selected variant", () => {
  withPricingEnv("0", () => {
    const staleLine = {
      productSlug: "black-oversized-tshirt",
      size: "L",
      qty: 1,
      unitPricePaise: 100,
      price: 1,
    };
    const rows = [
      row("black-oversized-tshirt", "M", 50000, "PT-BLK-M"),
      row("black-oversized-tshirt", "L", 80000, "PT-BLK-L"),
    ];
    const quote = quoteCart([staleLine], rows);
    assert.equal(quote.items[0]?.unit_price_paise, 80000);
    assert.equal(quote.items[0]?.sku, "PT-BLK-L");
    assert.equal(quote.subtotalPaise, 80000);

    const raised = quoteCart(
      [{ productSlug: "black-oversized-tshirt", size: "M", qty: 2 }],
      [row("black-oversized-tshirt", "M", 80000, "PT-BLK-M")],
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_CART_VALUE",
          minCartValuePaise: 150000,
        }),
      },
    );
    assert.equal(raised.coupon?.applied, true);
    const lowered = quoteCart(
      [{ productSlug: "black-oversized-tshirt", size: "M", qty: 2 }],
      [row("black-oversized-tshirt", "M", 70000, "PT-BLK-M")],
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_CART_VALUE",
          minCartValuePaise: 150000,
        }),
      },
    );
    assert.equal(lowered.coupon?.applied, false);
  });
});

test("removing a coupon restores the pre-discount total and a disabled coupon is rejected", () => {
  withPricingEnv("0", () => {
    const lines = [{ productSlug: "black-oversized-tshirt", size: "M", qty: 3 }];
    const rule = coupon({
      code: "COUPON10",
      eligibilityType: "MIN_QUANTITY",
      minQuantity: 3,
    });
    const withCoupon = quoteCart(lines, shirts, { coupon: rule });
    const without = quoteCart(lines, shirts);
    assert.ok(without.totalPaise > withCoupon.totalPaise);
    assert.equal(without.discountPaise, 0);
    assert.equal(without.coupon, null);

    const disabled = quoteCart(lines, shirts, { coupon: { ...rule, isEnabled: false } });
    assert.equal(disabled.coupon?.applied, false);
    assert.equal(disabled.discountPaise, 0);
    assert.match(disabled.coupon?.message ?? "", /not active/);
    assert.equal(disabled.totalPaise, without.totalPaise);
  });
});

test("checkout ignores a submitted percentage and keeps a historical snapshot", () => {
  withPricingEnv("0", () => {
    const config = coupon({
      code: "COUPON10",
      eligibilityType: "MIN_QUANTITY",
      minQuantity: 3,
    });
    const quote = quoteCart(
      [{ productSlug: "black-oversized-tshirt", size: "M", qty: 3, submittedPercent: 90 } as never],
      shirts,
      { coupon: config },
    );
    assert.equal(quote.discountPaise, 20970);
    const snapshot: CouponSnapshot = quote.couponSnapshot!;
    config.discountPercent = 20;
    config.isEnabled = false;
    config.code = "COUPON20";
    assert.equal(snapshot.discount_percent, 10);
    assert.equal(snapshot.code, "COUPON10");
    assert.equal(snapshot.discount_paise, 20970);
  });
});

test("razorpay lines sum to the payable paise and checkout without a coupon still prices", () => {
  withPricingEnv("40", () => {
    const plain = quoteCart([{ productSlug: "white-oversized-tshirt", size: "L", qty: 1 }], shirts, {
      destinationState: "Karnataka",
    });
    assert.equal(plain.discountPaise, 0);
    assert.equal(plain.tax.taxKind, "cgst_sgst");
    assert.equal(plain.shippingPaise, 4000);
    const plainLines = buildMagicLineItems(plain.items, plain.totalPaise);
    const plainSum = plainLines.reduce((sum, line) => sum + line.offer_price * line.quantity, 0);
    assert.equal(plainSum, plain.totalPaise);
    assert.equal(paymentAmount(plain.totalPaise).currency, "INR");

    const discounted = quoteCart(
      [
        { productSlug: "black-oversized-tshirt", size: "M", qty: 2 },
        { productSlug: "white-oversized-tshirt", size: "L", qty: 1 },
      ],
      shirts,
      {
        coupon: coupon({
          code: "COUPON10",
          eligibilityType: "MIN_QUANTITY",
          minQuantity: 3,
        }),
      },
    );
    const lines = buildMagicLineItems(discounted.items, discounted.totalPaise);
    const sum = lines.reduce((total, line) => total + line.offer_price * line.quantity, 0);
    assert.equal(sum, discounted.totalPaise);
    assert.ok(lines.every((line) => Number.isInteger(line.offer_price) && line.offer_price >= 0));
    assert.equal(reviewedTotalMismatch(discounted.totalPaise, discounted.totalPaise), null);
    assert.match(reviewedTotalMismatch(1, discounted.totalPaise) ?? "", /total changed/i);
  });
});

test("allocated discounts sum to the cart discount", () => {
  const shares = allocateDiscountPaise(
    [
      { key: "a", merchandisePaise: 100, eligible: true },
      { key: "b", merchandisePaise: 100, eligible: true },
      { key: "c", merchandisePaise: 50, eligible: false },
    ],
    1,
  );
  assert.equal((shares.get("a") ?? 0) + (shares.get("b") ?? 0) + (shares.get("c") ?? 0), 1);
  assert.equal(shares.get("c"), 0);
});

test("an admin edit to the threshold or scope is re-validated on the next quote", () => {
  withPricingEnv("0", () => {
    const lines = [
      { productSlug: "black-oversized-tshirt", size: "M", qty: 2 },
      { productSlug: "white-oversized-tshirt", size: "L", qty: 1 },
    ];

    const before = quoteCart(lines, shirts, {
      coupon: coupon({
        code: "COUPON10",
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 3,
      }),
    });
    assert.equal(before.coupon?.applied, true);
    assert.equal(before.discountPaise, 20970);

    const raised = quoteCart(lines, shirts, {
      coupon: coupon({
        code: "COUPON10",
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 5,
      }),
    });
    assert.equal(raised.coupon?.applied, false);
    assert.equal(raised.discountPaise, 0);
    assert.match(raised.coupon?.message ?? "", /Add 2 more eligible/);

    const narrowed = quoteCart(lines, shirts, {
      coupon: coupon({
        code: "COUPON10",
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 3,
        eligibleProductSlugs: ["white-oversized-tshirt"],
      }),
    });
    assert.equal(narrowed.coupon?.applied, false);
    assert.equal(narrowed.eligibleSubtotalPaise, 69900);
    assert.equal(narrowed.discountPaise, 0);

    const disabled = quoteCart(lines, shirts, {
      coupon: coupon({
        code: "COUPON10",
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 3,
        isEnabled: false,
      }),
    });
    assert.equal(disabled.coupon?.applied, false);
    assert.equal(disabled.discountPaise, 0);
  });
});

const buyNowLine = { productSlug: "hoodie", size: "M", qty: 1 };

test("buy-now intent must be a valid single-SKU payload", () => {
  assert.equal(parseCheckoutIntent(undefined), null);
  assert.equal(parseCheckoutIntent({ type: "SOMETHING" }), null);
  assert.deepEqual(parseCheckoutIntent({ type: "CART_CHECKOUT" }), { type: "CART_CHECKOUT" });
  assert.deepEqual(parseCheckoutIntent({ type: "BUY_NOW", product_slug: "hoodie", size: "M" }), {
    type: "BUY_NOW",
    product_slug: "hoodie",
    size: "M",
  });
  assert.throws(() => parseCheckoutIntent({ type: "BUY_NOW", product_slug: "", size: "M" }), CheckoutIntentError);
  assert.throws(
    () => parseCheckoutIntent({ type: "BUY_NOW", product_slug: "hoodie", size: "XS" }),
    CheckoutIntentError,
  );

  const buyNow = { type: "BUY_NOW", product_slug: "hoodie", size: "M" } as const;
  assert.doesNotThrow(() => assertCheckoutIntentMatchesLines(buyNow, [buyNowLine]));
  assert.throws(
    () => assertCheckoutIntentMatchesLines(buyNow, [{ ...buyNowLine, qty: 2 }]),
    /exactly one/,
  );
  assert.throws(
    () => assertCheckoutIntentMatchesLines(buyNow, [{ ...buyNowLine, size: "L" }]),
    /only contain the selected item/,
  );
  assert.throws(
    () => assertCheckoutIntentMatchesLines(buyNow, [buyNowLine, { productSlug: "hoodie", size: "M", qty: 1 }]),
    /only contain the selected item|exactly one/,
  );
  assert.doesNotThrow(() => assertCheckoutIntentMatchesLines({ type: "CART_CHECKOUT" }, [buyNowLine, ...[{ productSlug: "hoodie", size: "M", qty: 3 }]]));
  assert.doesNotThrow(() => assertCheckoutIntentMatchesLines(null, []));
});

test("eligibleCheckoutCoupons returns only coupons that apply to these exact lines", () => {
  withPricingEnv("0", () => {
    const lines = [
      { productSlug: "black-oversized-tshirt", size: "M", qty: 2 },
      { productSlug: "white-oversized-tshirt", size: "L", qty: 1 },
    ];
    const offers = eligibleCheckoutCoupons(lines, shirts, [
      coupon({ code: "COUPON10", eligibilityType: "MIN_QUANTITY", minQuantity: 3 }),
      coupon({ code: "COUPON15", eligibilityType: "MIN_QUANTITY", minQuantity: 4 }),
      coupon({ code: "COUPON20", eligibilityType: "MIN_CART_VALUE", minCartValuePaise: 300000 }),
      coupon({
        code: "COUPON25",
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 3,
        eligibleProductSlugs: ["pink-oversized-tshirt"],
      }),
      coupon({
        code: "COUPON30",
        eligibilityType: "MIN_QUANTITY",
        minQuantity: 2,
        eligibleProductSlugs: ["black-oversized-tshirt"],
      }),
      coupon({ code: "COUPON35", eligibilityType: "MIN_QUANTITY", minQuantity: 3, isEnabled: false }),
    ]);
    assert.deepEqual(
      offers.map((offer) => offer.code),
      ["COUPON30", "COUPON10"],
    );
    assert.equal(offers[0]?.discountPercent, 30);
    assert.equal(offers[0]?.discountPaise, percentDiscountPaise(TEE * 2, 30));
    assert.equal(offers[1]?.discountPaise, percentDiscountPaise(TEE * 3, 10));
    assert.match(offers[1]?.condition ?? "", /Buy at least 3 eligible items/);

    assert.deepEqual(eligibleCheckoutCoupons([], shirts, [coupon({ code: "COUPON10", eligibilityType: "MIN_QUANTITY", minQuantity: 1 })]), []);
    assert.throws(() => eligibleCheckoutCoupons([{ productSlug: "nope", size: "M", qty: 1 }], shirts, []), /Unknown product/);
  });
});

test("buy-now single line is priced and discounted like any checkout", () => {
  withPricingEnv("0", () => {
    const line = [{ productSlug: "black-oversized-tshirt", size: "M", qty: 1 }];
    const noCoupon = eligibleCheckoutCoupons(line, shirts, [
      coupon({ code: "COUPON10", eligibilityType: "MIN_QUANTITY", minQuantity: 3 }),
      coupon({ code: "COUPON20", eligibilityType: "MIN_CART_VALUE", minCartValuePaise: 50000 }),
    ]);
    assert.deepEqual(
      noCoupon.map((offer) => offer.code),
      ["COUPON20"],
    );
    const quote = quoteCart(line, shirts, { coupon: coupon({ code: "COUPON20", eligibilityType: "MIN_CART_VALUE", minCartValuePaise: 50000 }) });
    assert.equal(quote.discountPaise, percentDiscountPaise(TEE, 20));
  });
});
