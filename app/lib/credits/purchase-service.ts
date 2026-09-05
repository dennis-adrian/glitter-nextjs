import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { exactCreditShortfall, roundCredits } from "@/app/lib/credits/balances";
import {
  createCreditTopUpForRequirementInTx,
  getCreditBalancesInTx,
} from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import {
  reservationFailure,
  reservationSuccess,
  type ReservationActionResult,
} from "@/app/lib/reservations/errors";
import {
  lockCreditAccountRows,
  lockFestivalRow,
  lockParticipantsBeforeRegistryClaim,
  lockUserRows,
} from "@/app/lib/reservations/locks";
import {
  abandonRequest,
  claimRequest,
  completeRequest,
} from "@/app/lib/reservations/request-registry";
import { denySelfServiceMutationBeforeOpen } from "@/app/lib/reservations/tx-eligibility";
import {
  FULL_TABLE_CATEGORIES,
  type FullTableCategory,
} from "@/app/lib/stands/full-table-pairs";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import { creditTopUps } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The only feature a participant can buy credits for today.
 *
 * Late partner and reservation release have configuration rows but no
 * implementation, so there is nothing to fund; the admin panel disables them
 * for the same reason. Widening this list means teaching `intendedUseId` to
 * distinguish features — it stores the festival id, which is enough only while
 * one feature per festival is purchasable.
 */
export const PURCHASABLE_FEATURE_TYPES = ["full_table"] as const;
export type PurchasableFeatureType = (typeof PURCHASABLE_FEATURE_TYPES)[number];

export type CreditPurchase = {
  topUpId: number;
  amount: number;
  uploadDeadlineAt: string;
};

export type CreditPurchaseResult = ReservationActionResult<CreditPurchase>;

const UPLOAD_PROMPT =
  "Subí el comprobante antes de que venza el plazo para recibir tus créditos.";

function eligibleCategory(category: unknown): FullTableCategory | null {
  return FULL_TABLE_CATEGORIES.includes(category as FullTableCategory)
    ? (category as FullTableCategory)
    : null;
}

type OpenTopUp = {
  id: number;
  amount: number;
  status: string;
  uploadDeadlineAt: Date;
};

/**
 * The participant's open purchases for one intended use, locked.
 *
 * Read under the credit account lock so a second tab cannot open a parallel
 * session between this check and the insert.
 */
async function lockOpenTopUps(
  tx: DbTx,
  input: {
    userId: number;
    intendedUseType: "feature" | "debt";
    intendedUseId: number | null;
  },
): Promise<OpenTopUp[]> {
  return tx
    .select({
      id: creditTopUps.id,
      amount: creditTopUps.amount,
      status: creditTopUps.status,
      uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
    })
    .from(creditTopUps)
    .where(
      and(
        eq(creditTopUps.userId, input.userId),
        eq(creditTopUps.intendedUseType, input.intendedUseType),
        input.intendedUseId == null
          ? sql`${creditTopUps.intendedUseId} IS NULL`
          : eq(creditTopUps.intendedUseId, input.intendedUseId),
        sql`${creditTopUps.status} IN ('awaiting_voucher', 'under_review')`,
      ),
    )
    .for("update");
}

async function replayTopUp(
  tx: DbTx,
  topUpId: unknown,
): Promise<CreditPurchaseResult> {
  if (typeof topUpId !== "number") return reservationFailure("CONFLICT_RETRY");
  const [existing] = await tx
    .select({
      id: creditTopUps.id,
      amount: creditTopUps.amount,
      uploadDeadlineAt: creditTopUps.uploadDeadlineAt,
    })
    .from(creditTopUps)
    .where(eq(creditTopUps.id, topUpId))
    .limit(1);
  if (!existing) return reservationFailure("CONFLICT_RETRY");
  return reservationSuccess(
    {
      topUpId: existing.id,
      amount: existing.amount,
      uploadDeadlineAt: existing.uploadDeadlineAt.toISOString(),
    },
    UPLOAD_PROMPT,
  );
}

