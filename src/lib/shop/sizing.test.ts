import assert from "node:assert/strict";
import test from "node:test";
import { sizeGuide } from "@/data/content";
import { parseCm, parsedSizeRows, sizeTableHeaders, sizeTableRows } from "@/lib/shop/sizing";

test("only a clean centimetre value parses", () => {
  assert.equal(parseCm("53 cm"), 53);
  assert.equal(parseCm(" 52.5cm "), 52.5);
  assert.equal(parseCm("53"), null);
  assert.equal(parseCm("cm"), null);
  assert.equal(parseCm(""), null);
  assert.equal(parseCm("abc cm"), null);
  assert.equal(parseCm("-5 cm"), null);
  assert.equal(parseCm("0 cm"), null);
});

test("every published row parses, so no size silently loses its measurement", () => {
  const rows = parsedSizeRows();
  assert.equal(rows.length, sizeGuide.rows.length);
  assert.deepEqual(rows.map((row) => row.size), ["S", "M", "L", "XL", "XXL"]);
});

test("chest around is exactly double the flat measure, never a second hand-typed number", () => {
  for (const row of parsedSizeRows()) {
    assert.equal(row.chestAroundCm, row.chestFlatCm * 2);
    assert.ok(row.chestAroundCm > row.chestFlatCm);
  }
  const s = parsedSizeRows()[0];
  assert.equal(s.chestFlatCm, 53);
  assert.equal(s.chestAroundCm, 106);
});

test("table headers name which measure is which", () => {
  assert.deepEqual(sizeTableHeaders, ["Size", "Chest (flat)", "Chest (around)", "Length", "Shoulder", "Sleeve"]);
});

test("table rows align with headers and keep the other measurements intact", () => {
  const rows = sizeTableRows();
  assert.equal(rows.length, sizeGuide.rows.length);
  for (const row of rows) assert.equal(row.length, sizeTableHeaders.length);
  assert.deepEqual(rows[0], ["S", "53 cm", "106 cm", "71 cm", "50 cm", "17 cm"]);
  assert.deepEqual(rows[4], ["XXL", "62 cm", "124 cm", "80 cm", "61 cm", "26 cm"]);
});

test("the flat-versus-around distinction is stated in the copy customers read", () => {
  assert.match(sizeGuide.note, /flat/i);
  assert.match(sizeGuide.note, /circumference|around/i);
});
