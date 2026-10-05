import "server-only";

import { and, eq, inArray, isNotNull } from "drizzle-orm";

import {
  adminReservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import { resolveFullTableCompanion } from "@/app/lib/reservations/full-table-access";
import {
  fullTableUpgradeMatchesExpectation,
  fullTableUpgradeSuccessMessage,
  planFullTableUpgrade,
  summarizeFullTableUpgradeSettlement,
  type FullTableUpgradeExpectation,
  type FullTableUpgradeSettlementSummary,
} from "@/app/lib/reservations/full-table-upgrade";
import {
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  readReservationParticipantIds,
  sameIdSet,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import { activeReservationStandIds } from "@/app/lib/reservations/members";
import { roundMoney } from "@/app/lib/reservations/money";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import {
  applyReservationRepricing,
  invoicesHaveProofUnderReview,
  invoicesHaveTender,
  latePartnerPrepaidAmount,
  liveReservationIdForStand,
  readRepricingMoneyInputs,
  readReservationInvoices,
  standHasLiveHold,
} from "@/app/lib/reservations/reservation-repricing";
import { isMovableReservationStatus } from "@/app/lib/reservations/stand-change";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { standReservationStands, standReservations, stands } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FullTableUpgradeResult = ReservationActionResult<{
  keptStandId: number;
  addedStandId: number;
  settlement: FullTableUpgradeSettlementSummary;
  /** The upgrade left a waiting reservation fully paid and confirmed it. */
  accepted: boolean;
}>;

const SETTLEMENT_KINDS = ["none", "balance_due", "overpaid"] as const;

/**
 * Admin-only upgrade of a half-table reservation to the full table its stand
 * belongs to (PRD-admin-stand-management, Feature D).
 *
 * The inverse of `downgradeFullTableReservation`, and it leaves the reservation
 * in exactly the shape `createAdminReservation` builds for a full table: the
 * companion becomes a second live member above the kept half, and the
 * reservation bills the table price. So the downgrade keeps working on it.
 *
 * Money already paid is settled with the shared repricing model (§4.6), the
 * same one the stand switch uses: the invoice is repriced in place net of a
 * late partner's payment and keeping any write-off, a balance reopens the
 * reservation, a surplus comes back as credits tagged so later repricings net
 * it out, and a waiting reservation left fully paid is confirmed. No credits
 * are charged for the table and nobody is notified — this is an allocation by
 * an admin, like the admin create, not the participant's paid feature.
 *
 * `expected` is what the admin confirmed in the dialog. The plan is recomputed
 * under the locks, and a mismatch refuses instead of applying different money.
 */
export async function upgradeFullTableReservation(input: {
  reservationId: number;
  idempotencyKey: string;
  expected: FullTableUpgradeExpectation;
}): Promise<FullTableUpgradeResult> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return adminReservationFailure("UNAUTHORIZED");
  }
  const actorId = actor.id;

  return db.transaction(async (tx) => {
    const now = new Date();

    // Assembled before the registry claim because the advisory locks have to
    // be held first, but deliberately judgement-free: every refusal waits
    // until the claim, so retrying a completed upgrade replays its result
    // instead of tripping over the "already a full table" guard.
    const [reservationRow] = await tx
      .select({
        id: standReservations.id,
        festivalId: standReservations.festivalId,
        ownerUserId: standReservations.ownerUserId,
        status: standReservations.status,
      })
      .from(standReservations)
      .where(eq(standReservations.id, input.reservationId))
      .limit(1);
    if (!reservationRow) return adminReservationFailure("STAND_NOT_FOUND");

    // The invoice payers belong in the set too: the aggregate lock discovers
    // every invoice's user and refuses a set that differs from this preview,
    // and a payer who is neither owner nor participant would otherwise turn
    // every attempt into a conflict.
    const previewInvoices = await readReservationInvoices(
      tx,
      reservationRow.id,
    );
    const previewUserIds = uniqueSortedIds([
      ...(await readReservationParticipantIds(tx, reservationRow.id)),
      ...(reservationRow.ownerUserId != null
        ? [reservationRow.ownerUserId]
        : []),
      ...previewInvoices.map((invoice) => invoice.userId),
    ]);
    await lockParticipantsBeforeRegistryClaim(
      tx,
      reservationRow.festivalId,
      previewUserIds,
    );

    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "upgradeFullTableReservation",
      actorUserId: actorId,
      scope: { reservationId: input.reservationId },
    });
    if (claim.kind === "conflict") {
      return adminReservationFailure("CONFLICT_RETRY");
    }
    if (claim.kind === "replayed") {
      const {
        keptStandId,
        addedStandId,
        settlementKind,
        settlementAmount,
        accepted,
      } = claim.resultIds;
      if (
        typeof keptStandId !== "number" ||
        typeof addedStandId !== "number" ||
        typeof settlementAmount !== "number" ||
        !SETTLEMENT_KINDS.includes(
          settlementKind as (typeof SETTLEMENT_KINDS)[number],
        )
      ) {
        return adminReservationFailure("CONFLICT_RETRY");
      }
      const settlement = {
        kind: settlementKind as (typeof SETTLEMENT_KINDS)[number],
        amount: settlementAmount,
      };
      return reservationSuccess(
        { keptStandId, addedStandId, settlement, accepted: accepted === 1 },
        fullTableUpgradeSuccessMessage(settlement, accepted === 1),
      );
    }

    // Every refusal from here on returns rather than throws, so the claim is
    // released and the transaction commits nothing else: all of them come
    // before the first write.
    const fail = async (
      failure: Extract<ReservationActionResult, { success: false }>,
    ) => {
      await abandonRequest(tx, input.idempotencyKey);
      return failure;
    };

    if (!isMovableReservationStatus(reservationRow.status)) {
      return fail(adminReservationFailure("FULL_TABLE_NOT_UPGRADABLE"));
    }
    const previewMemberStandIds = await activeReservationStandIds(
      tx,
      reservationRow.id,
    );
    if (previewMemberStandIds.length !== 1) {
      return fail(adminReservationFailure("FULL_TABLE_NOT_UPGRADABLE"));
    }
    const keptStandId = previewMemberStandIds[0];

    const previewCompanion = await resolveFullTableCompanion(tx, keptStandId);
    if (!previewCompanion) {
      return fail(adminReservationFailure("FULL_TABLE_UPGRADE_NO_TABLE"));
    }
    const addedStandId = previewCompanion.companionStandId;
    if (
      (await standFestivalId(tx, addedStandId)) !== reservationRow.festivalId
    ) {
      return fail(adminReservationFailure("STAND_WRONG_FESTIVAL"));
    }

    // A surplus goes back as credits, which needs the owner's credit account
    // locked — and the canonical order places credit accounts before stands,
    // so the decision is made here, before prices are known. Any money already
    // against an invoice is enough to take the lock, and so is a late
    // partner's payment, which can exceed what is left to pay on its own.
    const previewInvoiceIds = uniqueSortedIds(
      previewInvoices.map((invoice) => invoice.id),
    );
    const lockedCreditUserIds =
      reservationRow.ownerUserId != null &&
      ((await invoicesHaveTender(tx, previewInvoiceIds)) ||
        (await latePartnerPrepaidAmount(tx, reservationRow.id)) > 0)
        ? [reservationRow.ownerUserId]
        : [];

    // No table-pair slot exists in the aggregate lock. The pair is re-resolved
    // under the stand locks below and compared with this preview instead, the
    // same substitute `createAdminReservation` uses.
    const locked = await lockReservationAggregate(tx, {
      festivalId: reservationRow.festivalId,
      userIds: previewUserIds,
      creditAccountUserIds: lockedCreditUserIds,
      standIds: uniqueSortedIds([keptStandId, addedStandId]),
      reservationIds: [reservationRow.id],
      invoiceIds: previewInvoiceIds,
    });
    if (!locked.ok) return fail(adminReservationFailure("CONFLICT_RETRY"));

    // Re-read everything the decision rests on, now that the rows are pinned.
    // Nothing read before the locks feeds a write below: a discount applied,
    // a payment approved or a voucher resolved in between would otherwise be
    // silently overwritten with the preview's view of it.
    const [reservation] = await tx
      .select({
        id: standReservations.id,
        festivalId: standReservations.festivalId,
        status: standReservations.status,
        ownerUserId: standReservations.ownerUserId,
        priceAmountSnapshot: standReservations.priceAmountSnapshot,
        individualPriceSnapshot: standReservations.individualPriceSnapshot,
      })
      .from(standReservations)
      .where(eq(standReservations.id, reservationRow.id))
      .limit(1);
    if (!reservation) return fail(adminReservationFailure("CONFLICT_RETRY"));
    const fromStatus = reservation.status;
    if (!isMovableReservationStatus(fromStatus)) {
      return fail(adminReservationFailure("FULL_TABLE_NOT_UPGRADABLE"));
    }

    const memberStandIds = await activeReservationStandIds(tx, reservation.id);
    if (!sameIdSet(memberStandIds, [keptStandId])) {
      return fail(adminReservationFailure("CONFLICT_RETRY"));
    }

    const invoiceRows = await readReservationInvoices(tx, reservation.id);
    if (
      !sameIdSet(
        invoiceRows.map((invoice) => invoice.id),
        previewInvoiceIds,
      )
    ) {
      return fail(adminReservationFailure("CONFLICT_RETRY"));
    }

    const companion = await resolveFullTableCompanion(tx, keptStandId);
    if (
      !companion ||
      companion.companionStandId !== addedStandId ||
      roundMoney(companion.fullTablePrice) !==
        roundMoney(previewCompanion.fullTablePrice)
    ) {
      return fail(adminReservationFailure("CONFLICT_RETRY"));
    }

    // The stand rows are locked now, and hold creation locks its stands too,
    // so neither check can race a new hold or reservation on the companion.
    // A stale `stands.status` on its own is not a blocker: admins hand out
    // disabled stands by hand, and the status is overwritten below.
    if (await standHasLiveHold(tx, addedStandId, now)) {
      return fail(adminReservationFailure("FULL_TABLE_COMPANION_HELD"));
    }
    if (
      (await liveReservationIdForStand(tx, addedStandId, reservation.id)) !=
      null
    ) {
      return fail(adminReservationFailure("FULL_TABLE_COMPANION_TAKEN"));
    }

    const liveInvoices = invoiceRows.filter(
      (invoice) => invoice.status !== "cancelled",
    );
    // Measured exactly as the stand switch measures it, and as the preview
    // did: the cobro's own tender (earlier refunds already out of it), and net
    // of a late partner's payment.
    const plan = planFullTableUpgrade({
      tablePrice: companion.fullTablePrice,
      priceAmountSnapshot: reservation.priceAmountSnapshot,
      liveInvoice: liveInvoices[0] ?? null,
      reservationStatus: fromStatus,
      ...(await readRepricingMoneyInputs(tx, reservation.id, liveInvoices)),
    });
    const settlement = summarizeFullTableUpgradeSettlement(plan.settlement);

    if (
      plan.priceChanged &&
      (await invoicesHaveProofUnderReview(
        tx,
        invoiceRows.map((invoice) => invoice.id),
      ))
    ) {
      return fail(
        adminReservationFailure("FULL_TABLE_UPGRADE_PROOF_UNDER_REVIEW"),
      );
    }
    if (!fullTableUpgradeMatchesExpectation(plan, input.expected)) {
      return fail(adminReservationFailure("FULL_TABLE_UPGRADE_STALE"));
    }
    if (plan.settlement.kind === "overpaid") {
      // Nobody to hand the surplus to. Refused outright rather than reported
      // as a conflict, which a retry could never get past.
      if (reservation.ownerUserId == null) {
        return fail(
          adminReservationFailure("FULL_TABLE_UPGRADE_REFUND_NO_OWNER"),
        );
      }
      // The preview decided the credit lock; money that appeared since then
      // is a conflict rather than an out-of-order lock.
      if (!lockedCreditUserIds.includes(reservation.ownerUserId)) {
        return fail(adminReservationFailure("CONFLICT_RETRY"));
      }
    }

    const [keptStand] = await tx
      .select({ individualPrice: stands.individualPrice })
      .from(stands)
      .where(eq(stands.id, keptStandId))
      .limit(1);
    if (!keptStand) return fail(adminReservationFailure("CONFLICT_RETRY"));

    // Vetted. Writes only from here on.
    await addCompanionMember(tx, {
      reservationId: reservation.id,
      keptStandId,
      addedStandId,
    });

    await tx
      .update(standReservations)
      .set({
        // What the cobro bills: the table less a late partner's payment. The
        // table price itself is kept on `full_table_price_snapshot`.
        priceAmountSnapshot: plan.grossAmount,
        fullTablePriceSnapshot: plan.toPrice,
        // The half's own prices stay on record — the downgrade prices the
        // surviving half from them. A legacy row that never had one would be
        // downgraded to a half priced at zero, so that one gap is filled from
        // the kept stand. The shared snapshot is never filled on its own: a
        // null there is legitimate (no shared price at booking), and the
        // downgrade already falls back to the individual price.
        ...(reservation.individualPriceSnapshot == null
          ? { individualPriceSnapshot: roundMoney(keptStand.individualPrice) }
          : {}),
        updatedAt: now,
      })
      .where(eq(standReservations.id, reservation.id));

    // After the companion joined: an acceptance confirms every live member.
    await applyReservationRepricing(tx, {
      reservationId: reservation.id,
      ownerUserId: reservation.ownerUserId,
      standId: keptStandId,
      invoices: invoiceRows,
      plan,
      actorUserId: actorId,
      refund: {
        reason: `Mesa completa: diferencia a favor de la reserva #${reservation.id}`,
        idempotencyKey: `full-table-upgrade-refund:${input.idempotencyKey}:${reservation.id}`,
      },
      now,
    });

    // Both halves follow the reservation, the mapping every other path uses:
    // paid means `confirmed`, anything still owed means `reserved`. A balance
    // reopens an accepted reservation, so its kept half comes back down too;
    // a waiting reservation left fully paid is accepted, so both go up.
    const toStatus = isMovableReservationStatus(plan.resultingStatus)
      ? plan.resultingStatus
      : fromStatus;
    await tx
      .update(stands)
      .set({
        status: toStatus === "accepted" ? "confirmed" : "reserved",
        updatedAt: now,
      })
      .where(inArray(stands.id, [keptStandId, addedStandId]));

    await insertStandReservationEvent(tx, {
      reservationId: reservation.id,
      actorUserId: actorId,
      eventType: "status_changed",
      fromStatus,
      toStatus,
      payload: {
        action: "full_table_manually_upgraded",
        keptStandId,
        addedStandId,
        fromPrice: plan.fromPrice,
        toPrice: plan.toPrice,
        settlement: settlement.kind,
        settlementAmount: settlement.amount,
        ...(plan.latePartnerPrepaid > 0
          ? { latePartnerPrepaid: plan.latePartnerPrepaid }
          : {}),
      },
      idempotencyKey: `upgrade:${input.idempotencyKey}`,
    });

    const accepted = plan.completesAcceptance;
    await completeRequest(tx, input.idempotencyKey, {
      keptStandId,
      addedStandId,
      settlementKind: settlement.kind,
      settlementAmount: settlement.amount,
      // The registry stores numbers and strings, not booleans.
      accepted: accepted ? 1 : 0,
    });

    return reservationSuccess(
      { keptStandId, addedStandId, settlement, accepted },
      fullTableUpgradeSuccessMessage(settlement, accepted),
    );
  });
}

