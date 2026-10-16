import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteCustomerSession } from "@/lib/shop/customers";
import { verifyCookieName, verifyCookieOptions } from "@/lib/shop/identity";
import { log } from "@/lib/log";

export async function POST() {
  const jar = await cookies();
  const verifyToken = jar.get(verifyCookieName)?.value ?? "";
  if (verifyToken) {
    await supabaseAdmin().from("checkout_verify_sessions").delete().eq("token", verifyToken);
    jar.set(verifyCookieName, "", { ...verifyCookieOptions(new Date(0)), maxAge: 0 });
  }
  await deleteCustomerSession();
  log.info("account-logout", "ok");
  return NextResponse.json({ ok: true });
}
