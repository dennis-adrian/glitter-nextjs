import "server-only";

import { eq } from "drizzle-orm";

import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
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

/**
 * The codes `evaluateSelfServiceEligibility` decides before it looks at terms,
 * sanctions or reservations. When one of them applies, the reads cannot change
 * the answer, so they are skipped — during the countdown, that is every
 * refresh. Pinned by policy.test.ts; a reorder of the policy must update both.
 */
export const PRE_READ_CODES: ReadonlySet<ReservationErrorCode> = new Set([
  "UNAUTHENTICATED",
  "UNAUTHORIZED",
  "PROFILE_NOT_VERIFIED",
  "FESTIVAL_NOT_ACTIVE",
  "RESERVATIONS_NOT_OPEN",
]);

/**
 * Why the participant cannot use the self-service reservation pages, or null.
 *
 * Pass `now: festival.reservationsStartDate` for the denial they would still
 * face the moment reservations open: `RESERVATIONS_NOT_OPEN` is evaluated
 * before enrollment, terms and sanctions, so before the map opens it masks
 * every other reason. Full-table activation needs exactly that — the PRD puts
 * the money decision before the map, but only for people who would otherwise
 * be allowed to reserve at all.
 */
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
  const enrollmentRow = input.targetProfile?.userRequests?.find(
    (request) =>
      request.festivalId === input.festival?.id &&
      request.type === "festival_participation",
  );
  const enrollment = enrollmentRow
    ? {
        type: enrollmentRow.type,
        status: enrollmentRow.status,
        termsVersionId: enrollmentRow.termsVersionId,
      }
    : null;
  const evaluate = (reads: {
    publishedTermsVersionId: number | null;
    sanctionBlocked: boolean;
    hasLiveSelfServiceReservation: boolean;
    hasRejectedFestivalReservation: boolean;
  }) =>
    evaluateSelfServiceEligibility({
      now,
      actor: input.actor,
      targetProfileId: input.targetProfile?.id ?? 0,
      intent: "view",
      profile: input.targetProfile
        ? { id: input.targetProfile.id, status: input.targetProfile.status }
        : null,
      festival: input.festival,
      enrollment,
      ...reads,
    });

  const preRead = evaluate({
    publishedTermsVersionId: null,
    sanctionBlocked: false,
    hasLiveSelfServiceReservation: false,
    hasRejectedFestivalReservation: false,
  });
  if (!preRead.allowed && PRE_READ_CODES.has(preRead.code)) {
    return { code: preRead.code };
  }

  const target = input.targetProfile;
  const festival = input.festival;
  const [publishedTerms, eligibility, memberships] = await Promise.all([
    festival?.participantTermsEnabled
      ? fetchPublishedFestivalTermsVersion()
      : null,
    target && festival
      ? getReservationEligibility({
          userId: target.id,
          festivalId: festival.id,
          now,
        })
      : null,
    target && festival
      ? db.query.reservationParticipants.findMany({
          where: eq(reservationParticipants.userId, target.id),
          columns: { id: true },
          with: {
            reservation: {
              columns: { festivalId: true, status: true, source: true },
            },
          },
        })
      : null,
  ]);

  const sanctionBlock =
    eligibility && !eligibility.eligible ? eligibility : undefined;
  const participation =
    memberships && festival
      ? summarizeFestivalParticipations(
          memberships.map((row) => row.reservation),
          festival.id,
        )
      : null;

  const result = evaluate({
    publishedTermsVersionId: publishedTerms?.id ?? null,
    sanctionBlocked: sanctionBlock != null,
    hasLiveSelfServiceReservation:
      participation?.hasLiveSelfServiceReservation ?? false,
    hasRejectedFestivalReservation:
      participation?.hasRejectedFestivalReservation ?? false,
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
