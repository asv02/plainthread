import { NextResponse } from "next/server";
import { normalizeEmail, readVerifySession } from "@/lib/shop/identity";
import { getCustomerFromCookie } from "@/lib/shop/customers";
import { errMessage, log } from "@/lib/log";

export async function GET() {
  try {
    const [verify, account] = await Promise.all([readVerifySession(), getCustomerFromCookie()]);
    // One canonical email: the account's own email only. Legacy linked
    // emails (customer_emails) stay visible for order history but no longer
    // pass the checkout gate.
    const accountEmails = account ? [normalizeEmail(account.email)] : [];
    return NextResponse.json({
      emailVerified: Boolean(verify?.emailVerified && verify.email),
      email: verify?.emailVerified ? verify.email : null,
      accountEmails,
      phoneVerified: Boolean(verify?.phoneVerified && verify.phone),
    });
  } catch (error) {
    log.error("identity", "status failed", { error: errMessage(error) });
    return NextResponse.json(
      {
        error: "Could not check verification status",
        emailVerified: false,
        email: null,
        accountEmails: [],
        phoneVerified: false,
      },
      { status: 500 },
    );
  }
}
