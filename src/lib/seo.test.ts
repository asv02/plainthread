import assert from "node:assert/strict";
import test from "node:test";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { buildMetadata, absoluteUrl } from "./seo";
import { productSchema, websiteSchema } from "./schema";
import { products } from "../data/products";
import { getAllPosts } from "./blog";
import { siteConfig } from "../data/site";

const black = products[0];

test("sitemap uses genuine blog dates and never a fabricated lastModified", () => {
  const entries = sitemap();
  const posts = getAllPosts();
  assert.ok(posts.length > 0, "blog posts discovered from content/blog");

  for (const entry of entries) {
    const isBlogPost = posts.some((p) => entry.url === absoluteUrl(`/blog/${p.slug}`));
    if (!isBlogPost) {
      assert.equal(entry.lastModified, undefined, `no invented date for ${entry.url}`);
    }
  }
  for (const post of posts) {
    const entry = entries.find((e) => e.url === absoluteUrl(`/blog/${post.slug}`));
    assert.ok(entry, `blog post ${post.slug} is listed`);
    assert.equal(new Date(entry!.lastModified as never).toISOString(), new Date(post.date).toISOString());
  }
});

test("sitemap inventory: all indexable routes in, private routes out, absolute URLs", () => {
  const urls = sitemap().map((e) => e.url);
  assert.ok(urls.includes(siteConfig.domain), "homepage is listed");
  for (const product of products) {
    assert.ok(urls.includes(`${siteConfig.domain}/products/${product.slug}`));
  }
  for (const banned of ["/cart", "/checkout", "/admin", "/account", "/orders", "/api"]) {
    assert.ok(
      !urls.some((u) => u.endsWith(banned) || u.includes(`${siteConfig.domain}${banned}`)),
      `${banned} must not appear in the sitemap`,
    );
  }
  assert.ok(urls.every((u) => u.startsWith("https://plainthread.in")), "all URLs are absolute on the production domain");
});

test("robots disallows every private surface and points at the real sitemap", () => {
  const policy = robots();
  const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
  const disallow = rules.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]));
  for (const path of ["/admin", "/checkout", "/cart", "/orders", "/account", "/api/"]) {
    assert.ok(disallow.includes(path), `${path} is disallowed`);
  }
  assert.equal(policy.sitemap, `${siteConfig.domain}/sitemap.xml`);
});

test("product schema: no fabricated aggregateRating, no assumed availability", () => {
  const schema = productSchema(black);
  assert.equal((schema as Record<string, unknown>).aggregateRating, undefined, "unsupported review markup must be gone");
  const offer = schema.offers as Record<string, unknown>;
  assert.equal(offer.availability, undefined, "availability is omitted unless real stock was read");
  assert.equal(offer.price, black.price);
});

test("product schema: authoritative price and stock are reflected when supplied", () => {
  const priced = productSchema(black, { pricePaise: 65_000, inStock: true });
  assert.equal((priced.offers as Record<string, unknown>).price, 650);
  assert.equal((priced.offers as Record<string, unknown>).availability, "https://schema.org/InStock");

  const soldOut = productSchema(black, { pricePaise: 69_900, inStock: false });
  assert.equal((soldOut.offers as Record<string, unknown>).availability, "https://schema.org/OutOfStock");
});

test("website schema carries no SearchAction for the nonexistent /shop?q= endpoint", () => {
  const schema = websiteSchema();
  assert.equal((schema as Record<string, unknown>).potentialAction, undefined);
});

test("buildMetadata: canonical, noindex toggle, and honest preview images", () => {
  const meta = buildMetadata({ title: "Fabric Guide", description: "About fabric", path: "/fabric" });
  assert.equal(meta.alternates?.canonical, `${siteConfig.domain}/fabric`);
  const image = (meta.openGraph?.images as Record<string, unknown>[])[0];
  assert.ok(String(image.url).endsWith("/og-default.png"), "social preview is a PNG, not SVG");
  assert.equal(image.width, undefined, "dimensions omitted when they were not supplied");

  const sized = buildMetadata({
    title: "Black Tee",
    description: "d",
    path: "/products/black-oversized-tshirt",
    image: "/images/products/Black/a.jpg",
    imageWidth: 853,
    imageHeight: 1280,
  });
  const sizedImage = (sized.openGraph?.images as Record<string, unknown>[])[0];
  assert.equal(sizedImage.width, 853);
  assert.equal(sizedImage.height, 1280);

  const hidden = buildMetadata({ title: "Cart", description: "d", path: "/cart", noIndex: true });
  assert.deepEqual(hidden.robots, { index: false, follow: false });
});

test("compare-at invariant holds for every product card price pair", () => {
  for (const product of products) {
    assert.ok(product.compareAtPrice != null && product.compareAtPrice > product.price);
  }
});
