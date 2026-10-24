import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { creditLedgerEntries } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ledger entries are kept for good (`credit_ledger_entries.user_id` is ON
 * DELETE RESTRICT), so a profile holding any cannot be deleted locally. Every
 * deletion path asks under the user lock, before the Clerk account goes. The
 * credit service and the gift worker take that lock and refuse a user with a
 * pending deletion. Reservation refunds (`refundOverpaymentAsCredits`) take it
 * but do not check, so one landing after this answer still blocks the delete.
 */
export async function hasCreditLedgerEntries(
  tx: DbTx,
  profileId: number,
): Promise<boolean> {
  const [entry] = await tx
    .select({ id: creditLedgerEntries.id })
    .from(creditLedgerEntries)
    .where(eq(creditLedgerEntries.userId, profileId))
    .limit(1);

  return Boolean(entry);
}
