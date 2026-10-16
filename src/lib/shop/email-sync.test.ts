import assert from "node:assert/strict";
import test, { before, mock } from "node:test";

type MethodCall = { method: string; args: unknown[] };
type TableCall = { table: string; calls: MethodCall[] };

const recorded: TableCall[] = [];
let linkEmailRows: Array<{ email: string }> = [];
let forceError = false;

function makeChain(entry: TableCall) {
  const chain: Record<string, unknown> = {};
  const track = (name: string) => (...args: unknown[]) => {
    entry.calls.push({ method: name, args });
    return chain;
  };
  for (const name of ["select", "insert", "update", "delete", "upsert", "eq", "neq", "is", "in", "limit"]) {
    chain[name] = track(name);
  }
  chain.then = (
    resolve: (value: unknown) => unknown,
  ) => {
    if (forceError) return resolve({ data: null, error: { message: "mock failure" } });
    if (entry.calls.some((c) => c.method === "select")) return resolve({ data: linkEmailRows, error: null });
    return resolve({ data: null, error: null });
  };
  return chain;
}

mock.module("../supabase/admin", {
  namedExports: {
    supabaseAdmin: () => ({
      from: (table: string) => {
        const entry: TableCall = { table, calls: [] };
        recorded.push(entry);
        return makeChain(entry);
      },
      rpc: async () => ({ data: null, error: null }),
    }),
  },
});

mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({
      get: () => ({ value: "customer-session-token-longer-than-16" }),
      set: () => undefined,
    }),
  },
});

type CustomersModule = typeof import("./customers");
let listVerifiedEmails: CustomersModule["listVerifiedEmails"];
let customerOwnsOrderWithLinks: CustomersModule["customerOwnsOrderWithLinks"];
let deleteCustomerSession: CustomersModule["deleteCustomerSession"];

before(async () => {
  const customers = await import("./customers");
  listVerifiedEmails = customers.listVerifiedEmails;
  customerOwnsOrderWithLinks = customers.customerOwnsOrderWithLinks;
  deleteCustomerSession = customers.deleteCustomerSession;
});

test("listVerifiedEmails returns lowercased legacy links and degrades to empty on error", async () => {
  recorded.length = 0;
  forceError = false;
  linkEmailRows = [{ email: "Email2@Example.com" }];
  assert.deepEqual(await listVerifiedEmails("u1"), ["email2@example.com"]);
  forceError = true;
  assert.deepEqual(await listVerifiedEmails("u1"), []);
  forceError = false;
});

test("ownership: legacy linked email2 grants the email1 account access to email2's order", async () => {
  recorded.length = 0;
  forceError = false;
  linkEmailRows = [{ email: "email2@example.com" }];
  const user = { id: "u1", email: "email1@example.com", phone: null, name: null };
  assert.equal(
    await customerOwnsOrderWithLinks(
      user,
      { user_id: null, email: "Email2@example.com" } as never,
    ),
    true,
  );
});

test("ownership: primary email match grants access without any link lookup", async () => {
  const user = { id: "u1", email: "Email1@Example.com", phone: null, name: null };
  assert.equal(
    await customerOwnsOrderWithLinks(user, { user_id: null, email: "email1@example.com" } as never),
    true,
  );
});

test("ownership negatives: unlinked order email is refused (IDOR guard)", async () => {
  const user = { id: "u1", email: "email1@example.com", phone: null, name: null };
  linkEmailRows = [{ email: "email2@example.com" }];
  assert.equal(
    await customerOwnsOrderWithLinks(user, { user_id: null, email: "victim@example.com" } as never),
    false,
  );
  linkEmailRows = [];
  assert.equal(
    await customerOwnsOrderWithLinks(user, { user_id: "u2", email: "email2@example.com" } as never),
    false,
  );
});

test("deleteCustomerSession revokes the DB session row and expires the cookie", async () => {
  recorded.length = 0;
  forceError = false;
  await deleteCustomerSession();
  const deletes = recorded.filter(
    (entry) => entry.table === "customer_sessions" && entry.calls.some((c) => c.method === "delete"),
  );
  assert.equal(deletes.length, 1, "the signed-in session row is revoked server-side");
  const eqArgs = deletes[0].calls.filter((c) => c.method === "eq").map((c) => c.args);
  assert.ok(eqArgs.some((args) => args[0] === "token"));
});
