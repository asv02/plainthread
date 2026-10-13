import { createHash } from "node:crypto";

const HASH_RE = /^[a-f0-9]{64}$/;

export function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Hash normalized PII once. Already-hashed 64-char hex is returned unchanged. */
export function hashOnce(normalized: string) {
  if (HASH_RE.test(normalized)) return normalized;
  return sha256Hex(normalized);
}

export function normalizeEmail(raw: string | null | undefined) {
  const email = raw?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return null;
  }
  if (/\s/.test(email)) return null;
  return email;
}

/**
 * India-first phone normalization for Meta `ph`.
 * Keeps country code 91. Does not strip digits from a 10-digit mobile.
 */
export function normalizePhone(raw: string | null | undefined) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("0") && /^0[6-9]\d{9}$/.test(digits)) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  return null;
}

function normalizePlace(raw: string | null | undefined) {
  const value = raw?.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "") ?? "";
  return value || null;
}

export function normalizeCity(raw: string | null | undefined) {
  return normalizePlace(raw);
}

export function normalizeState(raw: string | null | undefined) {
  return normalizePlace(raw);
}

export function normalizePincode(raw: string | null | undefined) {
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length !== 6) return null;
  return digits;
}

export function normalizeCountry(raw: string | null | undefined) {
  const value = (raw ?? "in").trim().toLowerCase();
  if (value === "in" || value === "india" || value === "ind") return "in";
  if (/^[a-z]{2}$/.test(value)) return value;
  return null;
}

export type MatchableUser = {
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
};

export function hashedUserData(user: MatchableUser) {
  const out: Record<string, string> = {};
  const email = normalizeEmail(user.email);
  if (email) out.em = hashOnce(email);
  const phone = normalizePhone(user.phone);
  if (phone) out.ph = hashOnce(phone);
  const externalId = user.userId?.trim();
  if (externalId) out.external_id = hashOnce(externalId);
  const city = normalizeCity(user.city);
  if (city) out.ct = hashOnce(city);
  const state = normalizeState(user.state);
  if (state) out.st = hashOnce(state);
  const zip = normalizePincode(user.pincode);
  if (zip) out.zp = hashOnce(zip);
  const country = normalizeCountry(user.country);
  if (country) out.country = hashOnce(country);
  return out;
}
