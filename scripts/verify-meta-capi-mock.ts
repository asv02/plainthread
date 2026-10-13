/**
 * Prints CAPI/Pixel parameter *values* for a mock cart.
 * Meta's "Set up events" wizard only lists parameter names; this report
 * is the local source of truth for value, currency, contents, and event IDs.
 *
 * Run: npm run test:capi
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  addToCartCustomData,
  initiateCheckoutCustomData,
  purchaseCustomData,
  purchaseEventId,
  viewContentCustomData,
} from "../src/lib/meta/events";
import { paiseToRupees } from "../src/lib/meta/catalog";

const product = {
  id: "black-oversized-tshirt",
  name: "Black Oversized T-Shirt",
  priceRupees: 699,
};
const qty = 1;
const taxPaise = 3495;
const shippingPaise = 0;
const totalPaise = 69900 + taxPaise + shippingPaise;

const viewContent = viewContentCustomData(product);
const addToCart = addToCartCustomData({
  id: product.id,
  quantity: qty,
  itemPriceRupees: product.priceRupees,
});
const initiateCheckout = initiateCheckoutCustomData({
  contents: [{ id: product.id, quantity: qty, item_price: product.priceRupees }],
  value: paiseToRupees(totalPaise),
});
const purchase = purchaseCustomData(
  {
    status: "open",
    payment_status: "paid",
    payment_method: "prepaid",
    paid_at: new Date().toISOString(),
    public_id: "PT-MOCK0001",
    total_paise: totalPaise,
    tax_paise: taxPaise,
    shipping_paise: shippingPaise,
    currency: "INR",
  },
  [{ product_slug: product.id, qty, unit_price_paise: 69900 }],
);

assert.equal(viewContent.value, 699);
assert.equal(viewContent.currency, "INR");
assert.deepEqual(viewContent.content_ids, ["black-oversized-tshirt"]);
assert.equal(addToCart.value, 699);
assert.equal(initiateCheckout.value, 733.95);
assert.equal(initiateCheckout.num_items, 1);
assert.equal(initiateCheckout.currency, "INR");
assert.equal(purchase.value, 733.95);
assert.equal(purchase.tax, 34.95);
assert.equal(purchase.order_id, "PT-MOCK0001");
assert.equal(purchaseEventId("PT-MOCK0001"), "purchase_PT-MOCK0001");

const report = {
  note: "Events Manager setup wizard shows names only. Values below are what Pixel + CAPI send.",
  pixelAndCapi: ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"],
  delivery: {
    funnel: "POST /api/meta/capi immediately (no cron)",
    purchase: "same eventID on Pixel, live CAPI, and outbox; Hobby cron expire-orders is backup only",
  },
  events: {
    PageView: { parameters: {}, eventID: "pv_<uuid>" },
    ViewContent: viewContent,
    AddToCart: addToCart,
    InitiateCheckout: initiateCheckout,
    Purchase: { ...purchase, eventID: purchaseEventId("PT-MOCK0001") },
  },
};

console.log(JSON.stringify(report, null, 2));

const root = process.cwd();
function assertFile(rel: string, needle: string) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  assert.ok(text.includes(needle), `${rel} should contain ${needle}`);
}
assertFile("src/app/api/meta/capi/route.ts", "sendCapiEvents");
assertFile("src/lib/meta-pixel-client.ts", "/api/meta/capi");
assertFile("src/lib/meta-pixel-client.ts", "eventID");
assertFile("vercel.json", "/api/cron/expire-orders");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
assert.equal(vercel.includes("/api/cron/meta-capi"), false, "do not add a second Hobby cron");

console.log("\nCAPI mock parameter values verified.");
