import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { CustomerUser } from "@/lib/shop/customers";
import { customerOwnsOrderWithLinks } from "@/lib/shop/customers";
import { timingSafeEqual } from "@/lib/shop/serialize";
import type { OrderPayload } from "@/lib/shop/types";
import {
  isLikelyAccessToken,
  isLikelyPublicId,
  orderAccessCookieName,
  orderAccessCookieOptions,
} from "@/lib/shop/order-access-cookie";

export {
  isLikelyAccessToken,
  isLikelyPublicId,
  orderAccessCookieName,
  orderAccessCookieOptions,
} from "@/lib/shop/order-access-cookie";

export async function orderAuthorized(
  payload: OrderPayload | null,
  token: string,
  user: CustomerUser | null,
) {
  if (!payload) return { ok: false as const, tokenOk: false, sessionOk: false };
  const tokenOk = Boolean(token && timingSafeEqual(payload.order.access_token, token));
  const sessionOk = user ? await customerOwnsOrderWithLinks(user, payload.order) : false;
  return { ok: tokenOk || sessionOk, tokenOk, sessionOk };
}

/**
 * Session-only authorization for reading and cancelling orders. The access
 * token alone must NOT grant these — tokens leak through email links, shared
 * devices, and browser history, which would let a stranger view or cancel
 * someone else's order. Only the payment-confirmation endpoint keeps the
 * token path (a captured payment must be confirmable by the paying browser).
 */
export async function orderSessionAuthorized(
  payload: OrderPayload | null,
  user: CustomerUser | null,
) {
  if (!payload) return { ok: false as const, signedIn: Boolean(user) };
  const sessionOk = user ? await customerOwnsOrderWithLinks(user, payload.order) : false;
  return { ok: sessionOk, signedIn: Boolean(user) };
}

export async function readOrderAccessToken(publicId: string) {
  const jar = await cookies();
  return jar.get(orderAccessCookieName(publicId))?.value ?? "";
}

export function attachOrderAccessCookie(
  response: NextResponse,
  publicId: string,
  token: string,
) {
  if (!isLikelyPublicId(publicId) || !isLikelyAccessToken(token)) return response;
  response.cookies.set(orderAccessCookieName(publicId), token, orderAccessCookieOptions());
  return response;
}

export function jsonWithOrderAccess<T>(
  body: T,
  publicId: string,
  token: string,
  init?: { status?: number },
) {
  const response = NextResponse.json(body, init);
  attachOrderAccessCookie(response, publicId, token);
  return response;
}
