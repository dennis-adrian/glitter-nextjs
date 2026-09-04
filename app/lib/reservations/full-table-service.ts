import "server-only";

import { and, eq, gt } from "drizzle-orm";

import {
  createCreditHoldForFeatureInTx,
  releaseCreditHoldForFeatureInTx,
} from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import {
  findActiveFullTableAccess,
  hasCompleteFullTable,
} from "@/app/lib/reservations/full-table-access";
import { insertStandReservationEvent } from "@/app/lib/reservations/events";
import {
  lockCreditAccountRows,
  lockFestivalRow,
  lockParticipantsBeforeRegistryClaim,
  lockReservationAggregate,
  lockUserRows,
  readReservationParticipantIds,
  sameIdSet,
  uniqueSortedIds,
} from "@/app/lib/reservations/locks";
import {
  activeReservationStandIds,
  releaseReservationMember,
} from "@/app/lib/reservations/members";
import { roundMoney } from "@/app/lib/reservations/money";
import { releaseStandIfVacant } from "@/app/lib/reservations/occupancy";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { denySelfServiceMutationBeforeOpen } from "@/app/lib/reservations/tx-eligibility";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  invoiceCreditAllocations,
  invoices,
  payments,
  reservationFeatureActions,
  standHoldMembers,
  standHolds,
  standReservationStands,
  standReservations,
  users,
} from "@/db/schema";

import {
  FULL_TABLE_CATEGORIES,
  type FullTableCategory,
} from "@/app/lib/stands/full-table-pairs";

function eligibleCategory(category: unknown): FullTableCategory | null {
  return FULL_TABLE_CATEGORIES.includes(category as FullTableCategory)
    ? (category as FullTableCategory)
    : null;
}

/**
 * Who is activating. Structural rather than the full profile: the credit
 * purchase path resolves these three columns itself, having no session to read.
 */
type FullTableActor = {
  id: number;
  role: string;
  category: unknown;
};

export type FullTableActivationResult = ReservationActionResult<{
  featureActionId: number;
  creditPrice: number;
  /** True when access was already active, so the caller can skip re-announcing it. */
  alreadyActive: boolean;
}>;

/**
 * Activates full-table access for the caller in one festival.
 *
 * Activation buys permission to try while availability lasts — never a
 * guarantee of a table or a location (PRD §7.3). The feature action and an
 * equal credit hold are created in one transaction, so access can never exist
 * without the credits behind it. The held credits stay in the wallet but
 * cannot be spent elsewhere until the participant either confirms a two-stand
 * reservation (capture) or settles for one half / deactivates (release).
 */
export async function activateFullTableAccess(input: {
  festivalId: number;
  idempotencyKey: string;
}): Promise<FullTableActivationResult> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  return activateFullTableAccessAs(actor, input);
}

/**
 * The activation itself, for a caller that has already established who is
 * acting.
 *
 * Kept separate from the exported entry points rather than given an optional
 * `actor` override: the override would sit on the same function the server
 * action calls, one stray field away from letting a request name its own
 * actor.
 */
