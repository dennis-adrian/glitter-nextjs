import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { fetchAdminUsers } from "@/app/api/users/actions";
import { applyReservationCancellation } from "@/app/lib/reservations/admin-service";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
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
  adminConfirmReservationSchema,
  correctSettlementProofSchema,
  parseUnknown,
  rejectSettlementSchema,
  submissionIdSchema,
  submitPaymentProofSchema,
  submitZeroValueInvoiceSchema,
} from "@/app/lib/reservations/schemas";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
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

async function lockInvoiceClaimKeys(
  tx: DbTx,
  invoiceId: number,
  extraUserIds: readonly number[] = [],
) {
  const [invoice] = await tx
    .select({
      userId: invoices.userId,
      reservationId: invoices.reservationId,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) return;
  const [reservation] = await tx
    .select({ festivalId: standReservations.festivalId })
    .from(standReservations)
    .where(eq(standReservations.id, invoice.reservationId))
    .limit(1);
  if (!reservation) return;
  const participantPreview = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, invoice.reservationId));
  await lockParticipantsBeforeRegistryClaim(tx, reservation.festivalId, [
    invoice.userId,
    ...participantPreview.map((row) => row.userId),
    ...extraUserIds,
  ]);
}

type InvoiceAggregateOk = {
  kind: "ok";
  invoice: typeof invoices.$inferSelect;
  reservation: typeof standReservations.$inferSelect;
  participants: Array<{ userId: number }>;
};

async function loadInvoiceAggregate(
  tx: DbTx,
  invoiceId: number,
): Promise<InvoiceAggregateOk | { kind: "missing" } | { kind: "conflict" }> {
  const [invoicePreview] = await tx
    .select({
      id: invoices.id,
      userId: invoices.userId,
      reservationId: invoices.reservationId,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoicePreview) return { kind: "missing" };

  const [reservationPreview] = await tx
    .select({
      id: standReservations.id,
      festivalId: standReservations.festivalId,
      standId: standReservations.standId,
      ownerUserId: standReservations.ownerUserId,
    })
    .from(standReservations)
    .where(eq(standReservations.id, invoicePreview.reservationId))
    .limit(1);
  if (!reservationPreview) return { kind: "missing" };

  const participantPreview = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservationPreview.id));
  const paymentPreview = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.invoiceId, invoicePreview.id));
  const submissionPreview = await tx
    .select({ id: invoiceSettlementSubmissions.id })
    .from(invoiceSettlementSubmissions)
    .where(eq(invoiceSettlementSubmissions.invoiceId, invoicePreview.id));

  const userIds = uniqueSortedIds([
    invoicePreview.userId,
    ...participantPreview.map((row) => row.userId),
    ...(reservationPreview.ownerUserId != null
      ? [reservationPreview.ownerUserId]
      : []),
  ]);

  const locked = await lockReservationAggregate(tx, {
    festivalId: reservationPreview.festivalId,
    userIds,
    standIds: [reservationPreview.standId],
    reservationIds: [reservationPreview.id],
    invoiceIds: [invoicePreview.id],
    paymentIds: paymentPreview.map((row) => row.id),
    submissionIds: submissionPreview.map((row) => row.id),
  });
  if (!locked.ok) return { kind: "conflict" };

  const [reservation] = await tx
    .select()
    .from(standReservations)
    .where(eq(standReservations.id, reservationPreview.id))
    .limit(1)
    .for("update");
  if (!reservation) return { kind: "missing" };

  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1)
    .for("update");
  if (!invoice) return { kind: "missing" };

  if (
    invoice.reservationId !== reservation.id ||
    reservation.festivalId !== reservationPreview.festivalId ||
    reservation.standId !== reservationPreview.standId ||
    invoice.userId !== invoicePreview.userId
  ) {
    return { kind: "conflict" };
  }

  const participants = await tx
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservation.id));
  const lockedUserIds = uniqueSortedIds([
    invoice.userId,
    ...participants.map((row) => row.userId),
    ...(reservation.ownerUserId != null ? [reservation.ownerUserId] : []),
  ]);
  if (!locked.locked.userIds.every((id) => lockedUserIds.includes(id))) {
    return { kind: "conflict" };
  }
  if (lockedUserIds.length !== locked.locked.userIds.length) {
    return { kind: "conflict" };
  }

  return { kind: "ok", invoice, reservation, participants };
}

