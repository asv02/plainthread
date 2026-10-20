import assert from "node:assert/strict";
import test from "node:test";
import {
  CLARITY_EVENTS,
  _clarityQueueLengthForTests,
  _isClarityScriptReadyForTests,
  _resetClarityForTests,
  clampTagValue,
  hasSensitiveQuery,
  hasStartedClarityThisSession,
  initClarity,
  isClarityActive,
  isClarityInitialized,
  revokeClarity,
  setClarityTag,
  startClarityTracking,
  trackClarityEvent,
  trackClarityPageView,
} from "./clarity";

type FakeWin = {
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  location: { search: string; href: string };
  dispatchEvent: (event: unknown) => boolean;
  [key: string]: unknown;
};

let fakeWin: FakeWin;
let calls: unknown[][];
let dispatched: string[];
const originalWindow = (globalThis as { window?: unknown }).window;
const originalSessionStorage = (globalThis as { sessionStorage?: unknown }).sessionStorage;

function installDom() {
  calls = [];
  dispatched = [];
  const store = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  fakeWin = {
    location: { search: "", href: "https://plainthread.in/checkout" },
    dispatchEvent: (event: unknown) => {
      const type = (event as { type?: string })?.type;
      if (type) dispatched.push(type);
      return true;
    },
  };
  const scripts: { id?: string }[] = [];
  (globalThis as { window?: unknown }).window = fakeWin;
  (globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => scripts.find((s) => s.id === id) ?? null,
    createElement: () => ({}),
    head: { appendChild: (el: { id?: string }) => scripts.push(el) },
  };
}

