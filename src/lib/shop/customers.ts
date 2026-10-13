import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import type { DbOrder, DbOrderItem, OrderPayload } from "@/lib/shop/types";

export const customerCookieName = "pt_account";
const SESSION_DAYS = 30;

export type CustomerUser = {
  id: string;
  email: string;
  phone: string | null;
  name: string | null;
};

export async function upsertCustomer(input: {
  email: string;
  phone?: string | null;
  name?: string | null;
}) {
  const { data, error } = await supabaseAdmin().rpc("upsert_customer", {
    p_email: input.email,
    p_phone: input.phone ?? null,
    p_name: input.name ?? null,
  });
  if (error) throw new Error(error.message);
  const userId = data as string;
  log.info("account", "user upserted", { userId });
  return userId;
}

export async function createCustomerSession(userId: string) {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const db = supabaseAdmin();
  const { error } = await db.from("customer_sessions").insert({
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);
  await db
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);
  log.info("account", "session created", { userId });
  return { token, expiresAt };
}

export function customerCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export async function getCustomerFromCookie(): Promise<CustomerUser | null> {
  const token = (await cookies()).get(customerCookieName)?.value ?? "";
  if (!token || token.length < 16) return null;
  const db = supabaseAdmin();
  const { data: session, error } = await db
    .from("customer_sessions")
    .select("user_id, expires_at, users(id, email, phone, name)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  const user = (session as { users?: CustomerUser | CustomerUser[] | null }).users;
  const row = Array.isArray(user) ? user[0] : user;
  if (!row?.id) return null;
  return row;
}

export async function deleteCustomerSession() {
  const jar = await cookies();
  const token = jar.get(customerCookieName)?.value ?? "";
  if (token) {
    await supabaseAdmin().from("customer_sessions").delete().eq("token", token);
  }
  jar.set(customerCookieName, "", {
    ...customerCookieOptions(new Date(0)),
    maxAge: 0,
  });
}

export function customerOwnsOrder(user: CustomerUser, order: DbOrder) {
  return order.user_id === user.id || order.email.toLowerCase() === user.email.toLowerCase();
}

export async function listOrdersForUser(userId: string): Promise<OrderPayload[]> {
  const db = supabaseAdmin();
  const { data: orders, error } = await db
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows = (orders ?? []) as DbOrder[];
  if (rows.length === 0) return [];
  const ids = rows.map((order) => order.id);
  const { data: items, error: itemsError } = await db
    .from("order_items")
    .select("*")
    .in("order_id", ids);
  if (itemsError) throw new Error(itemsError.message);
  const byOrder = new Map<string, DbOrderItem[]>();
  for (const item of (items ?? []) as DbOrderItem[]) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }
  return rows.map((order) => ({ order, items: byOrder.get(order.id) ?? [] }));
}
