# Plain Thread --- Production Design: Meta Pixel + Conversions API

**Repository:** `asv02/plainthread`\
**Stack:** Next.js App Router, TypeScript, Supabase/Postgres, Razorpay\
**Meta Pixel ID:** `1765251828052032`\
**Status:** Production design review --- implement only after reviewing
the acceptance criteria below.

------------------------------------------------------------------------

## 1. Executive decision

The original design has the right foundation but is **not yet
production-complete**. Keep the existing browser Pixel and its
`PageView` implementation. Add standard browser events for product and
checkout activity, and use server-side Conversions API (CAPI) as the
authoritative purchase signal.

Production changes required before launch:

1.  Define an exact, typed parameter contract for every event.
2.  Keep browser and CAPI purchase payloads consistent and use a shared
    deterministic `event_id`.
3.  Create a durable database outbox for Purchase delivery and retry
    failed sends.
4.  Treat database payment state---not a success URL, client callback,
    or webhook payload alone---as the source of truth.
5.  Capture attribution and matching fields in a privacy-aware way.
6.  Prevent order access tokens or other secrets from appearing in Pixel
    page URLs, referrers, logs, or event payloads.
7.  Test payment retries, late payments, duplicate webhooks, refunds,
    consent/opt-out, and Meta event deduplication.

**Data principle:** collect and send every *relevant, permitted, and
useful* matching signal---not every piece of information the business
happens to possess. Extra personal data can increase privacy and
security risk without improving match quality.

## 2. Verified existing architecture

The repository inspection confirms these relevant paths:

-   `src/lib/meta-pixel.ts`: central Pixel ID.
-   `src/components/analytics/MetaPixel.tsx`: initializes the Pixel and
    emits the initial `PageView`.
-   `src/components/analytics/MetaPixelPageView.tsx`: emits `PageView`
    on App Router navigation.
-   `src/components/shop/AddToCart.tsx`: Add to cart and Buy now
    actions; both call `addItem`.
-   `src/components/shop/CheckoutForm.tsx`: checkout form, cart, and
    Razorpay flow.
-   `src/app/api/checkout/route.ts`: validates checkout, prices cart
    server-side, creates the order and Razorpay order, and links
    customer records.
-   `src/components/shop/OrderView.tsx`: loads an order using a public
    ID plus access token and displays payment state.
-   `src/lib/shop/complete-payment.ts`: shared payment completion flow;
    `completeCapturedPayment()` calls `markOrderPaid()`.
-   `src/app/api/webhooks/razorpay/route.ts`: verifies Razorpay webhook
    signatures and handles duplicate provider events.
-   `src/lib/shop/types.ts`: `DbOrder`, `DbOrderItem`, and `PublicOrder`
    shapes.
-   `supabase/schema.sql`: orders and order-items schema.

Relevant database fields include `orders.status`,
`orders.payment_status`, `orders.payment_method`, `orders.paid_at`,
`orders.total_paise`, `orders.subtotal_paise`, `orders.tax_paise`,
`orders.shipping_paise`, `orders.email`, `orders.phone`,
`orders.user_id`; order items include `product_slug`, `sku`, `qty`, and
`unit_price_paise`.

The app currently has a custom order state machine. COD is disabled in
the current checkout flow; do not treat COD as a completed purchase. The
checkout/order URL currently carries an access token as a query
parameter. That needs a dedicated privacy fix before using PageView or
other tracking on the order page.

## 3. Goals and non-goals

### Goals

-   Track the funnel with standard Meta events and consistent product
    identifiers.
-   Send server-side `Purchase` only for an order whose persisted state
    proves a valid, successful payment.
-   Preserve `fbp`/`fbc` attribution identifiers and permitted
    customer-matching fields when available.
-   Make event delivery idempotent and recoverable after server/network
    failures.
-   Avoid changing checkout behavior if Meta is unavailable.
-   Make event values and parameters reconcilable with actual orders.
-   Support consent/opt-out decisions and minimize stored personal data.

### Initial scope

-   Browser: `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`,
    and paid `Purchase`.
-   Server: durable CAPI `Purchase` delivery.
-   Optional later events: `Search`, `AddPaymentInfo`, `AddToWishlist`,
    and refund reporting, only when the corresponding real user action
    exists and is implemented accurately.

