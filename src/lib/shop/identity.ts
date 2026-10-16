import { cookies } from "next/headers";
import { getVerifySession } from "@/lib/shop/otp";
import { getCustomerFromCookie, type CustomerUser } from "@/lib/shop/customers";

export const verifyCookieName = "pt_verify";

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function verifyCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export type VerifySessionState = {
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
};

export async function readVerifySessionToken(): Promise<string> {
  return (await cookies()).get(verifyCookieName)?.value ?? "";
}

export async function readVerifySession(): Promise<VerifySessionState | null> {
  const token = await readVerifySessionToken();
  if (!token) return null;
  const session = await getVerifySession(token);
  if (!session) return null;
  return {
    email: session.email,
    phone: session.phone,
    emailVerified: session.email_verified,
    phoneVerified: session.phone_verified,
  };
}

export type CheckoutGateInput = {
  verify: VerifySessionState | null;
  // Emails trusted from the signed-in account's session — in the
  // single-canonical-email model this is the account's primary email only.
  accountEmails: string[];
  email: string;
  phone: string;
  smsRequired: boolean;
};

export function emailTrustedIn(input: CheckoutGateInput) {
  const email = normalizeEmail(input.email);
  if (input.verify?.emailVerified && input.verify.email && input.verify.email === email) {
    return true;
  }
  return input.accountEmails.includes(email);
}

export function phoneTrustedIn(input: CheckoutGateInput) {
  const phone = input.phone.replace(/\s+/g, "").replace(/^\+91/, "");
  return Boolean(input.verify?.phoneVerified && input.verify.phone === phone);
}

export function decideCheckoutGate(input: CheckoutGateInput) {
  if (!emailTrustedIn(input)) {
    return { ok: false as const, error: "Verify your email before paying." };
  }
  if (input.smsRequired && !phoneTrustedIn(input)) {
    return { ok: false as const, error: "Verify your mobile number before paying." };
  }
  return { ok: true as const };
}

export async function assertTrustedCheckout(input: {
  email: string;
  phone: string;
  smsRequired: boolean;
  fallbackToken?: string;
}) {
  const token = (await readVerifySessionToken()) || input.fallbackToken || "";
  const session = token ? await getVerifySession(token) : null;
  const verify: VerifySessionState | null = session
    ? {
        email: session.email,
        phone: session.phone,
        emailVerified: session.email_verified,
        phoneVerified: session.phone_verified,
      }
    : null;
  const account: CustomerUser | null = await getCustomerFromCookie();
  // One canonical email per browser: only the account's primary email is
  // trusted from the session. Changing the checkout email to anything else
  // requires an OTP, and a successful OTP switches the account to that email.
  const accountEmails = account ? [normalizeEmail(account.email)] : [];
  const decision = decideCheckoutGate({
    verify,
    accountEmails,
    email: input.email,
    phone: input.phone,
    smsRequired: input.smsRequired,
  });
  if (!decision.ok) throw new Error(decision.error);
  return { verify, account, accountEmails };
}
