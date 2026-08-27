"use client";

import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type ImagePreviewRemoveButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Overlay control to clear a selected image. Sits on the preview corner so
 * remove is not a separate form button.
 */
export function ImagePreviewRemoveButton({
  label,
  onClick,
  disabled = false,
  className,
}: ImagePreviewRemoveButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        "absolute -right-1 -top-1 z-20 grid size-11 place-items-center rounded-full border bg-background text-foreground shadow-md touch-manipulation",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <XIcon className="size-5" aria-hidden="true" />
    </button>
  );
}