### Explicitly do not send

-   Card numbers, CVV, bank credentials, UPI PINs, OTPs, Razorpay
    signatures, checkout verification tokens, order access tokens, or
    authentication/session tokens.
-   Full street address or address line as custom event data.
-   Raw email or phone inside `custom_data`, URLs, or application logs.
-   Sensitive categories or unrelated customer profile data.
-   Arbitrary URL query strings, coupon codes containing personal data,
    or form contents.

## 4. Event contract --- exact parameters

Use the exact Meta standard event names and case. All monetary `value`
fields sent to Meta are **decimal rupees**, not paise. Currency is
`INR`.

### 4.1 `PageView` --- browser only

**Trigger:** initial page view and client-side navigation to a
meaningful page.

**Parameters:** no custom ecommerce parameters required.

**Rules:** - Keep the existing Pixel initialization; do not add a second
Pixel or a second initial `PageView`. - Keep the existing first-render
guard in `MetaPixelPageView`. - Do not send PageView on every React
render. - Never expose order access tokens in the page URL that Pixel
can read. See Section 8. - Do not send CAPI `PageView` initially. It
adds complexity and no value unless a complete browser/server
deduplication strategy is implemented.

### 4.2 `ViewContent` --- browser

**Trigger:** product detail content is actually rendered for a valid
product, not merely when a product link is clicked.

**Parameters:**

  Parameter            Required policy                       Source
  -------------------- ------------------------------------- --------------
  `content_ids`        Array of stable product/catalog IDs   Product data
  `content_type`       `"product"`                           Constant
  `content_name`       Product display name                  Product data
  `content_category`   Product category, if available        Product data
  `contents`           `[{id, quantity: 1, item_price}]`     Product data
  `value`              Unit selling price in INR             Product data
  `currency`           `"INR"`                               Constant

Do not send a fake value or a placeholder product ID. If the product is
not found, do not emit `ViewContent`.

### 4.3 `AddToCart` --- browser

**Trigger:** after `addItem(productSlug, size, qty)` successfully
updates the cart. Do not fire when the button is clicked if the action
fails or stock validation prevents the addition.

**Parameters:**

  ------------------------------------------------------------------------------
  Parameter               Required policy                Source
  ----------------------- ------------------------------ -----------------------
  `content_ids`           IDs for the item(s) added in   Product/catalog mapping
                          this action                    

  `content_type`          `"product"`                    Constant

  `contents`              One object per item/variant:   Added line and product
                          `{id, quantity, item_price}`   data

  `value`                 Sum of added quantity × unit   Product data
                          price, in INR                  

  `currency`              `"INR"`                        Constant
  ------------------------------------------------------------------------------

-   `value` is the value of the items added in this action, not the
    entire pre-existing cart.
-   `Buy now` should emit `AddToCart` because the current handler adds
    the item before navigating to checkout.
-   Do not emit twice for one action.
-   `size` may be retained in first-party analytics, but do not invent a
    non-standard Meta parameter unless there is a defined use for it.

### 4.4 `InitiateCheckout` --- browser

**Trigger:** checkout is entered with a non-empty, hydrated cart. Avoid
firing while cart state is still loading or empty.

**Parameters:**

  -----------------------------------------------------------------------------
  Parameter               Required policy         Source
  ----------------------- ----------------------- -----------------------------
  `content_ids`           All cart                Current cart
                          product/catalog IDs     

  `content_type`          `"product"`             Constant

  `contents`              One object per          Current cart
                          line/variant with ID,   
                          quantity, item price    

  `value`                 Documented checkout     Current
                          value in INR            displayed/server-calculated
                                                  totals

  `currency`              `"INR"`                 Constant

  `num_items`             Sum of quantities       Current cart
                          across lines            
  -----------------------------------------------------------------------------

Fire once per checkout-entry/cart snapshot, not on every render or every
field edit. If the user changes the cart materially and starts a new
checkout attempt, a new event may be appropriate; define this behavior
consistently.

For reliable reporting, use the same pricing basis across checkout and
purchase where possible. Purchase always uses the stored order amount.

### 4.5 `AddPaymentInfo` --- deferred

