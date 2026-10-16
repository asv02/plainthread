import assert from "node:assert/strict";
import test from "node:test";
import { customerOwnsOrderWithLinks } from "./customers";
import {
  decideCheckoutGate,
  emailTrustedIn,
  normalizeEmail,
  phoneTrustedIn,
  verifyCookieOptions,
  type VerifySessionState,
} from "./identity";

function session(overrides: Partial<VerifySessionState> = {}): VerifySessionState {
  return {
    email: "buyer@example.com",
    phone: "9876543210",
    emailVerified: true,
    phoneVerified: false,
    ...overrides,
  };
}

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Buyer@Example.COM "), "buyer@example.com");
});

test("verify session cookie is HttpOnly, SameSite=Lax, path-rooted", () => {
  const opts = verifyCookieOptions(new Date(Date.now() + 3600_000));
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, "lax");
  assert.equal(opts.path, "/");
  assert.ok(opts.expires instanceof Date);
});

test("verify cookie is Secure only in production", () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    assert.equal(verifyCookieOptions(new Date()).secure, true);
    env.NODE_ENV = "development";
    assert.equal(verifyCookieOptions(new Date()).secure, false);
  } finally {
    env.NODE_ENV = previous;
  }
});

test("checkout gate accepts a matching verified email session", () => {
  const decision = decideCheckoutGate({
    verify: session(),
    accountEmails: [],
    email: " Buyer@Example.com ",
    phone: "9876543210",
    smsRequired: false,
  });
  assert.equal(decision.ok, true);
});

test("checkout gate rejects when session email does not match submitted email", () => {
  const decision = decideCheckoutGate({
    verify: session({ email: "other@example.com" }),
    accountEmails: [],
    email: "buyer@example.com",
    phone: "9876543210",
    smsRequired: false,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.error, "Verify your email before paying.");
});

test("checkout gate rejects an unverified session even with the right email", () => {
  assert.equal(
    decideCheckoutGate({
      verify: session({ emailVerified: false }),
      accountEmails: [],
      email: "buyer@example.com",
      phone: "9876543210",
      smsRequired: false,
    }).ok,
    false,
  );
});

test("a valid account session for the same email is a trusted identity", () => {
  assert.equal(
    decideCheckoutGate({
      verify: null,
      accountEmails: ["buyer@example.com"],
      email: "buyer@example.com",
      phone: "9876543210",
      smsRequired: false,
    }).ok,
    true,
  );
});

test("account session for another email cannot authorize a different checkout email", () => {
  assert.equal(
    decideCheckoutGate({
      verify: null,
      accountEmails: ["victim@example.com"],
      email: "attacker@example.com",
      phone: "9876543210",
      smsRequired: false,
    }).ok,
    false,
  );
});

test("changing the verified email invalidates the previous email", () => {
  // Session first verified buyer@…, then the same session re-verified for new@…
  const afterSwitch = session({ email: "new@example.com" });
  assert.equal(
    emailTrustedIn({
      verify: afterSwitch,
      accountEmails: [],
      email: "buyer@example.com",
      phone: "9876543210",
      smsRequired: false,
    }),
    false,
  );
  assert.equal(
    emailTrustedIn({
      verify: afterSwitch,
      accountEmails: [],
      email: "new@example.com",
      phone: "9876543210",
      smsRequired: false,
    }),
    true,
  );
});

test("SMS-required checkouts still need a verified phone", () => {
  const decision = decideCheckoutGate({
    verify: session(),
    accountEmails: ["buyer@example.com"],
    email: "buyer@example.com",
    phone: "9876543210",
    smsRequired: true,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.error, "Verify your mobile number before paying.");
});

test("phone matching tolerates spacing and +91 prefix", () => {
  assert.equal(
    phoneTrustedIn({
      verify: session({ phone: "9876543210", phoneVerified: true }),
      accountEmails: [],
      email: "buyer@example.com",
      phone: "+91 98765 43210",
      smsRequired: true,
    }),
    true,
  );
});

test("missing session blocks the gate entirely", () => {
  const decision = decideCheckoutGate({
    verify: null,
    accountEmails: [],
    email: "buyer@example.com",
    phone: "9876543210",
    smsRequired: false,
  });
  assert.equal(decision.ok, false);
});

test("linked secondary email on the account is trusted after a fresh login", () => {
  // email1 signed-in account; email2 was OTP-verified and linked earlier.
  // Checkout with email2 must pass the gate with no live verify session.
  const decision = decideCheckoutGate({
    verify: null,
    accountEmails: ["email1@example.com", "email2@example.com"],
    email: " Email2@Example.com ",
    phone: "9876543210",
    smsRequired: false,
  });
  assert.equal(decision.ok, true);
});

test("an email not linked to the account is rejected", () => {
  const decision = decideCheckoutGate({
    verify: null,
    accountEmails: ["email1@example.com"],
    email: "email3@example.com",
    phone: "9876543210",
    smsRequired: false,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.equal(decision.error, "Verify your email before paying.");
});

test("a linked email from another user's list cannot authorize this checkout", () => {
  assert.equal(
    emailTrustedIn({
      verify: null,
      accountEmails: ["victim1@example.com", "victim2@example.com"],
      email: "attacker@example.com",
      phone: "9876543210",
      smsRequired: false,
    }),
    false,
  );
});

test("verify session for email2 still wins while links are being backfilled", () => {
  assert.equal(
    emailTrustedIn({
      verify: session({ email: "email2@example.com" }),
      accountEmails: ["email1@example.com"],
      email: "email2@example.com",
      phone: "9876543210",
      smsRequired: false,
    }),
    true,
  );
});

test("order ownership resolves by user id or primary email without link lookups", async () => {
  const user = { id: "u1", email: "Email1@Example.com", phone: null, name: null };
  assert.equal(
    await customerOwnsOrderWithLinks(user, { user_id: "u1", email: "someone@else.com" } as never),
    true,
  );
  assert.equal(
    await customerOwnsOrderWithLinks(user, { user_id: null, email: "email1@example.com" } as never),
    true,
  );
});
