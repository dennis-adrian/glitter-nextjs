"use server";

import { fetchAdminUsers } from "@/app/api/users/actions";
import {
  InvoiceWithParticipants,
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  ReservationWithStandAndInvoicesAndFestival,
} from "@/app/data/invoices/definitions";
import PaymentConfirmationForAdminsEmailTemplate from "@/app/emails/payment-confirmation-for-admins";
import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
  invoices,
  invoiceSettlementSubmissions,
  payments,
  reservationParticipants,
  standReservations,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import {
  canSubmitInvoiceSettlement,
  canViewAdminReservationData,
  canViewInvoiceRecord,
} from "@/app/lib/reservations/policy";
import {
  invoiceIdSchema,
  parseUnknown,
  submitPaymentProofSchema,
} from "@/app/lib/reservations/schemas";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { roundMoney } from "@/app/lib/reservations/money";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { revalidatePath } from "next/cache";
import {
  confirmReservation,
  sendReservationConfirmationEmails,
} from "@/app/api/reservations/actions";
import {
  attemptStorageCleanupJob,
  enqueueStorageCleanupJob,
} from "@/app/lib/uploadthing/actions";
import { countOutstandingInvoices, canAcceptInvoiceProof } from "@/app/lib/payments/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";

export async function updateInvoiceStatus(
  invoiceId: number,
  status: InvoiceWithParticipants["status"],
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  if (!["pending", "verification_payment", "paid", "cancelled"].includes(status)) {
    return { success: false, message: "Estado de pago inválido." };
  }

  try {
    const result = await db
      .update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId))
      .returning({ id: invoices.id });

    if (result.length === 0) {
      return { success: false, message: "Pago no encontrado." };
    }

    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return { success: true, message: "Estado del pago actualizado." };
  } catch (error) {
    console.error("Error updating invoice status", error);
    return { success: false, message: "No se pudo actualizar el estado." };
  }
}

