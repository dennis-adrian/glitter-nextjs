"use server";

import {
  InvoiceBase,
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  NewPayment,
} from "@/app/data/invoices/defiinitions";
import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";
import { sendEmail } from "@/app/vendors/resend";
import { pool, db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { UTApi } from "uploadthing/server";

export async function fetchLatestInvoiceByProfileId(
  profileId: number,
): Promise<InvoiceWithPaymentsAndStand | undefined | null> {
  const client = await pool.connect();

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
          },
        },
      },
      orderBy: desc(invoices.createdAt),
      where: eq(invoices.userId, profileId),
    });
  } catch (error) {
    console.error("Error fetching latest invoice", error);
    return null;
  } finally {
    client.release();
  }
}

export async function createPayment(
  payment: NewPayment,
  oldVoucherUrl?: string,
) {
  const client = await pool.connect();

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
        subject: `Tu pago el festival ${invoice.reservation.festival.name} fue registrado`,
        react: PaymentConfirmationForUserEmailTemplate({
          invoice,
        }),
      });
    }
  } catch (error) {
    console.error("Error creating payment", error);
    return {
      message: "No se pudo guardar el pago. Intenta nuevamente",
      success: false,
    };
  } finally {
    client.release();
  }
  const successMessage = payments.id
    ? "Pago actualizado con éxito"
    : "Pago creado con éxito";
  return { success: true, message: successMessage };
}

export async function fetchInvoices(): Promise<
  InvoiceWithPaymentsAndStandAndProfile[]
> {
  const client = await pool.connect();

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
          },
        },
        user: true,
      },
    });
  } catch (error) {
    console.error("Error fetching invoices", error);
    return [] as InvoiceWithPaymentsAndStandAndProfile[];
  } finally {
    client.release();
  }
}

export async function fetchInvoicesByReservation(reservationId: number) {
  const client = await pool.connect();

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
          },
        },
      },
      where: eq(invoices.reservationId, reservationId),
    });
  } catch {
  } finally {
    client.release();
  }
}

export async function fetchInvoice(
  id: number,
): Promise<InvoiceWithPaymentsAndStandAndProfile | undefined | null> {
  const client = await pool.connect();

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
          },
        },
        user: true,
      },
    });
  } catch (error) {
    console.error(error);
    return null;
  } finally {
    client.release();
  }
}
