import { DateTime } from "luxon";
import { Clock3Icon, MapPinIcon, UsersIcon } from "lucide-react";

import FreeRegistrationForm from "@/app/components/programs/free-registration-form";
import PaidRegistrationForm from "@/app/components/programs/paid-registration-form";
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
   * Exactly one registration mode is present for an eligible viewer; the
   * server action still re-checks price and audience after the click.
   */
  freeRegistration: { isSignedIn: boolean } | null;
  paidRegistration: { isSignedIn: boolean; price: number } | null;
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
  paidRegistration,
}: Props) {
  if (occurrences.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no hay horarios definidos.
      </p>
    );
  }

  return (
    <ul className="overflow-hidden rounded-[2rem] bg-[#fffaf3] text-[#4b255f]">
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
        const remaining = availability?.remaining;

        const scheduleLabel = `${formatDate(occurrence.startsAt).toLocaleString(
          DateTime.DATETIME_MED,
        )} — ${formatDate(occurrence.endsAt).toLocaleString(
          DateTime.TIME_SIMPLE,
        )}`;

        const canRegister =
          resolved.isPurchasable &&
          remaining !== undefined &&
          remaining > 0 &&
          (freeRegistration !== null || paidRegistration !== null);

        return (
          <li
            key={occurrence.id}
            className="grid gap-5 border-b border-[#4b255f]/15 p-5 last:border-b-0 sm:grid-cols-[78px_1fr_auto] sm:items-center md:p-6"
          >
            <div className="flex items-baseline gap-2 sm:grid sm:size-[68px] sm:place-content-center sm:rounded-full sm:bg-[#dff7f3] sm:text-center">
              <span className="text-4xl font-black leading-none text-[#4b255f]">
                {formatDate(occurrence.startsAt).toFormat("dd")}
              </span>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#e639b5] sm:mt-0.5 sm:block">
                {formatDate(occurrence.startsAt).toFormat("LLL")}
              </span>
            </div>

            <div className="space-y-2">
              <p className="flex items-center gap-2 font-black text-[#4b255f]">
                <Clock3Icon className="size-4 text-[#9347f5]" />
                {formatDate(occurrence.startsAt).toLocaleString(
                  DateTime.TIME_SIMPLE,
                )}{" "}
                —{" "}
                {formatDate(occurrence.endsAt).toLocaleString(
                  DateTime.TIME_SIMPLE,
                )}
              </p>
              {venue ? (
                <p className="flex items-center gap-2 text-sm font-medium text-[#70566f]">
                  <MapPinIcon className="size-4 shrink-0 text-[#9347f5]" />
                  {venue.name}
                  {occurrence.room ? ` · ${occurrence.room}` : ""}
                </p>
              ) : null}
              {remaining !== undefined ? (
                <p className="flex items-center gap-2 text-sm font-medium text-[#70566f]">
                  <UsersIcon className="size-4 shrink-0 text-[#9347f5]" />
                  {remaining > 0
                    ? `${remaining} de ${occurrence.capacity} cupos disponibles`
                    : "Sin cupos disponibles"}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
              <ProgramStatusBadge
                state={resolved.state}
                wasRescheduled={resolved.wasRescheduled}
              />
              {canRegister && freeRegistration ? (
                <FreeRegistrationForm
                  occurrenceId={occurrence.id}
                  sessionTitle={sessionTitle}
                  scheduleLabel={scheduleLabel}
                  isSignedIn={freeRegistration.isSignedIn}
                />
              ) : null}
              {canRegister && paidRegistration ? (
                <PaidRegistrationForm
                  occurrenceId={occurrence.id}
                  sessionTitle={sessionTitle}
                  scheduleLabel={scheduleLabel}
                  isSignedIn={paidRegistration.isSignedIn}
                  price={paidRegistration.price}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