export async function adminAttachPaymentVoucher(
  invoiceId: number,
  voucherUrl: string,
  markAsPaid: boolean,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  let confirmationFailure: string | null = null;

  try {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        payments: {
          orderBy: [desc(payments.createdAt), desc(payments.id)],
          limit: 1,
        },
        user: true,
        reservation: {
          with: {
            stand: true,
            festival: { with: { festivalDates: true } },
            participants: { with: { user: true } },
          },
        },
      },
    });
    if (!invoice) {
      return { success: false, message: "Pago no encontrado." };
    }

    const currentPayment = invoice.payments[0];
    const standLabel = formatStandLabel(invoice.reservation.stand);
    const shouldConfirmReservation =
      markAsPaid && invoice.reservation.status !== "accepted";
    let cleanupJobId: number | undefined;

    await db.transaction(async (tx) => {
      let paymentId: number;
      if (currentPayment) {
        paymentId = currentPayment.id;
        // The previous voucher is orphaned in storage once we overwrite it;
        // enqueue a cleanup job so the old file is removed after commit.
        const previousVoucherUrl = currentPayment.voucherUrl;
        if (previousVoucherUrl && previousVoucherUrl !== voucherUrl) {
          const cleanupJob = await enqueueStorageCleanupJob(
            {
              entityType: "invoice_voucher",
              entityId: invoiceId,
              fileUrl: previousVoucherUrl,
            },
            tx,
          );
          cleanupJobId = cleanupJob.id;
        }

        await tx
          .update(payments)
          .set({
            amount: roundMoney(invoice.amount),
            date: new Date(),
            voucherUrl,
            uploadedByUserId: profile.id,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, currentPayment.id));
        await tx.insert(invoiceSettlementSubmissions).values({
          invoiceId,
          paymentId: currentPayment.id,
          voucherUrl,
          uploadedByUserId: profile.id,
        });
      } else {
        const [payment] = await tx
          .insert(payments)
          .values({
            invoiceId,
            amount: roundMoney(invoice.amount),
            date: new Date(),
            voucherUrl,
            uploadedByUserId: profile.id,
          })
          .returning({ id: payments.id });
        paymentId = payment.id;
        await tx.insert(invoiceSettlementSubmissions).values({
          invoiceId,
          paymentId: payment.id,
          voucherUrl,
          uploadedByUserId: profile.id,
        });
      }

      if (shouldConfirmReservation) {
        const confirmationResult = await confirmReservation(
          invoice.reservationId,
          invoice.reservation.standId,
          invoice.id,
          tx,
        );
        if (!confirmationResult.success) {
          confirmationFailure = confirmationResult.message;
          throw new Error(confirmationResult.message);
        }
      } else if (markAsPaid) {
        await tx
          .update(invoices)
          .set({ status: "paid", updatedAt: new Date() })
          .where(eq(invoices.id, invoiceId));
      } else if (invoice.status === "pending") {
        await insertStandReservationEvent(tx, {
          reservationId: invoice.reservationId,
          actorUserId: profile.id,
          eventType: "payment_submitted",
          fromStatus: invoice.reservation.status,
          toStatus: "verification_payment",
          payload: { invoiceId: invoice.id, paymentId },
        });

        await tx
          .update(standReservations)
          .set({ status: "verification_payment", updatedAt: new Date() })
          .where(
            and(
              eq(standReservations.id, invoice.reservationId),
              eq(standReservations.standId, invoice.reservation.standId),
            ),
          );

        await tx
          .update(invoices)
          .set({ status: "verification_payment", updatedAt: new Date() })
          .where(eq(invoices.id, invoiceId));
      }
    });

    if (cleanupJobId !== undefined) {
      // The voucher transaction already committed; a failed immediate cleanup
      // attempt must not fail the request or block the confirmation emails and
      // revalidation below. The job stays persisted for cron retry.
      try {
        await attemptStorageCleanupJob(cleanupJobId, { invoiceId });
      } catch (cleanupError) {
        console.error("Immediate storage cleanup attempt failed", {
          cleanupJobId,
          invoiceId,
          error: cleanupError,
        });
      }
    }

    if (shouldConfirmReservation) {
      await sendReservationConfirmationEmails({
        user: invoice.user,
        standLabel,
        festival: invoice.reservation.festival,
        participants: invoice.reservation.participants,
      });
    }

    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return { success: true, message: "Comprobante guardado correctamente." };
  } catch (error) {
    console.error("Error attaching payment voucher", error);
    if (confirmationFailure) {
      return { success: false, message: confirmationFailure };
    }
    return { success: false, message: "No se pudo guardar el comprobante." };
  }
}

export async function adminRemovePaymentVoucher(
  invoiceId: number,
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  try {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
      with: {
        payments: {
          orderBy: [desc(payments.createdAt), desc(payments.id)],
        },
      },
    });
    if (!invoice) {
      return { success: false, message: "Pago no encontrado." };
    }

    const targetPayment = invoice.payments.find(
      (payment) => payment.voucherUrl,
    );
    if (!targetPayment) {
      return { success: false, message: "El pago no tiene un comprobante." };
    }

    const voucherUrlToDelete = targetPayment.voucherUrl;
    let cleanupJobId: number | undefined;

    await db.transaction(async (tx) => {
      await tx.delete(payments).where(eq(payments.id, targetPayment.id));

      // Paid state is invoice-level, not derived from remaining payment rows.
      await tx
        .update(invoices)
        .set({
          status: "pending",
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId));

      // Persist outbox entry in the same transaction so the URL survives
      // immediate delete failures and can be retried asynchronously.
      const cleanupJob = await enqueueStorageCleanupJob(
        {
          entityType: "invoice_voucher",
          entityId: invoiceId,
          fileUrl: voucherUrlToDelete,
        },
        tx,
      );
      cleanupJobId = cleanupJob.id;
    });

    if (cleanupJobId !== undefined) {
      // The delete transaction already committed; a failed immediate cleanup
      // attempt must not fail the request or block revalidation below. The job
      // stays persisted for cron retry.
      try {
        await attemptStorageCleanupJob(cleanupJobId, { invoiceId });
      } catch (cleanupError) {
        console.error("Immediate storage cleanup attempt failed", {
          cleanupJobId,
          invoiceId,
          error: cleanupError,
        });
      }
    }

    revalidatePath("/dashboard/festivals/[id]/payments", "page");
    return { success: true, message: "Comprobante eliminado correctamente." };
  } catch (error) {
    console.error("Error removing payment voucher", error);
    return { success: false, message: "No se pudo eliminar el comprobante." };
  }
}

