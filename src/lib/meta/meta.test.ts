import assert from "node:assert/strict";
import test from "node:test";
import { catalogProductId, paiseToRupees } from "./catalog";
import {
  customDataLooksSafe,
  isEligiblePaidPurchase,
  orderEventSourceUrl,
  purchaseCustomData,
  purchaseEventId,
  shouldEnqueueCapiPurchase,
} from "./events";
import { hashOnce, hashedUserData, normalizeEmail, normalizePhone } from "./hash";
import { validateFbc, validateFbp } from "./fbp-fbc";
import {
  buildConsentRecord,
  isMarketingConsentGrantedFromHeader,
  parseAdConsent,
  parseConsentRecord,
  serializeConsentCookie,
} from "./consent";

test("hashes Meta sample email once", () => {
  const normalized = normalizeEmail("John_Smith@gmail.com");
  assert.equal(normalized, "john_smith@gmail.com");
  assert.equal(
    hashOnce(normalized!),
    "62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f",
  );
});

test("does not double-hash", () => {
  const hashed = hashOnce("john_smith@gmail.com");
  assert.equal(hashOnce(hashed), hashed);
});

test("normalizes India phone with country code", () => {
  assert.equal(normalizePhone("09876543210"), "919876543210");
  assert.equal(normalizePhone("+91 98765 43210"), "919876543210");
  assert.equal(normalizePhone("9876543210"), "919876543210");
  assert.equal(normalizePhone("123"), null);
});

test("product ids are product-level slugs", () => {
  assert.equal(catalogProductId("black-oversized-tshirt"), "black-oversized-tshirt");
});

test("purchase eligibility and simulated exclusion", () => {
  const paid = {
    status: "open",
    payment_status: "paid",
    payment_method: "prepaid" as const,
    paid_at: new Date().toISOString(),
    razorpay_payment_id: "pay_123",
    total_paise: 89900,
    marketing_consent: true,
  };
  assert.equal(isEligiblePaidPurchase(paid), true);
  assert.equal(shouldEnqueueCapiPurchase(paid), true);
  assert.equal(shouldEnqueueCapiPurchase({ ...paid, marketing_consent: false }), false);
  assert.equal(
    isEligiblePaidPurchase({ ...paid, razorpay_payment_id: "sim_PT-ABC" }),
    false,
  );
  assert.equal(isEligiblePaidPurchase({ ...paid, payment_status: "refunded" }), false);
  assert.equal(isEligiblePaidPurchase({ ...paid, payment_method: "cod" }), false);
});

test("purchase payload uses rupees and public id, not secrets", () => {
  const custom = purchaseCustomData(
    {
      status: "open",
      payment_status: "paid",
      payment_method: "prepaid",
      paid_at: new Date().toISOString(),
      public_id: "PT-ABCD1234",
      total_paise: 89900,
      tax_paise: 4500,
      shipping_paise: 0,
      currency: "INR",
    },
    [{ product_slug: "white-oversized-tshirt", qty: 1, unit_price_paise: 69900 }],
  );
  assert.equal(custom.value, 899);
  assert.equal(custom.tax, 45);
  assert.equal(custom.shipping, 0);
  assert.equal(custom.order_id, "PT-ABCD1234");
  assert.deepEqual(custom.content_ids, ["white-oversized-tshirt"]);
  assert.equal(customDataLooksSafe(custom), true);
  assert.equal(purchaseEventId("PT-ABCD1234"), "purchase_PT-ABCD1234");
  assert.equal(orderEventSourceUrl("PT-ABCD1234"), "https://plainthread.in/orders/PT-ABCD1234");
  assert.equal(orderEventSourceUrl("PT-ABCD1234").includes("token"), false);
  assert.equal(paiseToRupees(179800), 1798);
});

test("fbp/fbc validation", () => {
  assert.ok(validateFbp("fb.1.1596403881668.1116446470"));
  assert.equal(validateFbp("not-a-cookie"), null);
  assert.ok(validateFbc("fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890"));
});

test("pixel custom data keeps ecommerce fields only", async () => {
  const { pickCustomData } = await import("../meta-pixel-client");
  const picked = pickCustomData({
    content_ids: ["black-oversized-tshirt"],
    content_type: "product",
    value: 699,
    currency: "INR",
    email: "buyer@plainthread.in",
    token: "secret",
    accessToken: "nope",
  });
  assert.deepEqual(picked, {
    content_ids: ["black-oversized-tshirt"],
    content_type: "product",
    value: 699,
    currency: "INR",
  });
});

test("consent cookie parses legacy and versioned records", () => {
  assert.equal(parseAdConsent("granted"), "granted");
  assert.equal(parseAdConsent("denied"), "denied");
  assert.equal(parseAdConsent("true"), null);
  const encoded = serializeConsentCookie(buildConsentRecord("granted", "2026-10-12T00:00:00.000Z"));
  const record = parseConsentRecord(encoded);
  assert.equal(record?.choice, "granted");
  assert.equal(record?.categories.marketing, true);
  assert.equal(record?.categories.essential, true);
  assert.equal(record?.policyVersion, "2026-10");
  const header = `cart=1; pt_ad_consent=${encoded}; other=x`;
  assert.equal(isMarketingConsentGrantedFromHeader(header), true);
  assert.equal(isMarketingConsentGrantedFromHeader("pt_ad_consent=denied"), false);
  assert.equal(isMarketingConsentGrantedFromHeader(""), false);
  assert.equal(isMarketingConsentGrantedFromHeader("pt_ad_consent=granted"), true);
});

test("user matching omits empty and hashes PII", () => {
  const data = hashedUserData({
    email: " Buyer@PlainThread.in ",
    phone: "9876543210",
    userId: "user-1",
    city: "Gurugram",
    state: "Haryana",
    pincode: "122001",
    country: "IN",
  });
  assert.equal(data.em, hashOnce("buyer@plainthread.in"));
  assert.equal(data.ph, hashOnce("919876543210"));
  assert.ok(!("fbp" in data));
  assert.equal(Object.values(data).every((value) => /^[a-f0-9]{64}$/.test(value)), true);
});
