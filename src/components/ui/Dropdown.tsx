"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type DropdownItem =
  | { kind: "separator" }
  | {
      kind?: "item";
      label: string;
      href?: string;
      icon?: ReactNode;
      onSelect?: () => void | Promise<void>;
      disabled?: boolean;
      pending?: boolean;
      danger?: boolean;
    };

export function isSeparator(item: DropdownItem): item is { kind: "separator" } {
  return item.kind === "separator";
}

export function Dropdown({
  label,
  trigger,
  items,
  align = "end",
  triggerClassName,
  panelClassName,
}: {
  label: string;
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  triggerClassName?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function focusItem(current: Element | null, direction: 1 | -1) {
    const nodes = rootRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    );
    if (!nodes || nodes.length === 0) return;
    const index = current ? Array.prototype.indexOf.call(nodes, current) : -1;
    const next =
      direction === 1
        ? nodes[(index + 1) % nodes.length]
        : nodes[(index - 1 + nodes.length) % nodes.length];
    next.focus();
  }

  function onMenuKeyDown(event: ReactKeyboardEvent) {
    const target = event.target as HTMLElement;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(target, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(target, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(null, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      const nodes = rootRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      );
      nodes?.[nodes.length - 1]?.focus();
    }
  }

  async function activate(item: Extract<DropdownItem, { kind?: "item" }>) {
    setOpen(false);
    if (item.onSelect) await item.onSelect();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        className={cn(triggerClassName)}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute top-full z-50 mt-2 border border-border bg-card py-1 shadow-luxury",
            panelClassName ?? "w-56",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, index) => {
            if (isSeparator(item)) {
              return <div key={index} role="separator" className="my-1 border-t border-border" />;
            }
            const itemClass = cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm tracking-wide transition hover:bg-muted",
              item.danger ? "text-red-700" : "text-foreground",
            );
            return item.href ? (
              <Link
                key={index}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={index}
                type="button"
                role="menuitem"
                disabled={item.disabled || item.pending}
                onClick={() => void activate(item)}
                className={cn(itemClass, "w-full text-left disabled:cursor-default disabled:opacity-40")}
              >
                {item.icon}
                {item.pending ? `${item.label}…` : item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
