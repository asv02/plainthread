import { NextResponse } from "next/server";
import { getCustomerFromCookie } from "@/lib/shop/customers";
import { errMessage, log } from "@/lib/log";

export async function GET() {
  try {
    const user = await getCustomerFromCookie();
    return NextResponse.json({
      user: user ? { email: user.email, name: user.name } : null,
    });
  } catch (error) {
    log.error("account-session", "probe failed", { error: errMessage(error) });
    return NextResponse.json({ error: "Could not check session" }, { status: 500 });
  }
}
