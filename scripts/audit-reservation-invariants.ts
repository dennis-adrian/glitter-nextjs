#!/usr/bin/env tsx
/**
 * Read-only reservation invariant report. Prints IDs and counts only — no PII.
 * Exits non-zero when any finding is present.
 */
import { loadEnvConfig } from "@next/env";
import { and, eq, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  festivals,
  invoices,
  payments,
  standHolds,
  standReservations,
  stands,
} from "@/db/schema";

loadEnvConfig(process.cwd());

type Finding = { name: string; count: number; ids: number[] };

async function main() {
  const findings: Finding[] = [];

  const activeFestivals = await db
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.status, "active"));
  if (activeFestivals.length > 1) {
    findings.push({
      name: "multiple_active_festivals",
      count: activeFestivals.length,
      ids: activeFestivals.map((row) => row.id),
    });
  }

  const duplicateHoldStands = await db.execute<{ stand_id: number; n: number }>(
    sql`SELECT stand_id, count(*)::int AS n FROM stand_holds GROUP BY stand_id HAVING count(*) > 1`,
  );
  if (duplicateHoldStands.rows.length > 0) {
    findings.push({
      name: "multiple_holds_per_stand",
      count: duplicateHoldStands.rows.length,
      ids: duplicateHoldStands.rows.map((row) => Number(row.stand_id)),
    });
  }

  const duplicateHoldUsers = await db.execute<{ user_id: number; n: number }>(
    sql`SELECT user_id, count(*)::int AS n FROM stand_holds GROUP BY user_id, festival_id HAVING count(*) > 1`,
  );
  if (duplicateHoldUsers.rows.length > 0) {
    findings.push({
      name: "multiple_holds_per_user_festival",
      count: duplicateHoldUsers.rows.length,
      ids: duplicateHoldUsers.rows.map((row) => Number(row.user_id)),
    });
  }

  const expiredHeld = await db
    .select({ id: standHolds.id, standId: standHolds.standId })
    .from(standHolds)
    .innerJoin(stands, eq(stands.id, standHolds.standId))
    .where(and(lte(standHolds.expiresAt, new Date()), eq(stands.status, "held")));
  if (expiredHeld.length > 0) {
    findings.push({
      name: "expired_holds_with_held_stand",
      count: expiredHeld.length,
      ids: expiredHeld.map((row) => row.standId),
    });
  }

  const duplicateReservations = await db.execute<{
    stand_id: number;
    n: number;
  }>(
    sql`SELECT stand_id, count(*)::int AS n FROM stand_reservations WHERE status <> 'rejected' GROUP BY stand_id HAVING count(*) > 1`,
  );
  if (duplicateReservations.rows.length > 0) {
    findings.push({
      name: "multiple_live_reservations_per_stand",
      count: duplicateReservations.rows.length,
      ids: duplicateReservations.rows.map((row) => Number(row.stand_id)),
    });
  }

  const festivalMismatch = await db
    .select({ id: standReservations.id })
    .from(standReservations)
    .innerJoin(stands, eq(stands.id, standReservations.standId))
    .where(ne(stands.festivalId, standReservations.festivalId));
  if (festivalMismatch.length > 0) {
    findings.push({
      name: "reservation_stand_festival_mismatch",
      count: festivalMismatch.length,
      ids: festivalMismatch.map((row) => row.id),
    });
  }

  const invoiceOwnerNotParticipant = await db.execute<{ id: number }>(sql`
    SELECT invoices.id
    FROM invoices
    WHERE NOT EXISTS (
      SELECT 1 FROM participations
      WHERE participations.reservation_id = invoices.reservation_id
        AND participations.user_id = invoices.user_id
    )
  `);
  if (invoiceOwnerNotParticipant.rows.length > 0) {
    findings.push({
      name: "invoice_owner_not_participant",
      count: invoiceOwnerNotParticipant.rows.length,
      ids: invoiceOwnerNotParticipant.rows.map((row) => Number(row.id)),
    });
  }

  const orphanPayments = await db
    .select({ id: payments.id })
    .from(payments)
    .leftJoin(invoices, eq(invoices.id, payments.invoiceId))
    .where(sql`${invoices.id} IS NULL`);
  if (orphanPayments.length > 0) {
    findings.push({
      name: "payments_missing_invoice",
      count: orphanPayments.length,
      ids: orphanPayments.map((row) => row.id),
    });
  }

  const acceptedUnpaid = await db
    .select({ id: standReservations.id })
    .from(standReservations)
    .innerJoin(invoices, eq(invoices.reservationId, standReservations.id))
    .where(
      and(eq(standReservations.status, "accepted"), ne(invoices.status, "paid")),
    );
  if (acceptedUnpaid.length > 0) {
    findings.push({
      name: "accepted_reservation_invoice_not_paid",
      count: acceptedUnpaid.length,
      ids: acceptedUnpaid.map((row) => row.id),
    });
  }

  const reservedWithoutLive = await db.execute<{ id: number }>(sql`
    SELECT stands.id
    FROM stands
    WHERE stands.status IN ('reserved', 'confirmed')
      AND NOT EXISTS (
        SELECT 1 FROM stand_reservations
        WHERE stand_reservations.stand_id = stands.id
          AND stand_reservations.status <> 'rejected'
      )
  `);
  if (reservedWithoutLive.rows.length > 0) {
    findings.push({
      name: "stand_reserved_without_live_reservation",
      count: reservedWithoutLive.rows.length,
      ids: reservedWithoutLive.rows.map((row) => Number(row.id)),
    });
  }

  const availableWithLive = await db.execute<{ id: number }>(sql`
    SELECT stands.id
    FROM stands
    WHERE stands.status = 'available'
      AND EXISTS (
        SELECT 1 FROM stand_reservations
        WHERE stand_reservations.stand_id = stands.id
          AND stand_reservations.status <> 'rejected'
      )
  `);
  if (availableWithLive.rows.length > 0) {
    findings.push({
      name: "stand_available_with_live_reservation",
      count: availableWithLive.rows.length,
      ids: availableWithLive.rows.map((row) => Number(row.id)),
    });
  }

  const heldWithoutHold = await db.execute<{ id: number }>(sql`
    SELECT stands.id
    FROM stands
    WHERE stands.status = 'held'
      AND NOT EXISTS (
        SELECT 1 FROM stand_holds
        WHERE stand_holds.stand_id = stands.id
          AND stand_holds.expires_at > now()
      )
  `);
  if (heldWithoutHold.rows.length > 0) {
    findings.push({
      name: "stand_held_without_live_hold",
      count: heldWithoutHold.rows.length,
      ids: heldWithoutHold.rows.map((row) => Number(row.id)),
    });
  }

  const verificationWithoutSettlement = await db.execute<{ id: number }>(sql`
    SELECT stand_reservations.id
    FROM stand_reservations
    WHERE stand_reservations.status = 'verification_payment'
      AND NOT EXISTS (
        SELECT 1
        FROM invoices
        INNER JOIN payments ON payments.invoice_id = invoices.id
        WHERE invoices.reservation_id = stand_reservations.id
      )
  `);
  if (verificationWithoutSettlement.rows.length > 0) {
    findings.push({
      name: "verification_payment_without_settlement",
      count: verificationWithoutSettlement.rows.length,
      ids: verificationWithoutSettlement.rows.map((row) => Number(row.id)),
    });
  }

  const multipleSettlements = await db.execute<{ invoice_id: number }>(sql`
    SELECT invoice_id
    FROM payments
    GROUP BY invoice_id
    HAVING count(*) > 1
  `);
  if (multipleSettlements.rows.length > 0) {
    findings.push({
      name: "multiple_submitted_settlements",
      count: multipleSettlements.rows.length,
      ids: multipleSettlements.rows.map((row) => Number(row.invoice_id)),
    });
  }

  const adminShapedUserReservation = await db.execute<{ id: number }>(sql`
    SELECT id
    FROM stand_reservations
    WHERE source = 'user_reservation'
      AND reveal_at IS NOT NULL
  `);
  if (adminShapedUserReservation.rows.length > 0) {
    findings.push({
      name: "admin_shaped_user_reservation",
      count: adminShapedUserReservation.rows.length,
      ids: adminShapedUserReservation.rows.map((row) => Number(row.id)),
    });
  }

  const expiredHoldStatusDrift = await db.execute<{ id: number }>(sql`
    SELECT stand_holds.id
    FROM stand_holds
    INNER JOIN stands ON stands.id = stand_holds.stand_id
    WHERE stand_holds.expires_at <= now()
      AND stands.status = 'held'
  `);
  if (expiredHoldStatusDrift.rows.length > 0) {
    findings.push({
      name: "expired_hold_status_drift",
      count: expiredHoldStatusDrift.rows.length,
      ids: expiredHoldStatusDrift.rows.map((row) => Number(row.id)),
    });
  }

  for (const finding of findings) {
    console.log(
      JSON.stringify({
        finding: finding.name,
        count: finding.count,
        ids: finding.ids.slice(0, 50),
      }),
    );
  }

  if (findings.length === 0) {
    console.log(JSON.stringify({ ok: true, findings: 0 }));
    return;
  }

  console.error(JSON.stringify({ ok: false, findings: findings.length }));
  process.exit(1);
}

main().catch(() => {
  console.error("audit-reservation-invariants failed");
  process.exit(1);
});
