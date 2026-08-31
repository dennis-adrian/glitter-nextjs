import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { fetchAdminUsers } from "@/app/api/users/actions";
import { applyReservationCancellation } from "@/app/lib/reservations/admin-service";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import { lockFestivalRow, lockParticipants, lockStandRows } from "@/app/lib/reservations/locks";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  enqueueAdminAndOwnerNotifications,
  scheduleReservationNotificationJobs,
} from "@/app/lib/reservations/notification-outbox";
import {
  canMutateAdminReservations,
  canSubmitInvoiceSettlement,
} from "@/app/lib/reservations/policy";
import {
  parseUnknown,
  rejectSettlementSchema,
  submissionIdSchema,
  submitPaymentProofSchema,
  submitZeroValueInvoiceSchema,
} from "@/app/lib/reservations/schemas";
import { enqueueStorageCleanupJob } from "@/app/lib/uploadthing/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  discountCodes,
  invoiceSettlementSubmissions,
  invoices,
  payments,
  reservationParticipants,
  scheduledTasks,
  standReservations,
  stands,
  users,
} from "@/db/schema";
import { revalidatePath } from "next/cache";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { id: number; role: string };

async function userEmail(tx: DbTx, userId: number) {
  const [row] = await tx
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ?? null;
}

function canAcceptInvoiceProof(status: string) {
  return status === "pending" || status === "verification_payment";
}

async function loadInvoiceAggregate(tx: DbTx, invoiceId: number) {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
    .for("update");
  if (!invoice) return null;

  const [reservation] = await tx
    .select()
    .from(standReservations)
    .where(eq(standReservations.id, invoice.reservationId))
    .limit(1)
    .for("update");
  if (!reservation) return null;

  await lockFestivalRow(tx, reservation.festivalId);
  await lockStandRows(tx, [reservation.standId]);
  await lockParticipants(tx, reservation.festivalId, [invoice.userId]);

  const participants = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservation.id));

  return { invoice, reservation, participants };
}

async function rejectOlderSubmittedSettlements(
  tx: DbTx,
  invoiceId: number,
  keepId?: number,
) {
  const submitted = await tx
    .select({ id: invoiceSettlementSubmissions.id })
    .from(invoiceSettlementSubmissions)
    .where(
      and(
        eq(invoiceSettlementSubmissions.invoiceId, invoiceId),
        eq(invoiceSettlementSubmissions.status, "submitted"),
      ),
    );
  for (const row of submitted) {
    if (keepId != null && row.id === keepId) continue;
    await tx
      .update(invoiceSettlementSubmissions)
      .set({
        status: "rejected",
        rejectionReason: "replaced",
        updatedAt: new Date(),
      })
      .where(eq(invoiceSettlementSubmissions.id, row.id));
  }
}

