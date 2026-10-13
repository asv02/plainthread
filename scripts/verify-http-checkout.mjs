const customer = {
  name: "Browser Test",
  email: "buyer@plainthread.in",
  phone: "9876543210",
  address_line1: "14 Marine Drive",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400020",
};
const items = [{ productSlug: "white-oversized-tshirt", size: "L", qty: 1 }];
const key = crypto.randomUUID();
const cookieJar = [];

function cookieHeader() {
  return cookieJar.join("; ");
}

function storeCookies(res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const raw of set) {
    const pair = raw.split(";")[0];
    if (pair) cookieJar.push(pair);
  }
}

async function json(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (cookieHeader()) headers.cookie = cookieHeader();
  const res = await fetch(url, { ...options, headers });
  storeCookies(res);
  const data = await res.json();
  return { status: res.status, data };
}

async function stock() {
  const res = await fetch("http://localhost:3000/api/variants");
  const data = await res.json();
  return data.variants.find((v) => v.sku === "PT-OTS-001-SW-L").stock;
}

const start = await stock();
const first = await json("http://localhost:3000/api/checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idempotencyKey: key, items, customer }),
});
const second = await json("http://localhost:3000/api/checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idempotencyKey: key, items, customer }),
});
const held = await stock();

if (first.data.order.publicId !== second.data.order.publicId) {
  throw new Error("double click created two orders");
}
if (held !== start - 1) throw new Error(`expected hold ${start - 1}, got ${held}`);
if (first.data.accessToken) throw new Error("checkout JSON must not include accessToken");

const paid = await json("http://localhost:3000/api/checkout/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publicId: first.data.order.publicId,
    simulate: true,
  }),
});
if (paid.data.order.status !== "paid" && paid.data.order.paymentStatus !== "paid") {
  throw new Error("pay failed");
}

const cancelled = await json(
  `http://localhost:3000/api/orders/${first.data.order.publicId}/cancel`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  },
);
if (cancelled.data.order.status !== "cancelled") throw new Error("cancel failed");
const restored = await stock();
if (restored !== start) throw new Error(`restock failed ${start} vs ${restored}`);

const dismissKey = crypto.randomUUID();
const pending = await json("http://localhost:3000/api/checkout", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idempotencyKey: dismissKey, items, customer }),
});
await json(`http://localhost:3000/api/orders/${pending.data.order.publicId}/cancel`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ reason: "payment_modal_dismissed" }),
});
const late = await json("http://localhost:3000/api/checkout/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    publicId: pending.data.order.publicId,
    simulate: true,
  }),
});
if (late.status !== 409 || late.data.result !== "late_payment") {
  throw new Error(`expected late_payment, got ${JSON.stringify(late)}`);
}
const afterLate = await stock();
if (afterLate !== start) throw new Error("late payment changed stock");

console.log("http_edge_cases: ok", first.data.order.publicId);
