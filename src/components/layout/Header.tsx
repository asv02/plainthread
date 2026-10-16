"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { navLinks, siteConfig } from "@/data/site";
import { CartNav } from "@/components/shop/CartNav";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { cn } from "@/lib/utils";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);

  // Close mobile menu when the route changes (adjust state during render).
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia("(min-width: 768px)").matches) {
        setOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 border-b border-transparent bg-background/95 backdrop-blur-md transition",
          (scrolled || open) && "border-border shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        )}
      >
        <div className="container-px relative z-50 flex h-14 items-center justify-between bg-background/95 sm:h-16 md:h-20">
          <Link
            href="/"
            className="font-serif text-lg tracking-[0.08em] text-foreground sm:text-xl md:text-2xl"
            aria-label={`${siteConfig.name} home`}
            onClick={() => setOpen(false)}
          >
            {siteConfig.name.toUpperCase()}
          </Link>

          <nav
            className="hidden items-center gap-6 md:flex lg:gap-8"
            aria-label="Primary"
          >
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm tracking-wide transition hover:text-foreground",
                  pathname === link.href || pathname.startsWith(`${link.href}/`)
                    ? "text-foreground"
                    : "text-secondary",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1">
            <AccountMenu />
            <CartNav />
          <button
            type="button"
            className="relative z-50 inline-flex h-11 w-11 items-center justify-center md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          </div>
        </div>
      </header>

      {/* Portal-style sibling overlay — must NOT live inside sticky header */}
      {open && (
        <div
          id="mobile-navigation"
          className="fixed inset-0 z-40 bg-background md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div className="flex h-full flex-col pt-14 sm:pt-16">
            <nav className="container-px flex flex-1 flex-col gap-1 overflow-y-auto py-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "border-b border-border py-4 text-lg text-foreground transition active:opacity-70",
                    (pathname === link.href ||
                      pathname.startsWith(`${link.href}/`)) &&
                      "font-medium",
                  )}
                >
                  {link.label}
                </Link>
              ))}

              <Link
                href="/account"
                className="border-b border-border py-4 text-lg text-foreground"
              >
                Orders
              </Link>
              <Link
                href="/cart"
                className="border-b border-border py-4 text-lg text-foreground"
              >
                Cart
              </Link>

              <div className="mt-8 flex flex-col gap-3 pb-8">
                <Link
                  href="/shop"
                  className="inline-flex w-full items-center justify-center bg-button px-6 py-3.5 text-sm tracking-wide text-white"
                >
                  Shop Collection
                </Link>
                <Link
                  href="/size-guide"
                  className="inline-flex w-full items-center justify-center border border-foreground px-6 py-3.5 text-sm tracking-wide text-foreground"
                >
                  Size Guide
                </Link>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
