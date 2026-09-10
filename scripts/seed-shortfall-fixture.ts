import { loadEnvConfig } from "@next/env";

import { applySyncedEnvToProcess } from "@/scripts/lib/sync-env-local";

applySyncedEnvToProcess();
loadEnvConfig(process.cwd());

/**
 * Puts one reservation into the only state that opens "Confirmar con saldo
 * pendiente", so the dialog can be exercised in a browser.
 *
 * That state is narrow by design. The menu offers the item when a cobro is
 * part-covered and something would actually be written off:
 *
 *   covered > 0, outstanding > 0, and total > covered + submittedCash
 *
 * Credits plus one closing voucher — the ordinary shape, and every case the
 * settlement engine was built around — fails the last test, because approving
 * the voucher is part of the command. So the fixture needs credits and *no*
 * voucher, which nothing in the normal flow produces on its own and which no
 * reservation in a restored dev database happens to be in.
 *
 * Built from the same primitives the real command uses rather than hand-written
 * rows: the ledger is append-only and balance-cached, and an allocation with no
 * matching debit behind it would be a state the app can never reach.
 *
 * Run with:
 *
 *   pnpm tsx --conditions=react-server scripts/seed-shortfall-fixture.ts [id]
 *
 * The condition is not optional. The credits service is `server-only`, which
 * resolves to a module that throws unless `react-server` is set, and the error
 * it throws ("cannot be imported from a Client Component") describes a cause
 * that has nothing to do with what actually went wrong.
 */
async function main() {
  if (!process.env.POSTGRES_URL) {
    console.info("POSTGRES_URL is not set. Nothing to do.");
    return;
  }

  const { pool, db } = await import("@/db");
  const { getDevSeedGate } = await import("@/scripts/seed/demo-users");

  // The same gate `pnpm seed` uses. This writes credit ledger entries, which
  // are append-only — there is no tidy undo if it runs somewhere real.
  const gate = getDevSeedGate();
  if (!gate.allowed) {
    console.info(`Refusing to build the fixture: ${gate.reason}`);
    await pool.end();
    return;
  }

  const { and, eq, isNull, notInArray, sql } = await import("drizzle-orm");
  const {
    invoiceCreditAllocations,
    invoiceSettlementSubmissions,
    invoices,
    payments,
    standReservations,
  } = await import("@/db/schema");
  const { grantCreditsInTx, debitConfirmedCreditsForInvoiceInTx } =
    await import("@/app/lib/credits/service");

  const requestedId = Number(process.argv[2]);

  try {
    const result = await db.transaction(async (tx) => {
      // A cobro still open, with nothing tendered against it: no payment rows
      // and no settlement submission, so `submittedCashAmount` is zero and the
      // write-off is the whole uncovered remainder.
      const candidates = await tx
        .select({
          reservationId: standReservations.id,
          invoiceId: invoices.id,
          userId: invoices.userId,
          amount: invoices.amount,
          festivalId: standReservations.festivalId,
        })
        .from(invoices)
        .innerJoin(
          standReservations,
          eq(standReservations.id, invoices.reservationId),
        )
        .where(
          and(
            notInArray(invoices.status, ["paid", "cancelled"]),
            isNull(
              sql`(SELECT 1 FROM ${payments} WHERE ${payments.invoiceId} = ${invoices.id} LIMIT 1)`,
            ),
            isNull(
              sql`(SELECT 1 FROM ${invoiceSettlementSubmissions} WHERE ${invoiceSettlementSubmissions.invoiceId} = ${invoices.id} LIMIT 1)`,
            ),
            isNull(
              sql`(SELECT 1 FROM ${invoiceCreditAllocations} WHERE ${invoiceCreditAllocations.invoiceId} = ${invoices.id} LIMIT 1)`,
            ),
            sql`${invoices.amount} > 0`,
            requestedId ? eq(standReservations.id, requestedId) : sql`TRUE`,
          ),
        )
        .orderBy(standReservations.id)
        .limit(1);

      const target = candidates[0];
      if (!target) {
        return { kind: "none" as const };
      }

      const total = Number(target.amount);
      // Deliberately short of the total: covering it fully would settle the
      // cobro and close the very state this fixture exists to produce.
      const credits = Math.max(1, Math.round(total * 0.4));

      const grant = await grantCreditsInTx(tx, {
        userId: target.userId,
        amount: credits,
        reason: "Fixture: créditos para probar el saldo pendiente",
        idempotencyKey: `shortfall-fixture-grant:${target.invoiceId}`,
      });
      // Returns null rather than a result union, unlike the debit below.
      if (!grant) {
        throw new Error("grantCreditsInTx returned null");
      }

      const debit = await debitConfirmedCreditsForInvoiceInTx(tx, {
        userId: target.userId,
        amount: credits,
        idempotencyKey: `shortfall-fixture-debit:${target.invoiceId}`,
      });
      if (!debit.ok) {
        throw new Error(`debitConfirmedCredits failed: ${debit.code}`);
      }

      await tx.insert(invoiceCreditAllocations).values({
        invoiceId: target.invoiceId,
        userId: target.userId,
        amount: credits,
        ledgerEntryId: debit.data.ledgerEntryId,
        idempotencyKey: `shortfall-fixture:${target.invoiceId}`,
      });

      return {
        kind: "built" as const,
        ...target,
        total,
        credits,
        outstanding: total - credits,
      };
    });

    if (result.kind === "none") {
      console.info(
        requestedId
          ? `No open cobro without payments, submissions or credits found for reservation ${requestedId}.`
          : "No open cobro without payments, submissions or credits found. Seed a festival first.",
      );
      return;
    }

    console.info(
      `[fixture] reservation ${result.reservationId} (cobro #${result.invoiceId}): ` +
        `total Bs${result.total}, Bs${result.credits} in credits, Bs${result.outstanding} outstanding.`,
    );
    console.info(
      `[fixture] Open /dashboard/festivals/${result.festivalId}/reservations, find ${result.reservationId}, ` +
        `and the actions menu should enable "Confirmar con saldo pendiente".`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("An error occurred while building the shortfall fixture", err);
  process.exitCode = 1;
});
