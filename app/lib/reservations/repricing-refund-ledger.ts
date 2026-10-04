import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { roundMoney } from "@/app/lib/reservations/money";
import type { db } from "@/db";
import { creditLedgerEntries } from "@/db/schema";

/**
 * Where a reservation's repricing refunds live in the credit ledger, and the
 * one reader of them every consumer shares.
 *
 * A leaf module — only the schema — because two very different callers need
 * it: the invoice tender (`tender-queries.ts`), which every settlement path
 * and screen reads, and the credit release (`repricing-refunds.ts`), which the
 * cancellation path reaches. Either importing the other would drag the
 * settlement services into the tender, or the tender into the credit service.
 */

/** Anything that can run a select: the client or a transaction. */
export type LedgerReader = Pick<typeof db, "select">;

/**
 * Marks a refund grant as belonging to a reservation, so later reads find it.
 *
 * The command's idempotency key already names the reservation, but a key is an
 * identifier, not a field to query on. This is the field. Every command that
 * refunds a reservation's surplus tags its grant with it — the name predates
 * the full-table upgrade, and renaming it would orphan the grants already
 * posted under it. A release that takes part of a refund back tags its offset
 * with it too, so the two net.
 */
export const STAND_CHANGE_REFUND_RESERVATION_KEY =
  "standChangeRefundReservationId";

/**
 * On a refund grant, the part of it that handed back a late partner's payment
 * rather than money on the cobro: a stand cheaper than what the late partner
 * alone already paid (`ReservationRepricing.latePartnerRefundAmount`).
 *
 * That part never sat on the cobro, so the tender must not net it — clamped at
 * what the cobro holds, it would read as dropped, then come back against the
 * next payment and show a paid cobro with a balance. It comes off the
 * late-partner figure instead (`latePartnerRefundedAmount`), which is exactly
 * the money it returned. Absent on every other grant and on release offsets.
 */
export const LATE_PARTNER_REFUND_AMOUNT_KEY = "latePartnerRefundAmount";

/**
 * The tag as SQL. The key is a constant, inlined rather than bound, so the
 * select and the `GROUP BY` render the identical expression.
 */
const taggedReservation = sql<string>`${creditLedgerEntries.metadata} ->> '${sql.raw(
  STAND_CHANGE_REFUND_RESERVATION_KEY,
)}'`;

/** An entry's late-partner part, 0 when it has none. */
const latePartnerPart = sql<string>`coalesce((${creditLedgerEntries.metadata} ->> '${sql.raw(
  LATE_PARTNER_REFUND_AMOUNT_KEY,
)}')::numeric, 0)`;

/** What an entry takes off (or, an offset, puts back on) the cobro's tender. */
const cobroRefundSum = sql<string>`coalesce(sum(${creditLedgerEntries.amount} - ${latePartnerPart}), 0)`;

/**
 * The entries that count: refund grants (positive) and release offsets
 * (negative `admin_adjustment`s), unless an entry reverses them. The same rule
 * `computeInvoiceTender` applies to allocations: an admin who undoes a refund
 * from the wallet has put the coverage back, and one who undoes an offset has
 * handed the refund out again.
 */
function countedRefundEntries() {
  return and(
    inArray(creditLedgerEntries.type, ["admin_grant", "admin_adjustment"]),
    sql`NOT EXISTS (
      SELECT 1
      FROM ${creditLedgerEntries} r
      WHERE r.reverses_entry_id = ${creditLedgerEntries.id}
    )`,
  );
}

/**
 * What earlier repricings handed back for one reservation out of its cobro's
 * tender and nothing has taken back since; `userId` narrows it to one wallet,
 * which is how a release nets it. A grant's late-partner part is not in it
 * (`LATE_PARTNER_REFUND_AMOUNT_KEY`). May be negative only after an admin
 * reverts a refund a release had already offset.
 */
export async function repricingRefundedAmount(
  reader: LedgerReader,
  reservationId: number,
  userId?: number,
): Promise<number> {
  const [row] = await reader
    .select({ amount: cobroRefundSum })
    .from(creditLedgerEntries)
    .where(
      and(
        countedRefundEntries(),
        eq(taggedReservation, String(reservationId)),
        userId != null ? eq(creditLedgerEntries.userId, userId) : undefined,
      ),
    );
  return roundMoney(Number(row?.amount ?? 0));
}

/**
 * `repricingRefundedAmount` for many reservations in one query, for the list
 * screens. Reservations with nothing tagged are absent from the map.
 */
export async function repricingRefundsByReservation(
  reader: LedgerReader,
  reservationIds: readonly number[],
): Promise<Map<number, number>> {
  const refunds = new Map<number, number>();
  const ids = [...new Set(reservationIds)];
  if (ids.length === 0) return refunds;

  const rows = await reader
    .select({ reservationId: taggedReservation, amount: cobroRefundSum })
    .from(creditLedgerEntries)
    .where(
      and(countedRefundEntries(), inArray(taggedReservation, ids.map(String))),
    )
    .groupBy(taggedReservation);

  for (const row of rows) {
    const reservationId = Number(row.reservationId);
    if (!Number.isInteger(reservationId)) continue;
    refunds.set(reservationId, roundMoney(Number(row.amount ?? 0)));
  }
  return refunds;
}

/**
 * What earlier repricings handed back of a late partner's payment for one
 * reservation, and nothing has taken back since: the late-partner parts of its
 * unreversed refund grants. `latePartnerPrepaidAmount` takes it off, so a
 * late partner's payment is counted once as paid and, once returned, never
 * again. Reverting the grant from the credit screen puts it back.
 */
export async function latePartnerRefundedAmount(
  reader: LedgerReader,
  reservationId: number,
): Promise<number> {
  const [row] = await reader
    .select({ amount: sql<string>`coalesce(sum(${latePartnerPart}), 0)` })
    .from(creditLedgerEntries)
    .where(
      and(countedRefundEntries(), eq(taggedReservation, String(reservationId))),
    );
  return roundMoney(Number(row?.amount ?? 0));
}
