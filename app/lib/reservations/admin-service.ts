import "server-only";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { releaseStandIfVacant } from "@/app/lib/reservations/occupancy";
import {
  RESERVATION_ERROR_MESSAGES,
  reservationFailure,
  reservationSuccess,
} from "@/app/lib/reservations/errors";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  readReservationParticipantIds,
  sameIdSet,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import {
  enqueueReservationNotification,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import { assertReservationPartner } from "@/app/lib/reservations/partner-eligibility";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  cancelReservationSchema,
  extendDeadlineSchema,
  parseUnknown,
  updateReservationPartnerSchema,
} from "@/app/lib/reservations/schemas";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  reservationStatusEnum,
  scheduledTasks,
  standReservationEventTypeEnum,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { revalidatePath } from "next/cache";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReservationEventType =
  (typeof standReservationEventTypeEnum.enumValues)[number];
type ReservationStatus = (typeof reservationStatusEnum.enumValues)[number];
type CancellationReservation = {
  id: number;
  standId: number;
  festivalId: number;
  status: string;
};

type ReservationPricingSnapshot = {
  id: number;
  priceAmountSnapshot: number | null;
  individualPriceSnapshot: number | null;
  sharedPriceSnapshot: number | null;
};

async function synchronizeReservationParticipantPricing(
  tx: DbTx,
  reservation: ReservationPricingSnapshot,
  participantCount: number,
) {
  const applicablePriceSnapshot =
    participantCount > 1
      ? reservation.sharedPriceSnapshot
      : reservation.individualPriceSnapshot;
  const nextPriceSnapshot =
    applicablePriceSnapshot == null
      ? reservation.priceAmountSnapshot
      : roundMoney(applicablePriceSnapshot);
  const priceChanged =
    nextPriceSnapshot != null &&
    (reservation.priceAmountSnapshot == null ||
      roundMoney(reservation.priceAmountSnapshot) !== nextPriceSnapshot);
  const updatedAt = new Date();

  await tx
    .update(standReservations)
    .set({
      bookedParticipantCount: participantCount,
      ...(priceChanged ? { priceAmountSnapshot: nextPriceSnapshot } : {}),
      updatedAt,
    })
    .where(eq(standReservations.id, reservation.id));

  if (!priceChanged) return;

  const invoiceRows = await tx
    .select({ id: invoices.id, discountAmount: invoices.discountAmount })
    .from(invoices)
    .where(eq(invoices.reservationId, reservation.id));

  for (const invoice of invoiceRows) {
    const discountAmount = Math.min(
      nextPriceSnapshot,
      roundMoney(invoice.discountAmount),
    );
    await tx
      .update(invoices)
      .set({
        originalAmount: nextPriceSnapshot,
        discountAmount,
        amount: roundMoney(nextPriceSnapshot - discountAmount),
        updatedAt,
      })
      .where(eq(invoices.id, invoice.id));
  }
}

async function previewReservationWriteSet(tx: DbTx, reservationId: number) {
  const [reservation] = await tx
    .select({
      id: standReservations.id,
      standId: standReservations.standId,
      festivalId: standReservations.festivalId,
      ownerUserId: standReservations.ownerUserId,
      status: standReservations.status,
    })
    .from(standReservations)
    .where(eq(standReservations.id, reservationId))
    .limit(1);
  if (!reservation) return null;

  const participantIds = await readReservationParticipantIds(
    tx,
    reservation.id,
  );
  const invoiceRows = await tx
    .select({ id: invoices.id, userId: invoices.userId })
    .from(invoices)
    .where(eq(invoices.reservationId, reservation.id));
  const taskRows = await tx
    .select({ id: scheduledTasks.id })
    .from(scheduledTasks)
    .where(eq(scheduledTasks.reservationId, reservation.id));

  const userIds = uniqueSortedIds([
    ...participantIds,
    ...(reservation.ownerUserId != null ? [reservation.ownerUserId] : []),
    ...invoiceRows.map((row) => row.userId),
  ]);

  return {
    reservation,
    participantIds,
    invoiceIds: invoiceRows.map((row) => row.id),
    scheduledTaskIds: taskRows.map((row) => row.id),
    userIds,
  };
}

