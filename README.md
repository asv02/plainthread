# Plain Thread

SEO-first micro brand website for premium oversized essentials. Sends shoppers to Amazon and Flipkart with a psychology-led journey: Attention → Trust → Desire → Choice → Action.

## Stack

- Next.js App Router
- Tailwind CSS
- Framer Motion
- Lucide React
- MDX blog content
- JSON-LD structured data

## Architecture

```
/
/shop
/products
/products/black-oversized-tshirt
/products/white-oversized-tshirt
/products/pink-oversized-tshirt
/collections/oversized-tshirts
/why-plain-thread
/fabric
/size-guide
/care-guide
/about
/faq
/contact
/blog/*
/privacy
```

## Develop

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## SEO included

- `generateMetadata` + canonical URLs
- `sitemap.xml` + `robots.txt`
- Product, FAQ, Organization, Website, Breadcrumb, Article schema
- Keyword-rich product and blog URLs
- Internal linking across products, guides, and articles

## Customize marketplace links

Update marketplace URLs in `src/data/products.ts` with your official Amazon and Flipkart listing links.

Brand content referenced from [asv02/Plain-Theory](https://github.com/asv02/Plain-Theory).

## Homepage hero discount treatment

The homepage hero in `src/app/page.tsx` keeps the existing brand name, headline, product-quality copy, and CTA links, and adds a separate responsive “FLAT 15% OFF — ON ALL T-SHIRTS” seal on the right.

The seal is presentational. A matching `COUPON15` coupon must be created by an admin in the Coupons panel before the advertised 15% can be redeemed at checkout (see "Coupons and database-driven SKU pricing" below).

### Architecture

- Copy and both buttons stay in the left column. The seal is a second grid item.
- Below the `lg` breakpoint the seal stacks under the copy. At `lg` and up it sits in the right column.
- The warm ivory wash is an inline gradient on a decorative layer (`aria-hidden`).
- The branch is an inline SVG (`.plain-thread-hero-botanical` in `src/app/globals.css`), also `aria-hidden`.
- The seal is live HTML with `role="img"` and the label “Flat 15 percent off on all T-shirts”. `.plain-thread-discount-seal` draws the ring.

### Why this approach

Live text stays sharp and editable. An inline SVG avoids another image request. The existing collection and brand-story links stay on their current routes.

The botanical SVG needs an unlayered CSS height because `globals.css` sets `svg { height: auto }`, which would otherwise cancel the Tailwind height. The seal class draws the ring because the pull request named `.plain-thread-discount-seal` without a border rule.

### Alternatives considered

| Approach | Advantages | Disadvantages | Decision |
|---|---|---|---|
| HTML seal, ivory gradient, inline SVG branch | Editable copy, no extra asset, matches the circular editorial badge | Branch is illustrative, not a photograph | Selected |
| Use the supplied full hero image as the background | Closest pixel match to the reference | Bakes copy into an image and duplicates the existing HTML | Rejected |
| Separate botanical photo | More photorealistic | Extra asset and optimization work | Rejected |
| Small promotional pill | Simpler | Does not match the circular seal | Rejected |

### Verification

Checked in the running dev server:

- Desktop 1280px and 1024px: seal sits to the right of the copy, with a gap, and does not overlap the headline or buttons. Seal text stays inside the ring.
- Phone 390px: seal stacks under the buttons. No horizontal overflow.
- **Shop Collection** opens `/collections/oversized-tshirts`. **Why Plain Thread** opens `/why-plain-thread`.
- `npx tsc --noEmit` passed.
- `npx eslint src/app/page.tsx` passed. `npm run lint` still fails on six existing `react-hooks/set-state-in-effect` errors in admin, account, checkout, order, and cart code. Those files were not part of this change.

`npm run build` was not run while `next dev` was already serving the app.

### Maintenance

Changing the offer means editing the seal text in `src/app/page.tsx`. Discount application itself lives in the coupon engine described below, not in the hero. There is no React component test runner in this repo, so the hero was checked in the browser rather than with a new test dependency.

## Compare-at (strikethrough) price on every product

All three products show `₹825` struck through followed by the real selling price `₹699`, both on the product detail buy box and on the grid cards (Home, `/products`, `/shop`).

### Implementation

- `compareAtPrice: 825` is set on every product in `src/data/products.ts` (the optional `compareAtPrice` field already existed on the `Product` type but was never populated or rendered).
- `AddToCart` (`src/components/shop/AddToCart.tsx`) renders the struck-through `compareAtPrice` before the live price; the live price still comes from the server (`pricePaiseFor` → DB `price_paise`), so if the DB price ever changes, only the right-hand number moves — `₹825` is a static marketing MRP.
- `ProductCard` (`src/components/product/ProductCard.tsx`) previously showed no price at all; it now renders `formatPrice(compareAtPrice)` with Tailwind `line-through` plus `formatPrice(price)` from the static catalog.
- Purely display-level: quotes, coupons, checkout totals, Meta pixel values, and order persistence are untouched — customers are always charged the server-authoritative price.

**Alternatives considered**: a DB `compare_at_price_paise` column (rejected: needs a migration, RPC and quote-schema changes for a fixed marketing number that never participates in pricing) and computing the pair from a percentage (rejected: the spec names exact 825/699 values). **Trade-off kept**: grid cards show the static catalog price, which could diverge from the DB variant price if merchandising changes one but not the other; the detail page and all money paths remain server-authoritative.

### Verification (2026-10-17, compare-at display)

- Browser E2E on the dev server: `/products/black-oversized-tshirt` buy box renders `₹825` with computed `text-decoration-line: line-through` followed by `₹699`; `/shop` renders the pair on all three grid cards (`strikeCount` 3, each `"₹825₹699"`); the "More colours" related cards on the detail page also show the pair.
- `npx tsc --noEmit` passes; `npm run build` succeeds; `npm run lint` unchanged at the 5 pre-existing errors + 1 warning baseline.
- Full regression: `test:coupons` 19/19, `test:identity` 17/17, `test:email-sync` 13/13, `test:order-auth` 10/10, `test:meta` 15/15.
- Not covered by unit tests (no component test runner in this repo): the rendering itself is browser-verified only.

## Coupons and database-driven SKU pricing

Admin-configurable coupons integrate with the existing cart, checkout, and Razorpay flow. No thresholds or percentages are hardcoded; everything is read from the database per request.

### Eligibility modes

- `MIN_CART_VALUE` — coupon applies when the eligible merchandise subtotal (DB prices, shipping excluded) reaches the configured `min_cart_value_paise`.
- `MIN_QUANTITY` — coupon applies when the sum of unit quantities across eligible lines reaches `min_quantity` (units, not line items). Threshold only affects eligibility; the discount is still the percentage on the eligible monetary base.

`eligible_product_slugs` scopes which products count toward the threshold and the discount base; an empty list means all products. Orders are snapshots at apply time: editing or disabling a coupon never changes historical orders (`orders.coupon_code`, `coupon_percent`, `coupon_snapshot`, `discount_paise`).

### Code convention and validation

Codes are letters followed by a 1-2 digit discount number — `PLAIN5` (5%), `SAVE25` (25%), and the previous `COUPON10` all pass — and the stored `discount_percent` must equal that trailing number. Enforced twice: in TypeScript on admin mutations (`src/lib/shop/coupon.ts` `assertCouponCodeMatchesPercent` via `parseCouponDraft`, regex `^[A-Z]+[0-9]{1,2}$`) and by the `coupons_code_percent_check` DB constraint. Negatives: `PLAIN` (no digits), `5PLAIN`, `PLAIN5OFF`, `PLAIN123` (three digits, ambiguous), `PLAIN0`/`COUPON00`, mismatched percent (`PLAIN5` at 50%), and zero/negative/non-integer percentages are rejected. Existing databases need `supabase/migrations/20261017_coupon_code_text_plus_digits.sql` (replaces the old `^COUPON…$`-only constraint).

### Pricing authority

`variants.price_paise` is the authoritative SKU price. `src/lib/shop/quote-service.ts` `quoteAuthoritativeCart` is the single server-side pricing entry for `/api/pricing/quote` and checkout; the `checkout_create` RPC recomputes goods totals from DB prices under `for update` and raises `PRICE_CHANGED` if the client subtotal diverges. Client-supplied prices, percentages, and totals are never trusted; localStorage only stores cart lines (slug/size/qty) and the coupon code.

### Calculation order (integer paise, round-half-up)

1. DB prices → 2. eligible lines → 3. eligible subtotal → 4. eligibility rule → 5. discount = `round(eligible_subtotal × percent / 100)` (capped at the base, allocated per line with largest-remainder) → 6. GST on net goods, preserving the existing CGST/SGST vs IGST model → 7. unchanged flat shipping → 8. payable total, which is the exact amount sent to Razorpay and asserted against its echo.

### Buy Now and Cart Checkout are separate flows

`ShopProvider` holds a **checkout intent** in sessionStorage (`plain-thread-checkout-intent-v1`), either `{ type: "cart" }` or `{ type: "buyNow", productSlug, size }`:

- **Buy Now** on the product page never touches the cart. It sets the `buyNow` intent (the product page has no quantity selector — buy now always means exactly one unit of the selected variant) and navigates to `/checkout`, where the order line is derived from the intent, not from `items`. The intent survives refresh and back-navigation; completing the order resets the flow and leaves the cart untouched.
- **Cart checkout** is the default intent. The cart page's Checkout button explicitly resets the intent, and completing a cart order clears the cart as before.
- Switching intents clears the coupon, so a coupon chosen for one flow can never silently carry into the other.
- The intent is also sent to the server on `/api/pricing/quote` and `/api/checkout` (`checkoutIntent: {type:"BUY_NOW", product_slug, size}`), where `assertCheckoutIntentMatchesLines` rejects any BUY_NOW payload whose lines are not exactly one unit of that SKU (HTTP 400). The server still resolves prices, eligibility, stock, and totals itself; the intent only constrains the shape of the order.

### Cart quantities are capped by live stock

`ShopProvider` keeps the stock map from `GET /api/variants` in a ref and clamps every mutation: `addItem` and `setQty` never let a line's quantity exceed that variant's live stock (alongside the existing `MAX_LINE_QTY`/`MAX_ORDER_QTY` caps), the cart stepper's max is the stock of the line, and Add-to-cart shows "Only N left in {size} — that is the most you can order." when the cap is hit. SKUs with unknown stock fall back to the old caps. This is a UX guard; the `checkout_create` RPC remains the authority and still raises `OUT_OF_STOCK` at order creation if stock moved between browsing and paying.

### Coupon application happens only at checkout

- Product pages show eligible offers (`ProductOffers`, from `GET /api/coupons/offers`) with the condition text and "Apply the code at checkout" — there is no Apply button there.
- The cart page shows no coupon UI at all.
- Checkout is the single place to apply or remove a coupon. `CouponField` offers a dropdown of **server-filtered eligible coupons** (`POST /api/coupons/eligible` → `eligibleCheckoutCoupons()` in `src/lib/shop/coupon.ts`, which prices the exact checkout lines against every enabled coupon and returns only those that currently apply, best discount first) **and** a manual code box with the same server validation. Loading, empty, and list-fetch-error states are shown; changing the order contents re-fetches the list, and any applied coupon is re-validated on every quote — if it no longer qualifies the quote response clears it with the shortfall message.
- The Meta Pixel `CouponApplied` event fires only after a quote from the server confirms `applied: true`, deduplicated per code + line contents + discount.

### Admin and customer surfaces

- Admin (`/admin`): create/edit coupons, enable/disable, and per-SKU price editing. All mutations go through the service-role `PATCH /api/admin` behind the existing admin cookie check. Coupons cannot be deleted, only disabled.
- Customers: offers on product pages (`ProductOffers`, display-only), apply/remove at checkout (`CouponField`), server-quote-driven totals (`usePricingQuote` → `/api/pricing/quote`), discount rows in order confirmation and emails.

### Migrations

Fresh installs: `npm run db:apply` (applies `supabase/schema.sql`). Existing databases: run `supabase/migrations/20261014_coupons_sku_prices.sql` (adds `variants.price_paise` with a ₹699 backfill, order snapshot columns, the `coupons` table with RLS and no anon policies, and the new 17-arg `checkout_create`), then `supabase/migrations/20261017_coupon_code_text_plus_digits.sql` (replaces `coupons_code_percent_check` so codes are letters + a 1-2 digit discount number, e.g. `PLAIN5`, not just `COUPON` + two digits). Neither is applied automatically; `npm run db:verify` does not yet assert coupon schema.

### Verification (2026-10-16, Buy Now / Cart Checkout / SKU-aware coupons rework)

- `npm run test:coupons` — 17/17 pass. New cases: `parseCheckoutIntent`/`assertCheckoutIntentMatchesLines` (BUY_NOW payload must be exactly one unit of the selected SKU; CART_CHECKOUT and absent intents are unrestricted) and `eligibleCheckoutCoupons` (SKU scope, threshold miss, disabled coupon, best-discount ordering, invalid SKU surfaces a real error, single buy-now line).
- `npx tsc --noEmit` passes. `npm run build` succeeds.
- `npm run lint` — 5 errors + 1 warning remain, all pre-existing (`react-hooks/set-state-in-effect` in `AdminClient`, `AccountClient`, `OrderView`, the `ShopProvider`/`CheckoutForm` hydration effects, and the unused `_key` warning); verified against HEAD copies of the touched files so none were introduced by this change. The new `CouponField`/`usePricingQuote` effects were rewritten to avoid the pattern.
- `npm run test:meta` 15/15, `test:pixel` and `test:capi` mocks pass with `CouponApplied` added to the event list, id prefix, and custom-data allowlist.
- Browser E2E on the dev server (mock DB data, no real payments): PDP has no quantity selector and Add to cart adds exactly 1; Buy Now (including when the same SKU is already in the cart) opens checkout with a single line of the selected variant, leaves the cart untouched, and survives a refresh; switching flows clears the cart coupon (no carry-over) and the cart Checkout button restores the cart flow; product pages show offers with no Apply control; the cart page has no coupon UI; the checkout dropdown lists only coupons eligible for the current lines (COUPON10 appears at 3 units, disappears at 2), applied state shows the −₹209.70 discount with GST recomputed on the net (₹94.37, total ₹1,981.67), persists across refresh, Remove restores ₹2,201.85; negative inputs: COUPON10 below threshold → "Add 2 more eligible items…", unknown code → "Enter a valid coupon code.", an applied coupon invalidated by a cart edit is cleared with the shortfall message.
- Cart stock cap (2026-10-17): `npx tsc --noEmit` passes; `npm run lint` unchanged at the same 5 pre-existing errors + 1 warning. Browser E2E: repeated Add-to-cart on white M (stock 3) caps the line at 3 with the "Only 3 left in M…" message; black S (stock 1) caps at 1; on `/cart` both capped lines render with the Increase-quantity button disabled.
- Coupon code format + themed picker (2026-10-17): `npm run test:coupons` — 19/19, including the new format cases (`PLAIN5`/`SAVE25`/`NEWUSER1` accepted with matching percent; `PLAIN`, `5PLAIN`, `PLAIN5OFF`, `PLAIN123`, `PLAIN-5`, `PLAIN0`, and percent mismatches rejected; lowercase normalized). `npx tsc --noEmit` clean, `npm run build` succeeds, `npm run lint` still at the 5+1 pre-existing baseline. Browser E2E on `/checkout`: the coupon picker is now the shared `Dropdown` (same primitive and theme as the account menu — `role=menu`/`menuitem`, `aria-expanded`, ArrowDown roving focus, Escape closes and refocuses the trigger); selecting COUPON10 applied it ("COUPON10 applied · 10% off eligible items", −₹279.60 in the totals) and Remove restored the pre-coupon state. Not verified: creating a `PLAIN5` coupon end-to-end on the live database — the old `coupons_code_percent_check` is still applied there, so `supabase/migrations/20261017_coupon_code_text_plus_digits.sql` must be run in the SQL editor first (the TypeScript layer already accepts the new format).
- Not verified: completing a payment (Razorpay or simulate) requires an email OTP session and real/test credentials, out of scope for this change — the payment, stock-hold, idempotency, and `checkout_create` code paths are untouched apart from the extra intent assertion; `npm run test:checkout` fails on the live server for the same pre-existing reason (it predates the OTP gate and cannot obtain a `verifyToken`); `CouponApplied` pixel delivery is consent-gated and was verified at the plumbing level, not against live Meta endpoints.

## Persistent verified-email identity, customer orders and the shared dropdown

### Identity model (no new tables — existing sessions reused)

A successfully verified email **is** the customer identity. Two server-controlled cookies carry it, both `HttpOnly`, `SameSite=Lax`, `Secure` in production, path `/`:

- `pt_verify` — the existing `checkout_verify_sessions` token (2-hour sliding TTL). Set by `POST /api/checkout/otp/verify` after the OTP is consumed. The session row keeps the normalized email (trim + lowercase) and per-channel verified flags.
- `pt_account` — the existing 30-day `customer_sessions` cookie. The checkout OTP verify route additionally promotes a *successful email OTP* into a full customer session (`upsertCustomer` + `createCustomerSession`), so guest verification and the account system are the same identity — no parallel auth. When a different email is verified while an account is signed in, the old session is revoked and the new email takes over (see "One canonical email" below).

The session tokens are no longer returned in any API response, kept in refs, or stored in browser storage; `sessionToken`/`verifyToken` request fields survive only as fallbacks for scripted clients. The browser learns its state exclusively through `GET /api/checkout/identity` (`{ emailVerified, email, accountEmails, phoneVerified }`), which the checkout form calls on mount — so reloads, back/forward, page navigation, and checkout remounts do **not** re-trigger OTP. A failed OTP never sets any cookie.

### One canonical email: account email and checkout email are always the same

The browser carries exactly one customer email, and both surfaces write it in sync:

- **Checkout email change → account follows.** `POST /api/checkout/otp/verify` on a successful email OTP: if the verified email differs from the signed-in account's, the old session is signed out server-side (`deleteCustomerSession` revokes the `customer_sessions` row and expires `pt_account`) and the new email is promoted to a fresh 30-day session — the checkout email change *is* the sign-out + sign-in, deliberately (the user's chosen model), and the OTP is the proof that the person committing the change owns the new mailbox. Verifying the **same** email as the account touches nothing. An unverified email edit never signs anyone out — it just blocks checkout until the OTP passes, so typos and abandoned checkouts cannot destroy a session.
- **Account login → checkout follows.** `POST /api/account/login` (itself an email OTP) additionally writes the `pt_verify` session with the login email (`upsertVerifySession` + cookie), so the checkout form's `GET /api/checkout/identity` returns that email and the gate trusts exactly it. The two cookies can never disagree after either flow.
- **Checkout trust is primary-only.** `assertTrustedCheckout` / `GET /api/checkout/identity` build `accountEmails` = `[account.email]`. The multi-email link trust is retired: `linkVerifiedEmail` was removed, and a different email at checkout now switches identity instead of being absorbed into the old account — which also eliminates the parallel-user and link-stealing holes the linked model left open.
- **`customer_emails` is legacy visibility only.** The table (migration `20261017_customer_verified_emails.sql`, apply in the Supabase SQL editor) keeps its backfill for *order history*: `GET /api/account` still merges orders from linked emails with `user_id IS NULL`, and `orderSessionAuthorized` → `customerOwnsOrderWithLinks` (id → primary email → legacy links) still authorizes reads/cancels for them. New flows never write to it. All helpers degrade to an empty list if the table is absent.
- Order linkage in `POST /api/checkout` attaches `orders.user_id` to the session's account whenever the order email equals the account's email; otherwise the email's own identity (fresh OTP just proved it) owns the order. Order detail and cancel are **session-authenticated only** — an access token alone grants neither.

