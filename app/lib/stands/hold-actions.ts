"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import { fetchAdminUsers, fetchBaseProfileById } from "@/app/api/users/actions";
import ReservationCreatedEmailTemplate from "@/app/emails/reservation-created";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  scheduledTasks,
  standHolds,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const HOLD_DURATION_MINUTES = 5;

function canActOnBehalfOfUser(
  actor: { id: number; role: string } | null | undefined,
  targetUserId: number,
): boolean {
  if (!actor) return false;
  if (actor.id === targetUserId) return true;
  return actor.role === "admin" || actor.role === "festival_admin";
}

type HoldTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function rejectIfAnyParticipantIsIneligible(
  userIds: readonly number[],
  festivalId: number,
  tx: HoldTx,
) {
  for (const [index, userId] of [...new Set(userIds)].entries()) {
    const eligibility = await getReservationEligibility(
      { userId, festivalId },
      tx,
    );
    if (!eligibility.eligible) {
      return {
        success: false as const,
        message:
          index === 0
            ? eligibility.message
            : `El compañero seleccionado no puede participar en esta reserva. ${eligibility.message}`,
      };
    }
  }
  return null;
}

export async function fetchHoldWithStand(
  holdId: number,
  userId: number,
  festivalId: number,
) {
  return db.query.standHolds.findFirst({
    where: and(
      eq(standHolds.id, holdId),
      eq(standHolds.userId, userId),
      eq(standHolds.festivalId, festivalId),
    ),
    with: { stand: true },
  });
}

export async function getActiveHold(
  userId: number,
  festivalId: number,
): Promise<{ id: number; standId: number } | null> {
  const hold = await db.query.standHolds.findFirst({
    where: and(
      eq(standHolds.userId, userId),
      eq(standHolds.festivalId, festivalId),
      gt(standHolds.expiresAt, new Date()),
    ),
    columns: { id: true, standId: true },
  });
  return hold ? { id: hold.id, standId: hold.standId } : null;
}

export async function createStandHold(
  standId: number,
  userId: number,
  festivalId: number,
): Promise<{
  success: boolean;
  message: string;
  holdId?: number;
  alreadyHeld?: boolean;
}> {
  const actor = await getCurrentUserProfile();
  if (!canActOnBehalfOfUser(actor, userId)) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [stand] = await tx
        .select({
          id: stands.id,
          status: stands.status,
          festivalId: stands.festivalId,
        })
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1)
        .for("update");

      if (!stand) {
        return {
          success: false,
          message: "Este espacio no existe",
        };
      }
      if (stand.festivalId !== festivalId) {
        return {
          success: false,
          message: "El espacio no pertenece a este festival",
        };
      }

      const forUser = await tx.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { status: true },
      });
      if (!forUser || forUser.status !== "verified") {
        return {
          success: false,
          message: "El participante no está verificado",
        };
      }

      const blocked = await rejectIfAnyParticipantIsIneligible(
        [userId],
        stand.festivalId,
        tx,
      );
      if (blocked) return blocked;

      // Check user doesn't already have an active hold for this festival
      const existingHold = await tx
        .select({ id: standHolds.id, standId: standHolds.standId })
        .from(standHolds)
        .where(
          and(
            eq(standHolds.userId, userId),
            eq(standHolds.festivalId, festivalId),
            gt(standHolds.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (existingHold.length > 0) {
        // User already holds the same stand — just return the existing hold
        if (existingHold[0].standId === standId) {
          return {
            success: true,
            message: "Ya tienes este espacio en espera",
            holdId: existingHold[0].id,
            alreadyHeld: true,
          };
        }

        // User holds a different stand — release old hold first
        await tx
          .delete(standHolds)
          .where(eq(standHolds.id, existingHold[0].id));
        await tx
          .update(stands)
          .set({ status: "available", updatedAt: new Date() })
          .where(
            and(
              eq(stands.id, existingHold[0].standId),
              eq(stands.status, "held"),
            ),
          );
      }

      if (stand.status !== "available") {
        return {
          success: false,
          message: "Este espacio ya no está disponible",
        };
      }

      // Create the hold
      const expiresAt = new Date(
        Date.now() + HOLD_DURATION_MINUTES * 60 * 1000,
      );
      const [hold] = await tx
        .insert(standHolds)
        .values({
          standId: stand.id,
          userId,
          festivalId: stand.festivalId,
          expiresAt,
        })
        .returning();

      // Update stand status to "held"
      await tx
        .update(stands)
        .set({ status: "held", updatedAt: new Date() })
        .where(eq(stands.id, standId));

      return {
        success: true,
        message: "Espacio reservado temporalmente",
        holdId: hold.id,
      };
    });

    revalidatePath("/profiles");
    return result;
  } catch (error) {
    console.error("Error creating stand hold", error);
    return {
      success: false,
      message: "Error al reservar temporalmente el espacio",
    };
  }
}

export async function cancelStandHold(
  holdId: number,
  userId: number,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canActOnBehalfOfUser(actor, userId)) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

  try {
    await db.transaction(async (tx) => {
      const [hold] = await tx
        .select({ id: standHolds.id, standId: standHolds.standId })
        .from(standHolds)
        .where(and(eq(standHolds.id, holdId), eq(standHolds.userId, userId)))
        .limit(1);

      if (!hold) {
        return;
      }

      // Delete the hold
      await tx.delete(standHolds).where(eq(standHolds.id, holdId));

      // Reset stand to available (only if still "held")
      await tx
        .update(stands)
        .set({ status: "available", updatedAt: new Date() })
        .where(and(eq(stands.id, hold.standId), eq(stands.status, "held")));
    });

    revalidatePath("/profiles");
    return { success: true, message: "Reserva temporal cancelada" };
  } catch (error) {
    console.error("Error cancelling stand hold", error);
    return {
      success: false,
      message: "Error al cancelar la reserva temporal",
    };
  }
}

