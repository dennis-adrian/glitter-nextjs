import type { ReactNode } from "react";

import { cn } from "@/app/lib/utils";

type FestivalNavLegendChipProps = {
  label: string;
  swatch: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onToggle?: () => void;
};

/**
 * One legend entry. Without `onToggle` it stays the plain read-only key the
 * standalone map page shows; with it, the same swatch becomes the filter
 * control for that stand trait.
 */
export default function FestivalNavLegendChip({
  label,
  swatch,
  pressed = false,
  disabled = false,
  disabledHint,
  onToggle,
}: FestivalNavLegendChipProps) {
  if (!onToggle) {
    return (
      <div className="flex items-center gap-2">
        {swatch}
        <span className="text-xs text-foreground">{label}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      onClick={onToggle}
      className={cn(
        "flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        pressed
          ? "border-primary bg-primary/10 text-primary"
          : "border-transparent text-foreground hover:border-border hover:bg-muted",
        disabled &&
          "cursor-not-allowed opacity-40 hover:border-transparent hover:bg-transparent",
      )}
    >
      {swatch}
      <span className={cn("text-xs", pressed && "font-semibold")}>{label}</span>
    </button>
  );
}
