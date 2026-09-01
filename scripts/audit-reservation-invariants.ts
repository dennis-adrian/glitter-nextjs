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

type Finding = {
  name: string;
  count: number;
  ids: number[];
  fingerprint?: string;
};

function asIdList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter((id) => Number.isFinite(id));
  }
  if (typeof value === "string") {
    return value
      .replace(/[{}]/g, "")
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isFinite(id));
  }
  return [];
}

function normalizeIndexPredicate(expr: string | null | undefined): string {
  if (!expr) return "";
  return expr
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/"/g, "")
    .replace(/\b[a-z_][a-z0-9_]*\./g, "")
    .replace(/::[a-z_][a-z0-9_]*/g, "")
    .replace(/[()]/g, "")
    .trim();
}

function keysMatch(actual: unknown, expected: string[]): boolean {
  const keys = Array.isArray(actual) ? actual.map((key) => String(key)) : [];
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
}

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
    .where(
      and(lte(standHolds.expiresAt, new Date()), eq(stands.status, "held")),
    );
  if (expiredHeld.length > 0) {
    findings.push({
      name: "expired_holds_with_held_stand",
      count: expiredHeld.length,
      ids: expiredHeld.map((row) => row.standId),
    });
  }

  const duplicateCapacityReservations = await db.execute<{
    stand_id: number;
    n: number;
  }>(
    sql`SELECT stand_id, count(*)::int AS n FROM stand_reservations WHERE status IN ('pending', 'verification_payment', 'accepted') GROUP BY stand_id HAVING count(*) > 1`,
  );
  if (duplicateCapacityReservations.rows.length > 0) {
    findings.push({
      name: "multiple_capacity_reservations_per_stand",
      count: duplicateCapacityReservations.rows.length,
      ids: duplicateCapacityReservations.rows.map((row) =>
        Number(row.stand_id),
      ),
    });
  }

  const holdMemberCardinality = await db.execute<{ id: number }>(sql`
    SELECT h.id
    FROM stand_holds h
    LEFT JOIN stand_hold_members m ON m.hold_id = h.id
    GROUP BY h.id
    HAVING count(m.id) <> 1
  `);
  if (holdMemberCardinality.rows.length > 0) {
    findings.push({
      name: "stand_hold_member_cardinality_not_one",
      count: holdMemberCardinality.rows.length,
      ids: holdMemberCardinality.rows.map((row) => Number(row.id)),
    });
  }

  const reservationMemberCardinality = await db.execute<{ id: number }>(sql`
    SELECT r.id
    FROM stand_reservations r
    LEFT JOIN stand_reservation_members m ON m.reservation_id = r.id
    GROUP BY r.id
    HAVING count(m.id) <> 1
  `);
  if (reservationMemberCardinality.rows.length > 0) {
    findings.push({
      name: "stand_reservation_member_cardinality_not_one",
      count: reservationMemberCardinality.rows.length,
      ids: reservationMemberCardinality.rows.map((row) => Number(row.id)),
    });
  }

  const memberAdapterMismatch = await db.execute<{ id: number }>(sql`
    SELECT h.id
    FROM stand_holds h
    INNER JOIN stand_hold_members m ON m.hold_id = h.id
    WHERE m.stand_id <> h.stand_id
    UNION ALL
    SELECT r.id
    FROM stand_reservations r
    INNER JOIN stand_reservation_members m ON m.reservation_id = r.id
    WHERE m.stand_id <> r.stand_id
  `);
  if (memberAdapterMismatch.rows.length > 0) {
    findings.push({
      name: "stand_member_adapter_mismatch",
      count: memberAdapterMismatch.rows.length,
      ids: memberAdapterMismatch.rows.map((row) => Number(row.id)),
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
      and(
        eq(standReservations.status, "accepted"),
        ne(invoices.status, "paid"),
      ),
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
          AND stand_reservations.status IN ('pending', 'verification_payment', 'accepted')
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
          AND stand_reservations.status IN ('pending', 'verification_payment', 'accepted')
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
    SELECT DISTINCT stand_reservations.id
    FROM stand_reservations
    LEFT JOIN invoices ON invoices.reservation_id = stand_reservations.id
    WHERE stand_reservations.status = 'verification_payment'
      AND (
        invoices.id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM invoice_settlement_submissions
          WHERE invoice_settlement_submissions.invoice_id = invoices.id
            AND invoice_settlement_submissions.status = 'submitted'
        )
      )
  `);
  if (verificationWithoutSettlement.rows.length > 0) {
    findings.push({
      name: "verification_payment_without_settlement",
      count: verificationWithoutSettlement.rows.length,
      ids: verificationWithoutSettlement.rows.map((row) => Number(row.id)),
    });
  }

  const zeroValueNonZero = await db.execute<{ id: number }>(sql`
    SELECT invoice_settlement_submissions.id
    FROM invoice_settlement_submissions
    INNER JOIN invoices ON invoices.id = invoice_settlement_submissions.invoice_id
    WHERE invoice_settlement_submissions.kind = 'zero_value_entitlement'
      AND invoice_settlement_submissions.status = 'submitted'
      AND invoices.amount <> 0
  `);
  if (zeroValueNonZero.rows.length > 0) {
    findings.push({
      name: "zero_value_settlement_invoice_not_zero",
      count: zeroValueNonZero.rows.length,
      ids: zeroValueNonZero.rows.map((row) => Number(row.id)),
    });
  }

  const proofWithoutPayment = await db.execute<{ id: number }>(sql`
    SELECT id
    FROM invoice_settlement_submissions
    WHERE kind = 'payment_proof'
      AND status = 'submitted'
      AND (payment_id IS NULL OR file_key IS NULL)
  `);
  if (proofWithoutPayment.rows.length > 0) {
    findings.push({
      name: "proof_settlement_missing_payment_or_file",
      count: proofWithoutPayment.rows.length,
      ids: proofWithoutPayment.rows.map((row) => Number(row.id)),
    });
  }

  const tooManyParticipants = await db.execute<{ id: number; n: number }>(sql`
    SELECT reservation_id AS id, count(*)::int AS n
    FROM participations
    GROUP BY reservation_id
    HAVING count(*) > 2
  `);
  if (tooManyParticipants.rows.length > 0) {
    findings.push({
      name: "reservation_more_than_two_participants",
      count: tooManyParticipants.rows.length,
      ids: tooManyParticipants.rows.map((row) => Number(row.id)),
    });
  }

  const nonIllustrationPartner = await db.execute<{ id: number }>(sql`
    SELECT sr.id
    FROM stand_reservations sr
    INNER JOIN stands ON stands.id = sr.stand_id
    WHERE (
      SELECT count(*) FROM participations p WHERE p.reservation_id = sr.id
    ) > 1
    AND (
      stands.stand_category NOT IN ('illustration', 'new_artist')
      OR EXISTS (
        SELECT 1
        FROM participations p
        INNER JOIN users u ON u.id = p.user_id
        WHERE p.reservation_id = sr.id
          AND (
            (sr.owner_user_id IS NOT NULL AND p.user_id <> sr.owner_user_id)
            OR (
              sr.owner_user_id IS NULL
              AND p.id <> (
                SELECT p2.id
                FROM participations p2
                WHERE p2.reservation_id = sr.id
                ORDER BY p2.id
                LIMIT 1
              )
            )
          )
          AND u.category NOT IN ('illustration', 'new_artist')
      )
    )
  `);
  if (nonIllustrationPartner.rows.length > 0) {
    findings.push({
      name: "non_illustration_partner_on_shared_reservation",
      count: nonIllustrationPartner.rows.length,
      ids: nonIllustrationPartner.rows.map((row) => Number(row.id)),
    });
  }

  const paidInvoiceNotAccepted = await db
    .select({ id: invoices.id })
    .from(invoices)
    .innerJoin(
      standReservations,
      eq(standReservations.id, invoices.reservationId),
    )
    .where(
      and(
        eq(invoices.status, "paid"),
        ne(standReservations.status, "accepted"),
      ),
    );
  if (paidInvoiceNotAccepted.length > 0) {
    findings.push({
      name: "paid_invoice_reservation_not_accepted",
      count: paidInvoiceNotAccepted.length,
      ids: paidInvoiceNotAccepted.map((row) => row.id),
    });
  }

  const pendingReservationPaidInvoice = await db
    .select({ id: standReservations.id })
    .from(standReservations)
    .innerJoin(invoices, eq(invoices.reservationId, standReservations.id))
    .where(
      and(eq(standReservations.status, "pending"), eq(invoices.status, "paid")),
    );
  if (pendingReservationPaidInvoice.length > 0) {
    findings.push({
      name: "pending_reservation_invoice_paid",
      count: pendingReservationPaidInvoice.length,
      ids: pendingReservationPaidInvoice.map((row) => row.id),
    });
  }

  const verificationMismatch = await db.execute<{ id: number }>(sql`
    SELECT stand_reservations.id
    FROM stand_reservations
    INNER JOIN invoices ON invoices.reservation_id = stand_reservations.id
    WHERE (
      stand_reservations.status = 'verification_payment'
      AND invoices.status <> 'verification_payment'
    ) OR (
      invoices.status = 'verification_payment'
      AND stand_reservations.status <> 'verification_payment'
    )
  `);
  if (verificationMismatch.rows.length > 0) {
    findings.push({
      name: "verification_payment_status_mismatch",
      count: verificationMismatch.rows.length,
      ids: verificationMismatch.rows.map((row) => Number(row.id)),
    });
  }

  const proofSettlementMissingPaymentRow = await db.execute<{ id: number }>(sql`
    SELECT invoice_settlement_submissions.id
    FROM invoice_settlement_submissions
    LEFT JOIN payments ON payments.id = invoice_settlement_submissions.payment_id
    WHERE invoice_settlement_submissions.kind = 'payment_proof'
      AND invoice_settlement_submissions.status = 'submitted'
      AND payments.id IS NULL
  `);
  if (proofSettlementMissingPaymentRow.rows.length > 0) {
    findings.push({
      name: "submitted_proof_settlement_payment_row_missing",
      count: proofSettlementMissingPaymentRow.rows.length,
      ids: proofSettlementMissingPaymentRow.rows.map((row) => Number(row.id)),
    });
  }

  const paymentOutsideLifecycle = await db.execute<{ id: number }>(sql`
    SELECT payments.id
    FROM payments
    INNER JOIN invoices ON invoices.id = payments.invoice_id
    WHERE invoices.status IN ('verification_payment', 'paid')
      AND NOT EXISTS (
        SELECT 1
        FROM invoice_settlement_submissions
        WHERE invoice_settlement_submissions.invoice_id = invoices.id
          AND invoice_settlement_submissions.kind = 'payment_proof'
      )
  `);
  if (paymentOutsideLifecycle.rows.length > 0) {
    findings.push({
      name: "payment_without_proof_settlement_lifecycle",
      count: paymentOutsideLifecycle.rows.length,
      ids: paymentOutsideLifecycle.rows.map((row) => Number(row.id)),
    });
  }

  const multipleSettlements = await db.execute<{ invoice_id: number }>(sql`
    SELECT invoice_id
    FROM invoice_settlement_submissions
    WHERE status = 'submitted'
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

  type DuplicateKeyRow = {
    fingerprint: string;
    ids: unknown;
    n: number;
  };
  const compositeIdempotencyTables = {
    payments: sql`payments`,
    invoice_settlement_submissions: sql`invoice_settlement_submissions`,
  } as const;
  for (const [table, tableSql] of Object.entries(compositeIdempotencyTables)) {
    const duplicates = await db.execute<DuplicateKeyRow>(sql`
      SELECT
        md5(idempotency_key) AS fingerprint,
        array_agg(id ORDER BY id) AS ids,
        count(*)::int AS n
      FROM ${tableSql}
      WHERE idempotency_key IS NOT NULL
      GROUP BY invoice_id, idempotency_key
      HAVING count(*) > 1
    `);
    for (const row of duplicates.rows) {
      findings.push({
        name: `duplicate_idempotency_key_${table}`,
        count: Number(row.n),
        ids: asIdList(row.ids),
        fingerprint: row.fingerprint,
      });
    }
  }

  const uniqueKeyTables = {
    stand_holds: sql`stand_holds`,
    stand_reservations: sql`stand_reservations`,
  } as const;
  for (const [table, tableSql] of Object.entries(uniqueKeyTables)) {
    const duplicates = await db.execute<DuplicateKeyRow>(sql`
      SELECT
        md5(idempotency_key) AS fingerprint,
        array_agg(id ORDER BY id) AS ids,
        count(*)::int AS n
      FROM ${tableSql}
      WHERE idempotency_key IS NOT NULL
      GROUP BY idempotency_key
      HAVING count(*) > 1
    `);
    for (const row of duplicates.rows) {
      findings.push({
        name: `duplicate_idempotency_key_${table}`,
        count: Number(row.n),
        ids: asIdList(row.ids),
        fingerprint: row.fingerprint,
      });
    }
  }

  const requiredIndexes: Array<{
    name: string;
    table: string;
    keys: string[];
    predicate: string;
  }> = [
    {
      name: "invoice_settlement_submissions_invoice_id_idempotency_key_unique",
      table: "invoice_settlement_submissions",
      keys: ["invoice_id", "idempotency_key"],
      predicate: "idempotency_key is not null",
    },
    {
      name: "payments_invoice_id_idempotency_key_unique",
      table: "payments",
      keys: ["invoice_id", "idempotency_key"],
      predicate: "idempotency_key is not null",
    },
    {
      name: "stand_holds_idempotency_key_unique",
      table: "stand_holds",
      keys: ["idempotency_key"],
      predicate: "idempotency_key is not null",
    },
    {
      name: "stand_reservations_capacity_stand_unique",
      table: "stand_reservations",
      keys: ["stand_id"],
      predicate:
        "status = any array['pending', 'verification_payment', 'accepted']",
    },
    {
      name: "stand_reservations_idempotency_key_unique",
      table: "stand_reservations",
      keys: ["idempotency_key"],
      predicate: "idempotency_key is not null",
    },
    {
      name: "stand_reservation_events_reservation_id_idempotency_key_unique",
      table: "stand_reservation_events",
      keys: ["reservation_id", "idempotency_key"],
      predicate: "idempotency_key is not null",
    },
    {
      name: "stand_holds_stand_idx",
      table: "stand_holds",
      keys: ["stand_id"],
      predicate: "",
    },
    {
      name: "stand_holds_user_festival_idx",
      table: "stand_holds",
      keys: ["user_id", "festival_id"],
      predicate: "",
    },
  ];

  const catalogIndexes = await db.execute<{
    indexname: string;
    tablename: string;
    indisunique: boolean;
    indisvalid: boolean;
    indisready: boolean;
    predicate: string | null;
    key_columns: unknown;
  }>(sql`
    SELECT
      pg_class.relname AS indexname,
      tables.relname AS tablename,
      pg_index.indisunique,
      pg_index.indisvalid,
      pg_index.indisready,
      pg_get_expr(pg_index.indpred, pg_index.indrelid) AS predicate,
      (
        SELECT coalesce(array_agg(pg_attribute.attname::text ORDER BY k.ordinality), '{}')
        FROM unnest(pg_index.indkey) WITH ORDINALITY AS k(attnum, ordinality)
        INNER JOIN pg_attribute
          ON pg_attribute.attrelid = pg_index.indrelid
         AND pg_attribute.attnum = k.attnum
      ) AS key_columns
    FROM pg_index
    INNER JOIN pg_class ON pg_class.oid = pg_index.indexrelid
    INNER JOIN pg_class AS tables ON tables.oid = pg_index.indrelid
    INNER JOIN pg_namespace ON pg_namespace.oid = tables.relnamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_class.relname IN (${sql.join(
        requiredIndexes.map((index) => sql`${index.name.slice(0, 63)}`),
        sql`, `,
      )})
  `);
  const catalogByName = new Map(
    catalogIndexes.rows.map((row) => [row.indexname, row]),
  );
  for (const required of requiredIndexes) {
    const catalogName = required.name.slice(0, 63);
    const found = catalogByName.get(catalogName);
    if (!found) {
      findings.push({
        name: `missing_index_${required.name}`,
        count: 1,
        ids: [],
      });
      continue;
    }
    const keysOk = keysMatch(found.key_columns, required.keys);
    const predicateOk =
      normalizeIndexPredicate(found.predicate) === required.predicate;
    const tableOk = found.tablename === required.table;
    if (
      !found.indisvalid ||
      !found.indisready ||
      !found.indisunique ||
      !keysOk ||
      !tableOk ||
      !predicateOk
    ) {
      findings.push({
        name: `invalid_index_${required.name}`,
        count: 1,
        ids: [],
      });
    }
  }

  for (const finding of findings) {
    console.log(
      JSON.stringify({
        finding: finding.name,
        count: finding.count,
        ids: finding.ids.slice(0, 50),
        ...(finding.fingerprint ? { fingerprint: finding.fingerprint } : {}),
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

main().catch((error: unknown) => {
  const errorWithCause =
    error !== null && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown })
      : undefined;
  const cause =
    errorWithCause?.cause !== null && typeof errorWithCause?.cause === "object"
      ? (errorWithCause.cause as { code?: unknown; message?: unknown })
      : undefined;
  const message =
    (typeof cause?.message === "string" ? cause.message : undefined) ??
    (error instanceof Error ? error.message : "Unknown audit error");

  console.error(
    JSON.stringify({
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "Error",
        ...(typeof cause?.code === "string" ? { code: cause.code } : {}),
        message,
      },
    }),
  );
  process.exit(1);
});
