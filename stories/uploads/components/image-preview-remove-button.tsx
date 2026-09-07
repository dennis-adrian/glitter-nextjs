"use client";

import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      disabled={disabled}
      className={cn(
        "absolute -right-1 -top-1 z-20 rounded-full bg-background shadow-md touch-manipulation",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <XIcon className="size-4" aria-hidden="true" />
    </Button>
  );
}
