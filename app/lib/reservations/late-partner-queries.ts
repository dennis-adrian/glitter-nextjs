import "server-only";

import { eq } from "drizzle-orm";

import { exactCreditShortfall } from "@/app/lib/credits/balances";
import { readCreditBalances } from "@/app/lib/credits/service";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import { latePartnerBlockReason } from "@/app/lib/reservations/late-partner-availability";
import { latePartnerPrice } from "@/app/lib/reservations/late-partner-pricing";
import { db } from "@/db";
import {
  reservationParticipants,
  standReservations,
  stands,
} from "@/db/schema";

export type LatePartnerOffer = {
  /** Whether to show anything at all. */
  offered: boolean;
  /** Which festival's configuration priced this, for the purchase to scope to. */
  festivalId: number;
  /** When the feature closes, so the panel can say so (§5). */
  deadlineAt: Date | null;
  /** What two people cost minus what one costs, on this reservation. */
  sharedPriceDifference: number;
  /** The festival's fee for adding somebody after booking. */
  featurePrice: number;
  totalCredits: number;
  spendableBalance: number;
  /** Credits still needed; zero once the balance covers the total. */
  shortfall: number;
};

const NOT_OFFERED: LatePartnerOffer = {
  offered: false,
  festivalId: 0,
  deadlineAt: null,
  sharedPriceDifference: 0,
  featurePrice: 0,
  totalCredits: 0,
  spendableBalance: 0,
  shortfall: 0,
};

/**
 * The price and eligibility of adding a partner, for a reservation's owner.
 *
 * Read-only and advisory: `addLatePartner` re-derives all of it under locks,
 * because the deadline can pass, an admin can disable the feature, and the
 * balance can move between rendering this and confirming.
 *
 * The total is computed here rather than taken from a caller so the purchase
 * and the action agree on one figure, and so no amount ever originates in the
 * browser.
 */
export async function fetchLatePartnerOffer(input: {
  reservationId: number;
  userId: number;
  now?: Date;
}): Promise<LatePartnerOffer> {
  const now = input.now ?? new Date();

  const [reservation] = await db
    .select({
      id: standReservations.id,
      festivalId: standReservations.festivalId,
      status: standReservations.status,
      ownerUserId: standReservations.ownerUserId,
      individualPriceSnapshot: standReservations.individualPriceSnapshot,
      sharedPriceSnapshot: standReservations.sharedPriceSnapshot,
      standCategory: stands.standCategory,
    })
    .from(standReservations)
    .innerJoin(stands, eq(stands.id, standReservations.standId))
    .where(eq(standReservations.id, input.reservationId))
    .limit(1);
  if (!reservation) return NOT_OFFERED;

  const config = await fetchFeatureConfig(
    reservation.festivalId,
    "late_partner",
    null,
    now,
  );
  if (!config || !config.enabled) return NOT_OFFERED;

  // A plain read: `readReservationParticipantIds` takes a transaction because
  // its callers hold locks, and this one deliberately does not.
  const participantIds = await db
    .select({ userId: reservationParticipants.userId })
    .from(reservationParticipants)
    .where(eq(reservationParticipants.reservationId, reservation.id));

  const blocked = latePartnerBlockReason({
    isOwner: reservation.ownerUserId === input.userId,
    standCategory: reservation.standCategory,
    reservationStatus: reservation.status,
    registeredParticipantCount: participantIds.length,
    effectiveDeadlineAt: config.effectiveDeadlineAt,
    now,
  });
  // Hidden rather than shown disabled (§8.1). Everything here is a reason the
  // action can never finish, and quoting a price beside one invites somebody
  // to buy credits for something undeliverable.
  if (blocked) return NOT_OFFERED;

  const price = latePartnerPrice({
    individualPriceSnapshot: reservation.individualPriceSnapshot,
    sharedPriceSnapshot: reservation.sharedPriceSnapshot,
    featurePrice: config.creditPrice,
  });
  if (!price) return NOT_OFFERED;

  const balances = await readCreditBalances(input.userId);

  return {
    offered: true,
    festivalId: reservation.festivalId,
    deadlineAt: config.effectiveDeadlineAt,
    sharedPriceDifference: price.sharedPriceDifference,
    featurePrice: price.featurePrice,
    totalCredits: price.totalCredits,
    spendableBalance: balances.spendableBalance,
    shortfall: exactCreditShortfall(
      price.totalCredits,
      balances.spendableBalance,
    ),
  };
}
