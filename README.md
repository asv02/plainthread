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
