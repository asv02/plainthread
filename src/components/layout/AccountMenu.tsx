"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, ReceiptText, UserRound } from "lucide-react";
import { Dropdown, type DropdownItem } from "@/components/ui/Dropdown";

type SessionUser = { email: string; name: string | null };

export const ACCOUNT_CHANGED_EVENT = "pt-account-changed";

export function AccountMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [known, setKnown] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/account/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { user?: SessionUser | null }) => {
        setUser(data.user ?? null);
        setKnown(true);
      })
      .catch(() => {
        setUser(null);
        setKnown(true);
      });
  }, []);

  useEffect(() => {
    refresh();
    const onChanged = () => refresh();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    return () => {
      window.removeEventListener(ACCOUNT_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, [refresh]);

  async function signOut() {
    const res = await fetch("/api/account/logout", { method: "POST" });
    if (!res.ok) return;
    setUser(null);
    window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
  }

  const items: DropdownItem[] = [
    { label: "Orders", href: "/account", icon: <ReceiptText size={15} /> },
    { kind: "separator" },
    { label: "Sign out", onSelect: signOut, icon: <LogOut size={15} />, danger: true },
  ];

  if (!known || !user) {
    // No confirmed session: keep the plain link behavior, never show
    // authenticated actions from stale state.
    return (
      <Link
        href="/account"
        className="hidden px-2 text-sm tracking-wide text-secondary transition hover:text-foreground md:inline"
      >
        Orders
      </Link>
    );
  }

  return (
    <Dropdown
      label="Account menu"
      items={items}
      triggerClassName="inline-flex h-10 items-center gap-2 px-2 text-sm tracking-wide text-secondary transition hover:text-foreground"
      trigger={
        <>
          <UserRound size={16} />
          <span className="hidden max-w-40 truncate md:inline">{user.name || user.email}</span>
        </>
      }
    />
  );
}
