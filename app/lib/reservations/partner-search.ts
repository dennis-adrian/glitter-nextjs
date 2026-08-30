import "server-only";

import { and, eq, inArray, not, sql } from "drizzle-orm";

import type { PartnerSearchResultDto } from "@/app/lib/reservations/dto";
import type { ReservationErrorCode } from "@/app/lib/reservations/errors";
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

async function liveSelfServiceUserIds(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  festivalId: number,
) {
  const rows = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .innerJoin(
      standReservations,
      eq(standReservations.id, reservationParticipants.reservationId),
    )
    .where(
      and(
        eq(standReservations.festivalId, festivalId),
        sql`${standReservations.status} <> 'rejected'`,
        eq(standReservations.source, "user_reservation"),
      ),
    );
  return new Set(rows.map((row) => row.userId));
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

function partnerDenial(input: {
  status: string;
  role: string;
  category: string;
  enrolled: boolean;
  reserved: boolean;
}): ReservationErrorCode | undefined {
  if (input.reserved) return "PARTNER_ALREADY_RESERVED";
  if (input.status !== "verified") return "PARTNER_NOT_ELIGIBLE";
  if (input.role === "admin") return "PARTNER_NOT_ELIGIBLE";
  if (!input.enrolled) return "PARTNER_NOT_ELIGIBLE";
  if (input.category !== "illustration" && input.category !== "new_artist") {
    return "PARTNER_NOT_ELIGIBLE";
  }
  return undefined;
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
      const reservedIds = await liveSelfServiceUserIds(tx, festivalId);
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
        .limit(PARTNER_SEARCH_LIMIT);

      const enrolled = await enrolledUserIds(
        tx,
        festivalId,
        matchedUsers.map((user) => user.id),
      );

      return matchedUsers.map((user) =>
        toDto(
          user,
          partnerDenial({
            status: user.status,
            role: user.role,
            category: user.category,
            enrolled: enrolled.has(user.id),
            reserved: reservedIds.has(user.id),
          }),
        ),
      );
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

      const reservedIds = await liveSelfServiceUserIds(tx, festivalId);
      const enrolled = await enrolledUserIds(
        tx,
        festivalId,
        recent.map((row) => row.userId),
      );

      return recent.map((user) =>
        toDto(
          { id: user.userId, displayName: user.displayName, imageUrl: user.imageUrl },
          partnerDenial({
            status: user.status,
            role: user.role,
            category: user.category,
            enrolled: enrolled.has(user.userId),
            reserved: reservedIds.has(user.userId),
          }),
        ),
      );
    });
  } catch (error) {
    console.error("Error fetching recent shared stand partners", error);
    return [];
  }
}
