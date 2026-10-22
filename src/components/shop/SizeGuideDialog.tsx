"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { X } from "lucide-react";
import { SizeGuideContent } from "@/components/shop/SizeGuideContent";

/**
 * Uses the native modal dialog, which gives Escape-to-close, focus trapping,
 * background inertness and focus restoration for free — a hand-rolled version
 * would re-implement all four and still get edge cases wrong. Where
 * `showModal` is unavailable the affordance degrades to the existing page.
 */
export function SizeGuideDialog({
  headingId = "size-guide-dialog-title",
  label = "Size & fit",
  onOpened,
}: {
  headingId?: string;
  label?: string;
  onOpened?: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function open() {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else router.push("/size-guide");
    onOpened?.();
  }

  function close() {
    if (dialogRef.current?.open) dialogRef.current.close();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="inline-flex min-h-9 items-center px-2 text-xs text-secondary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        {label}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        onClose={() => triggerRef.current?.focus()}
        className="m-auto w-[min(92vw,720px)] max-h-[85vh] overflow-y-auto border border-border bg-card p-0 text-foreground"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4">
          <div>
            <h2 id={headingId} className="font-serif text-2xl">
              Size &amp; fit
            </h2>
            <p className="mt-1 text-xs text-secondary">
              Garment measurements in cm, laid flat.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close size guide"
            className="shrink-0 p-2 text-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5">
          <SizeGuideContent />
          <Link
            href="/size-guide"
            className="mt-6 inline-block text-sm underline underline-offset-4"
          >
            Open the full size guide page →
          </Link>
        </div>
      </dialog>
    </>
  );
}
