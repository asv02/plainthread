import { NextResponse, type NextRequest } from "next/server";
import {
  isLikelyAccessToken,
  isLikelyPublicId,
  orderAccessCookieName,
  orderAccessCookieOptions,
} from "@/lib/shop/order-access-cookie";

export function middleware(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const parts = request.nextUrl.pathname.split("/");
  const publicId = parts[1] === "orders" ? parts[2] ?? "" : "";
  if (!publicId || parts.length !== 3 || !isLikelyPublicId(publicId) || !isLikelyAccessToken(token)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.searchParams.delete("token");
  const response = NextResponse.redirect(url, 307);
  response.cookies.set(orderAccessCookieName(publicId), token, orderAccessCookieOptions());
  return response;
}

export const config = {
  matcher: ["/orders/:publicId"],
};
