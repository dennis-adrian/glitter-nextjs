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
  /**
   * Set when the feature is offered but cannot be activated right now.
   *
   * Only ever the credits: an offer with no free table is not offered at all.
   */
  blockedReason: "insufficient_credits" | null;
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
 * The offer only stands while there is a full table to take: a category that
 * can never use the feature, a festival that paired none, and a festival whose
 * pairs are all half-taken all get `offered: false` and show nothing. Missing
 * credits is the one blocked state that still shows, because it is the one the
 * participant can do something about from the panel itself.
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

  // Nothing to activate: either the festival never paired a full table in this
  // category, or every pair it did has at least one half taken. Showing the
  // panel would quote a price for inventory that is not there to book, so the
  // offer goes rather than being shown blocked. Someone who already activated
  // still sees theirs — the credits they are holding have to stay releasable.
  if (!availability.hasFreePair && access == null) return unavailable;

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
    blockedReason:
      access == null && shortfall > 0 ? "insufficient_credits" : null,
  };
}