function uninstallDom() {
  (globalThis as { window?: unknown }).window = originalWindow;
  if (originalSessionStorage === undefined) {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
}

function installStub() {
  fakeWin.clarity = (...args: unknown[]) => {
    calls.push(args);
  };
}

function setSessionFlag(key: string, value: string) {
  const store = (globalThis as { sessionStorage?: { setItem?: (k: string, v: string) => void } }).sessionStorage;
  store?.setItem?.(key, value);
}

function setNodeEnv(value: string) {
  (process as { env: Record<string, string | undefined> }).env.NODE_ENV = value;
}

const PROJECT = "abc123xy";
const originalNodeEnv = process.env.NODE_ENV;

test.beforeEach(() => {
  setNodeEnv("production");
  _resetClarityForTests();
  installDom();
});

test.afterEach(() => {
  uninstallDom();
  setNodeEnv(originalNodeEnv ?? "test");
});

test("never initializes without a project id", () => {
  assert.equal(initClarity(""), false);
  assert.equal(fakeWin.clarity, undefined);
  assert.equal(startClarityTracking(), false);
  assert.equal(isClarityActive(), false);
});

test("development traffic is excluded from Clarity", () => {
  setNodeEnv("development");
  assert.equal(initClarity(PROJECT), false);
  assert.equal(fakeWin.clarity, undefined);
});

test("init injects the async tag exactly once and replays queued calls", () => {
  // Post-init calls land on the official stub queue before the SDK loads.
  assert.equal(initClarity(PROJECT), true);
  assert.equal(typeof fakeWin.clarity, "function");
  trackClarityEvent("view_home");
  assert.deepEqual(fakeWin.clarity?.q, [["event", "view_home"]]);
  // second init is a no-op: same stub queue (no duplicate entries), script id deduped
  assert.equal(initClarity(PROJECT), true);
  trackClarityEvent("add_to_cart");
  assert.deepEqual(fakeWin.clarity?.q, [["event", "view_home"], ["event", "add_to_cart"]]);
  assert.equal(_isClarityScriptReadyForTests(), true);
});

test("events before init are refused, not silently stored forever", () => {
  _resetClarityForTests();
  assert.equal(trackClarityEvent("view_home"), false);
  assert.equal(_clarityQueueLengthForTests(), 0);
});

test("post-init calls route through the official API; queue drains on init", () => {
  assert.equal(initClarity(PROJECT), true);
  installStub(); // simulate the loaded SDK replacing the stub
  trackClarityEvent("view_product");
  trackClarityPageView("/blog/post?ref=x#h");
  assert.deepEqual(calls[0], ["event", "view_product"]);
  assert.deepEqual(calls[1], ["set", "page", "/blog/post"]);
});

test("sensitive query strings block event delivery", () => {
  assert.equal(initClarity(PROJECT), true);
  installStub();
  fakeWin.location.search = "?otp=123456";
  assert.equal(hasSensitiveQuery(), true);
  assert.equal(trackClarityEvent("purchase_completed"), false);
  assert.equal(calls.length, 0);
  fakeWin.location.search = "";
  assert.equal(trackClarityEvent("purchase_completed"), true);
});

test("tag values are clamped, low-cardinality keys only, PII-shaped values rejected", () => {
  assert.equal(clampTagValue("  Buy Now! "), "buy-now");
  assert.equal(clampTagValue("user@example.com"), "user-example-com");
  assert.equal(clampTagValue(""), "unknown");
  assert.equal(clampTagValue("x".repeat(80)).length, 40);
  assert.equal(initClarity(PROJECT), true);
  installStub();
  assert.equal(setClarityTag("product_color", "Black"), true);
  assert.deepEqual(calls[0], ["set", "product_color", "black"]);
  // @ is treated as contact-shaped by the shared PII scanner
  const before = calls.length;
  assert.equal(setClarityTag("checkout_type", "cod;email@x.com"), false);
  assert.equal(calls.length, before);
});

test("consent withdrawal stops tracking and clears the SDK cookie state", () => {
  assert.equal(initClarity(PROJECT), true);
  installStub();
  trackClarityEvent("begin_checkout");
  revokeClarity();
  assert.deepEqual(calls[calls.length - 1], ["consent", false]);
  assert.equal(isClarityActive(), false);
  assert.equal(trackClarityEvent("view_cart"), false);
  assert.equal(_clarityQueueLengthForTests(), 0);
});

test("re-grant after withdrawal resumes tracking on the same page", () => {
  assert.equal(startClarityTracking(PROJECT), true);
  installStub();
  revokeClarity();
  assert.equal(trackClarityEvent("view_cart"), false);
  assert.equal(startClarityTracking(PROJECT), true);
  assert.deepEqual(calls[calls.length - 1], ["consent", true]);
  assert.equal(trackClarityEvent("view_cart"), true);
});

test("start dispatches the ready event so mount-gated components retry", () => {
  assert.equal(startClarityTracking(PROJECT), true);
  assert.ok(dispatched.includes("pt-clarity-ready"));
  // second start does not re-inject or re-dispatch
  const count = dispatched.length;
  startClarityTracking(PROJECT);
  assert.equal(dispatched.length, count);
});

test("a second document in the same tab session initialises its own stub", () => {
  // Regression: the init guard must be per-document. A full page load wipes
  // module state, so a lingering pt_clarity_started flag may not skip it —
  // otherwise every page after the landing page records nothing.
  setSessionFlag("pt_clarity_started", "1");
  _resetClarityForTests();
  assert.equal(hasStartedClarityThisSession(), true);
  assert.equal(isClarityInitialized(), false);
  assert.equal(startClarityTracking(PROJECT), true);
  assert.equal(typeof fakeWin.clarity, "function");
  assert.equal(_isClarityScriptReadyForTests(), true);
  assert.equal(trackClarityEvent("view_product"), true);
  assert.deepEqual(fakeWin.clarity?.q, [["event", "view_product"]]);
});

test("denied at load then accepted in the same document resumes delivery", () => {
  setSessionFlag("pt_clarity_started", "1");
  _resetClarityForTests();
  revokeClarity(); // loader revoke path for a document that never initialized
  assert.equal(trackClarityEvent("view_home"), false);
  assert.equal(startClarityTracking(PROJECT), true);
  assert.equal(isClarityActive(), true);
  assert.equal(trackClarityEvent("view_home"), true);
  assert.deepEqual(fakeWin.clarity?.q, [["event", "view_home"]]);
});

test("event taxonomy is snake_case, unique, and free of personal-data names", () => {
  const seen = new Set<string>();
  for (const name of CLARITY_EVENTS) {
    assert.match(name, /^[a-z][a-z0-9_]*$/);
    assert.ok(!seen.has(name), `duplicate event alias: ${name}`);
    seen.add(name);
  }
  for (const banned of ["email", "phone", "name", "address", "token"]) {
    assert.ok(!CLARITY_EVENTS.some((e) => e.includes(banned)), `PII-ish event: ${banned}`);
  }
});
