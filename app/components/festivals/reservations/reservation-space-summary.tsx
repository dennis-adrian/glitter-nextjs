import type { ReactNode } from "react";

import Heading from "@/app/components/atoms/heading";
import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";

export type ReservationSummaryRow = {
  label: string;
  value: ReactNode;
};

/**
 * What the reservation actually is: the stand, drawn and named.
 *
 * It used to be the first of six identical `dt`/`dd` pairs, which gave
 * "Sector" the same weight as the space itself. Here the stand leads as an
 * object — the same drawing the map, the confirmation and the invoice use, so
 * a participant meets one picture of their table across the whole flow — with
 * its size and sector as a caption under the code.
 *
 * The rest is a divided list with the label left and the value right, which is
 * how a booking summary reads everywhere it is done well: one column to scan,
 * one to read.
 */
export default function ReservationSpaceSummary({
  isFullTable,
  standLabel,
  dimensions,
  sectorName,
  rows,
}: {
  isFullTable: boolean;
  /** Every stand the reservation occupies, as `B48 y B49`. */
  standLabel: string;
  dimensions: string;
  sectorName: string | null;
  rows: ReservationSummaryRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {/* A lone half reads as a whole table at this size, so a single stand
            is drawn beside its muted neighbour rather than on its own. */}
        <div className="w-20 shrink-0 sm:w-24">
          <FullTableGraphic
            variant={isFullTable ? "full-selected" : "half-highlighted"}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isFullTable ? "Espacios" : "Espacio"}
          </p>
          <Heading level={3} className="leading-none">
            {standLabel}
          </Heading>
          {isFullTable && (
            <p className="text-sm font-medium text-primary">Mesa completa</p>
          )}
          <p className="text-sm text-muted-foreground">
            {dimensions}
            {sectorName ? ` · ${sectorName}` : null}
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <dl className="divide-y border-t">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <dt className="shrink-0 text-sm text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-right text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
