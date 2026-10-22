"use client";

import Link from "next/link";
import { footerLinks, siteConfig } from "@/data/site";
import { AD_CONSENT_OPEN_EVENT } from "@/lib/meta/consent";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-background">
      <div className="container-px grid gap-10 py-12 sm:grid-cols-2 sm:gap-12 md:py-16 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="font-serif text-xl tracking-[0.08em] sm:text-2xl">
            {siteConfig.name.toUpperCase()}
          </p>
          <p className="mt-4 max-w-xs text-sm leading-6 text-secondary">
            Premium oversized essentials crafted with 220 GSM combed cotton. Minimal.
            Comfortable. Built to last.
          </p>
          <a
            href={`tel:${siteConfig.support.phone}`}
            className="mt-6 block text-sm text-foreground underline underline-offset-4"
          >
            {siteConfig.support.name}, {siteConfig.support.role} — {siteConfig.support.phone}
          </a>
          <a
            href={siteConfig.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-foreground underline underline-offset-4"
          >
            Instagram
          </a>
        </div>

        {(
          [
            ["Products", footerLinks.products],
            ["Explore", footerLinks.explore],
            ["Company", footerLinks.company],
          ] as const
        ).map(([title, links]) => (
          <div key={title}>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-secondary">
              {title}
            </p>
            <ul className="mt-4 space-y-3">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-foreground transition hover:text-secondary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="container-px flex flex-col gap-2 py-6 text-xs text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 {siteConfig.name}. All rights reserved.</p>
          <div className="flex gap-4">
            <button
              type="button"
              className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              onClick={() => window.dispatchEvent(new Event(AD_CONSENT_OPEN_EVENT))}
            >
              Cookie Preferences
            </button>
            <p>220 GSM · 100% Combed Cotton · Chemical Safe</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
