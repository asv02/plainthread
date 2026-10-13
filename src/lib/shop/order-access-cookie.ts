export const ORDER_ACCESS_COOKIE_PREFIX = "pt_ord_";
export const ORDER_ACCESS_MAX_AGE_SEC = 60 * 60 * 24 * 90;

export function orderAccessCookieName(publicId: string) {
  return `${ORDER_ACCESS_COOKIE_PREFIX}${publicId}`;
}

export function isLikelyPublicId(value: string) {
  return /^PT-[A-Z0-9]{8}$/i.test(value);
}

export function isLikelyAccessToken(value: string) {
  return /^[a-f0-9]{32,64}$/i.test(value);
}

export function orderAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ORDER_ACCESS_MAX_AGE_SEC,
  };
}
