import "server-only";

import { and, eq } from "drizzle-orm";

import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import {
  RESERVATION_ERROR_MESSAGES,
  reservationFailure,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import {
  evaluateSelfServiceEligibility,
  mapPartnerEligibilityCode,
  standMatchesParticipant,
  type ReservationActor,
} from "@/app/lib/reservations/policy";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
import { db } from "@/db";
import {
  festivals,
  reservationParticipants,
  standReservations,
  standSubcategories,
  userRequests,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadLiveSelfServiceReservation(
  tx: DbTx,
  userId: number,
  festivalId: number,
) {
  const memberships = await tx.query.reservationParticipants.findMany({
    where: eq(reservationParticipants.userId, userId),
    columns: { id: true },
    with: {
      reservation: {
        columns: {
          festivalId: true,
          status: true,
          source: true,
        },
      },
    },
  });

  return memberships.some(
    (row) =>
      row.reservation.festivalId === festivalId &&
      row.reservation.status !== "rejected" &&
      row.reservation.source === "user_reservation",
  );
}

export async function denySelfServiceMutation(
  tx: DbTx,
  input: {
    actor: ReservationActor;
    userId: number;
    festivalId: number;
    now?: Date;
    asPartner?: boolean;
  },
): Promise<Extract<ReservationActionResult, { success: false }> | null> {
  const now = input.now ?? new Date();

  const profile = await tx.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: {
      id: true,
      status: true,
      category: true,
      participationType: true,
    },
  });

  const festival = await tx.query.festivals.findFirst({
    where: eq(festivals.id, input.festivalId),
    columns: {
      id: true,
      status: true,
      reservationsStartDate: true,
      participantTermsEnabled: true,
    },
  });

  const publishedTerms = festival?.participantTermsEnabled
    ? await fetchPublishedFestivalTermsVersion(tx)
    : null;

  const enrollment = await tx.query.userRequests.findFirst({
    where: and(
      eq(userRequests.userId, input.userId),
      eq(userRequests.festivalId, input.festivalId),
      eq(userRequests.type, "festival_participation"),
    ),
    columns: {
      type: true,
      status: true,
      termsVersionId: true,
    },
  });

  const eligibility = festival
    ? await getReservationEligibility(
        { userId: input.userId, festivalId: input.festivalId, now },
        tx,
      )
    : { eligible: true as const };

  const hasLiveSelfServiceReservation = await loadLiveSelfServiceReservation(
    tx,
    input.userId,
    input.festivalId,
  );

  const result = evaluateSelfServiceEligibility({
    now,
    actor: input.asPartner
      ? { id: input.userId, role: "user" }
      : input.actor,
    targetProfileId: input.userId,
    intent: "mutate",
    profile: profile ?? null,
    festival: festival ?? null,
    publishedTermsVersionId: publishedTerms?.id ?? null,
    enrollment: enrollment ?? null,
    sanctionBlocked: !eligibility.eligible,
    hasLiveSelfServiceReservation,
  });

  if (result.allowed) return null;

  const code = input.asPartner
    ? mapPartnerEligibilityCode(result.code)
    : result.code;
  const message = input.asPartner
    ? `${RESERVATION_ERROR_MESSAGES.PARTNER_NOT_ELIGIBLE} ${RESERVATION_ERROR_MESSAGES[result.code]}`
    : undefined;
  return reservationFailure(code, message);
}

export async function denyIfStandNotEligibleForProfile(
  tx: DbTx,
  input: {
    standId: number;
    standCategory: string;
    participationType: string;
    userId: number;
  },
): Promise<Extract<ReservationActionResult, { success: false }> | null> {
  const profile = await tx.query.users.findFirst({
    where: eq(users.id, input.userId),
    columns: {
      category: true,
      participationType: true,
    },
    with: {
      profileSubcategories: {
        columns: { subcategoryId: true },
      },
    },
  });

  const subcategories = await tx.query.standSubcategories.findMany({
    where: eq(standSubcategories.standId, input.standId),
    columns: { subcategoryId: true },
  });

  const matches = standMatchesParticipant({
    standCategory: input.standCategory,
    participationType: input.participationType,
    eligibleSubcategoryIds: subcategories.map((row) => row.subcategoryId),
    profileCategory: profile?.category,
    profileParticipationType: profile?.participationType,
    profileSubcategoryIds:
      profile?.profileSubcategories.map((row) => row.subcategoryId) ?? [],
  });

  if (!matches) return reservationFailure("STAND_NOT_ELIGIBLE");
  return null;
}
