import test, { before, mock } from "node:test";
import assert from "node:assert/strict";

const VALID_TOKEN = "a".repeat(32);

let signedInUser: { id: string; email: string } | null = null;
let ownsResult = false;
let loadedPayload: Record<string, unknown> | null = null;
const cancelCalls: Array<{ id: string; reason: string }> = [];

mock.module("./customers", {
  namedExports: {
    getCustomerFromCookie: async () => signedInUser,
    customerOwnsOrderWithLinks: async () => ownsResult,
    customerCookieName: "pt_account",
    upsertCustomer: async () => "u1",
    createCustomerSession: async () => ({ token: "x", expiresAt: new Date() }),
    deleteCustomerSession: async () => {},
    listVerifiedEmails: async () => [],
  },
});

mock.module("./orders", {
  namedExports: {
    getOrderByPublicId: async () => loadedPayload,
    cancelCustomerOrder: async (id: string, reason: string) => {
      cancelCalls.push({ id, reason });
      return { result: "cancelled", payload: loadedPayload };
    },
    finalizeRefundCancel: async () => ({ result: "cancelled", payload: loadedPayload }),
  },
});

mock.module("./serialize", {
  namedExports: {
    toPublicOrder: (p: { order: { public_id: string } }) => ({ publicId: p.order.public_id }),
    timingSafeEqual: () => false,
  },
});

mock.module("./config", {
  namedExports: {
    razorpayConfigured: () => false,
    simulatedPaymentsAllowed: () => false,
  },
});

function makePayload() {
  return {
    order: {
      id: "o-1",
      public_id: "PT-TEST-1",
      access_token: VALID_TOKEN,
      user_id: "u1",
      status: "pending",
      payment_status: "paid",
      payment_method: "card",
      total_paise: 199900,
      parcel_status: "unshipped",
    },
    items: [],
  };
}

let getOrderRoute: { GET: (req: Request, ctx: { params: Promise<{ publicId: string }> }) => Promise<Response> };
let cancelRoute: { POST: (req: Request, ctx: { params: Promise<{ publicId: string }> }) => Promise<Response> };
let orderAccess: typeof import("./order-access");

before(async () => {
  getOrderRoute = await import("../../app/api/orders/[publicId]/route");
  cancelRoute = await import("../../app/api/orders/[publicId]/cancel/route");
  orderAccess = await import("./order-access");
});

function ctx(publicId = "PT-TEST-1") {
  return { params: Promise.resolve({ publicId }) };
}

test("orderSessionAuthorized: signed-out user never authorized, valid token irrelevant", async () => {
  const auth = await orderAccess.orderSessionAuthorized(makePayload() as never, null);
  assert.equal(auth.ok, false);
  assert.equal(auth.signedIn, false);
});

test("orderSessionAuthorized: owning session authorized", async () => {
  ownsResult = true;
  const auth = await orderAccess.orderSessionAuthorized(makePayload() as never, {
    id: "u1",
    email: "a@b.c",
  } as never);
  assert.equal(auth.ok, true);
  assert.equal(auth.signedIn, true);
  ownsResult = false;
});

test("GET order: signed out with valid token in query → 401, no order data", async () => {
  signedInUser = null;
  ownsResult = false;
  loadedPayload = makePayload();
  const res = await getOrderRoute.GET(
    new Request(`http://localhost/api/orders/PT-TEST-1?token=${VALID_TOKEN}`),
    ctx(),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.order, undefined);
  assert.match(body.error, /sign in/i);
});

test("GET order: signed-in owner → 200 with order", async () => {
  signedInUser = { id: "u1", email: "a@b.c" };
  ownsResult = true;
  loadedPayload = makePayload();
  const res = await getOrderRoute.GET(new Request("http://localhost/api/orders/PT-TEST-1"), ctx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.order.publicId, "PT-TEST-1");
});

test("GET order: signed-in non-owner → 404 (no existence leak)", async () => {
  signedInUser = { id: "u2", email: "x@y.z" };
  ownsResult = false;
  loadedPayload = makePayload();
  const res = await getOrderRoute.GET(new Request("http://localhost/api/orders/PT-TEST-1"), ctx());
  assert.equal(res.status, 404);
});

test("GET order: unknown id, signed out → 401 not 404 (no enumeration)", async () => {
  signedInUser = null;
  loadedPayload = null;
  const res = await getOrderRoute.GET(new Request("http://localhost/api/orders/PT-NOPE"), ctx("PT-NOPE"));
  assert.equal(res.status, 401);
});

test("cancel: signed out with valid accessToken in body → 401 and cancel NOT executed", async () => {
  signedInUser = null;
  ownsResult = false;
  loadedPayload = makePayload();
  cancelCalls.length = 0;
  const req = new Request("http://localhost/api/orders/PT-TEST-1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken: VALID_TOKEN, reason: "customer_cancelled" }),
  });
  const res = await cancelRoute.POST(req, ctx());
  assert.equal(res.status, 401);
  assert.equal(cancelCalls.length, 0);
});

test("cancel: signed-in owner → 200 and cancel executed once", async () => {
  signedInUser = { id: "u1", email: "a@b.c" };
  ownsResult = true;
  loadedPayload = makePayload();
  cancelCalls.length = 0;
  const req = new Request("http://localhost/api/orders/PT-TEST-1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "customer_cancelled" }),
  });
  const res = await cancelRoute.POST(req, ctx());
  assert.equal(res.status, 200);
  assert.deepEqual(cancelCalls, [{ id: "o-1", reason: "customer_cancelled" }]);
});

test("cancel: signed-in non-owner → 404 and cancel NOT executed", async () => {
  signedInUser = { id: "u2", email: "x@y.z" };
  ownsResult = false;
  loadedPayload = makePayload();
  cancelCalls.length = 0;
  const req = new Request("http://localhost/api/orders/PT-TEST-1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken: VALID_TOKEN }),
  });
  const res = await cancelRoute.POST(req, ctx());
  assert.equal(res.status, 404);
  assert.equal(cancelCalls.length, 0);
});

test("cancel: empty body still requires session (signed out → 401)", async () => {
  signedInUser = null;
  loadedPayload = makePayload();
  cancelCalls.length = 0;
  const req = new Request("http://localhost/api/orders/PT-TEST-1/cancel", {
    method: "POST",
    body: "not json",
  });
  const res = await cancelRoute.POST(req, ctx());
  assert.equal(res.status, 401);
  assert.equal(cancelCalls.length, 0);
});
