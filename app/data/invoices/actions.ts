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

export async function fetchInvoices(): Promise<InvoiceWithParticipants[]> {
  try {
    return await db.query.invoices.findMany({
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
    console.error("Error fetching invoices", error);
    return [] as InvoiceWithParticipants[];
  }
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