Do **not** emit merely because the Razorpay modal opened, the customer
typed email/phone, or the checkout form was submitted. Add it only if
the Razorpay integration exposes a reliable signal that payment
information was actually submitted/selected.

If implemented, include `content_ids`, `content_type`, `contents`,
`value`, `currency`, and `num_items`. Do not include payment method
credentials or bank/UPI details. A payment method category such as
`"card"` or `"upi"` should only be added if the integration reliably
supplies it and there is a clear analytics use.

### 4.6 `Purchase` --- browser and server CAPI

**Authoritative trigger:** the database confirms the order is paid and
eligible for purchase reporting. A return URL, modal success callback,
or webhook receipt alone is not proof.

**Eligibility policy:** - `status === "open"` -
`payment_status === "paid"` - `payment_method === "prepaid"` - stored
`paid_at` and captured payment identifiers are consistent with the
payment completion flow - the order is not cancelled, `refund_pending`,
or `refunded` - exclude simulated/test payments from production events

The existing `completeCapturedPayment()` handles `paid`, `already_paid`,
and `late_payment` results. Do not emit a Purchase for `late_payment` if
the payment is being refunded. The outbox worker must re-check current
order state before sending.

**Custom data contract:**

  --------------------------------------------------------------------------------
  Parameter               Policy                           Source
  ----------------------- -------------------------------- -----------------------
  `content_ids`           Product/catalog IDs for every    Stored order items plus
                          purchased line                   ID mapping

  `content_type`          `"product"`                      Constant

  `contents`              `[{id, quantity, item_price}]`   Stored order items
                          for every line                   

  `value`                 `total_paise / 100` under the    Stored order
                          chosen policy below              

  `currency`              `"INR"`                          Stored order /
                                                           validated constant

  `order_id`              Stable non-secret public order   `order.public_id`
                          ID                               

  `num_items`             Sum of item quantities           Stored order items

  `tax`                   `tax_paise / 100`                Stored order

  `shipping`              `shipping_paise / 100`           Stored order
  --------------------------------------------------------------------------------

**Revenue policy:** this design defines Purchase `value` as the actual
stored order total paid by the customer, including tax and shipping.
Send `tax` and `shipping` separately as additional breakdown fields.
Keep the same policy for browser and CAPI events, and document it in
reporting so ROAS can be reconciled with finance. If the business later
chooses product subtotal excluding tax/shipping, change both sources
together and document the migration.

**Browser event:** emit from the order page only after the API response
confirms the eligible paid state. The page must handle the case where
payment is still pending on first load: re-fetch/poll with bounded
retries or refresh after the payment callback, rather than permanently
missing the event. A refresh can emit the same deterministic event ID;
Meta deduplication should handle browser/server copies, but do not rely
on the browser event for reliable purchase delivery.

**CAPI event fields:** - `event_name: "Purchase"` - `event_time`:
persisted payment confirmation timestamp (`paid_at`) as Unix seconds -
`event_id`: deterministic ID, e.g. `purchase_${order.public_id}` -
`action_source: "website"` - `event_source_url`: canonical
order-confirmation URL **without access token or query parameters** -
`user_data`: permitted matching fields described in Section 5 -
`custom_data`: the purchase contract above

Both browser and server must use exactly the same `event_name`
(`Purchase`) and `event_id` for the same order. In the browser Pixel
call, pass the ID in the Pixel options object as `eventID`; in CAPI,
send it as `event_id`.

Do not create a second Purchase when a webhook is retried, when
`completeCapturedPayment()` returns `already_paid`, or when the customer
reloads the order page.

### 4.7 Optional events

-   `Search`: only when a real site-search action exists; send the query
    only if it does not contain personal information. Consider omitting
    the raw query and tracking a safe category instead.
-   `AddToWishlist`: only if a real wishlist feature exists.
-   `Lead` / `CompleteRegistration`: only if those user actions exist
    and have a clear definition.
-   Refunds: Meta does not provide a standard ecommerce `Refund` event
    equivalent to `Purchase`. If refund analytics is needed, send a
    clearly named custom event such as `OrderRefunded` only after the
    refund is confirmed, or keep refund reporting in the first-party
    database/analytics. Never send a second Purchase for a refund.

## 5. Customer matching: useful fields, normalization, and exclusions

