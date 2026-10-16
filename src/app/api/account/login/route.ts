import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumeOtp, normalizeOtpDestination, upsertVerifySession } from "@/lib/shop/otp";
import {
  createCustomerSession,
  customerCookieName,
  customerCookieOptions,
  upsertCustomer,
} from "@/lib/shop/customers";
import { verifyCookieName, verifyCookieOptions } from "@/lib/shop/identity";
import { errMessage, startFlow } from "@/lib/log";

export async function POST(request: Request) {
  const flow = startFlow("account-login", { path: "/api/account/login" });
  try {
    const body = (await request.json()) as { email?: string; code?: string };
    const email = normalizeOtpDestination("email", body.email ?? "");
    flow.step("email normalized");
    await consumeOtp("email", email, body.code ?? "");
    flow.step("otp consumed");
    const userId = await upsertCustomer({ email });
    const session = await createCustomerSession(userId);
    const jar = await cookies();
    jar.set(customerCookieName, session.token, customerCookieOptions(session.expiresAt));
    // The login OTP proves this mailbox, so the checkout verify session must
    // carry the same email: one canonical email per browser.
    const verifyToken = jar.get(verifyCookieName)?.value ?? "";
    const verifySession = await upsertVerifySession({
      token: verifyToken,
      email,
      emailVerified: true,
      phoneVerified: false,
    });
    jar.set(
      verifyCookieName,
      verifySession.token,
      verifyCookieOptions(new Date(verifySession.expires_at)),
    );
    flow.done("logged in", { userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    flow.fail("login failed", { error: errMessage(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sign in" },
      { status: 400 },
    );
  }
}
