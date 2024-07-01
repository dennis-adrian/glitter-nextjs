import {
  InvoiceWithPaymentsAndStand,
  InvoiceWithPaymentsAndStandAndProfile,
  NewPayment,
} from "@/app/data/invoices/defiinitions";
import { pool, db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

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

export async function createPayment(payment: NewPayment) {
  const client = await pool.connect();

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(payments)
        .values(payment)
        .onConflictDoUpdate({ target: payments.id, set: payment });

      await tx
        .update(invoices)
        .set({ status: "paid" })
        .where(eq(invoices.id, payment.invoiceId));
    });
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
