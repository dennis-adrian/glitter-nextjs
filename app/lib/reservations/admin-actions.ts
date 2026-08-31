"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import {
  cancelReservation,
  extendReservationPaymentDeadline,
  updateReservationPartner,
} from "@/app/lib/reservations/admin-service";
import { fetchAdminUsers, fetchBaseProfileById } from "@/app/api/users/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { lockReservationAggregate } from "@/app/lib/reservations/locks";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  enqueueAdminAndOwnerNotifications,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import { standHasLiveOccupancy } from "@/app/lib/reservations/occupancy";
import { assertReservationPartner } from "@/app/lib/reservations/partner-eligibility";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import {
  createAdminReservationSchema,
  parseUnknown,
} from "@/app/lib/reservations/schemas";
import { getReservationEligibility } from "@/app/lib/sanctions/reservation-eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  scheduledTasks,
  standReservations,
  stands,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export { cancelReservation, extendReservationPaymentDeadline, updateReservationPartner };

export async function createAdminReservation(
  params: unknown,
): Promise<{ success: boolean; message: string; reservationId?: number }> {
  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tenés permisos para realizar esta acción",
    };
  }

  const parsed = parseUnknown(createAdminReservationSchema, params);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const {
    festivalId,
    standId,
    ownerUserId: userId,
    partnerId,
    idempotencyKey,
  } = parsed.data;

  const stand = await fetchStandById(standId);
  if (!stand) {
    return { success: false, message: "El espacio no existe" };
  }
  if (stand.festivalId !== festivalId) {
    return {
      success: false,
      message: "El espacio no pertenece a este festival",
    };
  }

  const festival = await fetchBaseFestival(festivalId);
  if (!festival) {
    return { success: false, message: "El festival no existe" };
  }
  const revealAt =
    parsed.data.revealAt === undefined
      ? festival.reservationsStartDate
      : parsed.data.revealAt;
  const normalizedRevealAt =
    revealAt instanceof Date ? revealAt.toISOString() : null;

  const forUser = await fetchBaseProfileById(userId);
  if (!forUser) {
    return { success: false, message: "El usuario no existe" };
  }
  if (forUser.status !== "verified") {
    return { success: false, message: "El usuario no está verificado" };
  }

  if (partnerId != null) {
    if (partnerId === userId) {
      return {
        success: false,
        message: "El compañero no puede ser el mismo que el usuario principal",
      };
    }
    const partner = await fetchBaseProfileById(partnerId);
    if (!partner) {
      return { success: false, message: "El usuario compañero no existe" };
    }
    if (partner.status !== "verified") {
      return {
        success: false,
        message: "El usuario compañero no está verificado",
      };
    }
  }

  const participantIds = [userId];
  if (partnerId && partnerId !== userId) participantIds.push(partnerId);

  try {
    const admins = await fetchAdminUsers();
    const result = await db.transaction(async (tx) => {
      const claim = await claimRequest(tx, {
        requestKey: idempotencyKey,
        operation: "createAdminReservation",
        actorUserId: currentProfile.id,
        scope: {
          festivalId,
          standId,
          ownerUserId: userId,
          partnerId: partnerId ?? null,
          revealAt: normalizedRevealAt,
        },
      });
      if (claim.kind === "conflict") {
        return {
          success: false as const,
          message:
            "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
        };
      }
      if (claim.kind === "replayed") {
        const reservationId = claim.resultIds.reservationId;
        if (typeof reservationId !== "number") {
          return {
            success: false as const,
            message:
              "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
          };
        }
        return { reservationId, jobIds: [] as number[] };
      }

      const finish = async (
        outcome:
          | { success: false; message: string }
          | { reservationId: number; jobIds: number[] },
      ) => {
        if ("success" in outcome && outcome.success === false) {
          await abandonRequest(tx, idempotencyKey);
          return outcome;
        }
        if ("reservationId" in outcome) {
          await completeRequest(tx, idempotencyKey, {
            reservationId: outcome.reservationId,
          });
        }
        return outcome;
      };

      const locked = await lockReservationAggregate(tx, {
        festivalId,
        userIds: participantIds,
        standIds: [standId],
      });
      if (!locked.ok) {
        return finish({
          success: false,
          message:
            "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo.",
        });
      }

      const [lockedStand] = await tx
        .select()
        .from(stands)
        .where(eq(stands.id, standId))
        .limit(1)
        .for("update");

      if (!lockedStand) {
        return finish({ success: false, message: "El espacio no existe" });
      }
      if (lockedStand.festivalId !== festivalId) {
        return finish({
          success: false,
          message: "El espacio no pertenece a este festival",
        });
      }
      if (
        lockedStand.status === "disabled" ||
        (await standHasLiveOccupancy(tx, standId))
      ) {
        return finish({
          success: false,
          message: "El espacio ya está reservado",
        });
      }

      const ownerEligibility = await getReservationEligibility(
        { userId, festivalId: lockedStand.festivalId },
        tx,
      );
      if (!ownerEligibility.eligible) {
        return finish({
          success: false,
          message: ownerEligibility.message,
        });
      }

      if (partnerId != null) {
        const partnerBlocked = await assertReservationPartner(tx, {
          festivalId: lockedStand.festivalId,
          ownerUserId: userId,
          partnerUserId: partnerId,
          standCategory: lockedStand.standCategory,
          existingParticipantUserIds: [userId],
          mode: "admin",
          actor: { id: currentProfile.id, role: currentProfile.role },
        });
        if (partnerBlocked) {
          return finish({
            success: false,
            message: partnerBlocked.message,
          });
        }
      }

      const [reservation] = await tx
        .insert(standReservations)
        .values({
          festivalId,
          standId,
          source: "admin_assignment",
          ownerUserId: userId,
          priceAmountSnapshot: roundMoney(lockedStand.price ?? 0),
          revealAt,
        })
        .returning();

      await tx.insert(reservationParticipants).values(
        participantIds.map((uid) => ({
          userId: uid,
          reservationId: reservation.id,
        })),
      );

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: currentProfile.id,
        eventType: "created",
        toStatus: "pending",
        payload: {
          source: "admin_assignment",
          standId,
          partnerId: partnerId ?? null,
        },
      });

      await tx
        .update(stands)
        .set({ status: "reserved", updatedAt: new Date() })
        .where(eq(stands.id, standId));

      await tx.insert(invoices).values({
        date: new Date(),
        dueAt: sql`now() + interval '5 days'`,
        userId,
        reservationId: reservation.id,
        originalAmount: roundMoney(lockedStand.price ?? 0),
        amount: roundMoney(lockedStand.price ?? 0),
      });

      await tx.insert(scheduledTasks).values({
        dueDate: sql`now() + interval '5 days'`,
        reminderTime: sql`now() + interval '4 days'`,
        profileId: userId,
        reservationId: reservation.id,
        taskType: "stand_reservation",
      });

      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "reservation_created",
        reservationId: reservation.id,
        ownerUserId: userId,
        ownerEmail: null,
        adminEmails: admins.map((admin) => ({
          id: admin.id,
          email: admin.email,
        })),
      });

      return finish({ reservationId: reservation.id, jobIds });
    });

    if (
      typeof result === "object" &&
      result &&
      "success" in result &&
      result.success === false
    ) {
      return result;
    }

    const created = result as { reservationId: number; jobIds: number[] };
    scheduleReservationNotificationJobs(created.jobIds);
    revalidatePath("/dashboard/festivals");
    revalidatePath(`/dashboard/festivals/${festivalId}/reservations`);

    return {
      success: true,
      message: "Reserva creada",
      reservationId: created.reservationId,
    };
  } catch (error: unknown) {
    console.error("Error creating admin reservation", error);
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof (error as { code: string }).code === "string"
        ? (error as { code: string }).code
        : "";
    if (code === "23505" || code === "40001") {
      return {
        success: false,
        message: "El espacio ya está reservado",
      };
    }
    return { success: false, message: "Ups! No pudimos crear la reserva" };
  }
}