export async function applyReservationCancellation(
  tx: DbTx,
  input: {
    reservation: CancellationReservation;
    actorUserId: number;
    eventType: ReservationEventType;
    reason?: string;
    payload?: Record<string, unknown> | null;
    participantUserIds?: readonly number[];
  },
): Promise<number[]> {
  const userIds =
    input.participantUserIds !== undefined
      ? [...input.participantUserIds]
      : await readReservationParticipantIds(tx, input.reservation.id);

  await tx
    .delete(scheduledTasks)
    .where(eq(scheduledTasks.reservationId, input.reservation.id));
  await tx
    .update(standReservations)
    .set({ status: "rejected", revealAt: null, updatedAt: new Date() })
    .where(eq(standReservations.id, input.reservation.id));
  await tx
    .update(invoices)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(invoices.reservationId, input.reservation.id));
  await releaseStandIfVacant(tx, input.reservation.standId);

  await insertStandReservationEvent(tx, {
    reservationId: input.reservation.id,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    fromStatus: input.reservation.status as ReservationStatus,
    toStatus: "rejected",
    payload: input.payload ?? (input.reason ? { reason: input.reason } : null),
  });

  const recipients =
    userIds.length === 0
      ? []
      : await tx
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds));

  const allowedRecipientIds = new Set(uniqueSortedIds(userIds));
  const jobIds: number[] = [];
  for (const recipient of recipients) {
    if (!allowedRecipientIds.has(recipient.id)) continue;
    const jobId = await enqueueReservationNotification(tx, {
      kind: "reservation_rejected",
      reservationId: input.reservation.id,
      userId: recipient.id,
      recipientEmail: recipient.email,
      payload: input.reason ? { reason: input.reason } : undefined,
    });
    if (jobId) jobIds.push(jobId);
  }
  return jobIds;
}

export async function lockAndApplyReservationCancellation(
  tx: DbTx,
  input: {
    reservationId: number;
    actorUserId: number;
    eventType: ReservationEventType;
    reason?: string;
    payload?: Record<string, unknown> | null;
  },
): Promise<{ ok: true; jobIds: number[] } | { ok: false; message: string }> {
  const preview = await previewReservationWriteSet(tx, input.reservationId);
  if (!preview) {
    return { ok: false as const, message: "La reserva no existe." };
  }

  const locked = await lockReservationAggregate(tx, {
    festivalId: preview.reservation.festivalId,
    userIds: preview.userIds,
    standIds: [preview.reservation.standId],
    reservationIds: [preview.reservation.id],
    invoiceIds: preview.invoiceIds,
    scheduledTaskIds: preview.scheduledTaskIds,
  });
  if (!locked.ok) {
    return {
      ok: false as const,
      message: RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY,
    };
  }

  const [reservation] = await tx
    .select()
    .from(standReservations)
    .where(eq(standReservations.id, input.reservationId))
    .limit(1)
    .for("update");
  if (!reservation) {
    return { ok: false as const, message: "La reserva no existe." };
  }
  if (reservation.status === "rejected") {
    return { ok: true as const, jobIds: [] as number[] };
  }

  const lockedUserIds = await readReservationParticipantIds(tx, reservation.id);
  if (!sameIdSet(preview.participantIds, lockedUserIds)) {
    return {
      ok: false as const,
      message: RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY,
    };
  }

  const jobIds = await applyReservationCancellation(tx, {
    reservation,
    actorUserId: input.actorUserId,
    eventType: input.eventType,
    reason: input.reason,
    payload: input.payload,
    participantUserIds: lockedUserIds,
  });
  return { ok: true as const, jobIds };
}

