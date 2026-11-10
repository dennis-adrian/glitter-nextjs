import "server-only";

import { and, eq, inArray, not, sql } from "drizzle-orm";

import { fetchPublishedFestivalTermsVersion } from "@/app/lib/festival-terms/queries";
import type { PartnerSearchResultDto } from "@/app/lib/reservations/dto";
import {
  partnerDenialMessage,
  type ReservationErrorCode,
} from "@/app/lib/reservations/errors";
import {
  blocksFestivalParticipation,
  evaluatePartnerSearchDenial,
  occupiesStandCapacity,
} from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivals,
  reservationParticipants,
  standReservations,
  userRequests,
  users,
} from "@/db/schema";

const PARTNER_QUERY_MIN = 2;
const PARTNER_QUERY_MAX = 80;
const PARTNER_SEARCH_LIMIT = 5;
const PARTNER_SEARCH_CANDIDATE_LIMIT = 25;

function toDto(
  row: {
    id: number;
    displayName: string | null;
    imageUrl: string | null;
  },
  denial?: { code: ReservationErrorCode; message?: string },
): PartnerSearchResultDto {
  return {
    id: row.id,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    selectable: denial == null,
    denialCode: denial?.code,
    denialMessage: denial?.message,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The terms version a partner's enrollment must carry, or null when the
 * festival does not gate on terms.
 *
 * Confirming re-runs the self-service policy on the partner, which refuses an
 * enrollment accepted under an older terms version (`TERMS_STALE`). Without
 * this the search offered such a partner as selectable and the owner only
 * learned otherwise when "Confirmar Reserva" failed. No published version at
 * all blocks the owner too (`TERMS_UNAVAILABLE`), so it is not the partner's
 * problem and is not flagged here.
 */
async function requiredTermsVersionId(
  tx: Tx,
  festivalId: number,
): Promise<number | null> {
  const [festival] = await tx
    .select({ participantTermsEnabled: festivals.participantTermsEnabled })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival?.participantTermsEnabled) return null;
  const published = await fetchPublishedFestivalTermsVersion(tx);
  return published?.id ?? null;
}

function partnerSearchDenial(
  user: { status: string; role: string; category: string },
  input: {
    enrollment: Map<number, number | null>;
    userId: number;
    requiredTermsVersionId: number | null;
    festivalReservation?: "live" | "rejected";
  },
): { code: ReservationErrorCode; message?: string } | undefined {
  const code = evaluatePartnerSearchDenial({
    status: user.status,
    role: user.role,
    category: user.category,
    enrolled: input.enrollment.has(input.userId),
    festivalReservation: input.festivalReservation,
  });
  if (code) return { code };
  if (
    input.requiredTermsVersionId != null &&
    input.enrollment.get(input.userId) !== input.requiredTermsVersionId
  ) {
    return {
      code: "PARTNER_NOT_ELIGIBLE",
      message: partnerDenialMessage("TERMS_STALE"),
    };
  }
  return undefined;
}

async function festivalReservationByUserId(
  tx: Tx,
  festivalId: number,
  userIds?: number[],
) {
  const conditions = [eq(standReservations.festivalId, festivalId)];
  if (userIds && userIds.length > 0) {
    conditions.push(inArray(reservationParticipants.userId, userIds));
  }

  const rows = await tx
    .select({
      userId: reservationParticipants.userId,
      status: standReservations.status,
    })
    .from(reservationParticipants)
    .innerJoin(
      standReservations,
      eq(standReservations.id, reservationParticipants.reservationId),
    )
    .where(and(...conditions));

  const byUser = new Map<number, "rejected" | "live">();
  for (const row of rows) {
    const current = byUser.get(row.userId);
    if (blocksFestivalParticipation(row.status)) {
      if (current !== "live") byUser.set(row.userId, "rejected");
    } else if (occupiesStandCapacity(row.status)) {
      byUser.set(row.userId, "live");
    }
  }
  return byUser;
}

/** Accepted enrollments in the festival: user id → accepted terms version. */
async function acceptedEnrollments(
  tx: Tx,
  festivalId: number,
  userIds: number[],
) {
  if (userIds.length === 0) return new Map<number, number | null>();
  const rows = await tx
    .select({
      userId: userRequests.userId,
      termsVersionId: userRequests.termsVersionId,
    })
    .from(userRequests)
    .where(
      and(
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.status, "accepted"),
        eq(userRequests.type, "festival_participation"),
        inArray(userRequests.userId, userIds),
      ),
    );
  return new Map(rows.map((row) => [row.userId, row.termsVersionId]));
}

