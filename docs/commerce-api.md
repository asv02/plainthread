# Plain Thread commerce: frontend, APIs, and Supabase

This document is for a new developer. It explains how the shop on this Next.js app talks to the backend, what every commerce API does, what it returns, which helpers it uses, and how money and stock stay consistent.

Secrets (`access_token`, Razorpay signatures, admin password, `CRON_SECRET`) are **never** logged. Logs are JSON lines from `src/lib/log.ts`.

| `LOG_LEVEL` | What you see |
| --- | --- |
| `debug` | Default in `next dev`. Cart pricing, RPC names, stock loads. |
| `info` | Default in production. Order created, paid, cancelled, cron ran. |
| `error` | Failures only. |

---

## Big picture

The browser **never** talks to Supabase with the service role. The **anon** key exists for the public site, but orders, stock holds, and payments go through **Next.js Route Handlers**. Those handlers use `supabaseAdmin()` (`SUPABASE_SERVICE_ROLE_KEY`) to call Postgres **RPCs** and tables. RLS is on; anon has no policies, so the browser cannot mutate commerce tables even if someone copies the anon key.

```
Browser (React)
  ShopProvider  →  localStorage cart
  CheckoutForm  →  POST /api/create-order  (= /api/checkout)
                →  Razorpay Checkout.js (hosted)
                →  POST /api/verify-payment  (= /api/checkout/verify)
                →  GET  /api/orders/:id?token=
                →  POST /api/orders/:id/cancel

Razorpay servers
                →  POST /api/webhooks/razorpay

Vercel Cron
                →  GET/POST /api/cron/expire-orders

Admin UI
                →  POST /api/admin/login
                →  GET/PATCH /api/admin

Next.js
                →  Supabase RPC + tables
                →  Razorpay REST (create order, refund)
                →  Resend (paid emails)
```

**Two IDs, do not mix them**

| ID | Who creates it | Role |
| --- | --- | --- |
| `public_id` e.g. `PT-A1B2C3D4` | Postgres in `checkout_create` | Shown to humans, used in URLs |
| `orders.id` UUID | Postgres | Internal FK |
| `razorpay_order_id` `order_…` | Razorpay | Checkout widget + webhook lookup |
| `razorpay_payment_id` `pay_…` | Razorpay | Capture / refund |
| `idempotency_key` UUID | Browser `crypto.randomUUID()` | Dedupes double-clicks for **one** checkout attempt |
| `access_token` hex | Postgres | Secret capability URL for that order |

---

## How frontend and backend stay in sync

### Cart (client only until Pay)

`ShopProvider` (`src/components/shop/ShopProvider.tsx`) keeps `{ productSlug, size, qty }[]` in React state and `localStorage` key `plain-thread-cart-v1`.

On load it also `GET /api/variants` so size buttons know stock. **Held** stock (pending unpaid checkouts) is already subtracted in `variants.stock`, so the UI shows remaining sellable units.

The cart is **not** an order. Nothing is reserved until Pay hits checkout.

### Pay click (the contract)

`CheckoutForm` (`src/components/shop/CheckoutForm.tsx`) sends:

```json
{
  "idempotencyKey": "<uuid from keyRef>",
  "items": [{ "productSlug": "black-oversized-tshirt", "size": "M", "qty": 1 }],
  "customer": {
    "name": "…",
    "email": "…",
    "phone": "9876543210",
    "address_line1": "…",
    "address_line2": "",
    "city": "…",
    "state": "Haryana",
    "pincode": "122001"
  }
}
```

**Prices are not in the payload.** The server looks up `products.ts`, computes GST and shipping, and ignores any client price.

`idempotencyKey` lives in a ref:

- New UUID when the **cart `items` array** changes (size/qty/product).
- **Same** UUID if the customer closes Razorpay and clicks Pay again (so they reuse the hold and the same Razorpay order).
- Closing Razorpay does **not** cancel the order. The hold lasts `STOCK_HOLD_MINUTES` (default 5).

After checkout succeeds, the form opens Razorpay with `order_id` from the API. Razorpay `handler` then POSTs payment ids + signature to verify. On success the cart is cleared and the router goes to `/orders/{publicId}?token={accessToken}`.

`OrderView` loads `GET /api/orders/{publicId}?token=` and can `POST .../cancel`.

Admin never uses the customer token; it uses an httpOnly cookie from `/api/admin/login`.

---

## `idempotencyKey` in payment

