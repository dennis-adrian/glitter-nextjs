import { DateTime } from "luxon";

import FreeRegistrationForm from "@/app/components/programs/free-registration-form";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { formatDate } from "@/app/lib/formatters";
import type {
  ProgramStatus,
  SessionOccurrence,
  Venue,
} from "@/app/lib/programs/definitions";
import type { OccurrenceAvailability } from "@/app/lib/programs/inventory";
import { resolveOccurrenceState } from "@/app/lib/programs/state";

type Props = {
  occurrences: SessionOccurrence[];
  programStatus: ProgramStatus;
  sessionStatus: ProgramStatus;
  /** Already resolved per occurrence: occurrence → session → program. */
  venuesById: Map<number, Venue>;
  fallbackVenueId: number | null;
  sessionTitle: string;
  availabilityByOccurrence: Map<number, OccurrenceAvailability>;
  /**
   * Present only when this session is free for the current viewer. A priced
   * session shows no registration button — it needs the voucher flow.
   */
  freeRegistration: { isSignedIn: boolean } | null;
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
  sessionTitle,
  availabilityByOccurrence,
  freeRegistration,
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
        const availability = availabilityByOccurrence.get(occurrence.id);
        const remaining = availability?.remaining ?? occurrence.capacity;

        const scheduleLabel = `${formatDate(occurrence.startsAt).toLocaleString(
          DateTime.DATETIME_MED,
        )} — ${formatDate(occurrence.endsAt).toLocaleString(
          DateTime.TIME_SIMPLE,
        )}`;

        const canRegister =
          freeRegistration !== null && resolved.isPurchasable && remaining > 0;

        return (
          <li
            key={occurrence.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 p-4"
          >
            <div className="space-y-1">
              <p className="font-medium">{scheduleLabel}</p>
              {venue ? (
                <p className="text-sm text-muted-foreground">
                  {venue.name}
                  {occurrence.room ? ` · ${occurrence.room}` : ""}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {remaining > 0
                  ? `${remaining} de ${occurrence.capacity} cupos disponibles`
                  : "Sin cupos disponibles"}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <ProgramStatusBadge
                state={resolved.state}
                wasRescheduled={resolved.wasRescheduled}
              />
              {canRegister ? (
                <FreeRegistrationForm
                  occurrenceId={occurrence.id}
                  sessionTitle={sessionTitle}
                  scheduleLabel={scheduleLabel}
                  isSignedIn={freeRegistration.isSignedIn}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