**Trade-offs**: switching (not linking) is the strict single-email model the owner asked for — the cost is that verifying email2 at checkout loses the *open tab* convenience of email1's session (a deliberate sign-out, matching "changed email → sign out from account level as well"). Alternatives rejected: linking both emails to one account (the previous model — kept two identities in sync but left the login-bypass and link-stealing holes and allowed divergent checkout emails), auto-adopting any typed email without OTP (identity forgery), and signing out the moment the email *field* changes (an unproven keystroke must not kill a 30-day session — sign-out is committed only when the OTP proves the new mailbox).

### Order view/cancel are authenticated APIs (`orderSessionAuthorized`)

`GET /api/orders/[publicId]` and `POST /api/orders/[publicId]/cancel` no longer accept the order access token as an authorization path — the token is read from nothing anymore (no `?token=` query, no request body field, no order-access cookie). A valid token in any of those places is ignored. This closes the hole where a token leaking through an email link, browser history, or a shared device let a stranger **read and cancel** someone else's order. Behavior: signed out → `401` ("Sign in to view this order." / "Sign in to cancel this order."), signed in but not the owner → `404` (no existence leak, same as an unknown id). Only `POST /api/checkout/verify` keeps the token-or-session path, deliberately: the browser that just completed a Razorpay capture must be able to confirm its own payment even before any session exists. **Consequence**: order-links in confirmation emails (`/orders/<id>?token=…`, `src/lib/email/send.ts`) now require the recipient to sign in; the `?token=` part is ignored by the API and kept only so the order page can still set the access cookie for the verify flow.

