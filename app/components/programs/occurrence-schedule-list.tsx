"use client";

import { useAuth } from "@clerk/nextjs";
import { DateTime } from "luxon";
import { Clock3Icon, MapPinIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";

import FreeRegistrationForm from "@/app/components/programs/free-registration-form";
import PaidRegistrationForm from "@/app/components/programs/paid-registration-form";
import ProgramDateStamp from "@/app/components/programs/program-date-stamp";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { useNow } from "@/app/hooks/use-now";
import { formatDisplayDate } from "@/app/lib/formatters";
import type {
  ProgramStatus,
  SessionOccurrence,
  Venue,
} from "@/app/lib/programs/definitions";
import {
  canPurchaseAudience,
  type ParticipantEligibility,
  type SessionAudience,
} from "@/app/lib/programs/eligibility";
import type { OccurrenceAvailability } from "@/app/lib/programs/inventory";
import { isFreePrice } from "@/app/lib/programs/pricing";
import { getCurrentViewerProgramEligibility } from "@/app/lib/programs/registration-actions";
import {
  resolveOccurrenceState,
  type OccurrenceEffectiveState,
} from "@/app/lib/programs/state";

type Props = {
  occurrences: SessionOccurrence[];
  /** Null for a standalone session: there is no program to gate it. */
  programStatus: ProgramStatus | null;
  sessionStatus: ProgramStatus;
  /** Already resolved per occurrence: occurrence → session → program. */
  venuesById: Map<number, Venue>;
  fallbackVenueId: number | null;
  /**
   * Analytics dimensions: the funnel is read per session, not per URL. Null
   * for a standalone session.
   */
  programSlug: string | null;
  sessionSlug: string;
  sessionTitle: string;
  availabilityByOccurrence: Map<number, OccurrenceAvailability>;
  audience: SessionAudience;
  publicPrice: number;
  participantPrice: number;
  /** When the server rendered the page; see `useNow`. */
  renderedAt: Date;
  /**
   * Codes belong to a program, so a standalone session takes none. The paid
   * form still shows the field, disabled with the reason.
   */
  acceptsPromoCodes: boolean;
};

/**
 * Seat counts only mean something while an occurrence can still sell. Once it
 * is over or called off, "3 de 20 cupos" reads as an offer.
 */
const STATES_WITHOUT_SEATS: ReadonlySet<OccurrenceEffectiveState> = new Set([
  "cancelled",
  "completed",
  "ended",
]);

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
  programSlug,
  sessionSlug,
  sessionTitle,
  availabilityByOccurrence,
  audience,
  publicPrice,
  participantPrice,
  renderedAt,
  acceptsPromoCodes,
}: Props) {
  const { isLoaded, isSignedIn } = useAuth();
  const now = useNow(renderedAt);
  const [eligibility, setEligibility] =
    useState<ParticipantEligibility>("public");

  useEffect(() => {
    let active = true;

    if (!isLoaded || !isSignedIn) {
      return () => {
        active = false;
      };
    }

    void getCurrentViewerProgramEligibility().then(
      (nextEligibility) => {
        if (active) setEligibility(nextEligibility);
      },
      () => {
        if (active) setEligibility("public");
      },
    );

    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  if (occurrences.length === 0) {
    return (
      <p className="text-brand-ink/75">Todavía no hay horarios definidos.</p>
    );
  }

  const viewerEligibility = isLoaded && isSignedIn ? eligibility : "public";
  const viewerPrice =
    viewerEligibility === "active_participant" ? participantPrice : publicPrice;
  const previousPrice =
    viewerEligibility === "active_participant" && participantPrice < publicPrice
      ? publicPrice
      : null;
  const canRegisterForAudience = canPurchaseAudience(
    audience,
    viewerEligibility,
  );
  const freeRegistration =
    canRegisterForAudience && isFreePrice(viewerPrice)
      ? { isSignedIn: isSignedIn === true }
      : null;
  const paidRegistration =
    canRegisterForAudience && !isFreePrice(viewerPrice)
      ? { isSignedIn: isSignedIn === true, price: viewerPrice }
      : null;

  return (
    // Dashed dividers: the stub perforation between bookable rows.
    <ul className="@container divide-y-2 divide-dashed divide-brand-primary/25">
      {occurrences.map((occurrence) => {
        const resolved = resolveOccurrenceState(
          {
            programStatus,
            sessionStatus,
            lifecycleStatus: occurrence.lifecycleStatus,
            endsAt: occurrence.endsAt,
            salesStartAt: occurrence.salesStartAt,
            salesEndAt: occurrence.salesEndAt,
            salesClosedAt: occurrence.salesClosedAt,
            rescheduledAt: occurrence.rescheduledAt,
          },
          now,
        );

        const venueId = occurrence.venueId ?? fallbackVenueId;
        const venue = venueId === null ? null : venuesById.get(venueId);
        const availability = availabilityByOccurrence.get(occurrence.id);
        const remaining = availability?.remaining;

        const scheduleLabel = `${formatDisplayDate(occurrence.startsAt, DateTime.DATETIME_MED)} a ${formatDisplayDate(occurrence.endsAt, DateTime.TIME_SIMPLE)}`;

        const canRegister =
          resolved.isPurchasable &&
          remaining !== undefined &&
          remaining > 0 &&
          (freeRegistration !== null || paidRegistration !== null);

        return (
          <li
            key={occurrence.id}
            className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4 py-5 first:pt-3 last:pb-0 @[44rem]:grid-cols-[64px_minmax(0,1fr)_auto]"
          >
            <ProgramDateStamp size="sm" start={occurrence.startsAt} />

            <div className="min-w-0 space-y-2">
              <p className="flex items-center gap-2 font-semibold tabular-nums">
                <Clock3Icon className="size-4 shrink-0 text-brand-primary" />
                {formatDisplayDate(
                  occurrence.startsAt,
                  DateTime.TIME_SIMPLE,
                )} a{" "}
                {formatDisplayDate(occurrence.endsAt, DateTime.TIME_SIMPLE)}
              </p>
              {venue ? (
                <p className="flex items-center gap-2 text-sm text-brand-ink/75">
                  <MapPinIcon className="size-4 shrink-0 text-brand-primary" />
                  {venue.name}
                  {occurrence.room ? ` - ${occurrence.room}` : ""}
                </p>
              ) : null}
              {remaining !== undefined &&
              !STATES_WITHOUT_SEATS.has(resolved.state) ? (
                <p className="flex items-center gap-2 text-sm tabular-nums text-brand-ink/75">
                  <UsersIcon className="size-4 shrink-0 text-brand-primary" />
                  {remaining > 0
                    ? `${remaining} de ${occurrence.capacity} cupos disponibles`
                    : "Sin cupos disponibles"}
                </p>
              ) : null}
            </div>

            <div className="col-span-2 flex flex-col items-end gap-3 @[44rem]:col-span-1">
              <ProgramStatusBadge
                state={resolved.state}
                wasRescheduled={resolved.wasRescheduled}
                hideOnSale
              />
              {canRegister && freeRegistration ? (
                <FreeRegistrationForm
                  occurrenceId={occurrence.id}
                  programSlug={programSlug}
                  sessionSlug={sessionSlug}
                  sessionTitle={sessionTitle}
                  scheduleLabel={scheduleLabel}
                  isSignedIn={freeRegistration.isSignedIn}
                  seatsRemaining={remaining ?? null}
                />
              ) : null}
              {canRegister && paidRegistration ? (
                <PaidRegistrationForm
                  occurrenceId={occurrence.id}
                  programSlug={programSlug}
                  sessionSlug={sessionSlug}
                  sessionTitle={sessionTitle}
                  scheduleLabel={scheduleLabel}
                  isSignedIn={paidRegistration.isSignedIn}
                  price={paidRegistration.price}
                  previousPrice={previousPrice}
                  seatsRemaining={remaining ?? null}
                  acceptsPromoCodes={acceptsPromoCodes}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
