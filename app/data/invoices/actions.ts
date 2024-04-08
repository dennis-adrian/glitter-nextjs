import { InvoiceBase } from "@/app/data/invoices/defiinitions";
import { pool, db } from "@/db";
import { invoices } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export async function fetchLatestInvoiceByProfileId(
  profileId: number,
): Promise<InvoiceBase | undefined | null> {
  const client = await pool.connect();

  try {
    return await db.query.invoices.findFirst({
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
