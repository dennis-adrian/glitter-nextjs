import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import {
  RESERVATION_ERROR_MESSAGES,
  reservationFailure,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import { uniqueSortedIds } from "@/app/lib/reservations/locks";
import {
  profileCategoryForStandMatch,
  type ReservationActor,
} from "@/app/lib/reservations/policy";
import { denySelfServiceMutation } from "@/app/lib/reservations/tx-eligibility";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
import { db } from "@/db";
import {
  reservationParticipants,
  standReservations,
  userRequests,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Failure = Extract<ReservationActionResult, { success: false }>;

export const MAX_RESERVATION_PARTICIPANTS = 2;

export function sharingAllowedForStandCategory(
  standCategory: string | null | undefined,
): boolean {
  return profileCategoryForStandMatch(standCategory) === "illustration";
}

export function isIllustrationParticipantCategory(
  category: string | null | undefined,
): boolean {
  return profileCategoryForStandMatch(category) === "illustration";
}

export function isAllowedReservationPartnerRole(role: string): boolean {
  return role === "user" || role === "artist";
}

export function hasTooManyRegisteredParticipants(
  participantUserIds: readonly number[],
): boolean {
  return uniqueSortedIds(participantUserIds).length > MAX_RESERVATION_PARTICIPANTS;
}

async function partnerAlreadyReserved(
  tx: DbTx,
  input: {
    partnerUserId: number;
    festivalId: number;
    reservationId?: number;
  },
) {
  const conditions = [
    eq(reservationParticipants.userId, input.partnerUserId),
    eq(standReservations.festivalId, input.festivalId),
  ];
  if (input.reservationId != null) {
    conditions.push(ne(standReservations.id, input.reservationId));
  }
  const [row] = await tx
    .select({ reservationId: reservationParticipants.reservationId })
    .from(reservationParticipants)
    .innerJoin(
      standReservations,
      eq(standReservations.id, reservationParticipants.reservationId),
    )
    .where(and(...conditions))
    .limit(1);
  return row != null;
}

async function assertAdminPartnerEnrollment(
  tx: DbTx,
  input: { userId: number; festivalId: number },
): Promise<Failure | null> {
  const [profile] = await tx
    .select({
      id: users.id,
      status: users.status,
      category: users.category,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!profile || profile.status !== "verified") {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }
  if (!isAllowedReservationPartnerRole(profile.role)) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }
  if (!isIllustrationParticipantCategory(profile.category)) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }

  const [festivalEnrollment] = await tx
    .select({
      type: userRequests.type,
      status: userRequests.status,
      termsVersionId: userRequests.termsVersionId,
    })
    .from(userRequests)
    .where(
      and(
        eq(userRequests.userId, input.userId),
        eq(userRequests.festivalId, input.festivalId),
        eq(userRequests.type, "festival_participation"),
      ),
    )
    .limit(1);
  if (!festivalEnrollment || festivalEnrollment.status !== "accepted") {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }

  const publishedTerms = await fetchPublishedFestivalTermsVersion(tx);
  if (
    publishedTerms == null ||
    festivalEnrollment.termsVersionId !== publishedTerms.id
  ) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }

  const eligibility = await getReservationEligibility(
    { userId: input.userId, festivalId: input.festivalId },
    tx,
  );
  if (!eligibility.eligible) {
    return reservationFailure(
      "PARTNER_NOT_ELIGIBLE",
      `${RESERVATION_ERROR_MESSAGES.PARTNER_NOT_ELIGIBLE} ${eligibility.message}`,
    );
  }

  return null;
}

export async function assertReservationPartner(
  tx: DbTx,
  input: {
    festivalId: number;
    ownerUserId: number;
    partnerUserId: number;
    standCategory: string;
    existingParticipantUserIds: readonly number[];
    reservationId?: number;
    mode: "self_service" | "admin";
    actor: ReservationActor;
  },
): Promise<Failure | null> {
  if (input.partnerUserId === input.ownerUserId) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }
  if (!sharingAllowedForStandCategory(input.standCategory)) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }

  const [owner] = await tx
    .select({ category: users.category })
    .from(users)
    .where(eq(users.id, input.ownerUserId))
    .limit(1);
  if (!owner || !isIllustrationParticipantCategory(owner.category)) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }

  const nextParticipantIds = uniqueSortedIds([
    ...input.existingParticipantUserIds,
    input.ownerUserId,
    input.partnerUserId,
  ]);
  if (hasTooManyRegisteredParticipants(nextParticipantIds)) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }
  const nonOwners = nextParticipantIds.filter((id) => id !== input.ownerUserId);
  if (nonOwners.length > 1) {
    return reservationFailure("PARTNER_NOT_ELIGIBLE");
  }

  if (input.mode === "self_service") {
    const partnerBlocked = await denySelfServiceMutation(tx, {
      actor: input.actor,
      userId: input.partnerUserId,
      festivalId: input.festivalId,
      asPartner: true,
    });
    if (partnerBlocked) return partnerBlocked;

    const [partner] = await tx
      .select({ category: users.category, role: users.role })
      .from(users)
      .where(eq(users.id, input.partnerUserId))
      .limit(1);
    if (
      !partner ||
      !isIllustrationParticipantCategory(partner.category) ||
      !isAllowedReservationPartnerRole(partner.role)
    ) {
      return reservationFailure("PARTNER_NOT_ELIGIBLE");
    }
  } else {
    const enrollmentBlocked = await assertAdminPartnerEnrollment(tx, {
      userId: input.partnerUserId,
      festivalId: input.festivalId,
    });
    if (enrollmentBlocked) return enrollmentBlocked;
  }

  if (
    await partnerAlreadyReserved(tx, {
      partnerUserId: input.partnerUserId,
      festivalId: input.festivalId,
      reservationId: input.reservationId,
    })
  ) {
    return reservationFailure("PARTNER_ALREADY_RESERVED");
  }

  return null;
}
