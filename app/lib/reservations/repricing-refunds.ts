import "server-only";

import {
  offsetReleasedCreditsInTx,
  releaseInvoiceCreditAllocationsInTx,
  type ReleasedAllocation,
} from "@/app/lib/credits/service";
import { roundMoney } from "@/app/lib/reservations/money";
import {
  repricingRefundedAmount,
  STAND_CHANGE_REFUND_RESERVATION_KEY,
} from "@/app/lib/reservations/repricing-refund-ledger";
import { db } from "@/db";

/**
 * The credits a repricing handed back for a reservation, and the one rule that
 * reads them when credits leave its cobro: nobody gets the same credits back
 * twice.
 *
 * Its own module, free of the settlement services, so the cancellation path in
 * `admin-service` can use it without the admin-service → payment-service →
 * admin-service cycle `reservation-repricing` would close. The ledger reads
 * themselves live in `repricing-refund-ledger.ts`, which the invoice tender
 * shares.
 */

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { STAND_CHANGE_REFUND_RESERVATION_KEY };

/**
 * What earlier repricings have handed back for this reservation and nothing
 * has taken back since.
 *
 * Coverage is computed from payments and credit allocations, and a refund
 * touches neither — it posts a grant into the participant's wallet. So the
 * invoice tender nets this against the reservation's live cobro
 * (`loadInvoiceTenders`): without it, every move would re-measure the same
 * coverage an earlier move already paid out against (500 → 300 refunds 200,
 * then 300 → 200 refunds another 200, against 500 tendered once), and moving
 * back up (500 → 300 → 500) would read as fully covered on a stand the
 * participant no longer has the money for, because the 200 is in their wallet
 * now.
 *
 * Refund grants count positive and release offsets
 * (`releaseReservationInvoiceCreditsInTx`) negative: once a release has netted
 * a refund against the allocation it came out of, that refund is no longer
 * outstanding, and counting it again would short the next move. Reversed
 * entries are excluded.
 *
 * Keyed on the reservation rather than the owner, because it is the
 * reservation's coverage being restated — a reservation whose owner changed
 * still had the money handed back exactly once. `userId` narrows it to one
 * wallet, which is how a release nets it.
 */
export async function standChangeRefundedAmount(
  tx: DbTx,
  reservationId: number,
  userId?: number,
): Promise<number> {
  return repricingRefundedAmount(tx, reservationId, userId);
}

export type RepricingRefundOffset = {
  userId: number;
  amount: number;
  ledgerEntryId: number;
};

/**
 * Hands back the credits standing on one of a reservation's cobros, net of
 * what a repricing already refunded from them.
 *
 * A move to a cheaper stand refunds the surplus as a grant and leaves the
 * allocation standing, so the allocation reads above the cobro it pays. Every
 * path that hands allocations back — cancelling the reservation, rejecting its
 * voucher with a cancellation, "Devolver créditos" — used to release them
 * whole, and the participant ended up with the refund twice: Bs500 of credits
 * on a Bs500 cobro, moved to a Bs300 stand (Bs200 back), then cancelled, came
 * to Bs700.
 *
 * The release itself stays whole (see `offsetReleasedCreditsInTx` for why it
 * cannot be trimmed); each wallet then gives back the part of its own
 * outstanding refunds that the release just returned a second time. The
 * effect is a capped release — never more than the allocation, never below
 * zero, and the balance never dips below where it started even when the grant
 * was already spent — and the offset carries the refund tag, so the refund
 * stops counting for later repricings and a partial release nets only what it
 * released.
 *
 * Netted per wallet, credits first. The refund went to the owner and
 * allocations are made by the cobro's holder, who is the owner on every path
 * that creates both; a refund whose recipient released nothing here is left
 * alone, since taking it out of somebody else's credits would move money
 * between people. A refund larger than the credits released (the surplus was
 * funded by cash) keeps the part the credits cannot cover: cash is never
 * handed back by a release, so that part was owed either way.
 *
 * Offsets are read after the release, under the wallet locks its refunds take,
 * so an admin reverting a grant at the same moment is seen rather than
 * offset a second time. A failure throws: the release is already written, and
 * returning would let a caller commit it without its offset.
 */
export async function releaseReservationInvoiceCreditsInTx(
  tx: DbTx,
  input: {
    reservationId: number;
    invoiceId: number;
    /** Restrict to one allocation; omit to release all of them. */
    allocationId?: number;
    idempotencyKey: string;
  },
): Promise<
  | {
      ok: true;
      released: ReleasedAllocation[];
      offsets: RepricingRefundOffset[];
      /** What reached the wallets: released less offset. */
      returnedAmount: number;
    }
  | {
      ok: false;
      code: "CREDITS_NOT_RELEASABLE" | "CREDITS_ALREADY_RELEASED" | "CONFLICT";
    }
> {
  const release = await releaseInvoiceCreditAllocationsInTx(tx, {
    invoiceId: input.invoiceId,
    allocationId: input.allocationId,
    idempotencyKey: input.idempotencyKey,
  });
  if (!release.ok) return release;

  const releasedByUser = new Map<number, number>();
  for (const row of release.released) {
    releasedByUser.set(
      row.userId,
      roundMoney((releasedByUser.get(row.userId) ?? 0) + row.amount),
    );
  }

  const offsets: RepricingRefundOffset[] = [];
  // Ascending, like the release's own locks, so the order is deterministic.
  for (const userId of [...releasedByUser.keys()].sort((a, b) => a - b)) {
    const refunded = await standChangeRefundedAmount(
      tx,
      input.reservationId,
      userId,
    );
    const amount = Math.min(
      Math.max(0, refunded),
      releasedByUser.get(userId) ?? 0,
    );
    if (amount <= 0) continue;
    const entry = await offsetReleasedCreditsInTx(tx, {
      userId,
      amount,
      reason: `Diferencia a favor de la reserva #${input.reservationId} ya devuelta: se descuenta de los créditos devueltos del cobro #${input.invoiceId}`,
      idempotencyKey: `repricing-refund-offset:${input.invoiceId}:${input.idempotencyKey}:${userId}`,
      metadata: {
        [STAND_CHANGE_REFUND_RESERVATION_KEY]: String(input.reservationId),
      },
    });
    if (!entry) throw new Error("repricing_refund_offset_failed");
    offsets.push({ userId, amount, ledgerEntryId: entry.ledgerEntryId });
  }

  const releasedTotal = release.released.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const offsetTotal = offsets.reduce((sum, row) => sum + row.amount, 0);
  return {
    ok: true,
    released: release.released,
    offsets,
    returnedAmount: roundMoney(releasedTotal - offsetTotal),
  };
}