export async function submitPaymentProof(
  input: unknown,
  actorOverride?: Actor,
): Promise<ReservationActionResult<{ submissionId: number }>> {
  const actor = actorOverride ?? (await getCurrentUserProfile());
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  const parsed = parseUnknown(submitPaymentProofSchema, input);
  if (!parsed.success) return reservationFailure("VALIDATION");
  const { invoiceId, voucherUrl, fileKey, idempotencyKey } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      const aggregate = await loadInvoiceAggregate(tx, invoiceId);
      if (!aggregate) return reservationFailure("VALIDATION");
      const { invoice, reservation } = aggregate;

      if (
        !canSubmitInvoiceSettlement({
          actor: { id: actor.id, role: actor.role },
          invoiceOwnerUserId: invoice.userId,
        })
      ) {
        return reservationFailure("INVOICE_NOT_OWNED");
      }
      if (!canAcceptInvoiceProof(invoice.status)) {
        return reservationFailure("INVOICE_NOT_PENDING");
      }
      if (
        reservation.status !== "pending" &&
        reservation.status !== "verification_payment"
      ) {
        return reservationFailure("INVOICE_NOT_PENDING");
      }

      if (fileKey) {
        const [byFile] = await tx
          .select({ id: invoiceSettlementSubmissions.id })
          .from(invoiceSettlementSubmissions)
          .where(eq(invoiceSettlementSubmissions.fileKey, fileKey))
          .limit(1);
        if (byFile) {
          return { kind: "replayed" as const, submissionId: byFile.id };
        }
      }
      if (idempotencyKey) {
        const [existing] = await tx
          .select({ id: invoiceSettlementSubmissions.id })
          .from(invoiceSettlementSubmissions)
          .where(
            and(
              eq(invoiceSettlementSubmissions.idempotencyKey, idempotencyKey),
              eq(invoiceSettlementSubmissions.invoiceId, invoice.id),
              eq(invoiceSettlementSubmissions.uploadedByUserId, actor.id),
            ),
          )
          .limit(1);
        if (existing) {
          return { kind: "replayed" as const, submissionId: existing.id };
        }
      }

      const [currentPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, invoice.id))
        .orderBy(desc(payments.createdAt), desc(payments.id))
        .limit(1);

      let paymentId = currentPayment?.id;
      if (currentPayment) {
        await tx
          .update(payments)
          .set({
            amount: roundMoney(invoice.amount),
            date: new Date(),
            voucherUrl,
            fileKey: fileKey ?? currentPayment.fileKey,
            uploadedByUserId: actor.id,
            idempotencyKey: idempotencyKey ?? currentPayment.idempotencyKey,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, currentPayment.id));
      } else {
        const [payment] = await tx
          .insert(payments)
          .values({
            invoiceId: invoice.id,
            amount: roundMoney(invoice.amount),
            date: new Date(),
            voucherUrl,
            fileKey,
            uploadedByUserId: actor.id,
            idempotencyKey,
          })
          .returning({ id: payments.id });
        paymentId = payment.id;
      }

      await rejectOlderSubmittedSettlements(tx, invoice.id);

      const [submission] = await tx
        .insert(invoiceSettlementSubmissions)
        .values({
          invoiceId: invoice.id,
          paymentId,
          voucherUrl,
          fileKey,
          uploadedByUserId: actor.id,
          kind: "payment_proof",
          status: "submitted",
          evidenceSnapshot: {
            invoiceId: invoice.id,
            reservationId: reservation.id,
            standId: reservation.standId,
            festivalId: reservation.festivalId,
            amount: roundMoney(invoice.amount),
            originalAmount: roundMoney(invoice.originalAmount),
            discountAmount: roundMoney(invoice.discountAmount),
          },
          idempotencyKey: idempotencyKey ?? fileKey,
        })
        .returning({ id: invoiceSettlementSubmissions.id });

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "settlement_submitted",
        fromStatus: reservation.status,
        toStatus: "verification_payment",
        payload: {
          invoiceId: invoice.id,
          submissionId: submission.id,
          kind: "payment_proof",
        },
        idempotencyKey: idempotencyKey ?? fileKey ?? `proof:${submission.id}`,
      });

      await tx
        .update(standReservations)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(standReservations.id, reservation.id));
      await tx
        .update(invoices)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      const ownerEmail = await userEmail(tx, invoice.userId);
      const admins = await fetchAdminUsers();
      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "proof_submitted",
        reservationId: reservation.id,
        ownerUserId: invoice.userId,
        ownerEmail,
        adminEmails: admins.map((admin) => ({ id: admin.id, email: admin.email })),
        payload: { invoiceId: invoice.id, submissionId: submission.id },
      });

      return {
        kind: "created" as const,
        submissionId: submission.id,
        previousVoucherUrl: currentPayment?.voucherUrl,
        jobIds,
      };
    });

    if ("success" in outcome) return outcome;
    if (outcome.kind === "replayed") {
      return reservationSuccess(
        { submissionId: outcome.submissionId },
        "Ya enviamos un comprobante para esta factura. Esperá la revisión.",
      );
    }

    if (
      outcome.previousVoucherUrl &&
      outcome.previousVoucherUrl !== voucherUrl
    ) {
      try {
        await enqueueStorageCleanupJob({
          entityType: "invoice_voucher",
          entityId: invoiceId,
          fileUrl: outcome.previousVoucherUrl,
        });
      } catch {
        console.error("[submitPaymentProof] voucher cleanup enqueue failed", {
          invoiceId,
        });
      }
    }

    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/profiles");
    return reservationSuccess(
      { submissionId: outcome.submissionId },
      "Comprobante enviado. Tu reserva está en revisión.",
    );
  } catch (error) {
    console.error("Error submitting payment proof", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function submitZeroValueInvoiceForReview(
  input: unknown,
): Promise<ReservationActionResult<{ submissionId: number }>> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  const parsed = parseUnknown(submitZeroValueInvoiceSchema, input);
  if (!parsed.success) return reservationFailure("VALIDATION");

  try {
    const outcome = await db.transaction(async (tx) => {
      const aggregate = await loadInvoiceAggregate(tx, parsed.data.invoiceId);
      if (!aggregate) return reservationFailure("VALIDATION");
      const { invoice, reservation } = aggregate;

      if (
        !canSubmitInvoiceSettlement({
          actor: { id: actor.id, role: actor.role },
          invoiceOwnerUserId: invoice.userId,
        })
      ) {
        return reservationFailure("INVOICE_NOT_OWNED");
      }
      if (invoice.status === "verification_payment") {
        return reservationFailure("PAYMENT_ALREADY_SUBMITTED");
      }
      if (invoice.status !== "pending") {
        return reservationFailure("INVOICE_NOT_PENDING");
      }
      if (Number(invoice.amount) !== 0) {
        return reservationFailure("INVOICE_NOT_PENDING");
      }

      if (parsed.data.idempotencyKey) {
        const [existing] = await tx
          .select({ id: invoiceSettlementSubmissions.id })
          .from(invoiceSettlementSubmissions)
          .where(
            and(
              eq(
                invoiceSettlementSubmissions.idempotencyKey,
                parsed.data.idempotencyKey,
              ),
              eq(invoiceSettlementSubmissions.invoiceId, invoice.id),
            ),
          )
          .limit(1);
        if (existing) {
          return { kind: "replayed" as const, submissionId: existing.id, jobIds: [] };
        }
      }

      await rejectOlderSubmittedSettlements(tx, invoice.id);

      const [submission] = await tx
        .insert(invoiceSettlementSubmissions)
        .values({
          invoiceId: invoice.id,
          paymentId: null,
          uploadedByUserId: actor.id,
          kind: "zero_value_entitlement",
          status: "submitted",
          evidenceSnapshot: {
            invoiceId: invoice.id,
            reservationId: reservation.id,
            standId: reservation.standId,
            festivalId: reservation.festivalId,
            ownerUserId: invoice.userId,
            originalAmount: roundMoney(invoice.originalAmount),
            discountAmount: roundMoney(invoice.discountAmount),
            amount: 0,
            discountCodeId: invoice.discountCodeId,
          },
          idempotencyKey: parsed.data.idempotencyKey,
        })
        .returning({ id: invoiceSettlementSubmissions.id });

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "settlement_submitted",
        fromStatus: reservation.status,
        toStatus: "verification_payment",
        payload: {
          invoiceId: invoice.id,
          submissionId: submission.id,
          kind: "zero_value_entitlement",
        },
        idempotencyKey:
          parsed.data.idempotencyKey ?? `zero:${invoice.id}:${submission.id}`,
      });

      await tx
        .update(standReservations)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(standReservations.id, reservation.id));
      await tx
        .update(invoices)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      const ownerEmail = await userEmail(tx, invoice.userId);
      const admins = await fetchAdminUsers();
      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "zero_value_review_requested",
        reservationId: reservation.id,
        ownerUserId: invoice.userId,
        ownerEmail,
        adminEmails: admins.map((admin) => ({ id: admin.id, email: admin.email })),
        payload: { invoiceId: invoice.id, submissionId: submission.id },
      });

      return { kind: "created" as const, submissionId: submission.id, jobIds };
    });

    if ("success" in outcome) return outcome;
    if (outcome.kind === "replayed") {
      return reservationSuccess(
        { submissionId: outcome.submissionId },
        "Tu reserva está en revisión.",
      );
    }

    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/profiles");
    return reservationSuccess(
      { submissionId: outcome.submissionId },
      "Tu reserva está en revisión.",
    );
  } catch (error) {
    console.error("Error submitting zero-value invoice", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

async function applyAcceptedReservation(
  tx: DbTx,
  reservationId: number,
  standId: number,
  invoiceId: number,
  actorUserId: number,
) {
  const updatedReservations = await tx
    .update(standReservations)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(
      and(
        eq(standReservations.id, reservationId),
        sql`${standReservations.status} IN ('pending', 'verification_payment')`,
      ),
    )
    .returning({ id: standReservations.id });
  if (updatedReservations.length === 0) {
    throw new Error("reservation_status_conflict");
  }

  const updatedStands = await tx
    .update(stands)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(stands.id, standId))
    .returning({ id: stands.id });
  if (updatedStands.length === 0) {
    throw new Error("stand_missing");
  }

  await tx
    .update(scheduledTasks)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(scheduledTasks.reservationId, reservationId),
        eq(scheduledTasks.taskType, "stand_reservation"),
      ),
    );

  const updatedInvoices = await tx
    .update(invoices)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning({ id: invoices.id });
  if (updatedInvoices.length === 0) {
    throw new Error("invoice_missing");
  }

  await insertStandReservationEvent(tx, {
    reservationId,
    actorUserId,
    eventType: "settlement_approved",
    toStatus: "accepted",
    payload: { invoiceId },
  });
}

