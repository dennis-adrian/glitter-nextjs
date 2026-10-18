import "server-only";

import { eq } from "drizzle-orm";

import {
  fullTableUpgradeExpectation,
  planFullTableUpgrade,
  type FullTableUpgradeExpectation,
  type FullTableUpgradePlan,
} from "@/app/lib/reservations/full-table-upgrade";
import { activeReservationStandIds } from "@/app/lib/reservations/members";
import { roundMoney } from "@/app/lib/reservations/money";
import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import {
  coveredAmountForInvoices,
  invoicesHaveProofUnderReview,
  invoicesHaveTender,
  liveReservationIdForStand,
  readReservationInvoices,
  standChangeRefundedAmount,
  standHasLiveHold,
} from "@/app/lib/reservations/reservation-repricing";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { standGroups, standReservations, stands } from "@/db/schema";

export type FullTableUpgradeCompanionState = "free" | "occupied" | "held";

export type FullTableUpgradePreview = {
  reservationStatus: string;
  keptStand: { id: number; label: string };
  /** The kept stand belongs to a `stand_groups` row of type `full_table`. */
  inFullTableGroup: boolean;
  /** `malformed`: the group is not exactly two stands. */
  groupIssue: "malformed" | "unpriced" | null;
  companion: { id: number; label: string } | null;
  /** Judged the way the service judges it under its locks: hold first. */
  companionState: FullTableUpgradeCompanionState | null;
  tablePrice: number | null;
  /** A comprobante or a zero-value request in `submitted`. */
  proofUnderReview: boolean;
  /** The reservation has a live (non-cancelled) invoice to reprice. */
  hasInvoice: boolean;
  /** A surplus can only be handed back to an owner. */
  hasOwner: boolean;
  /**
   * Any payment or credit allocation row at all, the downgrade's own test for
   * refusing: once this is true, the upgraded table can never be reduced back.
   */
  hasTender: boolean;
  /** Null when there is no priced, well-formed table to upgrade into. */
  plan: FullTableUpgradePlan | null;
  /** What the upgrade action must send back so the server applies this plan. */
  expected: FullTableUpgradeExpectation | null;
};

/**
 * Everything the edit page needs to offer "Ampliar a mesa completa" and to say,
 * before the admin confirms, what it will do to the money.
 *
 * Computed with the same helpers and the same planner the service runs under
 * its locks, so the numbers in the dialog are the numbers applied — and the
 * service refuses when they have moved since. Read-only: it runs in a
 * read-only transaction, which Postgres enforces.
 *
 * Returns null to anyone without admin read access, and for a reservation that
 * does not hold exactly one stand (there is no single half to widen).
 */
export async function fetchFullTableUpgradePreview(
  reservationId: number,
): Promise<FullTableUpgradePreview | null> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return null;

  return db.transaction(
    async (tx) => {
      const now = new Date();
      const [reservation] = await tx
        .select({
          id: standReservations.id,
          status: standReservations.status,
          ownerUserId: standReservations.ownerUserId,
          priceAmountSnapshot: standReservations.priceAmountSnapshot,
        })
        .from(standReservations)
        .where(eq(standReservations.id, reservationId))
        .limit(1);
      if (!reservation) return null;

      const memberStandIds = await activeReservationStandIds(
        tx,
        reservation.id,
      );
      if (memberStandIds.length !== 1) return null;

      const [kept] = await tx
        .select({
          id: stands.id,
          label: stands.label,
          standNumber: stands.standNumber,
          standGroupId: stands.standGroupId,
          groupType: standGroups.type,
          fullTablePrice: standGroups.fullTablePrice,
        })
        .from(stands)
        .leftJoin(standGroups, eq(standGroups.id, stands.standGroupId))
        .where(eq(stands.id, memberStandIds[0]))
        .limit(1);
      if (!kept) return null;

      const invoiceRows = await readReservationInvoices(tx, reservation.id);
      const invoiceIds = invoiceRows.map((invoice) => invoice.id);
      const liveInvoices = invoiceRows.filter(
        (invoice) => invoice.status !== "cancelled",
      );

      const base = {
        reservationStatus: reservation.status,
        keptStand: { id: kept.id, label: formatStandLabel(kept) },
        proofUnderReview: await invoicesHaveProofUnderReview(tx, invoiceIds),
        hasInvoice: liveInvoices.length > 0,
        hasOwner: reservation.ownerUserId != null,
        hasTender: await invoicesHaveTender(tx, invoiceIds),
      };

      if (kept.standGroupId == null || kept.groupType !== "full_table") {
        return {
          ...base,
          inFullTableGroup: false,
          groupIssue: null,
          companion: null,
          companionState: null,
          tablePrice: null,
          plan: null,
          expected: null,
        };
      }

      const siblings = await tx
        .select({
          id: stands.id,
          label: stands.label,
          standNumber: stands.standNumber,
        })
        .from(stands)
        .where(eq(stands.standGroupId, kept.standGroupId));
      const others = siblings.filter((sibling) => sibling.id !== kept.id);
      const companionRow = siblings.length === 2 ? others[0] : null;
      const tablePrice =
        kept.fullTablePrice == null ? null : roundMoney(kept.fullTablePrice);
      const groupIssue =
        companionRow == null
          ? "malformed"
          : tablePrice == null
            ? "unpriced"
            : null;

      let companionState: FullTableUpgradeCompanionState | null = null;
      if (companionRow) {
        companionState = (await standHasLiveHold(tx, companionRow.id, now))
          ? "held"
          : (await liveReservationIdForStand(
                tx,
                companionRow.id,
                reservation.id,
              )) != null
            ? "occupied"
            : "free";
      }

      let plan: FullTableUpgradePlan | null = null;
      if (groupIssue == null && tablePrice != null) {
        const coveredAmount = Math.max(
          0,
          roundMoney(
            (await coveredAmountForInvoices(tx, liveInvoices)) -
              (await standChangeRefundedAmount(tx, reservation.id)),
          ),
        );
        plan = planFullTableUpgrade({
          tablePrice,
          priceAmountSnapshot: reservation.priceAmountSnapshot,
          liveInvoice: liveInvoices[0] ?? null,
          coveredAmount,
        });
      }

      return {
        ...base,
        inFullTableGroup: true,
        groupIssue,
        companion: companionRow
          ? { id: companionRow.id, label: formatStandLabel(companionRow) }
          : null,
        companionState,
        tablePrice,
        plan,
        expected: plan ? fullTableUpgradeExpectation(plan) : null,
      };
    },
    { accessMode: "read only" },
  );
}
