import { createHmac, randomBytes, randomInt, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { otpSecret } from "@/lib/shop/config";
import { log } from "@/lib/log";
import { upsertCustomer } from "@/lib/shop/customers";

export type OtpChannel = "email" | "phone";

function hashCode(code: string) {
  const secret = otpSecret();
  if (!secret) throw new Error("OTP secret is not configured");
  return createHmac("sha256", secret).update(code).digest("hex");
}

function hashesEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && cryptoTimingSafeEqual(left, right);
}

export function normalizeOtpDestination(channel: OtpChannel, raw: string) {
  if (channel === "email") {
    const email = raw.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email");
    return email;
  }
  const phone = raw.replace(/\s+/g, "").replace(/^\+91/, "");
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid 10-digit Indian mobile number");
  return phone;
}

export async function createOtp(channel: OtpChannel, destination: string) {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("checkout_otps")
    .select("id", { count: "exact", head: true })
    .eq("channel", channel)
    .eq("destination", destination)
    .gte("created_at", since);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= 3) {
    log.info("otp", "rate limited", { channel });
    throw new Error("Too many codes sent. Wait a few minutes and try again.");
  }

  const code = String(randomInt(100000, 1000000));
  const { error } = await db.from("checkout_otps").insert({
    channel,
    destination,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  log.info("otp", "sent", { channel });
  return code;
}

export async function consumeOtp(channel: OtpChannel, destination: string, code: string) {
  const db = supabaseAdmin();
  const { data: rows, error } = await db
    .from("checkout_otps")
    .select("id, code_hash, expires_at, attempts")
    .eq("channel", channel)
    .eq("destination", destination)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = rows?.[0];
  if (!row) throw new Error("Request a new code first");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    log.info("otp", "expired", { channel });
    throw new Error("That code has expired. Request a new one.");
  }
  if (row.attempts >= 5) {
    log.info("otp", "too many attempts", { channel });
    throw new Error("Too many attempts. Request a new code.");
  }

  const ok = hashesEqual(row.code_hash, hashCode(code.trim()));
  await db
    .from("checkout_otps")
    .update({ attempts: row.attempts + 1 })
    .eq("id", row.id);
  if (!ok) throw new Error("Incorrect code");

  await db.from("checkout_otps").delete().eq("id", row.id);
  if (channel === "email") {
    try {
      await upsertCustomer({ email: destination });
    } catch (error) {
      log.error("otp", "user upsert after email verify failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function upsertVerifySession(input: {
  token?: string;
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}) {
  const db = supabaseAdmin();
  const existing = input.token ? await getVerifySession(input.token) : null;
  const token = existing?.token || randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const row = {
    token,
    email: input.emailVerified ? input.email ?? existing?.email ?? null : existing?.email ?? null,
    phone: input.phoneVerified ? input.phone ?? existing?.phone ?? null : existing?.phone ?? null,
    email_verified: Boolean(existing?.email_verified || input.emailVerified),
    phone_verified: Boolean(existing?.phone_verified || input.phoneVerified),
    expires_at: expiresAt,
  };
  if (existing) {
    const { error } = await db.from("checkout_verify_sessions").update(row).eq("token", token);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db.from("checkout_verify_sessions").insert(row);
    if (error) throw new Error(error.message);
  }
  return row;
}

export async function getVerifySession(token: string) {
  if (!token || token.length < 16) return null;
  const { data, error } = await supabaseAdmin()
    .from("checkout_verify_sessions")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as {
    token: string;
    email: string | null;
    phone: string | null;
    email_verified: boolean;
    phone_verified: boolean;
    expires_at: string;
  };
}
