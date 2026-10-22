import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { StarRating } from "@/components/ui/StarRating";

function render(rating: number, reviewCount?: number) {
  return renderToStaticMarkup(
    createElement(StarRating, {
      rating,
      ...(reviewCount == null ? {} : { reviewCount }),
    }),
  );
}

test("a rating below five does not render as a perfect score", () => {
  const html = render(4.9, 128);
  assert.match(
    html,
    /width:\s*98%/,
    "the filled row must be clipped to the rating",
  );
  assert.doesNotMatch(html, /width:\s*100%/);
});

test("the accessible name states the real value, not five stars", () => {
  const html = render(4.8, 96);
  assert.match(html, /aria-label="4\.8 out of 5 stars from 96 reviews"/);
  assert.match(html, /role="img"/);
  // The decorative glyph rows must not be double-announced.
  assert.match(html, /aria-hidden="true"/);
});

test("the numeric value is visible so the graphic is not the only carrier", () => {
  assert.match(render(4.9, 128), /">4\.9 · 128 reviews</);
});

test("a perfect rating fills the whole row and out-of-range values are clamped", () => {
  assert.match(render(5), /width:\s*100%/);
  assert.match(render(9), /width:\s*100%/);
  assert.match(render(-2), /width:\s*0%/);
});

test("the review count is optional so cards can show stars and score only", () => {
  const html = render(4.9);
  assert.match(html, /aria-label="4\.9 out of 5 stars"/);
  assert.doesNotMatch(html, /reviews/);
});
