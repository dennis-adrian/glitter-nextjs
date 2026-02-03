"use server";

import { ReservationBase } from "@/app/api/reservations/definitions";
import { FestivalWithDates, FestivalWithUserRequests } from "@/app/lib/festivals/definitions";
import { db } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type Participant = typeof reservationParticipants.$inferSelect & {
  user: typeof users.$inferSelect;
};
type StandReservation = typeof standReservations.$inferSelect & {
  participants: Participant[];
};
export type Stand = typeof stands.$inferSelect & {
  reservations: StandReservation[];
  festival: FestivalWithUserRequests;
};

export type StandReservationWithFestival = ReservationBase & {
  festival: FestivalWithDates;
};

export type StandBase = typeof stands.$inferSelect;

const positionSchema = z.object({
  id: z.number().int().positive(),
  positionLeft: z.number().finite(),
  positionTop: z.number().finite(),
});

export async function updateStandPositions(
  positions: { id: number; positionLeft: number; positionTop: number }[],
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = z.array(positionSchema).min(1).parse(positions);

    await db.transaction(async (tx) => {
      for (const pos of parsed) {
        await tx
          .update(stands)
          .set({
            positionLeft: pos.positionLeft,
            positionTop: pos.positionTop,
            updatedAt: new Date(),
          })
          .where(eq(stands.id, pos.id));
      }
    });

    revalidatePath("/dashboard/festivals");
    revalidatePath("/", "layout");

    return { success: true, message: "Posiciones actualizadas con éxito" };
  } catch (error) {
    console.error("Error updating stand positions", error);
    return { success: false, message: "Error al actualizar las posiciones" };
  }
}

export async function fetchStandById(
  id: number,
): Promise<StandBase | undefined | null> {
  try {
    return await db.query.stands.findFirst({
      where: eq(stands.id, id),
    });
  } catch (error) {
    console.error("Error fetching stand", error);
    return null;
  }
}
