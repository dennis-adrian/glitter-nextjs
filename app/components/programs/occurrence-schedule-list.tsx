"use client";

import { useAuth } from "@clerk/nextjs";
import { DateTime } from "luxon";
import { Clock3Icon, MapPinIcon, UsersIcon } from "lucide-react";
import { useEffect, useState } from "react";

import FreeRegistrationForm from "@/app/components/programs/free-registration-form";
import PaidRegistrationForm from "@/app/components/programs/paid-registration-form";
import ProgramStatusBadge from "@/app/components/programs/program-status-badge";
import { formatDate } from "@/app/lib/formatters";
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
import { resolveOccurrenceState } from "@/app/lib/programs/state";

type Props = {
  occurrences: SessionOccurrence[];
  programStatus: ProgramStatus;
  sessionStatus: ProgramStatus;
  /** Already resolved per occurrence: occurrence → session → program. */
  venuesById: Map<number, Venue>;
  fallbackVenueId: number | null;
  /** Analytics dimensions: the funnel is read per session, not per URL. */
  programSlug: string;
  sessionSlug: string;
  sessionTitle: string;
  availabilityByOccurrence: Map<number, OccurrenceAvailability>;
  audience: SessionAudience;
  publicPrice: number;
  participantPrice: number;
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
  programSlug,
  sessionSlug,
  sessionTitle,
  availabilityByOccurrence,
  audience,
  publicPrice,
  participantPrice,
}: Props) {
  const { isLoaded, isSignedIn } = useAuth();
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
      <p className="text-muted-foreground">
        Todavía no hay horarios definidos.
      </p>
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
    <ul className="@container overflow-hidden rounded-4xl bg-[#fffaf3] text-[#4b255f]">
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
        )} a ${formatDate(occurrence.endsAt).toLocaleString(
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
            className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-5 border-b border-[#4b255f]/15 p-5 last:border-b-0 @[44rem]:grid-cols-[78px_minmax(0,1fr)_auto] @[44rem]:p-6"
          >
            <div className="grid size-17 place-content-center rounded-full bg-[#dff7f3] text-center">
              <span className="text-4xl font-black leading-none text-[#4b255f]">
                {formatDate(occurrence.startsAt).toFormat("dd")}
              </span>
              <span className="mt-0.5 block text-xs font-black uppercase tracking-[0.16em] text-[#e639b5]">
                {formatDate(occurrence.startsAt).toFormat("LLL")}
              </span>
            </div>

            <div className="min-w-0 space-y-2">
              <p className="flex items-center gap-2 font-black text-[#4b255f]">
                <Clock3Icon className="size-4 text-[#9347f5]" />
                {formatDate(occurrence.startsAt).toLocaleString(
                  DateTime.TIME_SIMPLE,
                )}{" "}
                a{" "}
                {formatDate(occurrence.endsAt).toLocaleString(
                  DateTime.TIME_SIMPLE,
                )}
              </p>
              {venue ? (
                <p className="flex items-center gap-2 text-sm font-medium text-[#70566f]">
                  <MapPinIcon className="size-4 shrink-0 text-[#9347f5]" />
                  {venue.name}
                  {occurrence.room ? ` - ${occurrence.room}` : ""}
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
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