### Checkout gate (`src/lib/shop/identity.ts`)

`decideCheckoutGate` is the pure decision: an email is trusted if it equals the verify session's verified email **or** equals the signed-in account's primary email; phone (when SMS is configured) still requires the verify session. Changing the checkout email to an untrusted address drops verification for the old one (the session row's email is replaced only on a successful OTP for the new address). `assertTrustedCheckout` glues cookies to the decision and `POST /api/checkout` uses it before pricing/stock work. Server order linkage prefers the *session's* account whenever the order email is one it has proven, and order reads (`/api/account`, `/api/orders/[publicId]`, cancel) authorize from the server session only — never from a client-supplied customer ID, email, or access token. Legacy guest orders link through `upsert_customer`'s email back-association, whose proof-of-ownership remains the OTP itself.

Sign out (`POST /api/account/logout`) deletes both the `customer_sessions` and `checkout_verify_sessions` rows and clears both cookies; the UI updates only after the server confirms.

### Shared dropdown system

`src/components/ui/Dropdown.tsx` is the single menu primitive: `aria-haspopup`/`aria-expanded` trigger, `role=menu`/`menuitem`, Escape (returns focus to the trigger), ArrowUp/Down/Home/End roving focus, outside-pointerdown close, items as links or callbacks, disabled/pending/danger/separator support, and the store's square-corner theme (`border-border`, `bg-card`, `shadow-luxury`, `hover:bg-muted`). `AccountMenu` (`src/components/layout/AccountMenu.tsx`) uses it in the header: it probes `GET /api/account/session` on mount, on window focus, and on the `pt-account-changed` event (dispatched by `AccountClient` after sign-in and by the menu after sign-out). Without a confirmed session it renders the original plain "Orders" link — authenticated actions never appear from stale frontend state. Native `<select>` controls (coupon picker, admin filters) are deliberately kept native; the audit found no other custom menus to migrate.

**Alternatives considered**: React-state-only verification (the old `verifyToken` ref — broken by reloads, which is the bug this fixes), `localStorage` as identity proof (XSS-readable, forgeable — explicitly rejected), OTP on every checkout (safe but the UX the spec removes), and migrating to Supabase Auth (larger blast radius than needed; the repo already had cookie sessions, `customer_sessions`, and ownership checks). Trade-off kept: the trusted session is not permanent — 2 hours for the raw verify session, 30 days for the cookie-backed account identity, both revocable.

### Verification (2026-10-17, persistent identity + dropdown)

- `npm run test:identity` — 17/17 (cookie flags incl. prod-`Secure`, email normalization, gate accept/reject, account-session trust, wrong-email and other-account rejection, email-change invalidation, SMS-required phone handling, missing session, **linked secondary email trusted after login**, **unlinked/other-user email rejected**, verify-session-still-wins during backfill, order-ownership short-circuit by `user_id`/primary email without a link lookup).
- `npm run test:email-sync` — 12/12 negative-scenario tests on **mock data** (Node module-mocking of Supabase/cookies; real `linkVerifiedEmail`/`listVerifiedEmails`/`customerOwnsOrderWithLinks` and the real OTP-verify route handler): verifying email2 while signed in as email1 **links email2 and never switches or re-mints the `pt_account` session** (the earlier user stays logged in), failed OTP links nothing and sets no cookies, signed-out verify still promotes, phone OTP never touches email identity and is refused (503) without SMS config, `customer_emails` upsert normalizes the email, orders of email2 are re-attached (stray `user_id` and `user_id IS NULL`), link failures degrade silently, and IDOR: unlinked or other-account order emails are refused.
- `npx tsc --noEmit` passes; `npm run build` succeeds; `npm run lint` remains at the 5 pre-existing errors + 1 warning baseline (two new violations found during this work were fixed: TDZ effect ordering in `CheckoutForm`, transitive setState in `AccountMenu`).
- `npm run test:coupons` 17/17, `npm run test:meta` 15/15 unchanged.
- HTTP negative tests on the dev server: `GET /api/checkout/identity` → all-false with no cookies; `POST /api/checkout` with no and with a spoofed `pt_verify` cookie → `Verify your email before paying.`; failed `otp/verify` → 400 with **no Set-Cookie and no sessionToken** in the body.
- Browser E2E: unauthenticated header renders the plain Orders link; with a mocked `account/session` response the `AccountMenu` renders the dropdown (Orders link + Sign out item, `aria-expanded` toggling, ArrowDown/ArrowUp roving focus, Escape closes and refocuses, outside click closes); after reload the trigger reverts to the plain link (no stale authenticated UI). Checkout page with no session: email not prefilled, Pay button shows "Verify email to continue". `/account` sign-in form and cart totals unchanged.
- Follow-up (same day): the `<html>` hydration warning seen in dev logs was caused by a browser extension injecting attributes (`data-qb-installed`) before React loaded; `suppressHydrationWarning` was added to `<html>` in `src/app/layout.tsx` (attribute-level mismatch on that element only — the React-sanctioned fix). Console re-verified clean on `/account`; `npx tsc --noEmit` passes.
- Not verified here: the live OTP → cookie → reorder happy path (requires reading a real OTP email — no inbox/credentials in this environment; the unit tests and cookie-flag review cover the decision logic), real payment completion, and the `pt_account` promotion against live Supabase. No migration was needed for the base identity work (`checkout_verify_sessions`, `customer_sessions`, `users`, `orders.user_id` already exist in `supabase/schema.sql`), **but email sync requires applying `supabase/migrations/20261017_customer_verified_emails.sql` in the Supabase SQL editor** — until then `listVerifiedEmails` returns an empty list and only the primary email is trusted (safe degradation, no crash).

### Verification (2026-10-17, authenticated order view/cancel)

- `npm run test:order-auth` — 10/10 on **mock data** (module-mocked `customers`/`orders`/`serialize`/`config`, real `orderSessionAuthorized` and both real route handlers): unit cases (signed-out never authorized even with a matching token; owning session authorized); GET with a **valid token in the query and no session → 401 with no order body**; signed-in owner → 200; signed-in non-owner → 404; unknown id while signed out → 401 (no enumeration signal); cancel with a **valid `accessToken` in the JSON body and no session → 401 and the cancel RPC spy was never called**; owner → 200 with exactly one RPC call; non-owner → 404 with zero calls; malformed/empty body signed-out → 401.
- `npx tsc --noEmit` passes; `npm run build` succeeds; `npm run lint` unchanged at the 5 pre-existing errors + 1 warning baseline. Full regression: `test:coupons` 19/19, `test:identity` 17/17, `test:email-sync` 12/12, `test:meta` 15/15, `test:pixel` and `test:capi` exit 0.
- HTTP negative checks on the dev server: `GET /api/orders/PT-DEMO-1?token=<32-char>` with no cookies → `401 {"error":"Sign in to view this order."}`; `POST /api/orders/PT-DEMO-1/cancel` with `{"accessToken":"<32-char>"}` and no cookies → `401 {"error":"Sign in to cancel this order."}`.
- Not verified: the signed-in-owner HTTP round trip on the live dev server (needs a real `pt_account` cookie from a live OTP email; covered by the mocked owner cases above), and `POST /api/checkout/verify` behavior is unchanged by this work (still token-or-session, covered by `test:identity`). The email "View order" link now lands on the order page which shows the sign-in prompt for guests — accepted trade-off for the IDOR fix; no migration is required for this change.

### Verification (2026-10-17, one canonical email — checkout change signs out, login syncs checkout)

- `npm run test:email-sync` — 13/13 on **mock data** (module-mocked Supabase/cookies/OTP/customers, real route handlers): **verifying email2 while signed in as email1 signs email1 out (session-row revoke spy called once), upserts email2, creates the new session and the final `pt_account` cookie is email2's**; failed OTP signs nobody out and mints zero cookies; verifying the same email touches neither `upsertCustomer` nor `pt_account`; signed-out verify still promotes; phone verify never signs out or switches and is refused (503) without SMS config; `deleteCustomerSession` revokes the `customer_sessions` row by token; legacy link table: `listVerifiedEmails` lowercases and degrades to `[]` on error, ownership by legacy link and by primary email, IDOR negatives; **account login writes the verify session with the login email (both cookies set)** and replaces a stale email3 verify session with the email2 being logged in.
- `npx tsc --noEmit` passes; `npm run build` compiles successfully; `npm run lint` unchanged at the 5 pre-existing errors + 1 warning baseline. Full regression: `test:coupons` 19/19, `test:identity` 17/17 (pure gate unchanged), `test:order-auth` 10/10, `test:meta` 15/15, `test:pixel` and `test:capi` exit 0.
- Dev-server HTTP: `GET /api/checkout/identity` with no cookies → `{"emailVerified":false,"email":null,"accountEmails":[],"phoneVerified":false}` (shape unchanged for the client).
- Removed with this change: `linkVerifiedEmail` (function, all call sites, and its three unit tests) — checkout-trust linking is retired per the single-email model; `customer_emails` remains for legacy order visibility only, so the `20261017_customer_verified_emails.sql` migration is still required before that history shows up.
- Not verified: the live two-browser OTP switch round trip (requires reading real OTP emails — no inbox here; the mocked handler tests cover the decision and cookie outcomes) and the new checkout warning line ("Different from your signed-in email…") in a signed-in browser session (needs a real `pt_account`).

## Meta Pixel and Conversions API

Pixel ID: `1765251828052032`. One Pixel init after **explicit** marketing consent. Shopping actions are **standard events**, not extra PageViews.

## Cookie consent

A compact bottom notice (not a full-screen overlay) asks for an explicit choice. Navigating, closing the tab, or ignoring the notice is **not** consent. Optional tracking stays off until **Accept all**.

| Category | Examples | Default |
|---|---|---|
| Essential | Cart, checkout, session/OTP, HttpOnly order-access cookie | Always on |
| Marketing | Meta Pixel, `_fbp`/`_fbc`, CAPI Purchase + hashed matching | Off until Accept all |
| Analytics | No separate product analytics cookie today | — |

**Buttons:** Accept all (marketing on) · Reject optional (essential only). **Cookie Preferences** in the footer reopens the same notice so the choice can change. Escape/Close only hide the notice after a choice already exists.

**Storage:** `pt_ad_consent` holds a versioned record (`policyVersion` `2026-10`, choice, `marketing` flag, timestamp). Legacy values `granted` / `denied` still parse. Max-Age 1 year, `Path=/`, `SameSite=Lax`, `Secure` on HTTPS.

**Pixel:** `fbq` loads only after Accept all. Reject / withdraw calls `fbq('consent','revoke')`, clears the client event queue, and expires `_fbp` / `_fbc`. Re-accept grants again without a second script tag. PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase all use `trackMetaEvent`, which no-ops without granted consent. Every Pixel call includes an `eventID`.

**CAPI (all Pixel events):** The same `eventID` is POSTed immediately to `/api/meta/capi`, which sends Graph `/{pixel}/events` in that request. This does **not** use a Vercel cron. Hobby’s single daily cron stays `/api/cron/expire-orders` (and already drains any leftover Purchase outbox). Purchase is also enqueued in `meta_event_outbox` and processed right after payment so a Graph blip can retry without a second cron.

Checkout still reads the **consent cookie on the request**, not the client JSON flag. Funnel CAPI uses `_fbp`/`_fbc`/IP/UA only (no email from the browser). Purchase CAPI from the outbox adds hashed email/phone/address when `marketing_consent` was stored true. Rejecting later does not rewrite past orders.

This notice is not legal advice and does not by itself establish DPDP/GDPR compliance.

### How to test consent

1. Clear `pt_ad_consent`. Reload: no `fbevents.js`, no `fbq('track')`.
2. Accept all: Pixel inits once; Test Events can show PageView and shopping events.
3. Reject optional: no new Pixel events; `_fbp`/`_fbc` expire.
4. Refresh and move between pages: the choice sticks.
5. Cookie Preferences → switch Accept / Reject and confirm Pixel starts or stops.
6. Checkout + payment still work after Reject optional (cart is essential).

Live Meta Test Events still need a browser with Accept all and no ad blocker. This environment cannot claim Events Manager results unless that UI is opened.

`PageView` only means a page was viewed. Meta can tell product vs checkout from the **page URL** on that PageView, but it does **not** treat that as ViewContent / AddToCart / Purchase. Those require their own `fbq('track', …)` calls with ecommerce parameters.

| Event | Pixel | Live CAPI | Example values (₹699 tee + 5% GST) |
|---|---|---|---|
| `PageView` | Yes | Yes, same `eventID` | no custom_data |
| `ViewContent` | Yes | Yes | `value=699`, `currency=INR`, `content_ids=["black-oversized-tshirt"]` |
| `AddToCart` | Yes | Yes | `value=699` for qty 1 (this add, not cart total) |
| `InitiateCheckout` | Yes | Yes | `value=733.95`, `num_items=1`, `contents[{id, quantity:1, item_price:699}]` |
| `Purchase` | Yes | Yes + outbox backup | `value=733.95`, `order_id=PT-…`, `eventID=purchase_{publicId}` |
| `AddPaymentInfo` | No | No | Razorpay modal is not payment-info |
| `Search` | No | No | no site search |

IDs are **product slugs** (e.g. `black-oversized-tshirt`) until a Meta catalog exists.

Events are queued if `window.fbq` is not ready yet (product `useEffect` runs before the layout Pixel loader). They flush after the stub is installed.

### How to test parameter *values*

The Events Manager “Set up events” panel only lists **parameter names** (`value`, `num_items`, `currency`, `contents`, `content_ids`, `content_type`). It does not show 699 / INR there.

1. Local mock (no Meta login): `npm run test:capi` and `npm run test:meta`. These assert numeric values.
2. Staging Test Events: set `META_CAPI_TEST_EVENT_CODE` (never in production). Accept all, then open a product → cart → checkout. In **Test events**, click a row to see payload values. Connection method should be Browser + Server when both Pixel and `/api/meta/capi` succeeded.
3. Purchase still needs a real prepaid paid order (or staging). Do not fake live purchases.

### Diagnose missing events

- Consent cookie `pt_ad_consent` must be `granted`.
- DevTools Network: `facebook.com/tr` (browser) after each action.
- Console: `typeof fbq` should be `function` after Accept.
- Overview ≠ Test events. Setup wizard names ≠ values; use Test events click-through or `npm run test:capi`.
- Funnel CAPI needs `META_CAPI_ACCESS_TOKEN` and Accept all. Missing token or no consent returns `{ ok: false }` and Pixel still fires.
- Purchase outbox still needs schema applied. Hobby cron is only `expire-orders` (daily); do not add `/api/cron/meta-capi` on Vercel Free.

### Environment

```
META_CAPI_ACCESS_TOKEN=
META_GRAPH_API_VERSION=v25.0
META_CAPI_TEST_EVENT_CODE=   # staging only
META_CAPI_WORKER_SECRET=
```

Never use `NEXT_PUBLIC_` for those. Tokens stay server-only.

**Why this vs alternatives:** Enqueueing PageView in the DB outbox would need a second cron and explode row volume; Hobby Vercel allows one daily cron, already used by `expire-orders`. Pixel-only events drop behind ad blockers. A dedicated `/api/cron/meta-capi` cron was rejected for Free/Hobby. Immediate Graph POST from `/api/meta/capi` plus Purchase outbox processed on payment is the selected path. Trusting `marketingConsent` in checkout JSON would let a client enable CAPI after Reject optional.

**Checks:** `npm run test:meta`, `npm run test:capi`, `npm run test:pixel`, `npx tsc --noEmit`. Apply `supabase/schema.sql` for the Purchase outbox. Pixel Helper / live Test Events require a browser with consent and no ad blocker.

## API efficiency

Reviewed all App Router handlers under `src/app/api`. Behavior is unchanged: auth, expiry, payment, and CAPI still run the same checks. Independent I/O now overlaps so hot paths wait less.

| Path | What was sequential | Now |
|---|---|---|
| `GET /api/orders/[publicId]`, cancel, `POST /api/checkout/verify` | cookie, order, session one after another | `Promise.all` |
| `getOrderByPublicId` | items fetch, then a second orders fetch | both after expire, in parallel |
| `getCustomerFromCookie` | session row, then users row | one PostgREST embed |
| `POST /api/checkout` | Meta attribution, then customer upsert | parallel |
| `completeCapturedPayment` | emails, then CAPI outbox | parallel (each still try/caught) |

Left sequential on purpose (changing order would change outcomes):

- `expireStaleOrders` before stock/account/admin reads, so holds are released first
- Daily cron: emails, then refunds, then Meta (a failed email step still skips the later jobs)
- `/api/meta/capi` parse → consent → Graph (Graph cannot start earlier)
- OTP consume before session write

**Why not** skip expire on `GET /api/variants` or add a second cron: shop stock would briefly include expired holds; Hobby Vercel already has one daily cron.

**Checks:** `npx tsc --noEmit`, `npm run test:meta`, `npm run test:pixel`. Live Razorpay/Supabase checkout was not re-run in this pass.