export async function fetchLatestInvoiceByProfileId(
  profileId: number,
): Promise<InvoiceWithPaymentsAndStand | undefined | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;
  if (
    actor.id !== profileId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return null;
  }
  try {
    return await db.query.invoices.findFirst({
      with: {
        payments: true,
        reservation: {
          with: {
            stand: true,
            festival: {
              with: {
                festivalDates: true,
              },
            },
            participants: {
              with: { user: true },
            },
          },
        },
        user: true,
      },
      orderBy: desc(invoices.createdAt),
      where: eq(invoices.userId, profileId),
    });
  } catch (error) {
    console.error("Error fetching latest invoice", error);
    return null;
  }
}

function normalizePaymentProofInput(input: unknown) {
  if (input && typeof input === "object" && "payment" in input) {
    const nested = input as {
      payment?: { invoiceId?: unknown; voucherUrl?: unknown };
    };
    return {
      invoiceId: nested.payment?.invoiceId,
      voucherUrl: nested.payment?.voucherUrl,
    };
  }
  return input;
}

export async function createPayment(
  input: unknown,
): Promise<ReservationActionResult> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  const parsed = parseUnknown(
    submitPaymentProofSchema,
    normalizePaymentProofInput(input),
  );
  if (!parsed.success) return reservationFailure("VALIDATION");

  const { invoiceId, voucherUrl, fileKey, idempotencyKey } = parsed.data;

  try {
    const outcome = await db.transaction(async (tx) => {
      const [lockedInvoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1)
        .for("update");
      if (!lockedInvoice) return reservationFailure("VALIDATION");

      const reservation = await tx.query.standReservations.findFirst({
        where: eq(standReservations.id, lockedInvoice.reservationId),
        with: {
          participants: true,
        },
      });
      if (!reservation) return reservationFailure("VALIDATION");

      const invoicePayments = await tx.query.payments.findMany({
        where: eq(payments.invoiceId, lockedInvoice.id),
        orderBy: [desc(payments.createdAt), desc(payments.id)],
      });

      const invoice = {
        ...lockedInvoice,
        payments: invoicePayments,
        reservation,
      };

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
        invoice.reservation.status !== "pending" &&
        invoice.reservation.status !== "verification_payment"
      ) {
        return reservationFailure("INVOICE_NOT_PENDING");
      }

      const currentPayment = invoice.payments[0];
      if (idempotencyKey) {
        const [existingSubmission] = await tx
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
        if (existingSubmission) {
          return { kind: "replayed" as const };
        }
      }

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
            idempotencyKey,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(payments.id, currentPayment.id),
              eq(payments.invoiceId, invoice.id),
            ),
          );
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

      await tx.insert(invoiceSettlementSubmissions).values({
        invoiceId: invoice.id,
        paymentId,
        voucherUrl,
        fileKey,
        uploadedByUserId: actor.id,
        idempotencyKey,
      });

      await insertStandReservationEvent(tx, {
        reservationId: invoice.reservationId,
        actorUserId: actor.id,
        eventType: "payment_submitted",
        fromStatus: invoice.reservation.status,
        toStatus: "verification_payment",
        payload: { invoiceId: invoice.id, paymentId: paymentId ?? null },
      });

      await tx
        .update(standReservations)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(
          and(
            eq(standReservations.id, invoice.reservationId),
            eq(standReservations.standId, invoice.reservation.standId),
          ),
        );

      await tx
        .update(invoices)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      return {
        kind: "created" as const,
        previousVoucherUrl: currentPayment?.voucherUrl,
        userId: invoice.userId,
      };
    });

    if ("success" in outcome) return outcome;
    if (outcome.kind === "replayed") {
      return reservationSuccess(
        undefined,
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
      } catch (error) {
        console.error("[createPayment] voucher cleanup enqueue failed", {
          invoiceId,
        });
      }
    }

    try {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoiceId),
        with: {
          payments: true,
          user: true,
          reservation: {
            with: {
              stand: true,
              festival: { with: { festivalDates: true } },
              participants: { with: { user: true } },
            },
          },
        },
      });
      if (invoice) {
        await sendEmail({
          to: [invoice.user.email],
          from: "Reservas Glitter <reservas@productoraglitter.com>",
          subject: "Tu pago ha sido registrado",
          react: PaymentConfirmationForUserEmailTemplate({ invoice }),
        });
        const admins = await fetchAdminUsers();
        const adminEmails = admins.map((admin) => admin.email).filter(Boolean);
        if (adminEmails.length > 0) {
          await sendEmail({
            to: [...adminEmails],
            from: "Reservas Glitter <reservas@productoraglitter.com>",
            subject: `${invoice.user.displayName} hizo el pago de su reserva`,
            react: PaymentConfirmationForAdminsEmailTemplate({ invoice }),
          });
        }
      }
    } catch (error) {
      console.error("[createPayment] post-commit notification failed", {
        invoiceId,
        actorId: actor.id,
      });
    }

    revalidatePath("/profiles");
    return {
      success: true,
      data: undefined,
      message: "Comprobante enviado. Tu reserva está en revisión.",
    };
  } catch (error) {
    console.error("Error creating payment", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function confirmFreeInvoice(
  input: unknown,
): Promise<ReservationActionResult> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  const nested =
    input && typeof input === "object" && "invoiceId" in input
      ? input
      : input;
  const parsed = parseUnknown(invoiceIdSchema, nested);
  if (!parsed.success) return reservationFailure("VALIDATION");

  try {
    const outcome = await db.transaction(async (tx) => {
      const invoice = await tx.query.invoices.findFirst({
        where: eq(invoices.id, parsed.data.invoiceId),
        with: {
          reservation: {
            with: { participants: true },
          },
        },
      });
      if (!invoice) return reservationFailure("VALIDATION");

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

      await tx
        .update(standReservations)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(standReservations.id, invoice.reservationId));

      await tx
        .update(invoices)
        .set({ status: "verification_payment", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      return { success: true as const, userId: invoice.userId };
    });

    if (!outcome.success) return outcome;

    try {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, parsed.data.invoiceId),
        with: {
          payments: true,
          user: true,
          reservation: {
            with: {
              stand: true,
              festival: { with: { festivalDates: true } },
              participants: { with: { user: true } },
            },
          },
        },
      });
      if (invoice) {
        await sendEmail({
          to: [invoice.user.email],
          from: "Reservas Glitter <reservas@productoraglitter.com>",
          subject: "Tu reserva está en revisión",
          react: PaymentConfirmationForUserEmailTemplate({ invoice }),
        });
        const admins = await fetchAdminUsers();
        const adminEmails = admins.map((admin) => admin.email).filter(Boolean);
        if (adminEmails.length > 0) {
          await sendEmail({
            to: [...adminEmails],
            from: "Reservas Glitter <reservas@productoraglitter.com>",
            subject: `${invoice.user.displayName} solicitó revisión de una reserva sin costo`,
            react: PaymentConfirmationForAdminsEmailTemplate({ invoice }),
          });
        }
      }
    } catch (error) {
      console.error("[confirmFreeInvoice] post-commit notification failed", {
        invoiceId: parsed.data.invoiceId,
        actorId: actor.id,
      });
    }

    revalidatePath("/profiles");
    return {
      success: true,
      data: undefined,
      message: "Tu reserva está en revisión.",
    };
  } catch (error) {
    console.error("Error confirming free invoice", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

export async function fetchInvoicesByReservation(
  reservationId: number,
): Promise<InvoiceWithPaymentsAndStand[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];

  try {
    const reservation = await db.query.standReservations.findFirst({
      where: eq(standReservations.id, reservationId),
      with: { participants: true },
    });
    if (!reservation) return [];

    const participantUserIds = reservation.participants.map((p) => p.userId);
    const invoicesForReservation = await db.query.invoices.findMany({
      with: {
        payments: true,
        reservation: {
          with: {
            stand: {
              with: {
                qrCode: true,
              },
            },
            festival: {
              with: {
                festivalDates: true,
              },
            },
          },
        },
      },
      where: eq(invoices.reservationId, reservationId),
    });

    return invoicesForReservation.filter((invoice) =>
      canViewInvoiceRecord({
        actor: { id: actor.id, role: actor.role },
        invoiceOwnerUserId: invoice.userId,
        participantUserIds,
      }),
    );
  } catch (error) {
    console.error("Error fetching invoices by reservation", error);
    return [];
  }
}

export async function fetchInvoice(
  id: number,
): Promise<InvoiceWithPaymentsAndStandAndProfile | undefined | null> {
  const actor = await getCurrentUserProfile();
  if (!actor) return null;

  try {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, id),
      with: {
        payments: true,
        reservation: {
          with: {
            stand: true,
            festival: {
              with: {
                festivalDates: true,
              },
            },
            participants: {
              with: { user: true },
            },
          },
        },
        user: true,
      },
    });
    if (!invoice) return null;
    if (
      !canViewInvoiceRecord({
        actor: { id: actor.id, role: actor.role },
        invoiceOwnerUserId: invoice.userId,
        participantUserIds: invoice.reservation.participants.map(
          (participant) => participant.userId,
        ),
      })
    ) {
      return null;
    }
    return invoice;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchReservationsWithInvoicesByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<ReservationWithStandAndInvoicesAndFestival[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];
  if (
    actor.id !== profileId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }
  try {
    const reservationIdsSubquery = db
      .select({ id: reservationParticipants.reservationId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.userId, profileId));

    return await db.query.standReservations.findMany({
      where: and(
        eq(standReservations.festivalId, festivalId),
        inArray(standReservations.id, reservationIdsSubquery),
      ),
      with: {
        stand: {
          with: {
            festivalSector: true,
          },
        },
        festival: {
          with: {
            festivalDates: true,
          },
        },
        invoices: {
          with: {
            payments: true,
            user: true,
          },
        },
      },
      orderBy: desc(standReservations.createdAt),
    });
  } catch (error) {
    console.error(
      "Error fetching reservations with invoices by profile and festival",
      error,
    );
    return [];
  }
}

export async function fetchOutstandingInvoiceCountByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<{ reservationCount: number; outstandingInvoiceCount: number }> {
  const reservations = await fetchReservationsWithInvoicesByProfileAndFestival(
    profileId,
    festivalId,
  );
  const nonRejectedReservations = reservations.filter(
    (r) => r.status !== "rejected",
  );
  const outstandingInvoiceCount = nonRejectedReservations.reduce(
    (count, reservation) =>
      count + countOutstandingInvoices(reservation.invoices),
    0,
  );
  return {
    reservationCount: nonRejectedReservations.length,
    outstandingInvoiceCount,
  };
}

export async function fetchPendingInvoicesByProfile(
  profileId: number,
): Promise<InvoiceWithPaymentsAndStand[]> {
  const actor = await getCurrentUserProfile();
  if (!actor) return [];
  if (
    actor.id !== profileId &&
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }
  try {
    return await db.query.invoices.findMany({
      where: and(
        eq(invoices.userId, profileId),
        eq(invoices.status, "pending"),
      ),
      with: {
        payments: true,
        reservation: {
          with: {
            stand: {
              with: {
                qrCode: true,
              },
            },
            festival: {
              with: {
                festivalDates: true,
              },
            },
          },
        },
      },
      orderBy: desc(invoices.createdAt),
    });
  } catch (error) {
    console.error("Error fetching pending invoices by profile", error);
    return [];
  }
}

export async function fetchInvoicesByFestival(
  festivalId: number,
): Promise<InvoiceWithParticipants[]> {
  const actor = await getCurrentUserProfile();
  if (
    !actor ||
    !canViewAdminReservationData({ id: actor.id, role: actor.role })
  ) {
    return [];
  }
  try {
    const reservationsSubquery = db
      .select({ id: standReservations.id })
      .from(standReservations)
      .where(eq(standReservations.festivalId, festivalId));

    return await db.query.invoices.findMany({
      where: inArray(invoices.reservationId, reservationsSubquery),
      with: {
        payments: true,
        reservation: {
          with: {
            stand: true,
            festival: {
              with: {
                festivalDates: true,
              },
            },
            participants: {
              with: { user: true },
            },
          },
        },
        user: true,
      },
    });
  } catch (error) {
    console.error("Error fetching invoices by festival", error);
    return [];
  }
}
