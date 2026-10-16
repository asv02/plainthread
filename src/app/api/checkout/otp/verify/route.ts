import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { smsConfigured } from "@/lib/shop/config";
import {
  consumeOtp,
  normalizeOtpDestination,
  upsertVerifySession,
  type OtpChannel,
} from "@/lib/shop/otp";
import {
  createCustomerSession,
  customerCookieName,
  customerCookieOptions,
  deleteCustomerSession,
  getCustomerFromCookie,
  upsertCustomer,
} from "@/lib/shop/customers";
import {
  normalizeEmail,
  verifyCookieName,
  verifyCookieOptions,
} from "@/lib/shop/identity";
import { errMessage, startFlow } from "@/lib/log";

export async function POST(request: Request) {
  const flow = startFlow("otp-verify", { path: "/api/checkout/otp/verify" });
  try {
    const body = (await request.json()) as {
      channel?: OtpChannel;
      destination?: string;
      code?: string;
      sessionToken?: string;
    };
    const channel = body.channel === "phone" ? "phone" : "email";
    const jar = await cookies();
    // The HttpOnly cookie is the primary session pointer; the body token is a
    // fallback for scripted clients only.
    const cookieToken = jar.get(verifyCookieName)?.value ?? "";
    const sessionToken = cookieToken || body.sessionToken || "";
    flow.step("channel selected", { channel, hasSession: Boolean(sessionToken) });
    const destination = normalizeOtpDestination(channel, body.destination ?? "");
    if (channel === "phone" && !smsConfigured()) {
      flow.fail("SMS not configured");
      return NextResponse.json({ error: "SMS verification is not configured yet." }, { status: 503 });
    }
    await consumeOtp(channel, destination, body.code ?? "");
    flow.step("otp consumed", { channel });
    const session = await upsertVerifySession({
      token: sessionToken,
      email: channel === "email" ? destination : undefined,
      phone: channel === "phone" ? destination : undefined,
      emailVerified: channel === "email",
      phoneVerified: channel === "phone",
    });
    jar.set(verifyCookieName, session.token, verifyCookieOptions(new Date(session.expires_at)));
    flow.step("verify session cookie set");

    if (channel === "email") {
      // One canonical email per browser: the verified email IS the account.
      // Verifying a different email at checkout signs the previous account
      // out (its session row is revoked) and promotes the new email to a
      // full 30-day customer session, so account email and checkout email
      // never diverge. Verifying the already-signed-in email changes nothing.
      const existingAccount = await getCustomerFromCookie();
      const sameEmail =
        existingAccount && normalizeEmail(existingAccount.email) === destination;
      if (!sameEmail) {
        if (existingAccount) {
          await deleteCustomerSession();
          flow.step("previous account signed out for email switch");
        }
        const userId = await upsertCustomer({ email: destination });
        const customerSession = await createCustomerSession(userId);
        jar.set(
          customerCookieName,
          customerSession.token,
          customerCookieOptions(customerSession.expiresAt),
        );
        flow.step("customer session established", { userId, switched: Boolean(existingAccount) });
      } else {
        flow.step("verified email matches account; session unchanged");
      }
    }

    flow.done("session updated", {
      channel,
      emailVerified: session.email_verified,
      phoneVerified: session.phone_verified,
    });
    return NextResponse.json({
      ok: true,
      emailVerified: session.email_verified,
      phoneVerified: session.phone_verified,
    });
  } catch (error) {
    flow.fail("verify failed", { error: errMessage(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify code" },
      { status: 400 },
    );
  }
}
