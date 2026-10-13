import {
  AD_CONSENT_COOKIE,
  AD_CONSENT_EVENT,
  AD_CONSENT_MAX_AGE_SEC,
  buildConsentRecord,
  readConsentRecordFromCookieString,
  serializeConsentCookie,
  type AdConsent,
  type ConsentRecord,
} from "@/lib/meta/consent";
import { clearMetaPixelQueue } from "@/lib/meta-pixel-client";

export function readDocumentConsentRecord(): ConsentRecord | null {
  if (typeof document === "undefined") return null;
  return readConsentRecordFromCookieString(document.cookie);
}

export function persistAdConsent(choice: AdConsent): ConsentRecord {
  const record = buildConsentRecord(choice);
  const encoded = serializeConsentCookie(record);
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AD_CONSENT_COOKIE}=${encoded}; Path=/; Max-Age=${AD_CONSENT_MAX_AGE_SEC}; SameSite=Lax${secure}`;
  if (choice !== "granted") {
    expireOptionalMetaCookies();
    clearMetaPixelQueue();
  }
  window.dispatchEvent(new Event(AD_CONSENT_EVENT));
  return record;
}

export function expireOptionalMetaCookies() {
  if (typeof document === "undefined") return;
  const expires = "Thu, 01 Jan 1970 00:00:00 GMT";
  for (const name of ["_fbp", "_fbc"]) {
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=${expires}; SameSite=Lax`;
  }
}