1. Browser sends the key with checkout.
2. `checkout_create` looks up an **active** order (`pending_payment` or `paid`/`packed`/`shipped`/`delivered`) with that key.
3. If found: **no second stock hold**. Customer fields on `pending_payment` are updated (so they can fix the address and Pay again). Same `public_id` and existing `razorpay_order_id` are reused.
4. Unique partial index `orders_idempotency_active` enforces this in the database. A race of two identical POSTs: one inserts, the other hits unique violation and returns the existing row.
5. After the hold is cancelled/expired, the key can be reused to create a **new** order (cancelled rows are outside the unique index).
6. Changing the cart generates a **new** key, so a new hold can exist beside the old one until the old hold expires.

Razorpay also has its own order id. Double-open of Checkout.js with the same `order_id` cannot create two Razorpay orders for that attempt.

---

## `timingSafeEqual`

`src/lib/shop/serialize.ts` compares two strings of **equal length** with XOR so comparison time does not leak which character failed.

Used for:

| Call | Compared |
| --- | --- |
| Order GET / cancel / verify | `access_token` vs query/body token |
| Admin login | password vs `ADMIN_PASSWORD` |
| Cron | Bearer vs `CRON_SECRET` |
| Razorpay checkout HMAC | hex digest vs `razorpay_signature` (`node:crypto.timingSafeEqual` on Buffers) |
| Razorpay webhook HMAC | digest vs `x-razorpay-signature` |

If lengths differ, our string helper returns `false` immediately (length is leaked; values are not). Tokens are generated at fixed length so this is acceptable.

**Never** use `===` for tokens or signatures.

---

## Shared helpers (called by APIs)

### `src/lib/shop/pricing.ts`

- `validateCustomer` — trims fields, Indian 10-digit mobile (`6–9…`), 6-digit PIN. Throws user-facing strings.
- `priceCart` — merges duplicate slug+size, caps qty (`MAX_LINE_QTY` 5, `MAX_ORDER_QTY` 20), unit price from `getProduct`, then `calculateGst` + `shippingPaise()`.
- `tryPriceCart` — same, returns `{ ok, totals, error }` for the checkout UI.

### `src/lib/shop/tax.ts`

GST from env (`GST_RATE_PERCENT` default 5, exclusive unless `GST_INCLUSIVE`). Origin `GST_ORIGIN_STATE`. Same normalized state → CGST+SGST split; else IGST. Tax applies to goods **plus** shipping.

### `src/lib/shop/config.ts`

Shipping rupees, hold minutes, site URL, `razorpayConfigured()`, `simulatedPaymentsAllowed()` (true only if `ALLOW_SIMULATED_PAYMENTS=true` **and** not production **and** no `RAZORPAY_KEY_ID`).

### `src/lib/shop/serialize.ts`

`toPublicOrder` — strips internal UUIDs, exposes `canCancel` for `pending_payment` and `paid` only.

### `src/lib/shop/orders.ts`

Thin wrappers around Supabase. Throws on PostgREST errors. `expireStaleOrders` tries `p_exclude_id`; if the live DB still has the old zero-arg function (`PGRST202`), it falls back. `getOrderByPublicId` expires holds, then loads items and a fresh order row in parallel.

### `src/lib/shop/complete-payment.ts`

`completeCapturedPayment(orderId, paymentId)`:

1. RPC `mark_order_paid`
2. On `paid` / `already_paid` → customer + ops email in parallel with Purchase CAPI enqueue/process (failures are isolated)
3. On `already_paid` with a **different** payment id → refund the extra capture
4. On `late_payment` (order already cancelled) → refund this capture

### `src/lib/payments/razorpay.ts`

Create Razorpay order (amount in **paise**, min 100), refund, verify checkout HMAC `order_id|payment_id`, verify webhook HMAC of **raw body**.

### `src/lib/email/send.ts`

Resend HTML receipt. Sets `customer_email_sent_at` / `ops_email_sent_at` only after a successful send.

### `src/lib/shop/cron-auth.ts`

Bearer `CRON_SECRET` via `timingSafeEqual`. Empty secret → unauthorized.

### `src/lib/shop/admin-auth.ts`

Cookie `pt_admin` = HMAC-SHA256 of a constant using `ADMIN_PASSWORD` as key.

---

## Supabase RPCs (how they work)

Postgres functions live in `supabase/schema.sql`. Next.js calls them with:

```ts
supabaseAdmin().rpc("checkout_create", { p_idempotency_key: "…", … })
```

PostgREST maps JSON keys to function arguments. The service role bypasses RLS. Functions run in a **transaction**: stock decrement + order insert either both commit or both roll back.

`FOR UPDATE` on variant rows (ordered by `v.id`) prevents deadlocks when two checkouts grab M and L in opposite order.

