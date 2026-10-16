"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import type { PublicOrder } from "@/lib/shop/types";
import { ACCOUNT_CHANGED_EVENT } from "@/components/layout/AccountMenu";

type AccountUser = { email: string; name: string | null; phone: string | null };

export function AccountClient() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/account", { cache: "no-store" });
    if (res.status === 401) {
      setUser(null);
      setOrders([]);
      return;
    }
    const data = (await res.json()) as {
      user?: AccountUser;
      orders?: PublicOrder[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Could not load account");
      return;
    }
    setUser(data.user ?? null);
    setOrders(data.orders ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendCode() {
    setError("");
    setOtpBusy(true);
    try {
      const res = await fetch("/api/checkout/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "email", destination: email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not send code");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setOtpBusy(false);
    }
  }

  async function signIn() {
    setError("");
    setOtpBusy(true);
    try {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not sign in");
      setCode("");
      setSent(false);
      await load();
      window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setOtpBusy(false);
    }
  }

  async function signOut() {
    const res = await fetch("/api/account/logout", { method: "POST" });
    // Only drop the authenticated UI once the server confirmed revocation.
    if (!res.ok) {
      setError("Could not sign out. Please try again.");
      return;
    }
    setUser(null);
    setOrders([]);
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
  }

  if (!user) {
    return (
      <form
        className="mt-8 max-w-md space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void (sent ? signIn() : sendCode());
        }}
      >
        <p className="text-sm text-secondary">
          Use the same email you verified at checkout. We send a 6-digit code — no
          password.
        </p>
        <label className="block text-sm">
          <span className="text-secondary">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground"
          />
        </label>
        {sent && (
          <label className="block text-sm">
            <span className="text-secondary">6-digit code</span>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-1 w-full border border-border bg-card px-3 py-2.5 outline-none focus:border-foreground"
            />
          </label>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={otpBusy}
          className="inline-flex w-full items-center justify-center bg-button px-6 py-3.5 text-sm tracking-wide text-white disabled:opacity-50"
        >
          {otpBusy ? "Please wait…" : sent ? "Sign in" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">Signed in as {user.email}</p>
        <button type="button" onClick={() => void signOut()} className="text-sm underline underline-offset-2">
          Sign out
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-secondary">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {orders.map((order) => (
            <li key={order.publicId}>
              <Link
                href={`/orders/${order.publicId}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm hover:bg-muted"
              >
                <span>
                  {order.publicId}
                  <span className="mt-1 block text-xs text-secondary">
                    {new Date(order.createdAt).toLocaleDateString("en-IN")} ·{" "}
                    {order.paymentMethod === "cod"
                      ? "COD"
                      : order.paymentMethod === "prepaid"
                        ? "Prepaid"
                        : "Awaiting payment"}{" "}
                    · {order.parcelStatus}
                  </span>
                </span>
                <span>{formatPrice(order.totalPaise / 100)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