CAPI `user_data` is distinct from `custom_data`. Send only fields that
are actually available, valid, permitted by the user's consent state,
and useful for matching. Missing values should be omitted---not sent as
empty strings, `"undefined"`, or fabricated values.

### 5.1 Preferred matching fields

  ------------------------------------------------------------------------------
  CAPI field            Source               Processing before Notes
                                             sending           
  --------------------- -------------------- ----------------- -----------------
  `em`                  Verified checkout    Trim, lowercase,  Hash the
                        email                normalize,        normalized value;
                                             SHA-256           never log raw
                                                               value

  `ph`                  Verified checkout    Normalize to a    India numbers
                        phone                consistent        must be
                                             international     normalized
                                             format; remove    consistently; do
                                             formatting;       not blindly strip
                                             follow Meta's     digits without a
                                             current           country rule
                                             country-code      
                                             rules; SHA-256    

  `external_id`         Stable first-party   Stable canonical  Never use order
                        `user_id` when       string, SHA-256   access token,
                        present                                email, or a
                                                               random per-event
                                                               ID

  `fn` / `ln`           Customer name, only  Split carefully,  Omit if name
                        if useful and        trim, lowercase,  parsing is
                        consented            normalize,        ambiguous; do not
                                             SHA-256           send the full
                                                               name in custom
                                                               data

  `ct`                  Customer city        Normalize,        Only if available
                                             lowercase, remove and useful
                                             unnecessary       
                                             punctuation,      
                                             SHA-256           

  `st`                  State/region         Normalize         Use a consistent
                                             consistently,     representation
                                             lowercase,        
                                             SHA-256           

  `zp`                  Postal/PIN code      Normalize per     Do not convert to
                                             Meta guidance,    a number;
                                             SHA-256           preserve leading
                                                               zeros

  `country`             Country              Normalize to      For India use
                                             lowercase ISO     `in` before
                                             3166-1 alpha-2    hashing
                                             code, SHA-256     

  `fbp`                 Valid `_fbp` cookie  Send raw,         Do not hash
                                             unchanged         

  `fbc`                 Valid `_fbc` cookie  Send raw,         Do not fabricate
                        or valid             unchanged         from an arbitrary
                        click-ID-derived                       query parameter
                        value                                  

  `client_ip_address`   Trusted client IP    Send raw IP       Never trust
                        derived from the                       arbitrary
                        request/deployment                     user-supplied
                        proxy                                  forwarding
                                                               headers unless
                                                               the deployment
                                                               proxy is trusted

  `client_user_agent`   Request `User-Agent` Send raw          Do not hash
                                             user-agent string 
  ------------------------------------------------------------------------------

Meta's accepted fields and formatting rules can change; verify the
current official customer-information parameter documentation before
coding the final normalization helper. Do not send every possible field
just because the API supports it.

### 5.2 Fields not to collect just for ad matching

Do not add gender, date of birth, precise location, full address, social
account IDs, or other profile attributes solely to improve Meta
matching. Do not send street address lines or the entire checkout form.
These are unnecessary for the current apparel purchase use case.

### 5.3 Browser Pixel advanced matching

The initial version can use CAPI customer matching for Purchase. If
browser advanced matching is later enabled, do it only with the correct
consent state and documented privacy review. Do not place raw
email/phone in event `custom_data`, URLs, console logs, or local
storage. Do not initialize a second Pixel.

### 5.4 Hashing rules

-   SHA-256 is applied to normalized customer matching fields that Meta
    requires hashed.
-   Do not hash `fbp`, `fbc`, IP address, or user agent.
-   Do not hash an already hashed value a second time.
-   Hashing is pseudonymization, not anonymization; hashed identifiers
    remain personal data for privacy/security planning.
-   Use Node's built-in crypto API on the server. Do not use
    browser-submitted hashed values as trusted identity.

## 6. Attribution capture and schema

Capture `_fbp` and `_fbc` when available, with the same consent policy
as the Pixel. Preserve them for the checkout/order so the eventual
server Purchase can be attributed even if the user closes the page.

Suggested nullable order columns:

``` sql
alter table public.orders
  add column if not exists meta_fbp text,
  add column if not exists meta_fbc text,
  add column if not exists meta_client_ip_address text,
  add column if not exists meta_client_user_agent text,
  add column if not exists marketing_consent boolean,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_consent_source text;
```