export async function cancelReservation(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      success: false,
      message: "No autorizado para cancelar la reserva.",
    };
  }
  const actorUserId = actor.id;

  const parsed = parseUnknown(cancelReservationSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  try {
    const outcome = await db.transaction(async (tx) =>
      lockAndApplyReservationCancellation(tx, {
        reservationId: parsed.data.reservationId,
        actorUserId,
        eventType: "deleted",
        reason: parsed.data.reason,
      }),
    );

    if (!outcome.ok) {
      return { success: false, message: outcome.message };
    }

    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return {
      success: true,
      message: "Reserva cancelada. El espacio quedó disponible.",
    };
  } catch (error) {
    console.error("Error cancelling reservation", error);
    return { success: false, message: "No se pudo cancelar la reserva." };
  }
}

export async function updateReservationPartner(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return { success: false, message: "No autorizado" };
  }

  const parsed = parseUnknown(updateReservationPartnerSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }

  const { reservationId, partnerUserId } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      const preview = await previewReservationWriteSet(tx, reservationId);
      if (!preview) {
        return { success: false as const, message: "La reserva no existe" };
      }

      const [ownerInvoice] = await tx
        .select({ userId: invoices.userId })
        .from(invoices)
        .where(eq(invoices.reservationId, preview.reservation.id))
        .limit(1);
      const ownerUserId =
        preview.reservation.ownerUserId ??
        ownerInvoice?.userId ??
        preview.participantIds[0];
      if (ownerUserId == null) {
        return {
          success: false as const,
          message: "La reserva no tiene un participante principal",
        };
      }

      const [stand] = await tx
        .select({ standCategory: stands.standCategory })
        .from(stands)
        .where(eq(stands.id, preview.reservation.standId))
        .limit(1);
      if (!stand) {
        return { success: false as const, message: "La reserva no existe" };
      }

      const userIds = uniqueSortedIds([
        ...preview.userIds,
        ...(partnerUserId != null ? [partnerUserId] : []),
      ]);

      const locked = await lockReservationAggregate(tx, {
        festivalId: preview.reservation.festivalId,
        userIds,
        standIds: [preview.reservation.standId],
        reservationIds: [preview.reservation.id],
        invoiceIds: preview.invoiceIds,
      });
      if (!locked.ok) {
        return {
          success: false as const,
          message: RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY,
        };
      }

      const [reservation] = await tx
        .select({
          id: standReservations.id,
          status: standReservations.status,
          standId: standReservations.standId,
          festivalId: standReservations.festivalId,
          ownerUserId: standReservations.ownerUserId,
          priceAmountSnapshot: standReservations.priceAmountSnapshot,
          individualPriceSnapshot: standReservations.individualPriceSnapshot,
          sharedPriceSnapshot: standReservations.sharedPriceSnapshot,
        })
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1)
        .for("update");
      if (!reservation) {
        return { success: false as const, message: "La reserva no existe" };
      }
      if (reservation.status === "rejected") {
        return {
          success: false as const,
          message: "No se puede editar una reserva rechazada",
        };
      }

      const lockedParticipantIds = await readReservationParticipantIds(
        tx,
        reservation.id,
      );
      if (!sameIdSet(preview.participantIds, lockedParticipantIds)) {
        return {
          success: false as const,
          message: RESERVATION_ERROR_MESSAGES.CONFLICT_RETRY,
        };
      }

      const partnerRows = lockedParticipantIds.filter(
        (userId) => userId !== ownerUserId,
      );

      if (partnerUserId != null) {
        const partnerBlocked = await assertReservationPartner(tx, {
          festivalId: reservation.festivalId,
          ownerUserId,
          partnerUserId,
          standCategory: stand.standCategory,
          existingParticipantUserIds: lockedParticipantIds,
          reservationId: reservation.id,
          mode: "admin",
          actor: { id: actor.id, role: actor.role },
        });
        if (partnerBlocked) {
          return {
            success: false as const,
            message: partnerBlocked.message,
          };
        }
      }

      const currentPartnerId = partnerRows[0] ?? null;
      let participantCount = lockedParticipantIds.length;
      if (partnerUserId == null) {
        if (partnerRows.length > 0) {
          await tx
            .delete(reservationParticipants)
            .where(
              and(
                eq(reservationParticipants.reservationId, reservation.id),
                ne(reservationParticipants.userId, ownerUserId),
              ),
            );
          participantCount -= partnerRows.length;
        }
      } else if (currentPartnerId === partnerUserId) {
        return { success: true as const };
      } else if (currentPartnerId != null) {
        await tx
          .update(reservationParticipants)
          .set({ userId: partnerUserId, updatedAt: new Date() })
          .where(
            and(
              eq(reservationParticipants.reservationId, reservation.id),
              eq(reservationParticipants.userId, currentPartnerId),
            ),
          );
      } else {
        await tx.insert(reservationParticipants).values({
          userId: partnerUserId,
          reservationId: reservation.id,
        });
        participantCount += 1;
      }

      await synchronizeReservationParticipantPricing(
        tx,
        reservation,
        participantCount,
      );

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "status_changed",
        fromStatus: reservation.status as ReservationStatus,
        toStatus: reservation.status as ReservationStatus,
        payload: { partnerUserId },
      });

      return { success: true as const };
    });

    if (!outcome.success) return outcome;

    revalidatePath("/dashboard/festivals/[id]/reservations", "page");
    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return { success: true, message: "Compañero actualizado" };
  } catch (error) {
    console.error("Error updating reservation partner", error);
    return { success: false, message: "Error al actualizar el compañero" };
  }
}

