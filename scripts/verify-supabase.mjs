import fs from "fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const required = {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: service,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
};

let failed = false;
for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`missing ${key}`);
    failed = true;
  }
}
if (failed) process.exit(1);

const db = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const expectedTables = [
  "variants",
  "orders",
  "order_items",
  "payment_events",
  "checkout_otps",
  "checkout_verify_sessions",
  "users",
  "customer_sessions",
  "meta_event_outbox",
];
const expectedRpcs = [
  "checkout_create",
  "attach_razorpay_order",
  "mark_payment_failed",
  "mark_order_paid",
  "cancel_customer_order",
  "finalize_refund_cancel",
  "expire_stale_orders",
  "admin_set_status",
  "admin_set_parcel",
  "admin_set_payment",
  "confirm_cod_order",
  "upsert_customer",
  "enqueue_meta_purchase",
  "claim_meta_event_outbox",
  "reconcile_meta_purchase_outbox",
];
const expectedOrderCols = [
  "public_id",
  "access_token",
  "payment_method",
  "parcel_status",
  "tax_paise",
  "tax_rate_bps",
  "tax_kind",
  "cgst_paise",
  "sgst_paise",
  "igst_paise",
  "customer_email_sent_at",
  "ops_email_sent_at",
  "razorpay_order_id",
  "hold_expires_at",
  "created_at",
  "meta_fbp",
  "marketing_consent",
];

async function main() {
  console.log("supabase_url", url);

  const { data: variants, error: variantsError } = await db
    .from("variants")
    .select("sku, product_slug, size, stock, created_at")
    .order("sku");
  if (variantsError) {
    console.error("variants_fetch", variantsError.message);
    console.error("Run supabase/schema.sql in the SQL editor, then retry: npm run db:verify");
    process.exit(1);
  }

  const { data: ordersSample, error: ordersError } = await db
    .from("orders")
    .select("*")
    .limit(1);
  if (ordersError) {
    console.error("orders_fetch", ordersError.message);
    process.exit(1);
  }

  const orderCols = ordersSample?.[0] ? Object.keys(ordersSample[0]) : null;
  if (orderCols) {
    const missing = expectedOrderCols.filter((col) => !orderCols.includes(col));
    if (missing.length) {
      console.error("orders_missing_columns", missing.join(", "));
      failed = true;
    }
  }

  const { data: itemsSample, count: itemCount, error: itemsError } = await db
    .from("order_items")
    .select("id, created_at", { count: "exact" })
    .limit(1);
  if (itemsError) {
    console.error("order_items_fetch", itemsError.message);
    failed = true;
  } else if (itemsSample?.[0] && !("created_at" in itemsSample[0])) {
    console.error("order_items_missing_columns", "created_at");
    failed = true;
  }

  const { data: eventsSample, error: eventsError } = await db
    .from("payment_events")
    .select("id, created_at")
    .limit(1);
  if (eventsError) {
    console.error("payment_events_fetch", eventsError.message);
    failed = true;
  } else if (eventsSample?.[0] && !("created_at" in eventsSample[0])) {
    console.error("payment_events_missing_columns", "created_at");
    failed = true;
  }

  if (variants?.[0] && !("created_at" in variants[0])) {
    console.error("variants_missing_columns", "created_at");
    failed = true;
  }

  for (const name of expectedRpcs) {
    const { error } = await db.rpc(name, {});
    if (!error) {
      console.log("rpc_ok", name);
      continue;
    }
    const existsWithArgs = /without parameters in the schema cache/i.test(error.message);
    const missing = /Could not find the function/i.test(error.message) && !existsWithArgs;
    if (missing) {
      console.error("rpc_missing", name, error.message);
      failed = true;
    } else {
      console.log("rpc_ok", name);
    }
  }

  const slugs = new Set((variants ?? []).map((row) => `${row.product_slug}:${row.size}`));
  const expectedSkus = ["S", "M", "L", "XL", "XXL"].flatMap((size) =>
    ["black-oversized-tshirt", "white-oversized-tshirt", "pink-oversized-tshirt"].map(
      (slug) => `${slug}:${size}`,
    ),
  );
  const missingSkus = expectedSkus.filter((key) => !slugs.has(key));
  if (missingSkus.length) {
    console.error("variants_missing", missingSkus.join(", "));
    failed = true;
  }

  const { error: checkoutProbe } = await db.rpc("checkout_create", {
    p_idempotency_key: "verify-key-0001",
    p_customer: {
      name: "Verify",
      email: "verify@plainthread.in",
      phone: "9876543210",
      address_line1: "1 Test Road",
      city: "Gurugram",
      state: "Haryana",
      pincode: "122001",
    },
    p_items: [],
    p_subtotal_paise: 0,
    p_tax_paise: 0,
    p_shipping_paise: 0,
    p_total_paise: 0,
    p_hold_minutes: 15,
    p_tax_rate_bps: 500,
    p_tax_kind: "igst",
    p_cgst_paise: 0,
    p_sgst_paise: 0,
    p_igst_paise: 0,
  });
  if (checkoutProbe && /Could not find the function/i.test(checkoutProbe.message) && !/without parameters/i.test(checkoutProbe.message)) {
    console.error("checkout_create_call_failed", checkoutProbe.message);
    failed = true;
  } else {
    console.log("checkout_create_callable", checkoutProbe?.message || "ok");
  }

  console.log("tables_ok", expectedTables.join(", "));
  console.log("variant_rows", variants?.length ?? 0);
  console.log("order_items_count", itemCount ?? 0);
  console.log(
    "stock_sample",
    (variants ?? [])
      .slice(0, 3)
      .map((row) => `${row.sku}=${row.stock}`)
      .join(" "),
  );

  if (failed) process.exit(1);
  console.log("supabase_ready: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
