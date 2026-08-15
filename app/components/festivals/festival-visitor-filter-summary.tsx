"use client";

import { XIcon } from "lucide-react";

type FestivalVisitorFilterSummaryProps = {
  shownStandCount: number;
  totalStandCount: number;
  hasActiveFilters: boolean;
  onClear: () => void;
};

/**
 * Grey stands say "not this one", never "a filter is on" — a visitor who lands
 * mid-scroll or forgets a pressed chip has no way to tell a filtered map from a
 * sparse one. The count states it outright, and it is the only thing that can
 * explain a sector that comes back empty.
 */
export default function FestivalVisitorFilterSummary({
  shownStandCount,
  totalStandCount,
  hasActiveFilters,
  onClear,
}: FestivalVisitorFilterSummaryProps) {
  return (
    <div aria-live="polite">
      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-3 py-2">
          {shownStandCount > 0 ? (
            <p className="text-sm text-muted-foreground">
              Mostrando{" "}
              <span className="font-semibold text-foreground">
                {shownStandCount}
              </span>{" "}
              de {totalStandCount} {totalStandCount === 1 ? "stand" : "stands"}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ningún stand coincide con los filtros.
            </p>
          )}

          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
            Limpiar filtros
          </button>
        </div>
      ) : null}
    </div>
  );
}
