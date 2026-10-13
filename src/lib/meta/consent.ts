export const AD_CONSENT_COOKIE = "pt_ad_consent";
export const AD_CONSENT_EVENT = "pt-ad-consent";
export const AD_CONSENT_OPEN_EVENT = "pt-ad-consent-open";
export const AD_CONSENT_MAX_AGE_SEC = 60 * 60 * 24 * 365;
/** Privacy/consent copy version. Bump when the notice categories change. */
export const CONSENT_POLICY_VERSION = "2026-10";
const RECORD_VERSION = 1 as const;

export type AdConsent = "granted" | "denied";

export type ConsentRecord = {
  version: typeof RECORD_VERSION;
  policyVersion: string;
  choice: AdConsent;
  categories: {
    essential: true;
    marketing: boolean;
  };
  at: string;
};

type StoredRecord = {
  v: typeof RECORD_VERSION;
  p: string;
  c: AdConsent;
  m: 0 | 1;
  t: string;
};

export function adConsentCookieOptions() {
  return {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AD_CONSENT_MAX_AGE_SEC,
  };
}

export function getNamedCookie(
  cookieString: string | null | undefined,
  name: string,
): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    return trimmed.slice(name.length + 1);
  }
  return null;
}

function decodeCookieValue(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isStoredRecord(value: unknown): value is StoredRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as StoredRecord;
  return (
    row.v === RECORD_VERSION &&
    typeof row.p === "string" &&
    (row.c === "granted" || row.c === "denied") &&
    (row.m === 0 || row.m === 1) &&
    typeof row.t === "string"
  );
}

export function buildConsentRecord(choice: AdConsent, at = new Date().toISOString()): ConsentRecord {
  return {
    version: RECORD_VERSION,
    policyVersion: CONSENT_POLICY_VERSION,
    choice,
    categories: {
      essential: true,
      marketing: choice === "granted",
    },
    at,
  };
}

export function serializeConsentCookie(record: ConsentRecord) {
  const stored: StoredRecord = {
    v: RECORD_VERSION,
    p: record.policyVersion,
    c: record.choice,
    m: record.categories.marketing ? 1 : 0,
    t: record.at,
  };
  return encodeURIComponent(JSON.stringify(stored));
}

export function parseConsentRecord(value: string | null | undefined): ConsentRecord | null {
  if (!value) return null;
  const decoded = decodeCookieValue(value);
  if (decoded === "granted" || decoded === "denied") {
    return buildConsentRecord(decoded, "1970-01-01T00:00:00.000Z");
  }
  try {
    const parsed: unknown = JSON.parse(decoded);
    if (!isStoredRecord(parsed)) return null;
    return {
      version: RECORD_VERSION,
      policyVersion: parsed.p,
      choice: parsed.c,
      categories: { essential: true, marketing: parsed.m === 1 },
      at: parsed.t,
    };
  } catch {
    return null;
  }
}

export function parseAdConsent(value: string | null | undefined): AdConsent | null {
  return parseConsentRecord(value)?.choice ?? null;
}

export function readAdConsentFromCookieString(
  cookieString: string | null | undefined,
): AdConsent | null {
  return parseAdConsent(getNamedCookie(cookieString, AD_CONSENT_COOKIE));
}

export function readConsentRecordFromCookieString(
  cookieString: string | null | undefined,
): ConsentRecord | null {
  return parseConsentRecord(getNamedCookie(cookieString, AD_CONSENT_COOKIE));
}

/** Server-side gate: optional CAPI matching only when the consent cookie is granted. */
export function isMarketingConsentGrantedFromHeader(cookieHeader: string | null | undefined) {
  return readAdConsentFromCookieString(cookieHeader) === "granted";
}