Notes: - Apply only columns that fit the final consent design and
retention policy. IP/UA are personal data; consider not storing them
long-term and instead capture them in a short-lived, access-controlled
event/outbox record. - Never accept arbitrary `meta_fbp`/`meta_fbc`
values from an untrusted request without format/length validation. - Do
not expose these fields through `PublicOrder`, customer APIs, client
props, admin exports, or logs unless there is a documented operational
need. - Store no CAPI access token in the database. - Add an appropriate
migration to the canonical schema and ensure it is safe to run more than
once. - `fbp` and `fbc` are attribution/matching identifiers, not proof
of consent. A valid cookie must not override a user's opt-out.

## 7. Durable delivery: transactional outbox

### Why this is required

An inline CAPI request after `markOrderPaid()` can fail due to timeout,
deployment restart, network issues, rate limits, or Meta errors. Logging
the failure is not delivery. Production should use a durable outbox.

### Recommended data model

Create a `meta_event_outbox` table with:

-   `id` UUID primary key
-   `event_name` text
-   `event_id` text
-   `order_id` UUID foreign key
-   `status` (`pending`, `processing`, `sent`, `retry`, `dead_letter`,
    or equivalent)
-   `attempt_count` integer
-   `next_attempt_at` timestamptz
-   `last_http_status` integer nullable
-   `last_error_code` text nullable, sanitized
-   `created_at`, `updated_at`, `sent_at`
-   unique constraint on `(event_name, event_id)` or another equivalent
    unique key

Do not store a raw full CAPI payload forever. Build it from the order
and order items at send time where possible; if a payload snapshot is
necessary for deterministic retries, keep it minimal, restrict access,
and apply retention/deletion rules.

### Transaction boundary

Best option: enqueue the `Purchase` outbox row in the same database
transaction/RPC that changes the order to paid, and only on the valid
paid transition. This avoids a crash gap between payment persistence and
event enqueueing.

If changing the RPC is not feasible immediately, add an idempotent
enqueue operation after `markOrderPaid()` and a reconciliation job that
finds eligible paid orders missing a Purchase outbox row. The fallback
is less robust than a transactional outbox.

### Worker behavior

1.  Claim a small batch safely (transaction/row lock or equivalent) so
    multiple workers do not send the same row concurrently.
2.  Load the order and items from the database.
3.  Re-check eligibility immediately before sending. Do not send for
    cancelled, `refund_pending`, refunded, COD, or simulated/test
    orders.
4.  Build `event_time` from `paid_at`; validate timestamp age against
    Meta's current event acceptance window.
5.  POST to
    `https://graph.facebook.com/{SUPPORTED_VERSION}/{PIXEL_ID}/events`.
6.  Mark sent only after a valid success response; inspect Meta's
    response body, not just HTTP status.
7.  Retry network errors, timeouts, HTTP 429, and retryable 5xx errors
    with exponential backoff and jitter.
8.  Treat permanent validation/authentication errors as `dead_letter`
    and alert the operator.
9.  Use bounded attempts and alert on a growing backlog.
10. Never let a Meta error fail or reverse a successfully confirmed
    payment.

Use a supported Graph API version confirmed against current Meta docs;
keep it configurable and review before version sunset. Do not assume a
version number in an old design remains supported indefinitely.

## 8. Critical privacy fix: order access token in URL

Current checkout navigates to
`/orders/${order.publicId}?token=${token}`. That token is an access
credential. A tracking Pixel may read the current URL; URLs can also
enter browser history, analytics, server logs, screenshots, and referrer
flows.

Before enabling tracking on the order page:

1.  Redesign token handling so the access token is not exposed to
    third-party scripts or analytics.
2.  Preferred design: use a secure, short-lived, same-site, `HttpOnly`,
    `Secure` cookie or another server-mediated access mechanism rather
    than a long-lived token in the query string. Review CSRF and
    order-access implications before choosing cookies.
3.  If a transition period requires query tokens, do not send Pixel
    events while the token is present; avoid passing that URL as
    `event_source_url`; remove it from the address bar only after safely
    preserving the required access state; ensure refresh and direct-link
    behavior still works.
