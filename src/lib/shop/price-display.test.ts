import assert from "node:assert/strict";
import test from "node:test";
import { percentDiscountPaise } from "@/lib/shop/coupon";
import { formatPaise, offerDisplay, rupeesToPaise, savingsLabel } from "@/lib/shop/price-display";

test("rupees to paise is exact, including fractional rupees", () => {
  assert.equal(rupeesToPaise(699), 69900);
  assert.equal(rupeesToPaise(664.05), 66405);
  assert.equal(rupeesToPaise(825), 82500);
});

test("invalid or non-positive amounts never become a price", () => {
  assert.equal(rupeesToPaise(0), null);
  assert.equal(rupeesToPaise(-699), null);
  assert.equal(rupeesToPaise(Number.NaN), null);
  assert.equal(rupeesToPaise(undefined), null);
  assert.equal(rupeesToPaise(null), null);
  assert.equal(offerDisplay(null, 825), null);
  assert.equal(offerDisplay(0, 825), null);
  assert.equal(offerDisplay(699.5, 825), null);
});

test("the brief's headline case: 825 reference against a 699 payable", () => {
  const offer = offerDisplay(69900, 825);
  assert.ok(offer);
  assert.equal(offer.referencePaise, 82500);
  assert.equal(offer.savingsPaise, 12600);
  // 126 / 825 = 15.27% — shown as 15%, never rounded up to 16%.
  assert.equal(offer.savingsPercent, 15);
  const label = savingsLabel(offer);
  assert.ok(label);
  assert.equal(label.rupees, "₹126");
  assert.equal(label.percent, 15);
});

test("5% coupon on 699 matches the coupon engine and reads 19% against 825", () => {
  const discountPaise = percentDiscountPaise(69900, 5);
  assert.equal(discountPaise, 3495);
  const payable = 69900 - discountPaise;
  assert.equal(payable, 66405);
  assert.equal(formatPaise(discountPaise), "₹34.95");
  assert.equal(formatPaise(payable), "₹664.05");
  const combined = offerDisplay(payable, 825);
  assert.ok(combined);
  assert.equal(combined.savingsPaise, 16095);
  // 16095 / 82500 = 19.509% — floored, so the customer is never promised 20%.
  assert.equal(combined.savingsPercent, 19);
});

test("a reference price at or below the payable price is dropped entirely", () => {
  const equal = offerDisplay(82500, 825);
  assert.ok(equal);
  assert.equal(equal.referencePaise, null);
  assert.equal(equal.savingsPaise, 0);
  assert.equal(equal.savingsPercent, 0);
  assert.equal(savingsLabel(equal), null);

  const cheaper = offerDisplay(89900, 825);
  assert.ok(cheaper);
  assert.equal(cheaper.referencePaise, null);
  assert.equal(savingsLabel(cheaper), null);

  const noReference = offerDisplay(69900, null);
  assert.ok(noReference);
  assert.equal(noReference.referencePaise, null);
  assert.equal(savingsLabel(noReference), null);
});

test("a saving under 1% keeps the rupee amount but claims no percentage", () => {
  // ₹700.00 reference against a ₹699.99 payable: one paise of saving.
  const offer = offerDisplay(69999, 700);
  assert.ok(offer);
  assert.equal(offer.savingsPaise, 1);
  assert.equal(offer.savingsPercent, 0);
  const label = savingsLabel(offer);
  assert.ok(label);
  assert.equal(label.percent, 0);
});

test("every catalog product keeps a defensible reference price", async () => {
  const { products } = await import("@/data/products");
  for (const product of products) {
    const offer = offerDisplay(rupeesToPaise(product.price), product.compareAtPrice);
    assert.ok(offer, `no payable price for ${product.slug}`);
    if (product.compareAtPrice == null) continue;
    assert.ok(
      offer.referencePaise != null && offer.savingsPaise > 0,
      `${product.slug} advertises a reference price of ${product.compareAtPrice} against ${product.price}`,
    );
  }
});
