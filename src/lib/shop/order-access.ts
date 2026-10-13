import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { CustomerUser } from "@/lib/shop/customers";
import { customerOwnsOrder } from "@/lib/shop/customers";
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

export function orderAuthorized(
  payload: OrderPayload | null,
  token: string,
  user: CustomerUser | null,
) {
  if (!payload) return { ok: false as const, tokenOk: false, sessionOk: false };
  const tokenOk = Boolean(token && timingSafeEqual(payload.order.access_token, token));
  const sessionOk = Boolean(user && customerOwnsOrder(user, payload.order));
  return { ok: tokenOk || sessionOk, tokenOk, sessionOk };
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