async function standFestivalId(
  tx: DbTx,
  standId: number,
): Promise<number | null> {
  const [row] = await tx
    .select({ festivalId: stands.festivalId })
    .from(stands)
    .where(eq(stands.id, standId))
    .limit(1);
  return row?.festivalId ?? null;
}

/**
 * Makes the companion a live member, above the kept half.
 *
 * Member rows are history: `(reservation_id, stand_id)` and
 * `(reservation_id, position)` are both unique across released rows. A
 * reservation downgraded off this very companion still has its row, so that
 * row is revived rather than duplicated. Anything new goes after every
 * position the reservation has ever used, since a downgrade → switch leaves a
 * released row on another stand holding the next position.
 *
 * The kept half must stay the lowest live position — the downgrade keeps
 * `activeReservationStandIds[0]` — so a revived row that sat below it moves up.
 * `reservation_status` is trigger-owned and never written here.
 */
async function addCompanionMember(
  tx: DbTx,
  input: { reservationId: number; keptStandId: number; addedStandId: number },
) {
  const rows = await tx
    .select({
      id: standReservationStands.id,
      standId: standReservationStands.standId,
      position: standReservationStands.position,
      releasedAt: standReservationStands.releasedAt,
    })
    .from(standReservationStands)
    .where(eq(standReservationStands.reservationId, input.reservationId));
  const kept = rows.find(
    (row) => row.standId === input.keptStandId && row.releasedAt == null,
  );
  if (!kept) throw new Error("full_table_upgrade_member_conflict");
  const nextPosition = Math.max(...rows.map((row) => row.position)) + 1;

  const retired = rows.find((row) => row.standId === input.addedStandId);
  if (!retired) {
    await tx.insert(standReservationStands).values({
      reservationId: input.reservationId,
      standId: input.addedStandId,
      position: nextPosition,
    });
    return;
  }

  const revived = await tx
    .update(standReservationStands)
    .set({
      releasedAt: null,
      ...(retired.position < kept.position ? { position: nextPosition } : {}),
    })
    .where(
      and(
        eq(standReservationStands.id, retired.id),
        isNotNull(standReservationStands.releasedAt),
      ),
    )
    .returning({ id: standReservationStands.id });
  if (revived.length !== 1)
    throw new Error("full_table_upgrade_member_conflict");
}
