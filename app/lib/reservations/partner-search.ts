import "server-only";

import { and, eq, inArray, not, sql } from "drizzle-orm";

import type { PartnerSearchResultDto } from "@/app/lib/reservations/dto";
import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
import { evaluatePartnerSearchDenial } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
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
  denialCode?: ReservationErrorCode,
): PartnerSearchResultDto {
  return {
    id: row.id,
    displayName: row.displayName,
    imageUrl: row.imageUrl,
    selectable: denialCode == null,
    denialCode,
  };
}

async function festivalReservationByUserId(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
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
    if (row.status === "rejected") {
      if (current !== "live") byUser.set(row.userId, "rejected");
    } else {
      byUser.set(row.userId, "live");
    }
  }
  return byUser;
}

async function enrolledUserIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  festivalId: number,
  userIds: number[],
) {
  if (userIds.length === 0) return new Set<number>();
  const rows = await tx
    .select({ userId: userRequests.userId })
    .from(userRequests)
    .where(
      and(
        eq(userRequests.festivalId, festivalId),
        eq(userRequests.status, "accepted"),
        eq(userRequests.type, "festival_participation"),
        inArray(userRequests.userId, userIds),
      ),
    );
  return new Set(rows.map((row) => row.userId));
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
      const enrolled = await enrolledUserIds(tx, festivalId, matchedIds);

      const evaluated = matchedUsers.map((user) =>
        toDto(
          user,
          evaluatePartnerSearchDenial({
            status: user.status,
            role: user.role,
            category: user.category,
            enrolled: enrolled.has(user.id),
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
      const enrolled = await enrolledUserIds(
        tx,
        festivalId,
        recent.map((row) => row.userId),
      );

      return recent.map((user) =>
        toDto(
          { id: user.userId, displayName: user.displayName, imageUrl: user.imageUrl },
          evaluatePartnerSearchDenial({
            status: user.status,
            role: user.role,
            category: user.category,
            enrolled: enrolled.has(user.userId),
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
