import "server-only";

import { eq } from "drizzle-orm";

import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
import {
  fetchSelfServiceFestivalSnapshot,
  fetchSelfServiceTargetProfile,
} from "@/app/lib/reservations/map-queries";
import {
  evaluateSelfServiceEligibility,
  summarizeFestivalParticipations,
  type ReservationActor,
} from "@/app/lib/reservations/policy";
import {
  getReservationEligibility,
  type ReservationEligibility,
} from "@/app/lib/sanctions/reservation-eligibility";
import { db } from "@/db";
import { reservationParticipants } from "@/db/schema";

export type SelfServicePageDenial = {
  code: ReservationErrorCode;
  sanctionBlock?: Extract<ReservationEligibility, { eligible: false }>;
};

export async function getSelfServicePageDenial(input: {
  actor: ReservationActor | null;
  targetProfile: {
    id: number;
    status: string;
    userRequests?: Array<{
      festivalId: number | null;
      type: string;
      status: string;
      termsVersionId: number | null;
    }>;
  } | null;
  festival: {
    id: number;
    status: string;
    reservationsStartDate: Date;
    participantTermsEnabled: boolean;
  } | null;
  now?: Date;
}): Promise<SelfServicePageDenial | null> {
  const now = input.now ?? new Date();
  const publishedTerms = input.festival?.participantTermsEnabled
    ? await fetchPublishedFestivalTermsVersion()
    : null;

  const enrollment = input.targetProfile?.userRequests?.find(
    (request) =>
      request.festivalId === input.festival?.id &&
      request.type === "festival_participation",
  );

  let hasLiveSelfServiceReservation = false;
  let hasRejectedFestivalReservation = false;
  let sanctionBlocked = false;
  let sanctionBlock: Extract<ReservationEligibility, { eligible: false }> | undefined;
  if (input.targetProfile && input.festival) {
    const eligibility = await getReservationEligibility({
      userId: input.targetProfile.id,
      festivalId: input.festival.id,
      now,
    });
    sanctionBlocked = !eligibility.eligible;
    if (!eligibility.eligible) {
      sanctionBlock = eligibility;
    }

    const memberships = await db.query.reservationParticipants.findMany({
      where: eq(reservationParticipants.userId, input.targetProfile.id),
      columns: { id: true },
      with: {
        reservation: {
          columns: { festivalId: true, status: true, source: true },
        },
      },
    });
    const participation = summarizeFestivalParticipations(
      memberships.map((row) => row.reservation),
      input.festival.id,
    );
    hasLiveSelfServiceReservation = participation.hasLiveSelfServiceReservation;
    hasRejectedFestivalReservation =
      participation.hasRejectedFestivalReservation;
  }

  const result = evaluateSelfServiceEligibility({
    now,
    actor: input.actor,
    targetProfileId: input.targetProfile?.id ?? 0,
    intent: "view",
    profile: input.targetProfile
      ? { id: input.targetProfile.id, status: input.targetProfile.status }
      : null,
    festival: input.festival,
    publishedTermsVersionId: publishedTerms?.id ?? null,
    enrollment: enrollment
      ? {
          type: enrollment.type,
          status: enrollment.status,
          termsVersionId: enrollment.termsVersionId,
        }
      : null,
    sanctionBlocked,
    hasLiveSelfServiceReservation,
    hasRejectedFestivalReservation,
  });

  if (result.allowed) {
    return null;
  }

  return {
    code: result.code,
    ...(result.code === "SANCTION_BLOCKED" && sanctionBlock
      ? { sanctionBlock }
      : {}),
  };
}

/**
 * The denial a participant would still face the moment reservations open.
 *
 * `RESERVATIONS_NOT_OPEN` is evaluated before enrollment, terms and sanctions,
 * so during the days before the map opens it masks every other reason someone
 * cannot reserve. Re-evaluating at the opening instant lifts the clock and
 * leaves every other rule in force.
 *
 * That is exactly what full-table activation needs: the PRD puts the money
 * decision before the map on purpose, so the feature must be reachable early —
 * but only to people who would otherwise be allowed to reserve at all.
 * Returns null when nothing but the clock is in the way.
 */
export async function getSelfServiceDenialAtOpen(input: {
  actor: ReservationActor | null;
  profileId: number;
  festivalId: number;
  now?: Date;
}): Promise<SelfServicePageDenial | null> {
  const now = input.now ?? new Date();
  const [festival, targetProfile] = await Promise.all([
    fetchSelfServiceFestivalSnapshot(input.festivalId),
    fetchSelfServiceTargetProfile(input.profileId, input.festivalId),
  ]);
  if (!festival || !targetProfile) {
    return { code: "FESTIVAL_NOT_ACTIVE" };
  }

  const openAt = festival.reservationsStartDate.getTime();
  return getSelfServicePageDenial({
    actor: input.actor,
    targetProfile,
    festival,
    now: now.getTime() < openAt ? festival.reservationsStartDate : now,
  });
}