function aggregateUnavailable(
  aggregate: Awaited<ReturnType<typeof loadInvoiceAggregate>>,
) {
  if (aggregate.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
  return reservationFailure("VALIDATION");
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
  const requestKey = idempotencyKey ?? fileKey;

  try {
    const outcome = await db.transaction(async (tx) => {
      await lockInvoiceClaimKeys(tx, invoiceId, [actor.id]);
      const claim = await claimRequest(tx, {
        requestKey,
        operation: "submitPaymentProof",
        actorUserId: actor.id,
        scope: {
          invoiceId,
          kind: "payment_proof",
          fileKey,
        },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        const submissionId = claim.resultIds.submissionId;
        if (typeof submissionId !== "number") {
          return reservationFailure("CONFLICT_RETRY");
        }
        return { kind: "replayed" as const, submissionId };
      }

      const finishCreated = async (
        created:
          | { kind: "replayed"; submissionId: number }
          | {
              kind: "created";
              submissionId: number;
              previousVoucherUrl?: string | null;
              jobIds: number[];
            }
          | ReturnType<typeof reservationFailure>,
      ) => {
        if ("success" in created && created.success === false) {
          await abandonRequest(tx, requestKey);
          return created;
        }
        if ("kind" in created) {
          await completeRequest(tx, requestKey, {
            submissionId: created.submissionId,
          });
        }
        return created;
      };

      const aggregate = await loadInvoiceAggregate(tx, invoiceId);
      if (aggregate.kind !== "ok") {
        return finishCreated(aggregateUnavailable(aggregate));
      }
      const { invoice, reservation } = aggregate;

      if (
        !canSubmitInvoiceSettlement({
          actor: { id: actor.id, role: actor.role },
          invoiceOwnerUserId: invoice.userId,
        })
      ) {
        return finishCreated(reservationFailure("INVOICE_NOT_OWNED"));
      }
      if (!canAcceptInvoiceProof(invoice.status)) {
        return finishCreated(reservationFailure("INVOICE_NOT_PENDING"));
      }
      if (
        reservation.status !== "pending" &&
        reservation.status !== "verification_payment"
      ) {
        return finishCreated(reservationFailure("INVOICE_NOT_PENDING"));
      }

      const [byFile] = await tx
        .select({ id: invoiceSettlementSubmissions.id })
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.fileKey, fileKey))
        .limit(1);
      if (byFile) {
        return finishCreated({
          kind: "replayed" as const,
          submissionId: byFile.id,
        });
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
            fileKey,
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

      return finishCreated({
        kind: "created" as const,
        submissionId: submission.id,
        previousVoucherUrl: currentPayment?.voucherUrl,
        jobIds,
      });
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
      const requestKey = parsed.data.idempotencyKey;
      await lockInvoiceClaimKeys(tx, parsed.data.invoiceId, [actor.id]);
      const claim = await claimRequest(tx, {
        requestKey,
        operation: "submitZeroValueInvoice",
        actorUserId: actor.id,
        scope: {
          invoiceId: parsed.data.invoiceId,
          kind: "zero_value_entitlement",
        },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        const submissionId = claim.resultIds.submissionId;
        if (typeof submissionId !== "number") {
          return reservationFailure("CONFLICT_RETRY");
        }
        return { kind: "replayed" as const, submissionId, jobIds: [] as number[] };
      }

      const finish = async (
        created:
          | { kind: "replayed"; submissionId: number; jobIds: number[] }
          | { kind: "created"; submissionId: number; jobIds: number[] }
          | ReturnType<typeof reservationFailure>,
      ) => {
        if ("success" in created && created.success === false) {
          await abandonRequest(tx, requestKey);
          return created;
        }
        if ("kind" in created) {
          await completeRequest(tx, requestKey, {
            submissionId: created.submissionId,
          });
        }
        return created;
      };

      const aggregate = await loadInvoiceAggregate(tx, parsed.data.invoiceId);
      if (aggregate.kind !== "ok") {
        return finish(aggregateUnavailable(aggregate));
      }
      const { invoice, reservation } = aggregate;

      if (
        !canSubmitInvoiceSettlement({
          actor: { id: actor.id, role: actor.role },
          invoiceOwnerUserId: invoice.userId,
        })
      ) {
        return finish(reservationFailure("INVOICE_NOT_OWNED"));
      }
      if (invoice.status === "verification_payment") {
        return finish(reservationFailure("PAYMENT_ALREADY_SUBMITTED"));
      }
      if (invoice.status !== "pending") {
        return finish(reservationFailure("INVOICE_NOT_PENDING"));
      }
      if (Number(invoice.amount) !== 0) {
        return finish(reservationFailure("INVOICE_NOT_PENDING"));
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

      return finish({ kind: "created" as const, submissionId: submission.id, jobIds });
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

async function approveSubmissionInTx(
  tx: DbTx,
  submission: {
    id: number;
    invoiceId: number;
    kind: string;
    paymentId: number | null;
    status: string;
  },
  actorUserId: number,
) {
  if (submission.status === "approved") {
    return { kind: "replayed" as const, jobIds: [] as number[] };
  }
  if (submission.status !== "submitted") {
    return reservationFailure("INVOICE_NOT_PENDING");
  }

  const aggregate = await loadInvoiceAggregate(tx, submission.invoiceId);
  if (aggregate.kind !== "ok") return aggregateUnavailable(aggregate);
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
  return {
    kind: "approved" as const,
    jobIds,
    reservationId: reservation.id,
    invoiceId: invoice.id,
    submissionId: submission.id,
  };
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
      const [submissionPreview] = await tx
        .select({
          id: invoiceSettlementSubmissions.id,
          invoiceId: invoiceSettlementSubmissions.invoiceId,
        })
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.id, parsed.data.submissionId))
        .limit(1);
      if (!submissionPreview) return reservationFailure("VALIDATION");

      const aggregate = await loadInvoiceAggregate(
        tx,
        submissionPreview.invoiceId,
      );
      if (aggregate.kind !== "ok") return aggregateUnavailable(aggregate);

      const [submission] = await tx
        .select()
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.id, parsed.data.submissionId))
        .limit(1)
        .for("update");
      if (!submission) return reservationFailure("VALIDATION");

      const approved = await approveSubmissionInTx(tx, submission, actorUserId);
      if ("success" in approved) return approved;
      return { kind: approved.kind, jobIds: approved.jobIds };
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
      const [submissionPreview] = await tx
        .select({ invoiceId: invoiceSettlementSubmissions.invoiceId })
        .from(invoiceSettlementSubmissions)
        .where(eq(invoiceSettlementSubmissions.id, parsed.data.submissionId))
        .limit(1);
      if (!submissionPreview) return reservationFailure("VALIDATION");

      const aggregate = await loadInvoiceAggregate(
        tx,
        submissionPreview.invoiceId,
      );
      if (aggregate.kind !== "ok") return aggregateUnavailable(aggregate);

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
        // This command is the admin's explicit resolution of the submitted
        // proof. The shared cancellation path otherwise preserves invoices
        // whenever payment evidence exists for separate admin handling.
        await tx
          .update(invoices)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(invoices.id, invoice.id));
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

async function findSubmittedSettlementInTx(tx: DbTx, invoiceId: number) {
  const [row] = await tx
    .select()
    .from(invoiceSettlementSubmissions)
    .where(
      and(
        eq(invoiceSettlementSubmissions.invoiceId, invoiceId),
        eq(invoiceSettlementSubmissions.status, "submitted"),
      ),
    )
    .limit(1)
    .for("update");
  return row ?? null;
}

async function insertZeroValueSubmissionInTx(
  tx: DbTx,
  input: {
    invoice: typeof invoices.$inferSelect;
    reservation: typeof standReservations.$inferSelect;
    actorUserId: number;
    idempotencyKey: string;
  },
) {
  await rejectOlderSubmittedSettlements(tx, input.invoice.id);
  const [submission] = await tx
    .insert(invoiceSettlementSubmissions)
    .values({
      invoiceId: input.invoice.id,
      paymentId: null,
      uploadedByUserId: input.actorUserId,
      kind: "zero_value_entitlement",
      status: "submitted",
      evidenceSnapshot: {
        invoiceId: input.invoice.id,
        reservationId: input.reservation.id,
        standId: input.reservation.standId,
        festivalId: input.reservation.festivalId,
        ownerUserId: input.invoice.userId,
        originalAmount: roundMoney(input.invoice.originalAmount),
        discountAmount: roundMoney(input.invoice.discountAmount),
        amount: 0,
        discountCodeId: input.invoice.discountCodeId,
      },
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  await insertStandReservationEvent(tx, {
    reservationId: input.reservation.id,
    actorUserId: input.actorUserId,
    eventType: "settlement_submitted",
    fromStatus: input.reservation.status,
    toStatus: "verification_payment",
    payload: {
      invoiceId: input.invoice.id,
      submissionId: submission.id,
      kind: "zero_value_entitlement",
    },
    idempotencyKey: input.idempotencyKey,
  });

  await tx
    .update(standReservations)
    .set({ status: "verification_payment", updatedAt: new Date() })
    .where(eq(standReservations.id, input.reservation.id));
  await tx
    .update(invoices)
    .set({ status: "verification_payment", updatedAt: new Date() })
    .where(eq(invoices.id, input.invoice.id));

  return submission;
}

async function insertPaymentProofSubmissionInTx(
  tx: DbTx,
  input: {
    invoice: typeof invoices.$inferSelect;
    reservation: typeof standReservations.$inferSelect;
    actorUserId: number;
    voucherUrl: string;
    fileKey: string;
    idempotencyKey: string;
  },
) {
  const [currentPayment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, input.invoice.id))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(1);

  let paymentId = currentPayment?.id;
  if (currentPayment) {
    await tx
      .update(payments)
      .set({
        amount: roundMoney(input.invoice.amount),
        date: new Date(),
        voucherUrl: input.voucherUrl,
        fileKey: input.fileKey,
        uploadedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, currentPayment.id));
  } else {
    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: input.invoice.id,
        amount: roundMoney(input.invoice.amount),
        date: new Date(),
        voucherUrl: input.voucherUrl,
        fileKey: input.fileKey,
        uploadedByUserId: input.actorUserId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: payments.id });
    paymentId = payment.id;
  }

  await rejectOlderSubmittedSettlements(tx, input.invoice.id);
  const [submission] = await tx
    .insert(invoiceSettlementSubmissions)
    .values({
      invoiceId: input.invoice.id,
      paymentId,
      voucherUrl: input.voucherUrl,
      fileKey: input.fileKey,
      uploadedByUserId: input.actorUserId,
      kind: "payment_proof",
      status: "submitted",
      evidenceSnapshot: {
        invoiceId: input.invoice.id,
        reservationId: input.reservation.id,
        standId: input.reservation.standId,
        festivalId: input.reservation.festivalId,
        amount: roundMoney(input.invoice.amount),
        originalAmount: roundMoney(input.invoice.originalAmount),
        discountAmount: roundMoney(input.invoice.discountAmount),
      },
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  await insertStandReservationEvent(tx, {
    reservationId: input.reservation.id,
    actorUserId: input.actorUserId,
    eventType: "settlement_submitted",
    fromStatus: input.reservation.status,
    toStatus: "verification_payment",
    payload: {
      invoiceId: input.invoice.id,
      submissionId: submission.id,
      kind: "payment_proof",
    },
    idempotencyKey: input.idempotencyKey,
  });

  await tx
    .update(standReservations)
    .set({ status: "verification_payment", updatedAt: new Date() })
    .where(eq(standReservations.id, input.reservation.id));
  await tx
    .update(invoices)
    .set({ status: "verification_payment", updatedAt: new Date() })
    .where(eq(invoices.id, input.invoice.id));

  return submission;
}

export async function adminConfirmReservation(
  input: unknown,
): Promise<ReservationActionResult<{ reservationId: number; invoiceId: number }>> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return reservationFailure("UNAUTHORIZED");
  }

  const parsed = parseUnknown(adminConfirmReservationSchema, input);
  if (!parsed.success) return reservationFailure("VALIDATION");
  const { invoiceId, idempotencyKey, markAsPaid } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      await lockInvoiceClaimKeys(tx, invoiceId, [actor.id]);
      const claim = await claimRequest(tx, {
        requestKey: idempotencyKey,
        operation: "adminConfirmReservation",
        actorUserId: actor.id,
        scope: {
          invoiceId,
          markAsPaid: markAsPaid === true,
        },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        const reservationId = claim.resultIds.reservationId;
        const replayedInvoiceId = claim.resultIds.invoiceId;
        if (
          typeof reservationId !== "number" ||
          typeof replayedInvoiceId !== "number"
        ) {
          return reservationFailure("CONFLICT_RETRY");
        }
        return {
          kind: "replayed" as const,
          reservationId,
          invoiceId: replayedInvoiceId,
          jobIds: [] as number[],
        };
      }

      const finish = async (
        created:
          | {
              kind: "replayed" | "approved";
              reservationId: number;
              invoiceId: number;
              jobIds: number[];
            }
          | ReturnType<typeof reservationFailure>,
      ) => {
        if ("success" in created && created.success === false) {
          await abandonRequest(tx, idempotencyKey);
          return created;
        }
        if ("kind" in created) {
          await completeRequest(tx, idempotencyKey, {
            reservationId: created.reservationId,
            invoiceId: created.invoiceId,
          });
        }
        return created;
      };

      const aggregate = await loadInvoiceAggregate(tx, invoiceId);
      if (aggregate.kind !== "ok") {
        return finish(aggregateUnavailable(aggregate));
      }
      const { invoice, reservation } = aggregate;

      if (
        reservation.status === "accepted" &&
        invoice.status === "paid"
      ) {
        return finish({
          kind: "replayed",
          reservationId: reservation.id,
          invoiceId: invoice.id,
          jobIds: [],
        });
      }

      let submission = await findSubmittedSettlementInTx(tx, invoice.id);

      if (!submission && Number(invoice.amount) === 0) {
        submission = await insertZeroValueSubmissionInTx(tx, {
          invoice,
          reservation,
          actorUserId: actor.id,
          idempotencyKey,
        });
      }

      if (!submission) {
        const [currentPayment] = await tx
          .select({
            voucherUrl: payments.voucherUrl,
            fileKey: payments.fileKey,
          })
          .from(payments)
          .where(
            and(
              eq(payments.invoiceId, invoice.id),
              isNotNull(payments.fileKey),
            ),
          )
          .orderBy(desc(payments.createdAt), desc(payments.id))
          .limit(1);
        const proofUrl = currentPayment?.voucherUrl ?? null;
        const fileKey = currentPayment?.fileKey ?? null;
        if (markAsPaid === true || proofUrl) {
          if (!proofUrl || !fileKey) {
            return finish(reservationFailure("VALIDATION"));
          }
          submission = await insertPaymentProofSubmissionInTx(tx, {
            invoice,
            reservation,
            actorUserId: actor.id,
            voucherUrl: proofUrl,
            fileKey,
            idempotencyKey,
          });
        }
      }

      if (!submission) {
        return finish(reservationFailure("INVOICE_NOT_PENDING"));
      }

      const approved = await approveSubmissionInTx(tx, submission, actor.id);
      if ("success" in approved) return finish(approved);
      if (approved.kind === "replayed") {
        return finish({
          kind: "replayed",
          reservationId: reservation.id,
          invoiceId: invoice.id,
          jobIds: approved.jobIds,
        });
      }
      return finish({
        kind: "approved",
        reservationId: approved.reservationId,
        invoiceId: approved.invoiceId,
        jobIds: approved.jobIds,
      });
    });

    if ("success" in outcome) return outcome;
    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals");
    revalidatePath("/profiles");
    return reservationSuccess(
      { reservationId: outcome.reservationId, invoiceId: outcome.invoiceId },
      "La reserva fue confirmada.",
    );
  } catch (error) {
    console.error("Error confirming reservation as admin", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function correctSettlementProof(
  input: unknown,
): Promise<ReservationActionResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return reservationFailure("UNAUTHORIZED");
  }

  const parsed = parseUnknown(correctSettlementProofSchema, input);
  if (!parsed.success) return reservationFailure("VALIDATION");
  const { invoiceId, reason, idempotencyKey } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      await lockInvoiceClaimKeys(tx, invoiceId, [actor.id]);

      const [targetSubmission] = await tx
        .select({ id: invoiceSettlementSubmissions.id })
        .from(invoiceSettlementSubmissions)
        .where(
          and(
            eq(invoiceSettlementSubmissions.invoiceId, invoiceId),
            eq(invoiceSettlementSubmissions.status, "submitted"),
          ),
        )
        .orderBy(
          desc(invoiceSettlementSubmissions.id),
          desc(invoiceSettlementSubmissions.createdAt),
        )
        .limit(1);

      const requestKey = `correctSettlementProof:${invoiceId}:${idempotencyKey}`;
      const claim = await claimRequest(tx, {
        requestKey,
        operation: "correctSettlementProof",
        actorUserId: actor.id,
        scope: {
          invoiceId,
          idempotencyKey,
          submissionId: targetSubmission?.id ?? null,
        },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        return { kind: "replayed" as const, jobIds: [] as number[] };
      }

      const finish = async (
        created:
          | { kind: "replayed" | "corrected"; jobIds: number[] }
          | ReturnType<typeof reservationFailure>,
      ) => {
        if ("success" in created && created.success === false) {
          await abandonRequest(tx, requestKey);
          return created;
        }
        if ("kind" in created) {
          await completeRequest(tx, requestKey, { invoiceId });
        }
        return created;
      };

      const aggregate = await loadInvoiceAggregate(tx, invoiceId);
      if (aggregate.kind !== "ok") {
        return finish(aggregateUnavailable(aggregate));
      }
      const { invoice, reservation } = aggregate;

      if (reservation.status === "accepted" && invoice.status === "paid") {
        return finish(reservationFailure("INVOICE_NOT_PENDING"));
      }

      const submitted = await tx
        .select()
        .from(invoiceSettlementSubmissions)
        .where(
          and(
            eq(invoiceSettlementSubmissions.invoiceId, invoice.id),
            eq(invoiceSettlementSubmissions.status, "submitted"),
          ),
        );
      const [latestPayment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, invoice.id))
        .orderBy(desc(payments.createdAt), desc(payments.id))
        .limit(1);

      if (
        submitted.length === 0 &&
        invoice.status === "pending" &&
        reservation.status === "pending"
      ) {
        return finish({ kind: "replayed", jobIds: [] });
      }

      for (const row of submitted) {
        await tx
          .update(invoiceSettlementSubmissions)
          .set({
            status: "rejected",
            reviewedByUserId: actor.id,
            reviewedAt: new Date(),
            rejectionReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(invoiceSettlementSubmissions.id, row.id));
      }

      if (latestPayment?.fileKey) {
        await tx
          .update(payments)
          .set({ fileKey: null, updatedAt: new Date() })
          .where(eq(payments.id, latestPayment.id));
      }

      await tx
        .update(standReservations)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(standReservations.id, reservation.id));
      await tx
        .update(invoices)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      await insertStandReservationEvent(tx, {
        reservationId: reservation.id,
        actorUserId: actor.id,
        eventType: "settlement_rejected",
        fromStatus: reservation.status,
        toStatus: "pending",
        payload: {
          invoiceId: invoice.id,
          correction: "remove_proof",
          reason,
        },
        idempotencyKey,
      });

      const ownerEmail = await userEmail(tx, invoice.userId);
      const jobIds = await enqueueAdminAndOwnerNotifications(tx, {
        kind: "settlement_rejected",
        reservationId: reservation.id,
        ownerUserId: invoice.userId,
        ownerEmail,
        adminEmails: [],
        payload: { invoiceId: invoice.id, reason },
      });

      if (latestPayment?.voucherUrl) {
        await enqueueStorageCleanupJob(
          {
            entityType: "invoice_voucher",
            entityId: invoice.id,
            fileUrl: latestPayment.voucherUrl,
          },
          tx,
        );
      }

      return finish({ kind: "corrected", jobIds });
    });

    if ("success" in outcome) return outcome;
    scheduleReservationNotificationJobs(outcome.jobIds);
    revalidatePath("/dashboard/festivals");
    revalidatePath("/profiles");
    return reservationSuccess(
      undefined,
      "El comprobante fue rechazado. La reserva volvió a pendiente.",
    );
  } catch (error) {
    console.error("Error correcting settlement proof", error);
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

export async function findSubmittedSettlementInvoiceIdForReservation(
  reservationId: number,
) {
  const [row] = await db
    .select({ invoiceId: invoiceSettlementSubmissions.invoiceId })
    .from(invoiceSettlementSubmissions)
    .innerJoin(
      invoices,
      eq(invoices.id, invoiceSettlementSubmissions.invoiceId),
    )
    .where(
      and(
        eq(invoices.reservationId, reservationId),
        eq(invoiceSettlementSubmissions.status, "submitted"),
      ),
    )
    .orderBy(desc(invoiceSettlementSubmissions.createdAt))
    .limit(1);
  return row?.invoiceId ?? null;
}