export async function extendReservationPaymentDeadline(
  input: unknown,
): Promise<{ success: boolean; message: string }> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return {
      success: false,
      message: "No tenés permisos para realizar esta acción",
    };
  }

  const parsed = parseUnknown(extendDeadlineSchema, input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos." };
  }
  const { reservationId, dueAt } = parsed.data;
  if (dueAt.getTime() <= Date.now()) {
    return { success: false, message: "La nueva fecha debe ser futura" };
  }

  const requestKey = `extendDeadline:${reservationId}:${dueAt.toISOString()}`;

  try {
    const { claimRequest, completeRequest, abandonRequest } = await import(
      "@/app/lib/reservations/request-registry"
    );
    const outcome = await db.transaction(async (tx) => {
      const claimPreview = await previewReservationWriteSet(tx, reservationId);
      if (claimPreview) {
        await lockParticipantsBeforeRegistryClaim(
          tx,
          claimPreview.reservation.festivalId,
          [...claimPreview.userIds, actor.id],
        );
      }

      const claim = await claimRequest(tx, {
        requestKey,
        operation: "extendReservationPaymentDeadline",
        actorUserId: actor.id,
        scope: { reservationId, dueAt: dueAt.toISOString() },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        return { ok: true as const, jobIds: [] as number[] };
      }

      const finish = async (
        result:
          | { ok: true; jobIds: number[] }
          | { ok: false; message: string }
          | ReturnType<typeof reservationFailure>,
      ) => {
        if ("success" in result && result.success === false) {
          await abandonRequest(tx, requestKey);
          return { ok: false as const, message: result.message };
        }
        if ("ok" in result && result.ok === false) {
          await abandonRequest(tx, requestKey);
          return result;
        }
        await completeRequest(tx, requestKey, { reservationId });
        return result as { ok: true; jobIds: number[] };
      };

      const preview = await previewReservationWriteSet(tx, reservationId);
      if (!preview) {
        return finish({ ok: false, message: "La reserva no existe" });
      }

      const locked = await lockReservationAggregate(tx, {
        festivalId: preview.reservation.festivalId,
        userIds: preview.userIds,
        standIds: [preview.reservation.standId],
        reservationIds: [preview.reservation.id],
        invoiceIds: preview.invoiceIds,
        scheduledTaskIds: preview.scheduledTaskIds,
      });
      if (!locked.ok) {
        return finish(reservationFailure("CONFLICT_RETRY"));
      }

      const [reservation] = await tx
        .select()
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1)
        .for("update");
      if (!reservation) {
        return finish({ ok: false, message: "La reserva no existe" });
      }
      if (reservation.status !== "pending") {
        return finish({
          ok: false,
          message: "Solo puedes extender reservas pendientes de pago",
        });
      }

      const lockedParticipantIds = await readReservationParticipantIds(
        tx,
        reservation.id,
      );
      if (!sameIdSet(preview.participantIds, lockedParticipantIds)) {
        return finish(reservationFailure("CONFLICT_RETRY"));
      }

      const invoiceRows = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.reservationId, reservation.id))
        .for("update");
      const pendingInvoices = invoiceRows.filter(
        (invoice) =>
          invoice.status === "pending" ||
          invoice.status === "verification_payment",
      );
      if (pendingInvoices.length === 0) {
        return finish({
          ok: false,
          message: "Solo puedes extender reservas pendientes de pago",
        });
      }

      const tasks = await tx
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.reservationId, reservation.id),
            eq(scheduledTasks.taskType, "stand_reservation"),
          ),
        )
        .for("update");
      const activeTask = tasks.find((task) => task.completedAt === null);
      if (activeTask && dueAt.getTime() <= activeTask.dueDate.getTime()) {
        return finish({
          ok: false,
          message: "La nueva fecha debe ser posterior a la fecha límite actual",
        });
      }

      const creatorId =
        reservation.ownerUserId ?? lockedParticipantIds[0] ?? null;
      if (creatorId == null) {
        return finish({
          ok: false,
          message: "La reserva no tiene un participante asociado",
        });
      }

      if (activeTask) {
        await tx
          .update(scheduledTasks)
          .set({
            dueDate: dueAt,
            reminderTime: new Date(dueAt.getTime() - 24 * 60 * 60 * 1000),
            reminderSentAt: null,
            ranAfterDueDate: false,
            updatedAt: sql`now()`,
          })
          .where(eq(scheduledTasks.id, activeTask.id));
      } else {
        await tx.insert(scheduledTasks).values({
          dueDate: dueAt,
          reminderTime: new Date(dueAt.getTime() - 24 * 60 * 60 * 1000),
          profileId: creatorId,
          reservationId: reservation.id,
          taskType: "stand_reservation",
        });
      }

      await tx
        .update(invoices)
        .set({ dueAt, updatedAt: new Date() })
        .where(
          and(
            eq(invoices.reservationId, reservation.id),
            inArray(invoices.status, ["pending", "verification_payment"]),
          ),
        );

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "deadline_extended",
        payload: { dueAt: dueAt.toISOString() },
        idempotencyKey: requestKey,
      });

      const recipients =
        lockedParticipantIds.length === 0
          ? []
          : await tx
              .select({ id: users.id, email: users.email })
              .from(users)
              .where(inArray(users.id, lockedParticipantIds));

      const jobIds: number[] = [];
      const seen = new Set<string>();
      for (const recipient of recipients) {
        const email = recipient.email?.trim();
        if (!email) continue;
        const key = email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const jobId = await enqueueReservationNotification(tx, {
          kind: "deadline_extended",
          reservationId: reservation.id,
          userId: recipient.id,
          recipientEmail: email,
          payload: { dueAt: dueAt.toISOString() },
          deduplicationKey: `deadline_extended:${reservation.id}:${dueAt.toISOString()}:${key}`,
        });
        if (jobId) jobIds.push(jobId);
      }

      return finish({ ok: true, jobIds });
    });

    if ("success" in outcome) {
      return { success: false, message: outcome.message };
    }
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