async function activateFullTableAccessAs(
  actor: FullTableActor,
  input: {
    festivalId: number;
    idempotencyKey: string;
  },
): Promise<FullTableActivationResult> {
  return db.transaction(async (tx) => {
    await lockParticipantsBeforeRegistryClaim(tx, input.festivalId, [actor.id]);

    // Claimed before any eligibility or configuration check: a retry of a
    // request that already succeeded has to replay that result, and would
    // otherwise fail because an admin has since disabled the feature or the
    // participant's category changed.
    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "activateFullTableAccess",
      actorUserId: actor.id,
      scope: { festivalId: input.festivalId },
    });
    if (claim.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
    if (claim.kind === "replayed") {
      const featureActionId = claim.resultIds.featureActionId;
      const creditPrice = claim.resultIds.creditPrice;
      if (typeof featureActionId !== "number") {
        return reservationFailure("CONFLICT_RETRY");
      }
      return reservationSuccess(
        {
          featureActionId,
          // The price this access was actually taken at. Reading the current
          // configuration would report a later admin edit as though the
          // participant had been charged it.
          creditPrice: typeof creditPrice === "number" ? creditPrice : 0,
          alreadyActive: true,
        },
        "Ya tenés la mesa completa activada.",
      );
    }

    const finish = async (
      outcome: FullTableActivationResult,
      result?: { featureActionId: number; creditPrice: number },
    ) => {
      if (outcome.success && result != null) {
        await completeRequest(tx, input.idempotencyKey, result);
      } else {
        await abandonRequest(tx, input.idempotencyKey);
      }
      return outcome;
    };

    // Validation happens under the claim, so a refusal releases it rather than
    // leaving the key stuck in progress.
    const category = eligibleCategory(actor.category);
    if (!category) {
      return finish(reservationFailure("FULL_TABLE_CATEGORY_INELIGIBLE"));
    }

    // Activation is deliberately reachable before reservations open, so it
    // cannot lean on the map page's gate the way every other participant
    // mutation does. The clock is the one rule that must not apply here;
    // enrollment, terms, verification and sanctions all still must.
    const denial = await denySelfServiceMutationBeforeOpen(tx, {
      actor: { id: actor.id, role: actor.role },
      userId: actor.id,
      festivalId: input.festivalId,
    });
    if (denial) return finish(denial);

    // Read on this transaction's connection: reaching for the pool while
    // holding festival and user locks can self-deadlock under load.
    const config = await fetchFeatureConfig(
      input.festivalId,
      "full_table",
      category,
      new Date(),
      tx,
    );
    if (!config || !config.enabled || !config.available) {
      return finish(reservationFailure("FULL_TABLE_UNAVAILABLE"));
    }

    await lockFestivalRow(tx, input.festivalId);
    await lockUserRows(tx, [actor.id]);
    await lockCreditAccountRows(tx, [actor.id]);

    const existing = await findActiveFullTableAccess(tx, {
      userId: actor.id,
      festivalId: input.festivalId,
    });
    if (existing) {
      return finish(
        reservationSuccess(
          {
            featureActionId: existing.featureActionId,
            creditPrice: existing.featurePriceSnapshot,
            alreadyActive: true,
          },
          "Ya tenés la mesa completa activada.",
        ),
        {
          featureActionId: existing.featureActionId,
          creditPrice: existing.featurePriceSnapshot,
        },
      );
    }

    // Offering access with nothing complete left would sell permission to try
    // something that cannot succeed.
    if (
      !(await hasCompleteFullTable(tx, {
        festivalId: input.festivalId,
        category,
      }))
    ) {
      return finish(reservationFailure("FULL_TABLE_NONE_COMPLETE"));
    }

    const [action] = await tx
      .insert(reservationFeatureActions)
      .values({
        festivalId: input.festivalId,
        ownerUserId: actor.id,
        type: "full_table_access",
        status: "active",
        featureConfigId: config.id,
        featurePriceSnapshot: config.creditPrice,
        idempotencyKey: `full-table-access:${input.idempotencyKey}`,
      })
      .returning({ id: reservationFeatureActions.id });
    if (!action) return finish(reservationFailure("CONFLICT_RETRY"));

    const hold = await createCreditHoldForFeatureInTx(tx, {
      userId: actor.id,
      festivalId: input.festivalId,
      featureActionId: action.id,
      amount: config.creditPrice,
      idempotencyKey: `full-table-hold:${input.idempotencyKey}`,
    });
    if (!hold.ok) {
      // `finish` still has to commit its registry release, so the transaction
      // cannot be rolled back to undo the insert — the action is deleted
      // explicitly instead. Access must never exist without the credits behind
      // it, and nothing references the row yet.
      await tx
        .delete(reservationFeatureActions)
        .where(eq(reservationFeatureActions.id, action.id));
      return finish(
        hold.code === "INSUFFICIENT_CREDITS"
          ? reservationFailure("FULL_TABLE_INSUFFICIENT_CREDITS")
          : reservationFailure("CONFLICT_RETRY"),
      );
    }

    return finish(
      reservationSuccess(
        {
          featureActionId: action.id,
          creditPrice: config.creditPrice,
          alreadyActive: false,
        },
        "Mesa completa activada.",
      ),
      { featureActionId: action.id, creditPrice: config.creditPrice },
    );
  });
}

