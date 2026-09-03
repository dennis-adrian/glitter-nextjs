import "server-only";

import { readCreditBalances } from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import {
  findActiveFullTableAccess,
  hasCompleteFullTable,
  isFullTableCategory,
} from "@/app/lib/reservations/full-table-access";
import { db } from "@/db";

export type FullTableOffer = {
  /** Whether to render the feature at all for this participant. */
  offered: boolean;
  active: boolean;
  creditPrice: number;
  spendableBalance: number;
  /** Missing credits for activation; 0 when the balance already covers it. */
  shortfall: number;
  hasCompleteTable: boolean;
  /** Set when the feature is offered but cannot be activated right now. */
  blockedReason: "no_complete_table" | "insufficient_credits" | null;
};

/**
 * Everything the pre-booking full-table panel needs.
 *
 * A participant whose category can never use the feature gets `offered: false`
 * and sees nothing. Everyone else sees the panel even when they cannot activate
 * yet, with the reason stated — a table can free up and credits can be bought,
 * so a vanished control would read as a broken feature rather than a temporary
 * state.
 */
export async function fetchFullTableOffer(input: {
  userId: number;
  festivalId: number;
  category: unknown;
}): Promise<FullTableOffer> {
  const unavailable: FullTableOffer = {
    offered: false,
    active: false,
    creditPrice: 0,
    spendableBalance: 0,
    shortfall: 0,
    hasCompleteTable: false,
    blockedReason: null,
  };

  if (!isFullTableCategory(input.category)) return unavailable;

  const config = await fetchFeatureConfig(
    input.festivalId,
    "full_table",
    input.category,
  );
  if (!config || !config.enabled || !config.available) return unavailable;

  // Plain reads: wrapping each in its own transaction checked out a separate
  // pooled connection per map render for no isolation benefit.
  const [access, complete, balances] = await Promise.all([
    findActiveFullTableAccess(db, {
      userId: input.userId,
      festivalId: input.festivalId,
    }),
    hasCompleteFullTable(db, {
      festivalId: input.festivalId,
      category: input.category,
    }),
    readCreditBalances(input.userId),
  ]);

  const shortfall = Math.max(
    0,
    Math.round((config.creditPrice - balances.spendableBalance) * 100) / 100,
  );

  return {
    offered: true,
    active: access != null,
    creditPrice: config.creditPrice,
    spendableBalance: balances.spendableBalance,
    shortfall,
    hasCompleteTable: complete,
    blockedReason: access
      ? null
      : !complete
        ? "no_complete_table"
        : shortfall > 0
          ? "insufficient_credits"
          : null,
  };
}
