import assert from "node:assert/strict";
import test, { before, mock } from "node:test";

type Account = { id: string; email: string; phone: string | null; name: string | null };

let accountForTest: Account | null = null;
let consumeShouldFail = false;
let smsOn = false;
const cookieStore = new Map<string, string>();
const setCookies: Array<{ name: string; value: string }> = [];
const spies = {
  signOuts: 0,
  createSession: [] as string[],
  upsert: [] as Array<{ email: string }>,
  verifyUpserts: [] as Array<Record<string, unknown>>,
};

mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({
      get: (name: string) => {
        const value = cookieStore.get(name);
        return value ? { value } : undefined;
      },
      set: (name: string, value: string) => {
        setCookies.push({ name, value });
        cookieStore.set(name, value);
      },
    }),
  },
});

mock.module("./otp", {
  namedExports: {
    consumeOtp: async () => {
      if (consumeShouldFail) throw new Error("Invalid or expired code");
    },
    normalizeOtpDestination: (channel: string, raw: string) =>
      channel === "email" ? raw.trim().toLowerCase() : raw.replace(/\s+/g, "").replace(/^\+91/, ""),
    upsertVerifySession: async (input: { email?: string; phone?: string }) => {
      spies.verifyUpserts.push(input as Record<string, unknown>);
      return {
        token: "mock-verify-token",
        expires_at: Date.now() + 2 * 60 * 60 * 1000,
        email: input.email ?? null,
        phone: input.phone ?? null,
        email_verified: Boolean(input.email),
        phone_verified: Boolean(input.email ? false : input.phone),
      };
    },
    getVerifySession: async () => null,
  },
});

mock.module("./customers", {
  namedExports: {
    customerCookieName: "pt_account",
    customerCookieOptions: (expiresAt: Date) => ({ path: "/", expires: expiresAt }),
    getCustomerFromCookie: async () => accountForTest,
    listVerifiedEmails: async () => [],
    deleteCustomerSession: async () => {
      spies.signOuts += 1;
      cookieStore.delete("pt_account");
    },
    createCustomerSession: async (userId: string) => {
      spies.createSession.push(userId);
      return { token: "acct-token", expiresAt: new Date(Date.now() + 86_400_000) };
    },
    upsertCustomer: async (input: { email: string }) => {
      spies.upsert.push(input);
      return input.email === "email1@example.com" ? "u_email1" : "u_new_for_email";
    },
  },
});

mock.module("./config", {
  namedExports: {
    smsConfigured: () => smsOn,
  },
});

type VerifyRoute = typeof import("../../app/api/checkout/otp/verify/route");
type LoginRoute = typeof import("../../app/api/account/login/route");
let POST_VERIFY: VerifyRoute["POST"];
let POST_LOGIN: LoginRoute["POST"];

before(async () => {
  POST_VERIFY = (await import("../../app/api/checkout/otp/verify/route")).POST;
  POST_LOGIN = (await import("../../app/api/account/login/route")).POST;
});

function reset(input: { account?: Account | null; fail?: boolean; sms?: boolean }) {
  accountForTest = input.account === undefined ? null : input.account;
  consumeShouldFail = Boolean(input.fail);
  smsOn = Boolean(input.sms);
  cookieStore.clear();
  setCookies.length = 0;
  spies.signOuts = 0;
  spies.createSession.length = 0;
  spies.upsert.length = 0;
  spies.verifyUpserts.length = 0;
}

