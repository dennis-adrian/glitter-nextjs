import type {
  SanctionFestivalScope,
  SanctionStatus,
  SanctionType,
} from "@/app/lib/sanctions/definitions";
import { DateTime } from "luxon";

type FestivalType = "glitter" | "twinkler" | "festicker";

export function sanctionScopeMatchesFestival(
  festivalScope: SanctionFestivalScope,
  festivalType: FestivalType,
): boolean {
  if (festivalScope === "global") return true;
  return festivalScope === festivalType;
}

export function canQualifySanctionStatus(status: SanctionStatus): boolean {
  return status === "active" || status === "scheduled";
}

/**
 * A festival qualifies only when activation happens strictly after approval.
 */
export function festivalActivationQualifiesSanction(input: {
  activatedAt: Date;
  approvedAt: Date;
  startsAt: Date;
  endsAt?: Date | null;
  festivalEndAt?: Date | null;
  sanctionStatus: SanctionStatus;
  festivalScope: SanctionFestivalScope;
  festivalType: FestivalType;
}): boolean {
  if (!canQualifySanctionStatus(input.sanctionStatus)) return false;
  if (input.activatedAt.getTime() <= input.approvedAt.getTime()) return false;
  if (input.endsAt && input.endsAt.getTime() <= input.activatedAt.getTime()) {
    return false;
  }
  if (
    input.festivalEndAt &&
    input.festivalEndAt.getTime() <= input.startsAt.getTime()
  ) {
    return false;
  }
  return sanctionScopeMatchesFestival(input.festivalScope, input.festivalType);
}

export function calculateReservationEligibleAt(input: {
  reservationsStartDate: Date;
  reservationDelayMinutes: number | null | undefined;
  sanctionType: SanctionType;
}): Date | null {
  if (input.sanctionType !== "reservation_delay") return null;
  if (
    input.reservationDelayMinutes == null ||
    input.reservationDelayMinutes <= 0
  ) {
    return null;
  }

  return DateTime.fromJSDate(input.reservationsStartDate)
    .plus({ minutes: input.reservationDelayMinutes })
    .toJSDate();
}
