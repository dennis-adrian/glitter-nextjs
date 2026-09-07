"use client";

import { DateTime } from "luxon";
import { useState } from "react";

import OccurrenceActionsMenu from "@/app/components/dashboard/programs/occurrence-actions-menu";
import OccurrenceForm from "@/app/components/dashboard/programs/occurrence-form";
import OccurrenceSeatSummary from "@/app/components/dashboard/programs/occurrence-seat-summary";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { Button } from "@/app/components/ui/button";
import { formatDate } from "@/app/lib/formatters";
import type {
  ProgramStatus,
  SessionOccurrence,
  Venue,
} from "@/app/lib/programs/definitions";
import type { OccurrenceRosterSummary } from "@/app/lib/programs/occurrence-queries";
import { resolveOccurrenceState } from "@/app/lib/programs/state";

type Props = {
  occurrence: SessionOccurrence;
  venues: Venue[];
  defaultCapacity: number;
  programStatus: ProgramStatus;
  sessionStatus: ProgramStatus;
  /** Absent only if the summary query missed this occurrence. */
  summary?: OccurrenceRosterSummary;
};

/**
 * One occurrence in the admin list, switching in place between its summary and
 * an edit form.
 *
 * Editing is for correcting a schedule; moving one that attendees already know
 * about is "Reprogramar", which demands a reason and writes history. Only a
 * `scheduled` occurrence can be edited at all, matching the server guard in
 * `updateOccurrence`.
 */
export default function OccurrenceRow({
  occurrence,
  venues,
  defaultCapacity,
  programStatus,
  sessionStatus,
  summary,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);

  const resolved = resolveOccurrenceState({
    programStatus,
    sessionStatus,
    lifecycleStatus: occurrence.lifecycleStatus,
    salesStartAt: occurrence.salesStartAt,
    salesEndAt: occurrence.salesEndAt,
    salesClosedAt: occurrence.salesClosedAt,
    rescheduledAt: occurrence.rescheduledAt,
  });

  const isScheduled = occurrence.lifecycleStatus === "scheduled";
  const venue = occurrence.venueId
    ? venues.find((candidate) => candidate.id === occurrence.venueId)
    : null;

  return (
    <li className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="font-medium">
            {formatDate(occurrence.startsAt).toLocaleString(
              DateTime.DATETIME_MED,
            )}
            {" — "}
            {formatDate(occurrence.endsAt).toLocaleString(DateTime.TIME_SIMPLE)}
          </p>
          <p className="text-xs text-muted-foreground">
            {venue ? venue.name : "Sin lugar asignado"}
            {occurrence.room ? ` · ${occurrence.room}` : ""}
          </p>
          {occurrence.cancelledReason ? (
            <p className="text-xs text-muted-foreground">
              Motivo: {occurrence.cancelledReason}
            </p>
          ) : null}
        </div>
        <ProgramStatusBadge
          state={resolved.state}
          wasRescheduled={resolved.wasRescheduled}
        />
      </div>

      {summary ? (
        <OccurrenceSeatSummary
          summary={summary}
          href={`/dashboard/programs/occurrences/${occurrence.id}`}
        />
      ) : null}

      {isEditing ? (
        <div className="space-y-3 border-t border-border/70 pt-3">
          <OccurrenceForm
            sessionId={occurrence.sessionId}
            occurrence={occurrence}
            venues={venues}
            defaultCapacity={defaultCapacity}
            onSaved={() => setIsEditing(false)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            Cancelar edición
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {isScheduled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              Editar
            </Button>
          ) : null}
          <OccurrenceActionsMenu occurrence={occurrence} />
        </div>
      )}
    </li>
  );
}