async function postVerify(body: Record<string, unknown>) {
  const response = await POST_VERIFY(new Request("http://local/api/checkout/otp/verify", {
    method: "POST",
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const EMAIL1_ACCOUNT: Account = {
  id: "u_email1",
  email: "email1@example.com",
  phone: null,
  name: "Old User",
};

test("signed in as email1, verifying email2 at checkout signs email1 out and switches the account", async () => {
  reset({ account: EMAIL1_ACCOUNT });
  const res = await postVerify({ channel: "email", destination: "Email2@example.com", code: "123456" });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(spies.signOuts, 1, "the old account session is revoked server-side");
  assert.deepEqual(spies.upsert, [{ email: "email2@example.com" }]);
  assert.deepEqual(spies.createSession, ["u_new_for_email"]);
  assert.ok(setCookies.some((c) => c.name === "pt_verify"), "verify cookie refreshed");
  assert.equal(cookieStore.get("pt_account"), "acct-token", "the new email is now the signed-in account");
});

test("negative: failed OTP for email2 signs nobody out and sets no cookies", async () => {
  reset({ account: EMAIL1_ACCOUNT, fail: true });
  const res = await postVerify({ channel: "email", destination: "email2@example.com", code: "000000" });
  assert.equal(res.status, 400);
  assert.equal(spies.signOuts, 0, "an unproven email must never destroy the session");
  assert.deepEqual(spies.upsert, []);
  assert.deepEqual(setCookies, [], "a failed OTP must not mint any session cookie");
});

test("verifying the already-signed-in email changes nothing at account level", async () => {
  reset({ account: EMAIL1_ACCOUNT });
  const res = await postVerify({ channel: "email", destination: " Email1@Example.com ", code: "123456" });
  assert.equal(res.status, 200);
  assert.equal(spies.signOuts, 0);
  assert.deepEqual(spies.upsert, [], "no parallel identity is created");
  assert.deepEqual(spies.createSession, []);
  assert.equal(setCookies.filter((c) => c.name === "pt_account").length, 0, "pt_account is never re-minted");
  assert.ok(setCookies.some((c) => c.name === "pt_verify"));
});

test("contrast: signed-out verification of email2 promotes a fresh account session", async () => {
  reset({ account: null });
  const res = await postVerify({ channel: "email", destination: "email2@example.com", code: "123456" });
  assert.equal(res.status, 200);
  assert.equal(spies.signOuts, 0);
  assert.deepEqual(spies.upsert, [{ email: "email2@example.com" }]);
  assert.deepEqual(spies.createSession, ["u_new_for_email"]);
  assert.ok(setCookies.some((c) => c.name === "pt_account"), "guest is promoted to a customer session");
});

test("negative: phone verify never signs out or switches the account", async () => {
  reset({ account: EMAIL1_ACCOUNT, sms: true });
  const res = await postVerify({ channel: "phone", destination: "9876543210", code: "123456" });
  assert.equal(res.status, 200);
  assert.equal(res.body.phoneVerified, true);
  assert.equal(spies.signOuts, 0, "phone OTP proves nothing about emails");
  assert.deepEqual(spies.upsert, []);
  assert.equal(setCookies.filter((c) => c.name === "pt_account").length, 0);
});

test("negative: phone channel rejected with 503 when SMS is not configured", async () => {
  reset({ account: EMAIL1_ACCOUNT, sms: false });
  const res = await postVerify({ channel: "phone", destination: "9876543210", code: "123456" });
  assert.equal(res.status, 503);
  assert.deepEqual(setCookies, []);
  assert.equal(spies.signOuts, 0);
});

test("account login writes the checkout verify session with the same email", async () => {
  reset({ account: null });
  const res = await POST_LOGIN(new Request("http://local/api/account/login", {
    method: "POST",
    body: JSON.stringify({ email: "Email1@Example.com", code: "123456" }),
  }));
  assert.equal(res.status, 200);
  assert.deepEqual(spies.verifyUpserts, [
    { token: "", email: "email1@example.com", emailVerified: true, phoneVerified: false },
  ]);
  const names = setCookies.map((c) => c.name);
  assert.ok(names.includes("pt_account") && names.includes("pt_verify"), "both cookies carry the login email");
});

test("account login with email2 replaces a stale email3 verify session (checkout follows login)", async () => {
  reset({ account: null });
  cookieStore.set("pt_verify", "stale-verify-token-1234567890");
  const res = await POST_LOGIN(new Request("http://local/api/account/login", {
    method: "POST",
    body: JSON.stringify({ email: "email2@example.com", code: "123456" }),
  }));
  assert.equal(res.status, 200);
  assert.equal(spies.verifyUpserts[0].token, "stale-verify-token-1234567890");
  assert.equal(spies.verifyUpserts[0].email, "email2@example.com");
  assert.equal(cookieStore.get("pt_verify"), "mock-verify-token");
});
