"use server";

import { fetchStandById } from "@/app/api/stands/actions";
import { fetchAdminUsers, fetchBaseProfileById } from "@/app/api/users/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  lockFestivalRow,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  enqueueAdminAndOwnerNotifications,
  enqueueReservationNotification,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
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
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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

  // When the admin doesn't specify a reveal time, the reservation stays hidden
  // from participants until reservations open for everyone.
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
        return { success: false as const, message: "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo." };
      }
      if (claim.kind === "replayed") {
        const reservationId = claim.resultIds.reservationId;
        if (typeof reservationId !== "number") {
          return { success: false as const, message: "Otro cambio ocurrió al mismo tiempo. Actualizá e intentá de nuevo." };
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

      await lockParticipants(tx, festivalId, participantIds);
      await lockFestivalRow(tx, festivalId);
      await lockParticipantEligibilityRows(tx, festivalId, participantIds);
      await lockStandRows(tx, [standId]);

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
        lockedStand.status === "reserved" ||
        lockedStand.status === "held" ||
        lockedStand.status === "confirmed" ||
        lockedStand.status === "disabled"
      ) {
        return finish({
          success: false,
          message: "El espacio ya está reservado",
        });
      }

      for (const [index, participantId] of participantIds.entries()) {
        const eligibility = await getReservationEligibility(
          {
            userId: participantId,
            festivalId: lockedStand.festivalId,
          },
          tx,
        );
        if (!eligibility.eligible) {
          return finish({
            success: false,
            message:
              index === 0
                ? eligibility.message
                : `El compañero seleccionado no puede participar en esta reserva. ${eligibility.message}`,
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
        payload: { source: "admin_assignment", standId, partnerId: partnerId ?? null },
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

      const admins = await fetchAdminUsers();
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

    if (typeof result === "object" && result && "success" in result && result.success === false) {
      return result;
    }

    const created = result as { reservationId: number; jobIds: number[] };
    scheduleReservationNotificationJobs(created.jobIds);
    revalidatePath("/dashboard/festivals");
    revalidatePath(`/dashboard/festivals/${festivalId}/reservations`);

    return { success: true, message: "Reserva creada", reservationId: created.reservationId };
  } catch (error: unknown) {
    console.error("Error creating admin reservation", error);
    // Concurrent reservation or unique constraint: treat as already reserved
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

export async function extendReservationPaymentDeadline(params: {
  reservationId: number;
  newDueDate: Date;
}): Promise<{ success: boolean; message: string }> {
  const { reservationId, newDueDate } = params;

  const currentProfile = await getCurrentUserProfile();
  if (!currentProfile || currentProfile.role !== "admin") {
    return {
      success: false,
      message: "No tenés permisos para realizar esta acción",
    };
  }

  if (!(newDueDate instanceof Date) || Number.isNaN(newDueDate.getTime())) {
    return { success: false, message: "Fecha inválida" };
  }
  if (newDueDate.getTime() <= Date.now()) {
    return { success: false, message: "La nueva fecha debe ser futura" };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1)
        .for("update");

      if (!locked) {
        return { ok: false as const, message: "La reserva no existe" };
      }
      if (locked.status !== "pending") {
        return {
          ok: false as const,
          message: "Solo puedes extender reservas pendientes de pago",
        };
      }

      const reservationRow = await tx.query.standReservations.findFirst({
        where: eq(standReservations.id, reservationId),
        with: {
          stand: true,
          festival: { with: { festivalDates: true } },
          participants: { with: { user: true } },
          scheduledTasks: true,
        },
      });

      if (!reservationRow) {
        return { ok: false as const, message: "La reserva no existe" };
      }

      const activeTask = reservationRow.scheduledTasks.find(
        (t) => t.taskType === "stand_reservation" && t.completedAt === null,
      );

      if (activeTask && newDueDate.getTime() <= activeTask.dueDate.getTime()) {
        return {
          ok: false as const,
          message: "La nueva fecha debe ser posterior a la fecha límite actual",
        };
      }

      const creator = reservationRow.participants[0]?.user;
      if (!creator) {
        return {
          ok: false as const,
          message: "La reserva no tiene un participante asociado",
        };
      }

      if (activeTask) {
        await tx
          .update(scheduledTasks)
          .set({
            dueDate: newDueDate,
            reminderSentAt: sql`now()`,
            ranAfterDueDate: false,
            updatedAt: sql`now()`,
          })
          .where(eq(scheduledTasks.id, activeTask.id));
      } else {
        // When the payment deadline is extended, we send an email to the user
        // we don't need to send another reminder email
        await tx.insert(scheduledTasks).values({
          dueDate: newDueDate,
          reminderTime: sql`now()`,
          reminderSentAt: sql`now()`,
          profileId: creator.id,
          reservationId: reservationRow.id,
          taskType: "stand_reservation",
        });
      }

      await tx
        .update(invoices)
        .set({ dueAt: newDueDate, updatedAt: new Date() })
        .where(
          and(
            eq(invoices.reservationId, reservationRow.id),
            inArray(invoices.status, ["pending", "verification_payment"]),
          ),
        );

      await insertStandReservationEvent(tx, {
        reservationId: reservationRow.id,
        actorUserId: currentProfile.id,
        eventType: "deadline_extended",
        payload: { dueAt: newDueDate.toISOString() },
      });

      const jobIds: number[] = [];
      const seen = new Set<string>();
      for (const participant of reservationRow.participants) {
        const email = participant.user?.email?.trim();
        if (!email || !participant.user) continue;
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const jobId = await enqueueReservationNotification(tx, {
          kind: "deadline_extended",
          reservationId: reservationRow.id,
          userId: participant.user.id,
          recipientEmail: email,
          payload: { dueAt: newDueDate.toISOString() },
          deduplicationKey: `deadline_extended:${reservationRow.id}:${newDueDate.toISOString()}:${key}`,
        });
        if (jobId) jobIds.push(jobId);
      }

      return { ok: true as const, jobIds };
    });

    if (!outcome.ok) {
      return { success: false, message: outcome.message };
    }

    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    revalidatePath("/dashboard/festivals/[id]/payments", "page");

    return { success: true, message: "Plazo de pago extendido" };
  } catch (error) {
    console.error("Error extending reservation payment deadline", error);
    return {
      success: false,
      message: "No se pudo extender el plazo de pago",
    };
  }
}
