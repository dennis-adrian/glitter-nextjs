"use server";

import { UserCategory } from "@/app/api/users/definitions";
import { FestivalSectorWithStands } from "@/app/lib/festival_sectors/definitions";
import { getFestivalSectorAllowedCategories } from "@/app/lib/festival_sectors/helpers";
import type { PublicFestivalParticipant } from "@/app/components/festivals/participant-info";
import { isNewParticipationCount } from "@/app/lib/utils";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  festivalSectors,
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { and, countDistinct, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateSectorMapBounds(
  sectorId: number,
  bounds: { minX: number; minY: number; width: number; height: number },
): Promise<{ success: boolean; message: string }> {
  if (!(await requireAdminOrFestivalAdmin())) {
    return { success: false, message: "No autorizado" };
  }

  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height)
  ) {
    return {
      success: false,
      message: "Dimensiones del mapa inválidas",
    };
  }

  try {
    const updated = await db
      .update(festivalSectors)
      .set({
        mapOriginX: bounds.minX,
        mapOriginY: bounds.minY,
        mapWidth: bounds.width,
        mapHeight: bounds.height,
        updatedAt: new Date(),
      })
      .where(eq(festivalSectors.id, sectorId))
      .returning({ id: festivalSectors.id });

    if (updated.length === 0) {
      return {
        success: false,
        message: "No se pudo actualizar las dimensiones del mapa",
      };
    }

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return { success: true, message: "Dimensiones del mapa actualizadas" };
  } catch (error) {
    console.error("Error updating sector map bounds", error);
    return {
      success: false,
      message: "Error al actualizar las dimensiones del mapa",
    };
  }
}

/**
 * The public festival page's participant list, already shaped for its cards.
 *
 * Deliberately narrow. The cards need a name, a picture, a category, the stands
 * and two booleans, so that is what the query returns — where whole profiles
 * with their whole participation history ran to megabytes on a festival with
 * 200 participants, and carried contact details the page never shows.
 */
export async function fetchPublicFestivalParticipants(
  festivalId: number,
): Promise<PublicFestivalParticipant[]> {
  try {
    // Reservations still hidden from participants stay out of both queries, so
    // an unrevealed stand cannot name its occupant.
    const isRevealed = or(
      isNull(standReservations.revealAt),
      lte(standReservations.revealAt, new Date()),
    );

    const rows = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        category: users.category,
        hasStamp: reservationParticipants.hasStamp,
        standId: stands.id,
        standLabel: stands.label,
        standNumber: stands.standNumber,
      })
      .from(reservationParticipants)
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .innerJoin(stands, eq(stands.id, standReservations.standId))
      .innerJoin(users, eq(users.id, reservationParticipants.userId))
      .where(
        and(
          eq(standReservations.festivalId, festivalId),
          eq(standReservations.status, "accepted"),
          isRevealed,
        ),
      );

    if (rows.length === 0) return [];

    // "New" is a property of the whole profile, so this spans every festival —
    // but the badge only asks how many confirmed participations there are, not
    // what they were.
    const confirmedCounts = await db
      .select({
        userId: reservationParticipants.userId,
        confirmed: countDistinct(standReservations.festivalId),
      })
      .from(reservationParticipants)
      .innerJoin(
        standReservations,
        eq(standReservations.id, reservationParticipants.reservationId),
      )
      .where(
        and(
          inArray(
            reservationParticipants.userId,
            Array.from(new Set(rows.map((row) => row.userId))),
          ),
          eq(standReservations.status, "accepted"),
          isRevealed,
        ),
      )
      .groupBy(reservationParticipants.userId);

    const confirmedByUserId = new Map(
      confirmedCounts.map((row) => [row.userId, row.confirmed]),
    );
    const participantsByUserId = new Map<number, PublicFestivalParticipant>();

    // One row per stand a participant holds, so the rows fold into participants.
    for (const row of rows) {
      let participant = participantsByUserId.get(row.userId);

      if (!participant) {
        participant = {
          id: row.userId,
          displayName: row.displayName || "Participante",
          imageUrl: row.imageUrl,
          category: row.category,
          stands: [],
          hasStamp: false,
          isNew: isNewParticipationCount(
            confirmedByUserId.get(row.userId) ?? 0,
          ),
        };
        participantsByUserId.set(row.userId, participant);
      }

      if (row.hasStamp) participant.hasStamp = true;
      if (!participant.stands.some((stand) => stand.id === row.standId)) {
        participant.stands.push({
          id: row.standId,
          label: row.standLabel,
          standNumber: row.standNumber,
        });
      }
    }

    for (const participant of participantsByUserId.values()) {
      participant.stands.sort((a, b) => a.standNumber - b.standNumber);
    }

    return Array.from(participantsByUserId.values());
  } catch (error) {
    console.error("Error fetching public festival participants", error);
    return [];
  }
}

export async function fetchFestivalSectorsWithAllowedCategories(
  festivalId: number,
): Promise<
  (FestivalSectorWithStands & {
    allowedCategories: UserCategory[];
  })[]
> {
  try {
    const sectors = await db.query.festivalSectors.findMany({
      with: {
        stands: true,
      },
      where: eq(festivalSectors.festivalId, festivalId),
    });

    return sectors.map((sector) => ({
      ...sector,
      allowedCategories: getFestivalSectorAllowedCategories(sector),
    }));
  } catch (error) {
    console.error(
      "Error fetching festival sectors with allowed categories",
      error,
    );
    return [];
  }
}