4.  Ensure no logs record the token or full query string.
5.  Use a clean canonical event URL such as
    `https://plainthread.in/orders/{publicId}` with no query parameters.
6.  Add a regression test that asserts `token`, OTPs, emails, phone
    numbers, and other secrets never appear in Meta event URLs or custom
    event data.

Do not simply strip the token from the URL without designing how the
order page will continue to authenticate subsequent API requests.

## 9. Consent, privacy, and retention

-   Add a clear, documented consent/opt-out mechanism appropriate to the
    markets served and applicable law/platform terms.
-   The same consent/opt-out state must govern both browser Pixel events
    and server CAPI events. Server-side delivery must not bypass a
    user's choice.
-   Record consent state and timestamp only as needed to prove/operate
    the preference; do not infer consent from the presence of a cookie.
-   Do not use Meta's limited-data-use flags as a generic replacement
    for consent. Apply any regional data-processing options only when
    they are appropriate for the actual user and current Meta guidance.
-   Publish/update the privacy notice to describe advertising
    measurement, identifiers, sharing with Meta, and the opt-out
    process.
-   Define retention periods for attribution identifiers, IP/UA, hashed
    identifiers, outbox errors, and event logs. Purge data when no
    longer needed.
-   Restrict access to orders and outbox tables with database policies;
    service-role credentials must remain server-only.
-   Sanitize logs and monitoring events. Never log tokens, raw
    email/phone, full address, raw CAPI payloads, or access tokens.
-   Obtain appropriate legal/privacy review for the actual countries and
    consent experience. This document is technical design, not legal
    advice.

## 10. Product ID and catalog consistency

Meta catalog matching works only if event IDs match the catalog item IDs
exactly.

Create one central helper/mapping for event product IDs. Choose the
identifier based on the eventual catalog feed: - If catalog entries are
product-level: use the same product-level ID consistently. - If each
size/SKU is a distinct catalog item: use the corresponding variant/SKU
ID consistently.

Do not mix `product_slug` in browser events with `sku` in Purchase. The
current order items contain both, so the mapping should be explicit and
unit-tested. Until a catalog is configured, a stable product-level slug
can be used for funnel consistency, but document that catalog matching
may require changing it later.

## 11. Implementation architecture and file plan

### Browser helper

Add a small client-only helper such as `src/lib/meta-pixel-client.ts`: -
Calls `window.fbq` only if available. - Provides typed wrappers for the
supported standard events. - Does not initialize the Pixel. - Does not
throw if tracking is blocked or Pixel fails to load. - Applies consent
gating consistently. - Accepts only whitelisted event payload fields. -
Never includes customer contact data or access tokens.

### Event instrumentation

-   `src/app/products/[slug]/page.tsx`: keep the server-rendered product
    page; add a small client event component or client-side hook that
    emits `ViewContent` once for the valid product.
-   `src/components/shop/AddToCart.tsx`: emit `AddToCart` after the add
    operation; use the same handler data for Add to cart and Buy now.
-   `src/components/shop/CheckoutForm.tsx` or a dedicated checkout
    analytics component: emit `InitiateCheckout` after a non-empty cart
    is ready, with a once-per-attempt guard.
-   `src/components/shop/OrderView.tsx`: emit browser `Purchase` only
    when fetched order state meets the eligibility policy. Handle
    pending-to-paid transition with bounded polling or a
    payment-completion refresh.
-   `src/app/api/checkout/route.ts`: capture consent and valid
    attribution identifiers securely; never use client-provided monetary
    values for Purchase.
-   `src/lib/shop/complete-payment.ts`: preserve payment flow and ensure
    the valid paid transition enqueues a Purchase outbox record.
-   `src/app/api/webhooks/razorpay/route.ts`: retain signature
    validation and existing provider-event idempotency; do not send CAPI
    directly from every webhook branch.
-   Add `src/lib/meta-capi.ts` for server-only payload construction,
    normalization/hashing, API call, and response parsing.
-   Add a worker/cron route or scheduled job to process the outbox;
    protect it with a server-side secret and ensure concurrent claims
    are safe.
-   Update `supabase/schema.sql` and migrations, types, and tests.

### Server-only environment variables

``` dotenv
META_CAPI_ACCESS_TOKEN=server_only_secret
META_GRAPH_API_VERSION=verified_supported_version
META_CAPI_TEST_EVENT_CODE=optional_test_code_only
META_CAPI_WORKER_SECRET=strong_random_server_secret
```

