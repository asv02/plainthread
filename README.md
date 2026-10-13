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

The seal is presentational. Product prices in `src/data/products.ts` stay ₹699, and checkout does not apply a 15% reduction.

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

Changing the offer means editing the seal text in `src/app/page.tsx`. Applying the discount at checkout is separate work and is not done here. There is no React component test runner in this repo, so the hero was checked in the browser rather than with a new test dependency.

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

**Pixel:** `fbq` loads only after Accept all. Reject / withdraw calls `fbq('consent','revoke')`, clears the client event queue, and expires `_fbp` / `_fbc`. Re-accept grants again without a second script tag. PageView, ViewContent, AddToCart, InitiateCheckout, and Purchase all use `trackMetaEvent`, which no-ops without granted consent.

**CAPI:** Checkout reads the **consent cookie on the request**, not the client JSON flag. If marketing is not granted, the order stores `marketing_consent=false` and does not keep fbp/fbc/IP/UA for Meta. `shouldEnqueueCapiPurchase` requires that stored flag plus a verified prepaid paid order. Rejecting later does not rewrite past orders; it stops new Pixel events and new matching on future checkouts.

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

| Event | Trigger | Parameters |
|---|---|---|
| `PageView` | Consent + Pixel init; later App Router navigations | none |
| `ViewContent` | Product detail for a real product | `content_ids`, `content_type=product`, `content_name`, `content_category`, `contents`, `value`, `currency=INR` |
| `AddToCart` | After `addItem` succeeds (Add to cart and Buy now) | `content_ids`, `content_type`, `contents`, `value` of **this add**, `currency=INR` |
| `InitiateCheckout` | Checkout with a hydrated non-empty cart, once per cart snapshot | above plus `num_items`; `value` is checkout total in INR |
| `Purchase` | Order page after API shows prepaid `paid`; CAPI from DB outbox | stored totals, `order_id=public_id`, same `eventID` `purchase_{publicId}` |
| `AddPaymentInfo` | Not sent (Razorpay modal open is not a reliable payment-info signal) | — |
| `Search` | Not sent (no site search) | — |

IDs are **product slugs** (e.g. `black-oversized-tshirt`) until a Meta catalog exists.

Events are queued if `window.fbq` is not ready yet (product `useEffect` runs before the layout Pixel loader). They flush after the stub is installed.

### How to test in Events Manager

1. Choose **Accept all** on the site (**Reject optional** = no Pixel).
2. Events Manager → the Pixel → **Test events**. Overview and Ads Manager lag and often show only high-volume events (`PageView`).
3. Open a product, add to cart, open checkout. Test events should list `ViewContent`, `AddToCart`, `InitiateCheckout` with parameters. Click an event for payload detail (IDs, value, currency).
4. Finish **Set up events** in the dataset wizard after Meta has seen those names.
5. Purchase needs a real prepaid paid order (or staging with Test Events code). Do not fake live purchases.

### Diagnose missing events

- Consent cookie `pt_ad_consent` must be `granted`.
- DevTools Network: `facebook.com/tr` (browser) after each action.
- Console: `typeof fbq` should be `function` after Accept.
- Overview ≠ Test events. Connection method “Browser + Server” on PageView does not mean this app sends CAPI PageView (it does not).
- CAPI Purchase needs `META_CAPI_ACCESS_TOKEN`, Graph `v25.0`, schema outbox applied, and checkout consent stored as true.

### Environment

```
META_CAPI_ACCESS_TOKEN=
META_GRAPH_API_VERSION=v25.0
META_CAPI_TEST_EVENT_CODE=   # staging only
META_CAPI_WORKER_SECRET=
```

Never use `NEXT_PUBLIC_` for those. Tokens stay server-only.

**Why this vs alternatives:** a full-screen CMP overlay would block checkout. Auto-accept on scroll would not be a valid choice. Trusting `marketingConsent` in the checkout JSON would let a client enable CAPI after Reject optional. A second consent library would duplicate `pt_ad_consent`. Renaming PageView would break reporting. Firing ViewContent on every route would inflate catalog stats. Inline CAPI without an outbox drops purchases on Graph failures.

**Checks:** `npm run test:meta`, `npm run test:pixel`, `npx tsc --noEmit`. Apply `supabase/schema.sql` for the outbox. Pixel Helper / live Test Events require a browser with consent and no ad blocker.
