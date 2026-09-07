import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { utcTimestamp } from "@/app/lib/sql-time";
import { normalizePromoCode } from "@/app/lib/programs/promo-codes";
import { db } from "@/db";
import { programPromoCodeRedemptions, programPromoCodes } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | DbTx;

export async function fetchPromoConsumingUses(
  executor: Executor,
  promoCodeId: number,
  now: Date,
): Promise<number> {
  const result = await executor.execute(sql`
    SELECT count(*) AS uses
    FROM program_promo_code_redemptions r
    JOIN session_purchases p ON p.id = r.purchase_id
    WHERE r.promo_code_id = ${promoCodeId}
      AND (
        p.approved_at IS NOT NULL
        OR p.status IN ('under_verification', 'changes_requested')
        OR (
          p.status = 'pending_upload'
          AND p.hold_expires_at > ${utcTimestamp(now)}
        )
      )
  `);

  return Number((result.rows[0] as { uses?: string } | undefined)?.uses ?? 0);
}

export async function fetchProgramPromoCode(
  executor: Executor,
  programId: number,
  code: string,
) {
  const [promoCode] = await executor
    .select()
    .from(programPromoCodes)
    .where(
      and(
        eq(programPromoCodes.programId, programId),
        eq(
          sql`lower(${programPromoCodes.code})`,
          normalizePromoCode(code).toLowerCase(),
        ),
      ),
    )
    .limit(1);

  return promoCode ?? null;
}

/** Checkout lock order is occurrences first, then this promo row. */
export async function lockProgramPromoCode(
  tx: DbTx,
  programId: number,
  code: string,
) {
  const [promoCode] = await tx
    .select()
    .from(programPromoCodes)
    .where(
      and(
        eq(programPromoCodes.programId, programId),
        eq(
          sql`lower(${programPromoCodes.code})`,
          normalizePromoCode(code).toLowerCase(),
        ),
      ),
    )
    .for("update")
    .limit(1);

  return promoCode ?? null;
}

export async function hasPromoRedemptions(
  executor: Executor,
  promoCodeId: number,
): Promise<boolean> {
  const rows = await executor
    .select({ id: programPromoCodeRedemptions.id })
    .from(programPromoCodeRedemptions)
    .where(eq(programPromoCodeRedemptions.promoCodeId, promoCodeId))
    .limit(1);

  return rows.length > 0;
}
