import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { formatDate } from "@/app/lib/formatters";
import type {
  ProgramStatus,
  SessionOccurrence,
  Venue,
} from "@/app/lib/programs/definitions";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import { DateTime } from "luxon";

type Props = {
  occurrences: SessionOccurrence[];
  programStatus: ProgramStatus;
  sessionStatus: ProgramStatus;
  /** Already resolved per occurrence: occurrence → session → program. */
  venuesById: Map<number, Venue>;
  fallbackVenueId: number | null;
};

/**
 * Every scheduled group for a session. Each is separately purchasable with its
 * own capacity, so they are listed rather than collapsed into one date.
 */
export default function OccurrenceScheduleList({
  occurrences,
  programStatus,
  sessionStatus,
  venuesById,
  fallbackVenueId,
}: Props) {
  if (occurrences.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no hay horarios definidos.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {occurrences.map((occurrence) => {
        const resolved = resolveOccurrenceState({
          programStatus,
          sessionStatus,
          lifecycleStatus: occurrence.lifecycleStatus,
          salesStartAt: occurrence.salesStartAt,
          salesEndAt: occurrence.salesEndAt,
          salesClosedAt: occurrence.salesClosedAt,
          rescheduledAt: occurrence.rescheduledAt,
        });

        const venueId = occurrence.venueId ?? fallbackVenueId;
        const venue = venueId === null ? null : venuesById.get(venueId);

        return (
          <li
            key={occurrence.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 p-4"
          >
            <div className="space-y-1">
              <p className="font-medium">
                {formatDate(occurrence.startsAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
                {" — "}
                {formatDate(occurrence.endsAt).toLocaleString(
                  DateTime.TIME_SIMPLE,
                )}
              </p>
              {venue ? (
                <p className="text-sm text-muted-foreground">
                  {venue.name}
                  {occurrence.room ? ` · ${occurrence.room}` : ""}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {occurrence.capacity} cupos
              </p>
            </div>
            <ProgramStatusBadge
              state={resolved.state}
              wasRescheduled={resolved.wasRescheduled}
            />
          </li>
        );
      })}
    </ul>
  );
}