function purchased(topUp: {
  id: number;
  amount: number;
  uploadDeadlineAt: Date;
}): CreditPurchaseResult {
  return reservationSuccess(
    {
      topUpId: topUp.id,
      amount: topUp.amount,
      uploadDeadlineAt: topUp.uploadDeadlineAt.toISOString(),
    },
    UPLOAD_PROMPT,
  );
}

/**
 * Opens a credit purchase sized to exactly what an optional feature costs
 * beyond the participant's spendable balance (PRD §18).
 *
 * The browser sends the festival and the feature, never an amount: the price
 * comes from the festival's own configuration and the shortfall from the
 * ledger, both read under the account lock. Buying is deliberately allowed even
 * when no complete table is free right now — credits never expire and can pay
 * the participant's own reservation instead, so a table filling mid-purchase
 * must not strand the money.
 */
export async function createFeatureCreditTopUp(input: {
  festivalId: number;
  featureType: PurchasableFeatureType;
  idempotencyKey: string;
}): Promise<CreditPurchaseResult> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  try {
    return await db.transaction(async (tx) => {
      await lockParticipantsBeforeRegistryClaim(tx, input.festivalId, [
        actor.id,
      ]);
      // Before the claim: the registry insert takes a FOR KEY SHARE on
      // `users` through `actor_user_id`, and this transaction later needs FOR
      // UPDATE on the same row. Two purchases that both held the share lock
      // first would deadlock upgrading it — the advisory lock above only
      // serialises them within one festival.
      await lockUserRows(tx, [actor.id]);

      // Claimed before any configuration check, so a retry of a request that
      // already opened a purchase replays it rather than failing because an
      // admin disabled the feature in between.
      const claim = await claimRequest(tx, {
        requestKey: input.idempotencyKey,
        operation: "createFeatureCreditTopUp",
        actorUserId: actor.id,
        scope: {
          festivalId: input.festivalId,
          featureType: input.featureType,
        },
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        return replayTopUp(tx, claim.resultIds.topUpId);
      }

      const fail = async (result: CreditPurchaseResult) => {
        await abandonRequest(tx, input.idempotencyKey);
        return result;
      };

      const category = eligibleCategory(actor.category);
      if (!category) {
        return fail(reservationFailure("FULL_TABLE_CATEGORY_INELIGIBLE"));
      }

      // The same gate activation uses: buying is offered before reservations
      // open, so the clock is lifted and every other rule — enrollment, terms,
      // verification, sanctions — still decides.
      const denial = await denySelfServiceMutationBeforeOpen(tx, {
        actor: { id: actor.id, role: actor.role },
        userId: actor.id,
        festivalId: input.festivalId,
      });
      if (denial) return fail(denial);

      // Read on this transaction's connection: reaching for the pool while
      // holding user locks checks out a second connection that only a
      // finishing transaction can free.
      const config = await fetchFeatureConfig(
        input.festivalId,
        input.featureType,
        category,
        new Date(),
        tx,
      );
      if (!config || !config.enabled || !config.available) {
        return fail(reservationFailure("FULL_TABLE_UNAVAILABLE"));
      }

      await lockFestivalRow(tx, input.festivalId);
      await lockCreditAccountRows(tx, [actor.id]);

      // One open purchase per festival feature. Resuming the pending one keeps
      // the participant on a single upload deadline instead of stacking
      // sessions they would each have to fund.
      const open = await lockOpenTopUps(tx, {
        userId: actor.id,
        intendedUseType: "feature",
        intendedUseId: input.festivalId,
      });
      if (open.some((row) => row.status === "under_review")) {
        return fail(
          reservationFailure(
            "CREDIT_TOP_UP_UNDER_REVIEW",
            "Ya tenés una compra de créditos en revisión. Esperá la confirmación para activar la mesa completa.",
          ),
        );
      }
      const resumable = open.find(
        (row) => row.uploadDeadlineAt.getTime() > Date.now(),
      );
      if (resumable) {
        await completeRequest(tx, input.idempotencyKey, {
          topUpId: resumable.id,
        });
        return purchased(resumable);
      }

      const balances = await getCreditBalancesInTx(tx, actor.id);
      const required = exactCreditShortfall(
        config.creditPrice,
        balances.spendableBalance,
      );
      if (required <= 0) {
        return fail(
          reservationFailure(
            "CREDIT_TOP_UP_NOT_NEEDED",
            "Ya tenés los créditos que cuesta la mesa completa. Activala desde el panel.",
          ),
        );
      }

      const created = await createCreditTopUpForRequirementInTx(tx, {
        userId: actor.id,
        amount: required,
        intendedUseType: "feature",
        intendedUseId: input.festivalId,
        idempotencyKey: input.idempotencyKey,
      });
      if (!created.ok) return fail(reservationFailure("CONFLICT_RETRY"));

      await completeRequest(tx, input.idempotencyKey, {
        topUpId: created.data.id,
      });
      return purchased(created.data);
    });
  } catch (error) {
    console.error("Error creating feature credit top-up", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}

/**
 * Opens a credit purchase sized to exactly the participant's outstanding debt.
 *
 * Debt is what a reversed top-up left behind after its credits were already
 * spent — on a full table, say. A negative ledger blocks every credit
 * operation, so without this the only way back is an admin running
 * `resolveCreditDebt` by hand. Nothing in the domain is rewound either way:
 * the reservation or access the reversed credits funded stays exactly as it is.
 */
export async function createDebtCreditTopUp(input: {
  idempotencyKey: string;
}): Promise<CreditPurchaseResult> {
  const actor = await getCurrentUserProfile();
  if (!actor) return reservationFailure("UNAUTHENTICATED");

  try {
    return await db.transaction(async (tx) => {
      // Before the claim, for the reason spelled out in
      // `createFeatureCreditTopUp`: the registry insert share-locks the actor's
      // `users` row, and this transaction upgrades that row to FOR UPDATE
      // below. There is no festival to scope an advisory lock to here, so this
      // row lock is the whole defence.
      await lockUserRows(tx, [actor.id]);

      const claim = await claimRequest(tx, {
        requestKey: input.idempotencyKey,
        operation: "createDebtCreditTopUp",
        actorUserId: actor.id,
        scope: {},
      });
      if (claim.kind === "conflict") {
        return reservationFailure("CONFLICT_RETRY");
      }
      if (claim.kind === "replayed") {
        return replayTopUp(tx, claim.resultIds.topUpId);
      }

      const fail = async (result: CreditPurchaseResult) => {
        await abandonRequest(tx, input.idempotencyKey);
        return result;
      };

      await lockCreditAccountRows(tx, [actor.id]);

      // Checked before the balance: an open purchase has already issued its
      // provisional credits, so the debt it was opened for reads as settled.
      const open = await lockOpenTopUps(tx, {
        userId: actor.id,
        intendedUseType: "debt",
        intendedUseId: null,
      });
      if (open.some((row) => row.status === "under_review")) {
        return fail(
          reservationFailure(
            "CREDIT_TOP_UP_UNDER_REVIEW",
            "Ya tenés una compra de créditos en revisión para regularizar tu saldo. Esperá la confirmación.",
          ),
        );
      }
      const resumable = open.find(
        (row) => row.uploadDeadlineAt.getTime() > Date.now(),
      );
      if (resumable) {
        await completeRequest(tx, input.idempotencyKey, {
          topUpId: resumable.id,
        });
        return purchased(resumable);
      }

      const balances = await getCreditBalancesInTx(tx, actor.id);
      const debt = Math.max(0, roundCredits(-balances.ledgerBalance));
      if (debt <= 0) {
        return fail(
          reservationFailure(
            "CREDIT_TOP_UP_NOT_NEEDED",
            "No tenés saldo pendiente que regularizar.",
          ),
        );
      }

      const created = await createCreditTopUpForRequirementInTx(tx, {
        userId: actor.id,
        amount: debt,
        intendedUseType: "debt",
        idempotencyKey: input.idempotencyKey,
      });
      if (!created.ok) return fail(reservationFailure("CONFLICT_RETRY"));

      await completeRequest(tx, input.idempotencyKey, {
        topUpId: created.data.id,
      });
      return purchased(created.data);
    });
  } catch (error) {
    console.error("Error creating debt credit top-up", error);
    return reservationFailure("CONFLICT_RETRY");
  }
}