export async function confirmStandHold(
  holdId: number,
  userId: number,
  partnerId?: number,
): Promise<{
  success: boolean;
  message: string;
  reservationId?: number;
  description?: string;
}> {
  const actor = await getCurrentUserProfile();
  if (!canActOnBehalfOfUser(actor, userId)) {
    return {
      success: false,
      message: "No autorizado",
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Validate the hold is still active
      const [hold] = await tx
        .select({
          id: standHolds.id,
          standId: standHolds.standId,
          festivalId: standHolds.festivalId,
          standFestivalId: stands.festivalId,
          standPrice: stands.price,
        })
        .from(standHolds)
        .innerJoin(stands, eq(stands.id, standHolds.standId))
        .where(
          and(
            eq(standHolds.id, holdId),
            eq(standHolds.userId, userId),
            gt(standHolds.expiresAt, new Date()),
          ),
        )
        .limit(1)
        .for("update");

      if (!hold) {
        return {
          success: false,
          message:
            "Tu reserva temporal expiró. Vuelve al mapa para seleccionar otro espacio.",
        };
      }
      if (hold.festivalId !== hold.standFestivalId) {
        return {
          success: false,
          message:
            "La reserva temporal no coincide con el festival del espacio",
        };
      }

      const participantIds = [
        ...new Set([userId, ...(partnerId ? [partnerId] : [])]),
      ];
      if (partnerId === userId) {
        return {
          success: false,
          message: "El compañero no puede ser el usuario principal",
        };
      }

      const participantRows = await tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(inArray(users.id, participantIds));
      if (
        participantRows.length !== participantIds.length ||
        participantRows.some((participant) => participant.status !== "verified")
      ) {
        return {
          success: false,
          message: "Todos los participantes deben estar verificados",
        };
      }

      const blocked = await rejectIfAnyParticipantIsIneligible(
        participantIds,
        hold.standFestivalId,
        tx,
      );
      if (blocked) return blocked;

      // Create the actual reservation
      const [reservation] = await tx
        .insert(standReservations)
        .values({
          festivalId: hold.festivalId,
          standId: hold.standId,
        })
        .returning();

      // Insert participants
      await tx.insert(reservationParticipants).values(
        participantIds.map((uid) => ({
          userId: uid,
          reservationId: reservation.id,
        })),
      );

      // Update stand to "reserved"
      await tx
        .update(stands)
        .set({ status: "reserved", updatedAt: new Date() })
        .where(eq(stands.id, hold.standId));

      // Create invoice
      const standPrice = hold.standPrice ?? 0;
      await tx.insert(invoices).values({
        date: new Date(),
        userId: userId,
        reservationId: reservation.id,
        originalAmount: standPrice,
        amount: standPrice,
      });

      // Create scheduled task
      await tx.insert(scheduledTasks).values({
        dueDate: sql`now() + interval '5 days'`,
        reminderTime: sql`now() + interval '4 days'`,
        profileId: userId,
        reservationId: reservation.id,
        taskType: "stand_reservation",
      });

      // Delete the hold
      await tx.delete(standHolds).where(eq(standHolds.id, holdId));

      return {
        success: true,
        message: "Reserva creada",
        reservationId: reservation.id,
        festivalId: hold.festivalId,
        standId: hold.standId,
      };
    });

    // Send admin email (outside transaction, following existing pattern)
    if (result.success && result.reservationId) {
      const festival = await fetchBaseFestival(result.festivalId as number);
      const creator = await fetchBaseProfileById(userId);
      const stand = await fetchStandById(result.standId as number);
      const admins = await fetchAdminUsers();
      const adminEmails = admins.map((admin) => admin.email);
      await sendEmail({
        to: [...adminEmails],
        from: "Reservas Glitter <reservas@productoraglitter.com>",
        subject: "Nueva reserva creada",
        react: ReservationCreatedEmailTemplate({
          festivalName: festival?.name || "Festival",
          reservationId: result.reservationId,
          creatorName: creator?.displayName || "Usuario",
          standName: stand != null ? formatStandLabel(stand) : "sin stand",
          standCategory: getCategoryOccupationLabel(stand?.standCategory, {
            singular: false,
          }),
        }) as React.ReactElement,
      });
    }

    revalidatePath("/profiles");
    revalidatePath("/my_profile");

    return {
      success: result.success,
      message: result.message,
      reservationId: result.reservationId,
    };
  } catch (error) {
    console.error("Error confirming stand hold", error);
    return {
      success: false,
      message: "Ups! No pudimos crear la reserva",
    };
  }
}

export async function cleanupExpiredHolds(): Promise<number> {
  try {
    const expiredHolds = await db
      .select({ id: standHolds.id, standId: standHolds.standId })
      .from(standHolds)
      .where(lte(standHolds.expiresAt, new Date()));

    if (expiredHolds.length === 0) return 0;

    await db.transaction(async (tx) => {
      for (const hold of expiredHolds) {
        await tx.delete(standHolds).where(eq(standHolds.id, hold.id));

        await tx
          .update(stands)
          .set({ status: "available", updatedAt: new Date() })
          .where(and(eq(stands.id, hold.standId), eq(stands.status, "held")));
      }
    });

    return expiredHolds.length;
  } catch (error) {
    console.error("Error cleaning up expired holds", error);
    return 0;
  }
}
