"use server";

import {
  InvoiceWithParticipants,
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  ReservationWithStandAndInvoicesAndFestival,
} from "@/app/data/invoices/definitions";
import { db } from "@/db";
import {
  invoices,
  payments,
  reservationParticipants,
  standReservations,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { cancelReservation } from "@/app/lib/reservations/admin-service";
import { type ReservationActionResult } from "@/app/lib/reservations/errors";
import {
  canViewAdminReservationData,
  canViewInvoiceRecord,
} from "@/app/lib/reservations/policy";
import {
  approveInvoiceSettlement,
  findSubmittedSettlementId,
  rejectInvoiceSettlement,
  submitPaymentProof,
  submitZeroValueInvoiceForReview,
} from "@/app/lib/reservations/payment-service";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { revalidatePath } from "next/cache";
import {
  attemptStorageCleanupJob,
  enqueueStorageCleanupJob,
} from "@/app/lib/uploadthing/actions";
import { countOutstandingInvoices } from "@/app/lib/payments/helpers";

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
    if (status === "paid") {
      const submissionId = await findSubmittedSettlementId(invoiceId);
      if (!submissionId) {
        const invoice = await db.query.invoices.findFirst({
          where: eq(invoices.id, invoiceId),
          columns: { status: true },
        });
        if (invoice?.status === "paid") {
          return { success: true, message: "El pago ya figura como pagado." };
        }
        return {
          success: false,
          message: "No hay una solicitud en revisión para aprobar.",
        };
      }
      const result = await approveInvoiceSettlement({ submissionId });
      return { success: result.success, message: result.message };
    }

    if (status === "pending") {
      const submissionId = await findSubmittedSettlementId(invoiceId);
      if (!submissionId) {
        return {
          success: false,
          message: "No hay una solicitud en revisión para devolver a pendiente.",
        };
      }
      const result = await rejectInvoiceSettlement({
        submissionId,
        reason: "Revisión administrativa",
        correction: { type: "keep_amount" },
      });
      return { success: result.success, message: result.message };
    }

    if (status === "cancelled") {
      const submissionId = await findSubmittedSettlementId(invoiceId);
      if (submissionId) {
        const result = await rejectInvoiceSettlement({
          submissionId,
          reason: "Cancelado desde el estado de pago",
          correction: { type: "cancel_reservation" },
        });
        return { success: result.success, message: result.message };
      }
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoiceId),
        columns: { reservationId: true },
      });
      if (!invoice) {
        return { success: false, message: "Pago no encontrado." };
      }
      return cancelReservation({
        reservationId: invoice.reservationId,
        reason: "Cancelado desde el estado de pago",
      });
    }

    return {
      success: false,
      message:
        "Para pasar a revisión, el participante debe enviar el comprobante o solicitar revisión.",
    };
  } catch (error) {
    console.error("Error updating invoice status", error);
    return { success: false, message: "No se pudo actualizar el estado." };
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
      payment?: {
        invoiceId?: unknown;
        voucherUrl?: unknown;
        idempotencyKey?: unknown;
      };
      idempotencyKey?: unknown;
    };
    const idempotencyKey =
      nested.idempotencyKey ?? nested.payment?.idempotencyKey;
    return {
      invoiceId: nested.payment?.invoiceId,
      voucherUrl: nested.payment?.voucherUrl,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    };
  }
  return input;
}

export async function createPayment(
  input: unknown,
): Promise<ReservationActionResult<{ submissionId: number }>> {
  return submitPaymentProof(normalizePaymentProofInput(input));
}

export async function confirmFreeInvoice(
  input: unknown,
): Promise<ReservationActionResult<{ submissionId: number }>> {
  const nested =
    input && typeof input === "object" && "invoiceId" in input
      ? input
      : input;
  return submitZeroValueInvoiceForReview(nested);
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
