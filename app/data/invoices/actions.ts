"use server";

import { fetchAdminUsers } from "@/app/api/users/actions";
import {
  InvoiceWithParticipants,
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  NewPayment,
  ReservationWithStandAndInvoicesAndFestival,
} from "@/app/data/invoices/definitions";
import PaymentConfirmationForAdminsEmailTemplate from "@/app/emails/payment-confirmation-for-admins";
import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";
import { updateReservationStatus } from "@/app/lib/reservations/actions";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
  invoices,
  payments,
  reservationParticipants,
  standReservations,
} from "@/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { UTApi } from "uploadthing/server";
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

export async function updateInvoiceStatus(
  invoiceId: number,
  status: InvoiceWithParticipants["status"],
): Promise<{ success: boolean; message: string }> {
  const profile = await getCurrentUserProfile();
  if (!profile || profile.role !== "admin") {
    return { success: false, message: "No autorizado." };
  }

  if (!["pending", "paid", "cancelled"].includes(status)) {
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
    const standLabel = `${invoice.reservation.stand.label}${invoice.reservation.stand.standNumber}`;
    const shouldConfirmReservation =
      markAsPaid && invoice.reservation.status !== "accepted";
    let cleanupJobId: number | undefined;

    await db.transaction(async (tx) => {
      if (currentPayment) {
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
            amount: invoice.amount,
            date: new Date(),
            voucherUrl,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, currentPayment.id));
      } else {
        await tx.insert(payments).values({
          invoiceId,
          amount: invoice.amount,
          date: new Date(),
          voucherUrl,
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

export async function createPayment(data: {
  payment: NewPayment;
  oldVoucherUrl?: string;
  reservationId: number;
  standId: number;
}) {
  const { payment, oldVoucherUrl, reservationId, standId } = data;
  try {
    await db.transaction(async (tx) => {
      if (payment.id) {
        await tx
          .update(payments)
          .set({
            amount: payment.amount,
            date: payment.date,
            voucherUrl: payment.voucherUrl,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));
      } else {
        await tx.insert(payments).values(payment);
      }

      await tx
        .update(invoices)
        .set({ status: "paid" })
        .where(eq(invoices.id, payment.invoiceId));
    });

    if (oldVoucherUrl) {
      const [_, key] = oldVoucherUrl.split("/f/");
      await new UTApi().deleteFiles(key);
    }

    const invoice = await fetchInvoice(payment.invoiceId);
    if (invoice) {
      await sendEmail({
        to: [invoice.user.email],
        from: "Reservas Glitter <reservas@productoraglitter.com>",
        subject: "Tu pago ha sido registrado",
        react: PaymentConfirmationForUserEmailTemplate({
          invoice,
        }),
      });

      const admins = await fetchAdminUsers();
      const adminEmails = admins.map((admin) => admin.email);
      if (adminEmails.length > 0) {
        await sendEmail({
          to: [...adminEmails],
          from: "Reservas Glitter <reservas@productoraglitter.com>",
          subject: `${invoice.user.displayName} hizo el pago de su reserva`,
          react: PaymentConfirmationForAdminsEmailTemplate({
            invoice,
          }),
        });
      }
    }

    await updateReservationStatus({
      standId,
      reservationId,
      status: "verification_payment",
    });
  } catch (error) {
    console.error("Error creating payment", error);
    return {
      message: "No se pudo guardar el pago. Intenta nuevamente",
      success: false,
    };
  }

  const successMessage = payments.id
    ? "Pago actualizado con éxito"
    : "Pago creado con éxito";
  return { success: true, message: successMessage };
}

export async function confirmFreeInvoice(data: {
  invoiceId: number;
  reservationId: number;
  standId: number;
}): Promise<{ success: boolean; message: string }> {
  const { invoiceId, reservationId, standId } = data;
  try {
    const invoice = await fetchInvoice(invoiceId);
    if (!invoice || invoice.amount !== 0) {
      return {
        success: false,
        message: "El monto de la factura no es cero. Recarga la página.",
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(invoices)
        .set({ status: "paid" })
        .where(eq(invoices.id, invoiceId));
    });

    await sendEmail({
      to: [invoice.user.email],
      from: "Reservas Glitter <reservas@productoraglitter.com>",
      subject: "Tu reserva ha sido confirmada",
      react: PaymentConfirmationForUserEmailTemplate({ invoice }),
    });

    const admins = await fetchAdminUsers();
    const adminEmails = admins.map((admin) => admin.email);
    if (adminEmails.length > 0) {
      await sendEmail({
        to: [...adminEmails],
        from: "Reservas Glitter <reservas@productoraglitter.com>",
        subject: `${invoice.user.displayName} confirmó su reserva gratuita`,
        react: PaymentConfirmationForAdminsEmailTemplate({ invoice }),
      });
    }

    await updateReservationStatus({
      standId,
      reservationId,
      status: "verification_payment",
    });
  } catch (error) {
    console.error("Error confirming free invoice", error);
    return {
      success: false,
      message: "No se pudo confirmar la reserva. Intenta nuevamente.",
    };
  }

  return { success: true, message: "Reserva confirmada" };
}

export async function fetchInvoicesByReservation(
  reservationId: number,
): Promise<InvoiceWithPaymentsAndStand[]> {
  try {
    return await db.query.invoices.findMany({
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
  } catch (error) {
    console.error("Error fetching invoices by reservation", error);
    return [];
  }
}

export async function fetchInvoice(
  id: number,
): Promise<InvoiceWithPaymentsAndStandAndProfile | undefined | null> {
  try {
    return await db.query.invoices.findFirst({
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
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchReservationsWithInvoicesByProfileAndFestival(
  profileId: number,
  festivalId: number,
): Promise<ReservationWithStandAndInvoicesAndFestival[]> {
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
      count + reservation.invoices.filter((i) => i.status === "pending").length,
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