/**
 * Activates full-table access off the back of the purchase that funded it.
 *
 * Buying credits from a full-table screen is already the participant saying
 * what they are for, so asking them to press "Activar" afterwards is asking the
 * same question twice. Credits topped up for anything else — an invoice, a
 * debt, an admin grant, a purchase they never spent — carry no such intent, and
 * those still take an explicit activation.
 *
 * Best-effort by design: the credits are issued either way, and a refusal here
 * (nothing complete left, terms since changed) just leaves them spendable in
 * the wallet with the panel offering activation the ordinary way.
 */
export async function activateFullTableAccessAfterPurchase(input: {
  userId: number;
  festivalId: number;
  topUpId: number;
}): Promise<FullTableActivationResult> {
  const [actor] = await db
    .select({ id: users.id, role: users.role, category: users.category })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  return activateFullTableAccessAs(actor, {
    festivalId: input.festivalId,
    // Derived from the top-up rather than random: the upload callback can be
    // retried by UploadThing, and the registry is what stops that becoming a
    // second activation and a second credit hold.
    idempotencyKey: `credit-top-up:${input.topUpId}:full-table`,
  });
}

/**
 * Turns access off before booking and frees the held credits.
 *
 * The credits are not refunded — they were never spent. They simply become
 * spendable again, including on the participant's own stand invoice.
 */
export async function deactivateFullTableAccess(input: {
  festivalId: number;
  idempotencyKey: string;
}): Promise<ReservationActionResult<{ featureActionId: number | null }>> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  return db.transaction(async (tx) => {
    await lockParticipantsBeforeRegistryClaim(tx, input.festivalId, [actor.id]);

    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "deactivateFullTableAccess",
      actorUserId: actor.id,
      scope: { festivalId: input.festivalId },
    });
    if (claim.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
    if (claim.kind === "replayed") {
      // Null only when the original call found nothing active to turn off.
      const featureActionId = claim.resultIds.featureActionId;
      return reservationSuccess(
        {
          featureActionId:
            typeof featureActionId === "number" ? featureActionId : null,
        },
        "Mesa completa desactivada.",
      );
    }

    await lockUserRows(tx, [actor.id]);
    await lockCreditAccountRows(tx, [actor.id]);

    // A live two-stand hold was taken on the strength of this access. Letting
    // it go now would leave the participant holding a full table with nothing
    // paying for it, so the hold has to be cancelled first.
    const [fullTableHold] = await tx
      .select({ id: standHolds.id })
      .from(standHolds)
      .innerJoin(standHoldMembers, eq(standHoldMembers.holdId, standHolds.id))
      .where(
        and(
          eq(standHolds.userId, actor.id),
          eq(standHolds.festivalId, input.festivalId),
          gt(standHolds.expiresAt, new Date()),
          gt(standHoldMembers.position, 0),
        ),
      )
      .limit(1);
    if (fullTableHold) {
      await abandonRequest(tx, input.idempotencyKey);
      return reservationFailure("FULL_TABLE_HOLD_ACTIVE");
    }

    const access = await findActiveFullTableAccess(tx, {
      userId: actor.id,
      festivalId: input.festivalId,
    });
    if (!access) {
      await completeRequest(tx, input.idempotencyKey, {});
      return reservationSuccess(
        { featureActionId: null },
        "Mesa completa desactivada.",
      );
    }

    const released = await releaseCreditHoldForFeatureInTx(tx, {
      userId: actor.id,
      featureActionId: access.featureActionId,
      status: "released",
    });
    if (!released.ok) {
      await abandonRequest(tx, input.idempotencyKey);
      return reservationFailure("CONFLICT_RETRY");
    }

    await tx
      .update(reservationFeatureActions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(reservationFeatureActions.id, access.featureActionId),
          eq(reservationFeatureActions.status, "active"),
        ),
      );

    await completeRequest(tx, input.idempotencyKey, {
      featureActionId: access.featureActionId,
    });
    return reservationSuccess(
      { featureActionId: access.featureActionId },
      "Mesa completa desactivada. Tus créditos vuelven a estar disponibles.",
    );
  });
}

