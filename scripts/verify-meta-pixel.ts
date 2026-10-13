/**
 * Smoke checks for Meta Pixel integration.
 * Run: npx tsx scripts/verify-meta-pixel.ts
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const PIXEL_ID = "1765251828052032";

const requiredFiles = [
  "src/lib/meta-pixel.ts",
  "src/lib/meta-pixel-client.ts",
  "src/lib/meta-capi.ts",
  "src/lib/meta/browser-capi.ts",
  "src/app/api/meta/capi/route.ts",
  "src/components/analytics/MetaPixel.tsx",
  "src/components/analytics/MetaPixelLoader.tsx",
  "src/components/analytics/MetaPixelPageView.tsx",
  "src/app/layout.tsx",
  "src/middleware.ts",
];

let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS  ${message}`);
  } else {
    console.error(`FAIL  ${message}`);
    failed += 1;
  }
}

for (const file of requiredFiles) {
  const full = path.join(root, file);
  assert(fs.existsSync(full), `exists: ${file}`);
}

const metaLib = fs.readFileSync(path.join(root, "src/lib/meta-pixel.ts"), "utf8");
assert(metaLib.includes(PIXEL_ID), `pixel id ${PIXEL_ID} present in meta-pixel.ts`);

const loader = fs.readFileSync(
  path.join(root, "src/components/analytics/MetaPixelLoader.tsx"),
  "utf8",
);
assert(loader.includes("init"), "loader initializes fbq after consent");
assert(loader.includes("trackMetaEvent"), "loader tracks PageView after consent via shared helper");
assert(loader.includes("connect.facebook.net/en_US/fbevents.js"), "loader loads fbevents.js");

const pageView = fs.readFileSync(
  path.join(root, "src/components/analytics/MetaPixelPageView.tsx"),
  "utf8",
);
assert(pageView.includes("trackMetaEvent"), "SPA PageView uses client helper");
assert(pageView.includes("usePathname"), "SPA tracker listens to pathname");
assert(pageView.includes("isFirstRender"), "SPA tracker skips first render");

const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
assert(layout.includes("MetaPixel"), "Root layout mounts MetaPixel");
assert(layout.includes("CookieConsent"), "Root layout mounts consent notice");

const client = fs.readFileSync(path.join(root, "src/lib/meta-pixel-client.ts"), "utf8");
assert(client.includes("hasSensitiveQuery"), "browser helper blocks token query strings");
assert(client.includes("flushMetaPixelQueue"), "browser helper queues until Pixel is ready");
assert(client.includes("ViewContent"), "browser helper can track ViewContent");
assert(client.includes("AddToCart"), "browser helper can track AddToCart");
assert(client.includes("/api/meta/capi"), "browser helper POSTs CAPI with the same eventID");
assert(client.includes("eventID"), "browser helper always sends Pixel eventID");
assert(!client.includes("NEXT_PUBLIC_META_CAPI"), "CAPI token is not in client helper");

const capiRoute = fs.readFileSync(path.join(root, "src/app/api/meta/capi/route.ts"), "utf8");
assert(capiRoute.includes("sendCapiEvents"), "live CAPI route posts to Graph immediately");
assert(capiRoute.includes("buildBrowserCapiEvent"), "live CAPI route uses consent-gated builder");

const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
assert(vercel.includes("/api/cron/expire-orders"), "Hobby cron remains expire-orders only");
assert(!vercel.includes("/api/cron/meta-capi"), "meta-capi is not a second Vercel cron");

const viewContent = fs.readFileSync(
  path.join(root, "src/components/analytics/ViewContentPixel.tsx"),
  "utf8",
);
assert(viewContent.includes("PIXEL_READY_EVENT"), "ViewContent retries after Pixel ready");
assert(
  fs.readFileSync(path.join(root, "src/components/shop/AddToCart.tsx"), "utf8").includes("trackAddToCart"),
  "AddToCart fires after a successful cart add",
);

const middleware = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf8");
assert(middleware.includes("orderAccessCookieName"), "middleware stores order access cookie");
assert(middleware.includes("searchParams.delete(\"token\")"), "middleware strips token from URL");

const checkout = fs.readFileSync(path.join(root, "src/components/shop/CheckoutForm.tsx"), "utf8");
assert(!checkout.includes("`/orders/${order.publicId}?token="), "checkout does not put token in order URL");

const consentUi = fs.readFileSync(
  path.join(root, "src/components/analytics/CookieConsent.tsx"),
  "utf8",
);
assert(consentUi.includes("Accept all"), "notice offers Accept all");
assert(consentUi.includes("Reject optional"), "notice offers Reject optional");
assert(!consentUi.includes("fixed inset-0"), "notice is not a full-screen overlay");

const footer = fs.readFileSync(path.join(root, "src/components/layout/Footer.tsx"), "utf8");
assert(footer.includes("Cookie Preferences"), "footer has Cookie Preferences");

const consentLib = fs.readFileSync(path.join(root, "src/lib/meta/consent.ts"), "utf8");
assert(consentLib.includes("CONSENT_POLICY_VERSION"), "consent record is versioned");
assert(consentLib.includes("isMarketingConsentGrantedFromHeader"), "server can read consent cookie");

const checkoutApi = fs.readFileSync(path.join(root, "src/app/api/checkout/route.ts"), "utf8");
assert(
  checkoutApi.includes("isMarketingConsentGrantedFromHeader"),
  "CAPI attribution uses consent cookie, not client flag alone",
);
assert(loader.includes("consent"), "loader uses Meta consent grant/revoke");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log("\nAll Meta Pixel checks passed.");
