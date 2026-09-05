import type { ReactNode } from "react";

import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";
import { cn } from "@/app/lib/utils";

export type ReservationSummaryRow = {
  label: string;
  value: ReactNode;
  /** The figure someone came to the page for. Rendered heavier. */
  emphasis?: boolean;
};

/**
 * What the reservation is, above what it costs.
 *
 * The stand leads as an object — drawn, named, sized — because that is the
 * thing being bought. It used to be the first of six equal `dt`/`dd` pairs, so
 * "Sector" carried the same weight as the space itself and the price.
 *
 * Every remaining fact is a labelled row with the value right-aligned, which
 * is how a booking summary reads in Navan, Airbnb and Expedia: the labels form
 * one column to scan, the values another.
 */
export default function ReservationSummary({
  isFullTable,
  standLabel,
  dimensions,
  sectorName,
  rows,
}: {
  isFullTable: boolean;
  standLabel: string;
  dimensions: string;
  sectorName: string | null;
  rows: ReservationSummaryRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-20 shrink-0 sm:w-24">
          <FullTableGraphic
            variant={isFullTable ? "full-selected" : "half-highlighted"}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-space-grotesk text-2xl font-bold leading-none">
            {standLabel}
          </p>
          {isFullTable && (
            <p className="text-sm font-medium text-primary">Mesa completa</p>
          )}
          <p className="text-sm text-muted-foreground">
            {dimensions}
            {sectorName ? ` · ${sectorName}` : null}
          </p>
        </div>
      </div>

      <dl className="divide-y rounded-lg border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 px-3 py-2.5"
          >
            <dt className="shrink-0 text-sm text-muted-foreground">
              {row.label}
            </dt>
            <dd
              className={cn(
                "text-right text-sm",
                row.emphasis && "text-base font-semibold",
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
