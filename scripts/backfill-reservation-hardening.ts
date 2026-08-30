#!/usr/bin/env tsx
/**
 * Restartable reservation-hardening backfill. IDs and counts only — no PII.
 *
 *   pnpm exec tsx scripts/backfill-reservation-hardening.ts --dry-run
 *   pnpm exec tsx scripts/backfill-reservation-hardening.ts --batch-size 200
 */
import { loadEnvConfig } from "@next/env";
import { and, eq, isNull, sql } from "drizzle-orm";

import { roundMoney } from "@/app/lib/reservations/money";
import { db } from "@/db";
import {
  invoices,
  reservationParticipants,
  scheduledTasks,
  standHolds,
  standReservations,
  stands,
} from "@/db/schema";

loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="));
const batchSize = Math.max(
  1,
  Number.parseInt(batchSizeArg?.split("=")[1] ?? "200", 10) || 200,
);

type Counts = Record<string, number>;

function log(message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ message, dryRun, ...extra }));
}

async function backfillOwners(counts: Counts) {
  const rows = await db
    .select({
      reservationId: standReservations.id,
      ownerUserId: standReservations.ownerUserId,
    })
    .from(standReservations)
    .where(isNull(standReservations.ownerUserId))
    .limit(batchSize);

  for (const row of rows) {
    const [participant] = await db
      .select({ userId: reservationParticipants.userId })
      .from(reservationParticipants)
      .where(eq(reservationParticipants.reservationId, row.reservationId))
      .orderBy(reservationParticipants.id)
      .limit(1);
    if (!participant) {
      counts.owner_skipped_no_participant += 1;
      continue;
    }
    counts.owner_candidates += 1;
    if (dryRun) continue;
    await db
      .update(standReservations)
      .set({ ownerUserId: participant.userId, updatedAt: new Date() })
      .where(
        and(
          eq(standReservations.id, row.reservationId),
          isNull(standReservations.ownerUserId),
        ),
      );
    counts.owner_updated += 1;
  }
  return rows.length === batchSize;
}

async function backfillPriceSnapshots(counts: Counts) {
  const rows = await db.execute<{
    id: number;
    stand_price: number | null;
    invoice_amount: number | null;
  }>(sql`
    SELECT stand_reservations.id,
           stands.price AS stand_price,
           (
             SELECT invoices.original_amount
             FROM invoices
             WHERE invoices.reservation_id = stand_reservations.id
             ORDER BY invoices.id
             LIMIT 1
           ) AS invoice_amount
    FROM stand_reservations
    INNER JOIN stands ON stands.id = stand_reservations.stand_id
    WHERE stand_reservations.price_amount_snapshot IS NULL
    ORDER BY stand_reservations.id
    LIMIT ${batchSize}
  `);

  for (const row of rows.rows) {
    const snapshot = roundMoney(Number(row.invoice_amount ?? row.stand_price ?? 0));
    counts.price_snapshot_candidates += 1;
    if (dryRun) continue;
    await db
      .update(standReservations)
      .set({ priceAmountSnapshot: snapshot, updatedAt: new Date() })
      .where(
        and(
          eq(standReservations.id, Number(row.id)),
          isNull(standReservations.priceAmountSnapshot),
        ),
      );
    counts.price_snapshot_updated += 1;
  }
  return rows.rows.length === batchSize;
}

async function backfillHoldSnapshots(counts: Counts) {
  const rows = await db
    .select({
      holdId: standHolds.id,
      standPrice: stands.price,
    })
    .from(standHolds)
    .innerJoin(stands, eq(stands.id, standHolds.standId))
    .where(isNull(standHolds.priceAmountSnapshot))
    .limit(batchSize);

  for (const row of rows) {
    counts.hold_snapshot_candidates += 1;
    if (dryRun) continue;
    await db
      .update(standHolds)
      .set({ priceAmountSnapshot: roundMoney(row.standPrice ?? 0) })
      .where(
        and(
          eq(standHolds.id, row.holdId),
          isNull(standHolds.priceAmountSnapshot),
        ),
      );
    counts.hold_snapshot_updated += 1;
  }
  return rows.length === batchSize;
}

async function backfillInvoiceDueAt(counts: Counts) {
  const rows = await db.execute<{ id: number; due_date: Date }>(sql`
    SELECT invoices.id, scheduled_tasks.due_date
    FROM invoices
    INNER JOIN scheduled_tasks
      ON scheduled_tasks.reservation_id = invoices.reservation_id
     AND scheduled_tasks.task_type = 'stand_reservation'
    WHERE invoices.due_at IS NULL
    ORDER BY invoices.id
    LIMIT ${batchSize}
  `);

  for (const row of rows.rows) {
    counts.invoice_due_candidates += 1;
    if (dryRun) continue;
    await db
      .update(invoices)
      .set({ dueAt: new Date(row.due_date), updatedAt: new Date() })
      .where(and(eq(invoices.id, Number(row.id)), isNull(invoices.dueAt)));
    counts.invoice_due_updated += 1;
  }
  return rows.rows.length === batchSize;
}

async function relabelUnprovenSources(counts: Counts) {
  const rows = await db.execute<{ id: number }>(sql`
    SELECT stand_reservations.id
    FROM stand_reservations
    WHERE stand_reservations.source = 'user_reservation'
      AND NOT EXISTS (
        SELECT 1
        FROM stand_reservation_events
        WHERE stand_reservation_events.reservation_id = stand_reservations.id
          AND stand_reservation_events.event_type = 'created'
      )
    ORDER BY stand_reservations.id
    LIMIT ${batchSize}
  `);

  for (const row of rows.rows) {
    counts.source_candidates += 1;
    if (dryRun) continue;
    await db
      .update(standReservations)
      .set({ source: "legacy_unknown", updatedAt: new Date() })
      .where(
        and(
          eq(standReservations.id, Number(row.id)),
          eq(standReservations.source, "user_reservation"),
        ),
      );
    counts.source_updated += 1;
  }
  return rows.rows.length === batchSize;
}

async function main() {
  const counts: Counts = {
    owner_candidates: 0,
    owner_updated: 0,
    owner_skipped_no_participant: 0,
    price_snapshot_candidates: 0,
    price_snapshot_updated: 0,
    hold_snapshot_candidates: 0,
    hold_snapshot_updated: 0,
    invoice_due_candidates: 0,
    invoice_due_updated: 0,
    source_candidates: 0,
    source_updated: 0,
  };

  log("starting reservation hardening backfill", { batchSize });

  const steps: Array<[string, (counts: Counts) => Promise<boolean>]> = [
    ["owner", backfillOwners],
    ["price snapshot", backfillPriceSnapshots],
    ["hold snapshot", backfillHoldSnapshots],
    ["invoice due_at", backfillInvoiceDueAt],
    ["source relabel", relabelUnprovenSources],
  ];

  for (const [name, step] of steps) {
    if (dryRun) {
      await step(counts);
      continue;
    }
    while (await step(counts)) {
      log(`${name} batch complete`, counts);
    }
  }

  log("backfill complete", counts);
}

main().catch((error) => {
  console.error("backfill-reservation-hardening failed", error);
  process.exit(1);
});