/**
 * Admin-only manual downgrade of a full-table reservation to its original half
 * (PRD §7.7).
 *
 * This is the sanctioned resolution when a credit voucher that funded a full
 * table is later rejected. Nothing about it is automatic: rejection creates
 * wallet debt and an admin decides, case by case, whether to ask for
 * replacement payment, waive the debt, or come here.
 *
 * The reservation keeps the half the participant originally selected —
 * member position 0 — and only the companion is released. Credits, invoice,
 * payments and participants are all left exactly as they are.
 */
export async function downgradeFullTableReservation(input: {
  reservationId: number;
  idempotencyKey: string;
}): Promise<
  ReservationActionResult<{ releasedStandId: number; keptStandId: number }>
> {
  const actor = await getCurrentUserProfile();
  if (!canMutateAdminReservations(actor)) {
    return reservationFailure("UNAUTHORIZED");
  }

  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select({
        id: standReservations.id,
        festivalId: standReservations.festivalId,
        status: standReservations.status,
        ownerUserId: standReservations.ownerUserId,
        individualPriceSnapshot: standReservations.individualPriceSnapshot,
        sharedPriceSnapshot: standReservations.sharedPriceSnapshot,
        fullTablePriceSnapshot: standReservations.fullTablePriceSnapshot,
        bookedParticipantCount: standReservations.bookedParticipantCount,
      })
      .from(standReservations)
      .where(eq(standReservations.id, input.reservationId))
      .limit(1);
    if (!reservation) return reservationFailure("STAND_NOT_FOUND");

    // The aggregate lock re-reads these under the locks and refuses when they
    // moved, so they have to be previewed before the registry claim takes its
    // foreign-key share lock on the actor.
    const previewUserIds = uniqueSortedIds([
      ...(await readReservationParticipantIds(tx, reservation.id)),
      ...(reservation.ownerUserId != null ? [reservation.ownerUserId] : []),
    ]);
    await lockParticipantsBeforeRegistryClaim(
      tx,
      reservation.festivalId,
      previewUserIds,
    );

    const claim = await claimRequest(tx, {
      requestKey: input.idempotencyKey,
      operation: "downgradeFullTableReservation",
      actorUserId: actor!.id,
      scope: { reservationId: input.reservationId },
    });
    if (claim.kind === "conflict") return reservationFailure("CONFLICT_RETRY");
    if (claim.kind === "replayed") {
      const releasedStandId = claim.resultIds.releasedStandId;
      const keptStandId = claim.resultIds.keptStandId;
      if (
        typeof releasedStandId !== "number" ||
        typeof keptStandId !== "number"
      ) {
        return reservationFailure("CONFLICT_RETRY");
      }
      return reservationSuccess(
        { releasedStandId, keptStandId },
        "La mesa completa ya fue reducida a media mesa.",
      );
    }

    const previewStandIds = await activeReservationStandIds(tx, reservation.id);
    if (previewStandIds.length !== 2) {
      await abandonRequest(tx, input.idempotencyKey);
      return reservationFailure("FULL_TABLE_NOT_DOWNGRADABLE");
    }

    // Occupancy is revalidated under the stand locks before anything moves.
    const locked = await lockReservationAggregate(tx, {
      festivalId: reservation.festivalId,
      userIds: previewUserIds,
      standIds: previewStandIds,
      reservationIds: [reservation.id],
    });
    if (!locked.ok) {
      await abandonRequest(tx, input.idempotencyKey);
      return reservationFailure("CONFLICT_RETRY");
    }

    // Membership was previewed before those locks existed. Re-reading it now
    // is what makes the release act on stands whose occupancy is actually
    // pinned; a set that moved means someone else got there first.
    const memberStandIds = await activeReservationStandIds(tx, reservation.id);
    if (!sameIdSet(memberStandIds, previewStandIds)) {
      await abandonRequest(tx, input.idempotencyKey);
      return reservationFailure("CONFLICT_RETRY");
    }

    const keptStandId = memberStandIds[0];
    const releasedStandId = memberStandIds[1];

    // The reservation was billed for a whole table, and it no longer is one.
    // Leaving the invoice alone would charge the participant a table's price
    // for one half — under the old model the invoice already was a single
    // stand's price, so downgrading really did leave the money alone.
    //
    // Priced and vetted before anything is released, under the invoice's own
    // lock: a refusal returns rather than throws, so the transaction commits
    // whatever came before it. Releasing first would free the companion stand
    // and then report the downgrade as refused.
    let repricing: {
      halfPrice: number;
      invoiceId: number | null;
      discountAmount: number;
    } | null = null;
    if (reservation.fullTablePriceSnapshot != null) {
      const halfPrice =
        reservation.bookedParticipantCount > 1 &&
        reservation.sharedPriceSnapshot != null
          ? Number(reservation.sharedPriceSnapshot)
          : Number(reservation.individualPriceSnapshot ?? 0);

      const [invoice] = await tx
        .select({ id: invoices.id, discountAmount: invoices.discountAmount })
        .from(invoices)
        .where(eq(invoices.reservationId, reservation.id))
        .limit(1)
        .for("update");

      if (invoice) {
        // Anything already tendered against the table's price would have to be
        // refunded or re-applied, which is a decision this command cannot make.
        const [settled] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.invoiceId, invoice.id))
          .limit(1);
        const [allocated] = await tx
          .select({ id: invoiceCreditAllocations.id })
          .from(invoiceCreditAllocations)
          .where(eq(invoiceCreditAllocations.invoiceId, invoice.id))
          .limit(1);
        if (settled || allocated) {
          await abandonRequest(tx, input.idempotencyKey);
          return reservationFailure("FULL_TABLE_NOT_DOWNGRADABLE");
        }
      }

      repricing = {
        halfPrice,
        invoiceId: invoice?.id ?? null,
        // Clamped to the new price, the same bound `applyReservationWriteSet`
        // uses: a discount agreed against a full table can exceed half of one,
        // and a discount larger than the invoice would invert the total.
        discountAmount: Math.min(
          halfPrice,
          roundMoney(Number(invoice?.discountAmount ?? 0)),
        ),
      };
    }

    const didRelease = await releaseReservationMember(tx, {
      reservationId: reservation.id,
      standId: releasedStandId,
    });
    if (!didRelease) {
      await abandonRequest(tx, input.idempotencyKey);
      return reservationFailure("CONFLICT_RETRY");
    }

    await releaseStandIfVacant(tx, releasedStandId);

    if (repricing) {
      if (repricing.invoiceId != null) {
        await tx
          .update(invoices)
          .set({
            // `amount` is what is owed, so it has to keep honouring the
            // discount. Writing the gross half price here billed a discounted
            // participant the full amount and broke the invoice's own
            // `amount = originalAmount - discountAmount` invariant.
            originalAmount: repricing.halfPrice,
            discountAmount: repricing.discountAmount,
            amount: roundMoney(repricing.halfPrice - repricing.discountAmount),
            updatedAt: new Date(),
          })
          .where(eq(invoices.id, repricing.invoiceId));
      }

      await tx
        .update(standReservations)
        .set({
          priceAmountSnapshot: repricing.halfPrice,
          fullTablePriceSnapshot: null,
          updatedAt: new Date(),
        })
        .where(eq(standReservations.id, reservation.id));
    }

    await insertStandReservationEvent(tx, {
      reservationId: reservation.id,
      actorUserId: actor!.id,
      eventType: "status_changed",
      fromStatus: reservation.status,
      toStatus: reservation.status,
      payload: {
        action: "full_table_manually_downgraded",
        keptStandId,
        releasedStandId,
      },
      idempotencyKey: `downgrade:${input.idempotencyKey}`,
    });

    await completeRequest(tx, input.idempotencyKey, {
      releasedStandId,
      keptStandId,
    });

    return reservationSuccess(
      { releasedStandId, keptStandId },
      "La reserva quedó con media mesa. El otro espacio volvió a estar disponible.",
    );
  });
}