-   Do not prefix secrets with `NEXT_PUBLIC_`.
-   Keep real secrets out of source control and logs.
-   Use the test event code only in test/staging; production must not
    accidentally route events to the Test Events view.
-   Use the existing Pixel ID constant to avoid configuration drift.
-   The worker secret protects the endpoint but does not replace
    authorization, rate limiting, or safe job claiming.

## 12. Payload examples

### Browser `AddToCart` example

``` ts
window.fbq?.("track", "AddToCart", {
  content_ids: ["plain-thread-product-id"],
  content_type: "product",
  contents: [{ id: "plain-thread-product-id", quantity: 2, item_price: 899 }],
  value: 1798,
  currency: "INR",
});
```

Use actual IDs/prices/quantity from the action; this is illustrative
only. If one item is added, do not report the entire cart value.

### Server `Purchase` shape (illustrative)

``` ts
{
  event_name: "Purchase",
  event_time: paidAtUnixSeconds,
  event_id: `purchase_${publicOrderId}`,
  action_source: "website",
  event_source_url: "https://plainthread.in/orders/ORDER_PUBLIC_ID",
  user_data: {
    em: sha256(normalizedEmail),
    ph: sha256(normalizedPhone),
    external_id: sha256(stableFirstPartyUserId),
    fbp: validFbpOrOmit,
    fbc: validFbcOrOmit,
    client_ip_address: trustedClientIpOrOmit,
    client_user_agent: requestUserAgentOrOmit
  },
  custom_data: {
    content_ids: ["catalog-matching-id"],
    content_type: "product",
    contents: [{ id: "catalog-matching-id", quantity: 1, item_price: 899 }],
    value: 899,
    currency: "INR",
    order_id: "ORDER_PUBLIC_ID",
    num_items: 1,
    tax: taxRupees,
    shipping: shippingRupees
  }
}
```

This example intentionally omits unavailable fields. Build `contents`,
`content_ids`, `num_items`, value, tax, shipping, and identity from
verified database data. Confirm current Meta schema/normalization
requirements before shipping. Do not literally use placeholder strings
or example IDs.

## 13. Failure handling and observability

-   Tracking must never block checkout, payment verification, refunds,
    order page rendering, or email delivery.
-   Record event ID, event name, outbox status, attempt count, HTTP
    status, sanitized Meta error code, and timing.
-   Do not log CAPI access tokens or full user data.
-   Alert on dead-letter events, repeated auth errors, growing outbox
    backlog, and unexpectedly low Purchase volume.
-   Track internal metrics: eligible paid orders, outbox rows enqueued,
    events accepted by Meta, retry count, dead-letter count, and
    latency.
-   A Meta API success response does not guarantee correct attribution.
    Verify Events Manager diagnostics, event match quality, and
    browser/server deduplication.
-   Add reconciliation: eligible paid orders should have exactly one
    logical Purchase outbox row, even when webhook delivery is repeated.

## 14. Test plan --- mandatory before production

### Browser event tests

-   Product page emits one `ViewContent` with the correct product ID,
    name, value, and INR.
-   Add to cart emits once after a successful cart mutation.
-   Buy now emits one AddToCart and then one InitiateCheckout.
-   Checkout with an empty cart emits no InitiateCheckout.
-   React Strict Mode, rerenders, navigation, and Pixel blocking do not
    create runaway duplicate events.
-   Consent denied/withdrawn prevents the corresponding browser event
    from firing.

### Payment state tests

-   Successful prepaid payment creates one Purchase outbox record.
-   Duplicate Razorpay webhook does not create a second logical
    Purchase.
-   Repeated `completeCapturedPayment()` call does not create another
    Purchase.
-   Failed or pending payment creates no Purchase.
-   Cancelled order creates no Purchase.
-   Late payment that is refunded creates no Purchase if it is
    ineligible under the database state policy.
-   `refund_pending` and `refunded` orders do not get a new Purchase.
-   COD and simulated test payments are excluded from production.
-   Browser order page loaded while pending eventually reports Purchase
    after confirmed paid state, without relying on a manual refresh.
-   Browser and server Purchase use the exact same event name and event
    ID.