export async function approveInvoiceSettlement(
  input: unknown,
): Promise<ReservationActionResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return reservationFailure("UNAUTHORIZED");
  }
  const actorUserId = actor.id;

  const parsed = parseUnknown(submissionIdSchema, input);
  if (!parsed.success) return reservationFailure("VALIDATION");

  try {
    const outcome = await db.transaction(async (tx) => {
      const [submission] = await tx
        .select()
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.id, parsed.data.submissionId))
        .limit(1)
        .for("update");
      if (!submission) return reservationFailure("VALIDATION");
      if (submission.status === "approved") {
        return { kind: "replayed" as const, jobIds: [] as number[] };
      }
      if (submission.status !== "submitted") {
        return reservationFailure("INVOICE_NOT_PENDING");
      }

      const aggregate = await loadInvoiceAggregate(tx, submission.invoiceId);
      if (!aggregate) return reservationFailure("VALIDATION");
      const { invoice, reservation } = aggregate;

      if (submission.kind === "zero_value_entitlement") {
        if (Number(invoice.amount) !== 0 || submission.paymentId != null) {
          return reservationFailure("VALIDATION");
        }
      } else if (submission.paymentId == null) {
        return reservationFailure("VALIDATION");
      }

      await tx
        .update(invoiceSettlementSubmissions)
        .set({
          status: "approved",
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoiceSettlementSubmissions.id, submission.id));

      await applyAcceptedReservation(
        tx,
        reservation.id,
        reservation.standId,
        invoice.id,
        actorUserId,
      );

      const ownerEmail = await userEmail(tx, invoice.userId);
      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "settlement_approved",
        reservationId: reservation.id,
        ownerUserId: invoice.userId,
        ownerEmail,
        adminEmails: [],
        payload: { invoiceId: invoice.id, submissionId: submission.id },
      });
      return { kind: "approved" as const, jobIds };
    });

    if ("success" in outcome) return outcome;
    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals");
    revalidatePath("/profiles");
    return reservationSuccess(undefined, "La reserva fue confirmada.");
  } catch (error) {
    console.error("Error approving settlement", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function rejectInvoiceSettlement(
  input: unknown,
): Promise<ReservationActionResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return reservationFailure("UNAUTHORIZED");
  }
  const actorUserId = actor.id;

  const parsed = parseUnknown(rejectSettlementSchema, input);
  if (!parsed.success) return reservationFailure("VALIDATION");

  try {
    const outcome = await db.transaction(async (tx) => {
      const [submission] = await tx
        .select()
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.id, parsed.data.submissionId))
        .limit(1)
        .for("update");
      if (!submission) return reservationFailure("VALIDATION");
      if (submission.status !== "submitted") {
        return reservationFailure("INVOICE_NOT_PENDING");
      }

      const aggregate = await loadInvoiceAggregate(tx, submission.invoiceId);
      if (!aggregate) return reservationFailure("VALIDATION");
      const { invoice, reservation } = aggregate;

      if (submission.kind === "zero_value_entitlement") {
        const correctionType = parsed.data.correction.type;
        if (
          correctionType !== "restore_amount" &&
          correctionType !== "set_amount" &&
          correctionType !== "cancel_reservation"
        ) {
          return reservationFailure("VALIDATION");
        }
      }

      await tx
        .update(invoiceSettlementSubmissions)
        .set({
          status: "rejected",
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          rejectionReason: parsed.data.reason,
          updatedAt: new Date(),
        })
        .where(eq(invoiceSettlementSubmissions.id, submission.id));

      let cancelledJobIds: number[] | null = null;
      if (parsed.data.correction.type === "cancel_reservation") {
        cancelledJobIds = await applyReservationCancellation(tx, {
          reservation,
          actorUserId,
          eventType: "settlement_rejected",
          reason: parsed.data.reason,
          payload: {
            invoiceId: invoice.id,
            submissionId: submission.id,
            correction: "cancel_reservation",
          },
        });
      } else {
        if (parsed.data.correction.type === "restore_amount") {
          if (invoice.discountCodeId != null) {
            await tx
              .update(discountCodes)
              .set({
                currentUses: sql`GREATEST(${discountCodes.currentUses} - 1, 0)`,
                updatedAt: new Date(),
              })
              .where(eq(discountCodes.id, invoice.discountCodeId));
          }
          await tx
            .update(invoices)
            .set({
              amount: invoice.originalAmount,
              discountAmount: 0,
              discountCodeId: null,
              status: "pending",
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoice.id));
        } else if (parsed.data.correction.type === "set_amount") {
          await tx
            .update(invoices)
            .set({
              amount: roundMoney(parsed.data.correction.amount),
              status: "pending",
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoice.id));
        } else {
          await tx
            .update(invoices)
            .set({ status: "pending", updatedAt: new Date() })
            .where(eq(invoices.id, invoice.id));
        }

        await tx
          .update(standReservations)
          .set({ status: "pending", updatedAt: new Date() })
          .where(eq(standReservations.id, reservation.id));
        await insertStandReservationEvent(tx, {
          reservationId: reservation.id,
          actorUserId,
          eventType: "settlement_rejected",
          fromStatus: reservation.status,
          toStatus: "pending",
          payload: {
            invoiceId: invoice.id,
            submissionId: submission.id,
            correction: parsed.data.correction.type,
          },
        });
      }

      if (cancelledJobIds) {
        return { jobIds: cancelledJobIds };
      }

      const ownerEmail = await userEmail(tx, invoice.userId);
      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "settlement_rejected",
        reservationId: reservation.id,
        ownerUserId: invoice.userId,
        ownerEmail,
        adminEmails: [],
        payload: { invoiceId: invoice.id, submissionId: submission.id },
      });
      return { jobIds };
    });

    if ("success" in outcome) return outcome;
    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals");
    revalidatePath("/profiles");
    return reservationSuccess(undefined, "La solicitud fue rechazada.");
  } catch (error) {
    console.error("Error rejecting settlement", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function findSubmittedSettlementId(invoiceId: number) {
  const [row] = await db
    .select({ id: invoiceSettlementSubmissions.id })
    .from(invoiceSettlementSubmissions)
    .where(
      and(
        eq(invoiceSettlementSubmissions.invoiceId, invoiceId),
        eq(invoiceSettlementSubmissions.status, "submitted"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
