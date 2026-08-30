import "server-only";

import { eq } from "drizzle-orm";

import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
import {
  evaluateSelfServiceEligibility,
  type ReservationActor,
} from "@/app/lib/reservations/policy";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
import { db } from "@/db";
import { reservationParticipants } from "@/db/schema";

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
}): Promise<ReservationErrorCode | null> {
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
  let sanctionBlocked = false;
  if (input.targetProfile && input.festival) {
    const eligibility = await getReservationEligibility({
      userId: input.targetProfile.id,
      festivalId: input.festival.id,
      now,
    });
    sanctionBlocked = !eligibility.eligible;

    const memberships = await db.query.reservationParticipants.findMany({
      where: eq(reservationParticipants.userId, input.targetProfile.id),
      columns: { id: true },
      with: {
        reservation: {
          columns: { festivalId: true, status: true, source: true },
        },
      },
    });
    hasLiveSelfServiceReservation = memberships.some(
      (row) =>
        row.reservation.festivalId === input.festival!.id &&
        row.reservation.status !== "rejected" &&
        row.reservation.source === "user_reservation",
    );
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
  });

  return result.allowed ? null : result.code;
}
