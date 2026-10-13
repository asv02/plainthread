import assert from "node:assert/strict";
import test from "node:test";
import { catalogProductId, paiseToRupees } from "./catalog";
import {
  addToCartCustomData,
  customDataLooksSafe,
  initiateCheckoutCustomData,
  isEligiblePaidPurchase,
  isValidMetaEventId,
  orderEventSourceUrl,
  pickCustomData,
  purchaseCustomData,
  purchaseEventId,
  shouldEnqueueCapiPurchase,
  viewContentCustomData,
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

test("pixel custom data keeps ecommerce fields only", () => {
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

test("ViewContent parameter values are numeric INR slugs", () => {
  const data = viewContentCustomData({
    id: "black-oversized-tshirt",
    name: "Black Oversized T-Shirt",
    priceRupees: 699,
  });
  assert.equal(data.value, 699);
  assert.equal(data.currency, "INR");
  assert.equal(data.content_type, "product");
  assert.equal(data.content_category, "Oversized T-Shirts");
  assert.equal(data.content_name, "Black Oversized T-Shirt");
  assert.deepEqual(data.content_ids, ["black-oversized-tshirt"]);
  assert.deepEqual(data.contents, [
    { id: "black-oversized-tshirt", quantity: 1, item_price: 699 },
  ]);
});

test("AddToCart value is this add, not cart total", () => {
  const data = addToCartCustomData({
    id: "white-oversized-tshirt",
    quantity: 2,
    itemPriceRupees: 699,
  });
  assert.equal(data.value, 1398);
  assert.equal(data.currency, "INR");
  assert.deepEqual(data.content_ids, ["white-oversized-tshirt"]);
  assert.equal(data.contents[0].quantity, 2);
  assert.equal(data.contents[0].item_price, 699);
});

test("InitiateCheckout exposes the six Meta wizard parameters with values", () => {
  const data = initiateCheckoutCustomData({
    contents: [{ id: "black-oversized-tshirt", quantity: 1, item_price: 699 }],
    value: paiseToRupees(73395),
  });
  assert.deepEqual(Object.keys(data).sort(), [
    "content_ids",
    "content_type",
    "contents",
    "currency",
    "num_items",
    "value",
  ]);
  assert.equal(data.value, 733.95);
  assert.equal(data.num_items, 1);
  assert.equal(data.currency, "INR");
  assert.equal(data.content_type, "product");
  assert.deepEqual(data.content_ids, ["black-oversized-tshirt"]);
  assert.deepEqual(data.contents, [
    { id: "black-oversized-tshirt", quantity: 1, item_price: 699 },
  ]);
});

test("browser CAPI builder attaches eventID and strips secrets from URL", async () => {
  const { buildBrowserCapiEvent, parseBrowserCapiBody } = await import("./browser-capi");
  const parsed = parseBrowserCapiBody({
    event_name: "InitiateCheckout",
    event_id: "ic_testevent_123456",
    event_source_url: "http://localhost:3000/checkout?token=secret&otp=123456",
    custom_data: initiateCheckoutCustomData({
      contents: [{ id: "pink-oversized-tshirt", quantity: 1, item_price: 699 }],
      value: 733.95,
    }),
    fbp: "fb.1.1596403881668.1116446470",
    email: "should-be-blocked@plainthread.in",
  });
  assert.equal(parsed.ok, false);
  const okParsed = parseBrowserCapiBody({
    event_name: "InitiateCheckout",
    event_id: "ic_testevent_123456",
    event_source_url: "http://localhost:3000/checkout?token=secret",
    custom_data: initiateCheckoutCustomData({
      contents: [{ id: "pink-oversized-tshirt", quantity: 1, item_price: 699 }],
      value: 733.95,
    }),
    fbp: "fb.1.1596403881668.1116446470",
  });
  assert.equal(okParsed.ok, true);
  if (!okParsed.ok) return;
  const consent = serializeConsentCookie(buildConsentRecord("granted"));
  const request = new Request("http://localhost:3000/api/meta/capi", {
    headers: {
      cookie: `pt_ad_consent=${consent}`,
      "user-agent": "PlainThreadTest/1.0",
      "x-forwarded-for": "203.0.113.10",
    },
  });
  const event = buildBrowserCapiEvent(okParsed.value, request);
  assert.ok(!("error" in event));
  if ("error" in event) return;
  assert.equal(event.event_name, "InitiateCheckout");
  assert.equal(event.event_id, "ic_testevent_123456");
  assert.equal(event.event_source_url.includes("token"), false);
  assert.equal(event.custom_data?.value, 733.95);
  assert.equal(event.custom_data?.currency, "INR");
  assert.equal(event.custom_data?.num_items, 1);
  assert.equal(event.user_data.fbp, "fb.1.1596403881668.1116446470");
  assert.equal(event.user_data.client_ip_address, "203.0.113.10");
  const denied = buildBrowserCapiEvent(
    okParsed.value,
    new Request("http://localhost:3000/api/meta/capi", {
      headers: { cookie: "pt_ad_consent=denied" },
    }),
  );
  assert.deepEqual(denied, { error: "consent" });
  assert.equal(isValidMetaEventId("ic_testevent_123456"), true);
});

test("mock Graph POST includes parameter values not just names", async () => {
  const { sendCapiEvents } = await import("../meta-capi");
  const captured: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const previousToken = process.env.META_CAPI_ACCESS_TOKEN;
  const previousCode = process.env.META_CAPI_TEST_EVENT_CODE;
  process.env.META_CAPI_ACCESS_TOKEN = "test-access-token";
  process.env.META_CAPI_TEST_EVENT_CODE = "TEST12345";
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    captured.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await sendCapiEvents([
      {
        event_name: "InitiateCheckout",
        event_time: 1_700_000_000,
        event_id: "ic_mock_graph_001",
        action_source: "website",
        event_source_url: "https://plainthread.in/checkout",
        user_data: { fbp: "fb.1.1596403881668.1116446470" },
        custom_data: initiateCheckoutCustomData({
          contents: [{ id: "black-oversized-tshirt", quantity: 1, item_price: 699 }],
          value: 733.95,
        }),
      },
    ]);
    assert.equal(result.ok, true);
    const body = captured[0] as {
      test_event_code?: string;
      data: Array<{ custom_data: Record<string, unknown>; event_id: string }>;
    };
    assert.equal(body.test_event_code, "TEST12345");
    assert.equal(body.data[0].event_id, "ic_mock_graph_001");
    assert.equal(body.data[0].custom_data.value, 733.95);
    assert.equal(body.data[0].custom_data.currency, "INR");
    assert.equal(body.data[0].custom_data.num_items, 1);
    assert.deepEqual(body.data[0].custom_data.content_ids, ["black-oversized-tshirt"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken == null) delete process.env.META_CAPI_ACCESS_TOKEN;
    else process.env.META_CAPI_ACCESS_TOKEN = previousToken;
    if (previousCode == null) delete process.env.META_CAPI_TEST_EVENT_CODE;
    else process.env.META_CAPI_TEST_EVENT_CODE = previousCode;
  }
});