-   Purchase value, tax, shipping, currency, content IDs, quantities,
    and order ID match the stored order.
-   Server/network failure leaves the order paid and creates a retryable
    outbox state.
-   Worker retries transient failures and dead-letters permanent errors.

### Privacy/security tests

-   Access token is never included in Pixel/CAPI event URLs or logs.
-   No raw email, phone, address, OTP, payment data, or secrets appear
    in `custom_data`.
-   Hashed values are normalized and SHA-256 exactly once.
-   `fbp`/`fbc` are not hashed and are omitted when absent/invalid.
-   Client IP is obtained only through trusted proxy configuration.
-   Consent/opt-out prevents both browser and server event delivery as
    designed.
-   Server token is not exposed in client bundles or API responses.

### Meta validation

-   Use Meta Events Manager Test Events in staging.
-   Use Meta Pixel Helper for browser events.
-   Confirm Purchase deduplication using matching event name and event
    ID.
-   Check diagnostics and event parameter values.
-   Remove test event code and test credentials before production.
-   Run typecheck, lint, build, and payment/refund regression tests
    before deploy.

## 15. Rollout plan

1.  **Audit and privacy fix:** design safe order access-token handling;
    document consent policy.
2.  **Define IDs and payload contract:** decide catalog item ID strategy
    and value policy.
3.  **Implement typed browser helper:** no duplicate Pixel
    initialization.
4.  **Add browser funnel events:** ViewContent, AddToCart,
    InitiateCheckout.
5.  **Add schema and transactional outbox:** unique event key and safe
    worker claims.
6.  **Implement server CAPI Purchase:** server-only token, matching
    fields, event time/source, robust response parsing.
7.  **Add browser Purchase:** paid-state revalidation and shared event
    ID.
8.  **Run staging tests:** include duplicate/late/refund and consent
    cases.
9.  **Deploy with monitoring:** begin with Test Events, then production
    without test code.
10. **Reconcile for several days:** compare eligible paid orders to
    outbox rows and Meta diagnostics before relying on campaign
    optimization.

## 16. Acceptance criteria

Do not consider this production-ready until all are true:

-   [ ] Existing Pixel initializes exactly once and PageView is not
    duplicated on first load.
-   [ ] Every implemented event has a written trigger and typed
    parameter schema.
-   [ ] Product IDs are consistent across all events and match catalog
    IDs if a catalog is used.
-   [ ] Purchase uses only database-confirmed order data.
-   [ ] Purchase is not emitted for pending, failed, cancelled, COD,
    simulated, refund-pending, or refunded orders.
-   [ ] Outbox insertion is transactional or protected by an idempotent
    reconciliation process.
-   [ ] Worker retries transient failures safely and dead-letters
    permanent failures.
-   [ ] Browser and server Purchase use the same `event_name` and
    `event_id`.
-   [ ] CAPI `event_time`, `action_source`, and clean `event_source_url`
    are valid.
-   [ ] Customer matching fields are normalized correctly; hashed fields
    are hashed once; `fbp`/`fbc` are raw.
-   [ ] Consent/opt-out is respected on both client and server.
-   [ ] Order access tokens cannot leak through Pixel URLs, referrers,
    logs, or event data.
-   [ ] CAPI failure never breaks checkout or payment completion.
-   [ ] Test Events, Pixel Helper, typecheck, lint, build, and
    payment/refund regression tests pass.
-   [ ] Retention and deletion policies exist for stored identifiers and
    outbox data.

------------------------------------------------------------------------

## 17. Official references to verify during implementation

Use Meta's current official documentation as the source of truth because
API fields, accepted formats, and supported Graph API versions can
change:

-   Meta Conversions API overview:
    <https://developers.facebook.com/docs/marketing-api/conversions-api/>
-   Server event parameters:
    <https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event>
-   Customer information parameters:
    <https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters>
-   Custom data parameters:
    <https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/custom-data>
-   Meta Pixel standard events:
    <https://developers.facebook.com/docs/meta-pixel/reference/>

**Final recommendation:** implement the event contract and privacy fix
first, then build the durable Purchase outbox. Do not deploy an
implementation that only sends inline CAPI requests and logs failures;
production purchase tracking should be recoverable and auditable.
