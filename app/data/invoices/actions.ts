import {
  InvoiceWithPaymentsAndStand,
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
    await db
      .insert(payments)
      .values(payment)
      .onConflictDoUpdate({ target: payments.id, set: payment });
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