export async function searchPotentialPartnersForActor(
  festivalId: number,
  query: string,
): Promise<PartnerSearchResultDto[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];

  const trimmed = query.replace(/\s+/g, " ").trim();
  if (
    trimmed.length < PARTNER_QUERY_MIN ||
    trimmed.length > PARTNER_QUERY_MAX
  ) {
    return [];
  }

  try {
    return await db.transaction(async (tx) => {
      const normalizedQuery = trimmed.replace(/\s+/g, "").toLowerCase();

      const matchedUsers = await tx
        .select({
          id: users.id,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
          status: users.status,
          role: users.role,
          category: users.category,
        })
        .from(users)
        .where(
          and(
            eq(users.status, "verified"),
            not(eq(users.role, "admin")),
            not(eq(users.id, actor.id)),
            sql`${users.displayName} is not null`,
            sql`similarity(
              replace(lower(${users.displayName}), ' ', ''),
              ${normalizedQuery}
            ) > 0.1`,
          ),
        )
        .orderBy(
          sql`CASE WHEN replace(lower(${users.displayName}), ' ', '')
            LIKE '%' || ${normalizedQuery} || '%'
          THEN 0 ELSE 1 END`,
          sql`similarity(
            replace(lower(${users.displayName}), ' ', ''),
            ${normalizedQuery}
          ) DESC`,
        )
        .limit(PARTNER_SEARCH_CANDIDATE_LIMIT);

      if (!matchedUsers.length) return [];

      const matchedIds = matchedUsers.map((user) => user.id);
      const reservedByUser = await festivalReservationByUserId(
        tx,
        festivalId,
        matchedIds,
      );
      const enrollment = await acceptedEnrollments(tx, festivalId, matchedIds);
      const termsVersionId = await requiredTermsVersionId(tx, festivalId);

      const evaluated = matchedUsers.map((user) =>
        toDto(
          user,
          partnerSearchDenial(user, {
            enrollment,
            userId: user.id,
            requiredTermsVersionId: termsVersionId,
            festivalReservation: reservedByUser.get(user.id),
          }),
        ),
      );

      return [...evaluated]
        .sort((a, b) => Number(b.selectable) - Number(a.selectable))
        .slice(0, PARTNER_SEARCH_LIMIT);
    });
  } catch (error) {
    console.error("Error searching potential partners for festival", error);
    return [];
  }
}

export async function searchRecentPartners(
  festivalId: number,
  limit = 3,
): Promise<PartnerSearchResultDto[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];
  if (limit <= 0) return [];

  try {
    return await db.transaction(async (tx) => {
      const ownParticipations = await tx
        .select({
          reservationId: reservationParticipants.reservationId,
          participatedAt: reservationParticipants.createdAt,
        })
        .from(reservationParticipants)
        .where(eq(reservationParticipants.userId, actor.id))
        .orderBy(reservationParticipants.createdAt);

      if (!ownParticipations.length) return [];

      const reservationIds = [
        ...new Set(ownParticipations.map((row) => row.reservationId)),
      ];
      const coParticipants = await tx
        .select({
          reservationId: reservationParticipants.reservationId,
          userId: users.id,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
          status: users.status,
          role: users.role,
          category: users.category,
          participatedAt: reservationParticipants.createdAt,
        })
        .from(reservationParticipants)
        .innerJoin(users, eq(users.id, reservationParticipants.userId))
        .where(
          and(
            inArray(reservationParticipants.reservationId, reservationIds),
            not(eq(reservationParticipants.userId, actor.id)),
          ),
        );

      const unique = new Map<
        number,
        (typeof coParticipants)[number] & { sharedAt: Date }
      >();
      for (const row of coParticipants) {
        const existing = unique.get(row.userId);
        if (!existing || row.participatedAt > existing.sharedAt) {
          unique.set(row.userId, { ...row, sharedAt: row.participatedAt });
        }
      }

      const recent = [...unique.values()]
        .sort((a, b) => b.sharedAt.getTime() - a.sharedAt.getTime())
        .slice(0, limit);
      if (!recent.length) return [];

      const reservedByUser = await festivalReservationByUserId(
        tx,
        festivalId,
        recent.map((row) => row.userId),
      );
      const enrollment = await acceptedEnrollments(
        tx,
        festivalId,
        recent.map((row) => row.userId),
      );
      const termsVersionId = await requiredTermsVersionId(tx, festivalId);

      return recent.map((user) =>
        toDto(
          {
            id: user.userId,
            displayName: user.displayName,
            imageUrl: user.imageUrl,
          },
          partnerSearchDenial(user, {
            enrollment,
            userId: user.userId,
            requiredTermsVersionId: termsVersionId,
            festivalReservation: reservedByUser.get(user.userId),
          }),
        ),
      );
    });
  } catch (error) {
    console.error("Error fetching recent shared stand partners", error);
    return [];
  }
}