`expire_stale_orders(p_exclude_id)` cancels `pending_payment` rows with `hold_expires_at < now()`, except the optional UUID (so a capture can still mark **this** order paid after the clock expired).

### `checkout_create`

Expires other stale holds → find existing active idempotency row or lock variants, decrement stock, insert `orders` + `order_items` with `stock_held=true`, `hold_expires_at = now() + N minutes`.

Returns JSON `{ order, items }` (`order_payload`).

### `attach_razorpay_order`

Sets `razorpay_order_id` once if still `pending_payment` (`coalesce` so retries do not overwrite).

### `mark_order_paid`

Expires **other** stale holds (not this id, after schema apply) → lock this row:

| Current status | Result |
| --- | --- |
| `pending_payment` | `paid`, stores payment id |
| `paid` / packed / shipped / delivered | `already_paid` + stored payment id |
| `cancelled` | `late_payment` |
| missing | `not_found` |

### `cancel_customer_order`

| Status | Result |
| --- | --- |
| `pending_payment` | Restock, `cancelled_pending` |
| `paid` | `needs_refund` (does not restock yet; sets `refund_pending`) |
| `cancelled` | `already_cancelled` |
| packed / shipped / delivered | `not_cancellable` |

### `finalize_refund_cancel`

Requires status still `paid`. Sets `cancelled` + `refunded`, restocks.

### `mark_payment_failed`

Only if still `pending_payment`. Does **not** restock; customer can retry the same Razorpay order.

### `admin_set_status`

Allowed: `paid→packed`, `packed→shipped` (or `paid→shipped`), `packed|shipped→delivered`. Not from cancelled.

### `expire_stale_orders`

Returns count cancelled. `SKIP LOCKED` so cron and checkout do not wait on the same row.

---

## APIs

Aliases: `POST /api/create-order` re-exports checkout. `POST /api/verify-payment` re-exports checkout verify.

### `GET /api/variants`

**When:** Shop provider mount; after failed checkout; admin load also expires holds separately.

**Does:** `expireStaleOrders()` then select variant stock.

**Success `200`:** `{ variants: [{ product_slug, size, sku, stock }] }`

**Error `500`:** `{ error }`

**After:** UI enables Add to cart when `stock != null` and not 0.

---

### `POST /api/checkout` and `POST /api/create-order`

**When:** Customer clicks Pay.

**Flow:** validate key (≥ 8 chars) → validate customer → `priceCart` → `checkout_create` → if already `paid`, return `alreadyPaid` → if no Razorpay keys, simulate or `503` + restock → create/attach Razorpay order.

**Success `200`**

Already paid:

```json
{ "alreadyPaid": true, "order": { "publicId": "PT-…", "status": "paid", "…" }, "accessToken": "…" }
```

Simulate (local only):

```json
{ "provider": "simulate", "order": { }, "accessToken": "…", "keyId": null, "razorpayOrderId": null, "amountPaise": 73395 }
```

Live:

```json
{
  "provider": "razorpay",
  "order": { "publicId": "PT-…", "status": "pending_payment", "totalPaise": 73395, "canCancel": true, "items": [ ] },
  "accessToken": "hex",
  "keyId": "rzp_…",
  "razorpayOrderId": "order_…",
  "order_id": "order_…",
  "amount": 73395,
  "amountPaise": 73395,
  "currency": "INR"
}
```

(`amount` is paise, as Razorpay Checkout expects.)

**Errors**

| Status | `error` |
| --- | --- |
| 400 | Missing checkout key; invalid name/email/phone/address/PIN; empty cart; invalid qty |
| 409 | Size sold out |
| 503 | Razorpay not configured and simulate off |
| 4xx/5xx | Razorpay API message |

**After:** Browser opens Razorpay. Stock is held. If Razorpay create fails, order is cancelled and stock returned.

**Edge cases:** Duplicate Pay with same key reuses order. Paid key returns `alreadyPaid` and the UI jumps to the order page.

---

### `POST /api/checkout/verify` and `POST /api/verify-payment`

**When:** Razorpay `handler` after success, or simulate path immediately after checkout.

**Body (live):**

```json
{
  "publicId": "PT-…",
  "accessToken": "hex",
  "razorpay_order_id": "order_…",
  "razorpay_payment_id": "pay_…",
  "razorpay_signature": "hmac-hex"
}
```

Simulate: `{ publicId, accessToken, simulate: true }` — rejected unless simulate is allowed.

**Auth:** Load order by `publicId`, `timingSafeEqual` token. Wrong token → `404 Order not found` (do not leak existence).

**Does:** HMAC verify → payment id must match stored Razorpay order → `completeCapturedPayment`.

