import assert from "node:assert/strict";
import test from "node:test";
import { RETURN_WINDOW_DAYS, orderSupportCopy } from "@/lib/shop/order-support";
import { siteConfig } from "@/data/site";

const copy = orderSupportCopy();

test("founder contact is stated with name, role and a dialable number", () => {
  assert.equal(
    copy.contact,
    "Questions about your order? Contact Akash Suryavanshi, Founder, on 8090178921.",
  );
  assert.equal(copy.phoneHref, "tel:8090178921");
});

test("the published number is a 10-digit Indian mobile so the tel: link works", () => {
  assert.match(siteConfig.support.phone, /^[6-9][0-9]{9}$/);
});

test("the returns summary matches the published policy window and conditions", () => {
  assert.equal(RETURN_WINDOW_DAYS, 7);
  assert.match(
    copy.returns,
    new RegExp(`within ${RETURN_WINDOW_DAYS} days of the delivered date`),
  );
  for (const condition of ["unused", "unwashed", "tags"]) {
    assert.ok(
      copy.returns.includes(condition),
      `returns summary omits "${condition}"`,
    );
  }
});

test("no transit window is promised because no PIN-code estimate exists", () => {
  // Negative case: a number followed by a day/week unit would be an estimate.
  assert.doesNotMatch(
    copy.delivery,
    /[0-9]+\s*(business\s+|working\s+)?(day|days|week|weeks)/i,
  );
  assert.match(copy.delivery, /depends on your PIN code/i);
});

test("support copy invents no channel, coverage or response-time claim", () => {
  const all = Object.values(copy).join(" ").toLowerCase();
  for (const forbidden of [
    "whatsapp",
    "24/7",
    "24*7",
    "call us anytime",
    "hours",
    "minutes",
  ]) {
    assert.ok(!all.includes(forbidden), `support copy contains "${forbidden}"`);
  }
});

test("cancellation matches the order page, which only cancels a pending parcel", () => {
  assert.match(copy.cancellation, /while the parcel is still pending/i);
  assert.doesNotMatch(copy.cancellation, /cancel any time|cancel anytime/i);
});
