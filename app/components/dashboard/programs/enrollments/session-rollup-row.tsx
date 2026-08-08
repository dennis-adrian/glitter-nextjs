"use client";

import { useState } from "react";

import { ChevronRight } from "lucide-react";

import OccurrenceRollupRow from "@/app/components/dashboard/programs/enrollments/occurrence-rollup-row";
import {
  SESSION_TYPE_LABELS,
  type ProgramStatus,
} from "@/app/lib/programs/definitions";
import type { RosterEntry } from "@/app/lib/programs/occurrence-queries";
import type {
  OccurrenceRollup,
  SessionRollup,
} from "@/app/lib/programs/program-roster";
import { cn } from "@/lib/utils";

type Props = {
  rollup: SessionRollup;
  programStatus: ProgramStatus;
  /** Pinned server-side (invariant 1); never re-derived here. */
  now: Date;
  /** This session's own occurrence rollups, already chronologically ordered. */
  occurrenceRollups: OccurrenceRollup[];
  entriesByOccurrenceId: Map<number, RosterEntry[]>;
  showReleased: boolean;
  /** Sets the global session filter — the "drill in" affordance. */
  onSelectSession: () => void;
  /** Sets session + occurrence at once, skipping the intermediate level. */
  onSelectOccurrence: (occurrenceId: number) => void;
};

/**
 * One session, collapsed to its seat-count line or expanded to its
 * occurrences (§5.4). Expanding is a local peek: it does not touch the
 * global filter, which is instead set by clicking the row's own label via
 * `onSelectSession`.
 */
export default function SessionRollupRow({
  rollup,
  programStatus,
  now,
  occurrenceRollups,
  entriesByOccurrenceId,
  showReleased,
  onSelectSession,
  onSelectOccurrence,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <li className="rounded-lg border border-border/70">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? "Ocultar horarios" : "Ver horarios"}
            aria-expanded={isExpanded}
            disabled={rollup.occurrenceCount === 0}
            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
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
            onClick={onSelectSession}
            className="text-left font-medium hover:underline"
          >
            {rollup.title}
          </button>
          <span className="text-xs text-muted-foreground">
            {SESSION_TYPE_LABELS[rollup.type]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span>
            {rollup.occurrenceCount}{" "}
            {rollup.occurrenceCount === 1 ? "horario" : "horarios"} ·{" "}
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

      {isExpanded && occurrenceRollups.length > 0 ? (
        <ul className="space-y-2 border-t border-border/70 p-3">
          {occurrenceRollups.map((occurrenceRollup) => (
            <OccurrenceRollupRow
              key={occurrenceRollup.occurrenceId}
              rollup={occurrenceRollup}
              programStatus={programStatus}
              sessionStatus={rollup.status}
              now={now}
              entries={
                entriesByOccurrenceId.get(occurrenceRollup.occurrenceId) ?? []
              }
              showReleased={showReleased}
              onSelect={() =>
                onSelectOccurrence(occurrenceRollup.occurrenceId)
              }
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