**Success `200`:** `{ result: "paid" | "already_paid", order, accessToken }`

**Errors**

| Status | Meaning |
| --- | --- |
| 400 | Missing fields, bad signature, payment/order mismatch, generic verify failure |
| 403 | Simulate disabled |
| 404 | Bad publicId/token |
| 409 | `late_payment` (auto refund) or could not confirm |

**After:** Emails fire (best-effort + retry). Frontend navigates to the order page. Webhook may run the same function again (`already_paid` is a no-op except duplicate-payment refund).

---

### `POST /api/webhooks/razorpay`

**When:** Razorpay, typically `payment.captured`, `order.paid`, `payment.failed`. Configure the URL in the Razorpay dashboard. This is the source of truth if the user closes the tab after paying.

**Auth:** HMAC of **raw body** with `RAZORPAY_WEBHOOK_SECRET`. Invalid → `400`.

**Does:** Parse event → find order by `razorpay_order_id` → insert `payment_events` (unique `provider_event_id`). Duplicate still runs `completeCapturedPayment` for captures so a crash after insert cannot drop a payment.

No matching order → `200 { ok: true, ignored: true }` (Razorpay must not retry forever on 5xx for unknown orders; we acknowledge).

**Success:** `{ ok: true }` or `{ ok: true, duplicate: true }`

**After:** Same as verify: paid flag, emails, possible refunds.

**Edge:** `order.paid` without `payment.id` is logged and skipped; `payment.captured` must carry the id.

---

### `GET /api/orders/[publicId]?token=`

**When:** Order page load (`OrderView`).

**Success `200`:** `{ order: PublicOrder, accessToken }`

**404:** Bad id or token.

**After:** UI shows status, cancel button if `canCancel`.

---

### `POST /api/orders/[publicId]/cancel`

**Body:** `{ accessToken, reason? }`

**When:** Customer clicks cancel (unpaid or paid, not packed).

**Success `200`:** `{ result, order?, accessToken? }`  
`result` is `cancelled_pending`, `refunded`, `already_cancelled`, or `not_cancellable`.

**404 / 400:** Token fail / RPC throw.

**After:** Paid cancel refunds Razorpay then restocks. Packed+ cannot cancel here; use returns after delivery.

---

### `GET|POST /api/cron/expire-orders`

**When:** Vercel cron every 5 minutes (`vercel.json`). Also conceptually the same expire runs on variants/admin/checkout RPCs.

**Auth:** `Authorization: Bearer $CRON_SECRET`. Empty secret → 401.

**Success `200`:** `{ ok: true, expired: number, emailed: number }`

**401 / 500:** Unauthorized / job throw.

**After:** Stale holds restocked. Unsent paid emails retried (needs email columns on `orders`).

---

### `POST /api/admin/login`

**Body:** `{ password }` compared with `timingSafeEqual` to `ADMIN_PASSWORD`.

**200:** `{ ok: true }` + httpOnly cookie `pt_admin` (7 days).

**401 / 500:** Invalid password / admin not configured.

---

### `GET /api/admin`

Cookie required. Expires stale holds. Returns last 50 orders **without** `access_token`, plus line items, address, totals, email-sent flags, and all variants.

**401:** `{ error: "Unauthorized" }`

---

### `PATCH /api/admin`

Cookie required.

Stock: `{ kind: "stock", sku, stock }` → `{ ok: true }`

Status: `{ kind: "status", orderId, status }` where status is `packed` | `shipped` | `delivered` → `{ ok: true, payload }` (RPC JSON).

**400:** Invalid stock/status/transition.

**After:** Customer `canCancel` becomes false once packed.

---

## Happy path (money)

1. Pay → checkout_create holds stock, creates Razorpay order.
2. Customer pays.
3. Browser verify **and/or** webhook `payment.captured` → `mark_order_paid`.
4. Resend invoices; cron retries if send failed.
5. Admin: packed → shipped → delivered.
6. Optional: customer cancel while `paid` → refund + restock.

If the browser dies at step 2, step 3 webhook still marks paid.

If they close Razorpay without paying, stock stays held until cron/variants expire the hold.

---

## Status machine

`pending_payment` → `paid` → `packed` → `shipped` → `delivered`  
`pending_payment` → `cancelled` (expire, dismiss is **not** cancel, user cancel, payments_not_configured, razorpay_create_failed)  
`paid` → `cancelled` (customer cancel + refund)

Payment status is separate: `created` | `failed` | `paid` | `refund_pending` | `refunded`.

---

## What not to log

Do not add `access_token`, `razorpay_signature`, webhook raw body, admin password, or API keys to `log.*`. Payment ids and `publicId` are OK.
