import "server-only";

import { readCreditBalances } from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import {
  findActiveFullTableAccess,
  isFullTableCategory,
  summarizeFullTableAvailability,
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
  /**
   * What the cheapest currently-free table costs to book, in Bs.
   *
   * Separate money from `creditPrice`: the credits are the access fee, this is
   * the reservation itself. Tables are priced individually, so before the map
   * there is no single number — this is the "desde" one, and null when nothing
   * is free.
   */
  lowestTablePrice: number | null;
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
    lowestTablePrice: null,
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
  const [access, availability, balances] = await Promise.all([
    findActiveFullTableAccess(db, {
      userId: input.userId,
      festivalId: input.festivalId,
    }),
    summarizeFullTableAvailability(db, {
      festivalId: input.festivalId,
      category: input.category,
    }),
    readCreditBalances(input.userId),
  ]);

  // Priced but never paired: the festival has no full tables in this category
  // at all. Showing the panel would quote a price for inventory that does not
  // exist and invite a purchase for it, under copy promising a table might free
  // up. Someone who already activated still sees theirs.
  if (availability.declaredPairs === 0 && access == null) return unavailable;

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
    hasCompleteTable: availability.hasFreePair,
    lowestTablePrice: availability.lowestFreePrice,
    blockedReason: access
      ? null
      : !availability.hasFreePair
        ? "no_complete_table"
        : shortfall > 0
          ? "insufficient_credits"
          : null,
  };
}
