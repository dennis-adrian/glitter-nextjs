"use client";

import { DateTime } from "luxon";
import { useState } from "react";

import { ChevronRight } from "lucide-react";

import OccurrenceRosterTable from "@/app/components/dashboard/programs/occurrence-roster-table";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { formatDate } from "@/app/lib/formatters";
import type {
  ProgramStatus,
  SessionStatus,
} from "@/app/lib/programs/definitions";
import type { RosterEntry } from "@/app/lib/programs/occurrence-queries";
import type { OccurrenceRollup } from "@/app/lib/programs/program-roster";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import { cn } from "@/lib/utils";

type Props = {
  rollup: OccurrenceRollup;
  programStatus: ProgramStatus;
  sessionStatus: SessionStatus;
  /** Pinned server-side (invariant 1); never re-derived here. */
  now: Date;
  /** This occurrence's own entries, unfiltered — the toggle is applied here. */
  entries: RosterEntry[];
  showReleased: boolean;
  /** Sets the global session+occurrence filter — the "drill in" affordance. */
  onSelect: () => void;
};

/**
 * One occurrence, collapsed to its seat-count line or expanded to its people
 * (§5.5). Expanding is a local peek: it does not touch the global filter,
 * which is instead set by clicking the row's own label via `onSelect`.
 */
export default function OccurrenceRollupRow({
  rollup,
  programStatus,
  sessionStatus,
  now,
  entries,
  showReleased,
  onSelect,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const resolved = resolveOccurrenceState(
    {
      programStatus,
      sessionStatus,
      lifecycleStatus: rollup.lifecycleStatus,
      salesStartAt: rollup.salesStartAt,
      salesEndAt: rollup.salesEndAt,
      salesClosedAt: rollup.salesClosedAt,
      rescheduledAt: rollup.rescheduledAt,
    },
    now,
  );

  const visibleEntries = showReleased
    ? entries
    : entries.filter((entry) => entry.state !== "released");

  return (
    <li className="rounded-lg border border-border/70">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? "Ocultar inscritos" : "Ver inscritos"}
            aria-expanded={isExpanded}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="text-left font-medium hover:underline"
          >
            {formatDate(rollup.startsAt).toLocaleString(DateTime.DATETIME_MED)}
            {rollup.venueName ? ` · ${rollup.venueName}` : ""}
            {rollup.room ? ` · ${rollup.room}` : ""}
          </button>
          <ProgramStatusBadge
            state={resolved.state}
            wasRescheduled={resolved.wasRescheduled}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span>
            {rollup.totals.occupied}/{rollup.capacity} ocupados ·{" "}
            {rollup.isSoldOut ? "Sin cupos" : `${rollup.remaining} libres`}
            {rollup.waitlistActive > 0
              ? ` · ${rollup.waitlistActive} en lista`
              : ""}
          </span>
          {rollup.totals.released > 0 ? (
            <span className="text-xs text-muted-foreground">
              [{rollup.totals.released}{" "}
              {rollup.totals.released === 1 ? "liberado" : "liberados"}]
            </span>
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <div className="border-t border-border/70 p-3">
          <OccurrenceRosterTable entries={visibleEntries} />
        </div>
      ) : null}
    </li>
  );
}
