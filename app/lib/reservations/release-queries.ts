import "server-only";

import { readCreditBalances } from "@/app/lib/credits/service";
import { exactCreditShortfall } from "@/app/lib/credits/balances";
import { fetchFeatureConfig } from "@/app/lib/festivals/feature-config-service";
import { statusAllowsRelease } from "@/app/lib/reservations/participant-status";

export type ReleaseOffer = {
  /** Whether to show anything at all. */
  offered: boolean;
  creditPrice: number;
  spendableBalance: number;
  /** Credits still needed; zero once the balance covers the price. */
  shortfall: number;
};

const NOT_OFFERED: ReleaseOffer = {
  offered: false,
  creditPrice: 0,
  spendableBalance: 0,
  shortfall: 0,
};

/**
 * What the reservation-detail page needs to decide whether to offer a release
 * (PRD §9.3).
 *
 * Read-only and advisory. Every rule here is enforced again inside
 * `releaseReservation` under locks, because between rendering this and pressing
 * the button a participant can submit a payment, an admin can disable the
 * feature, and the balance can move.
 *
 * A negative balance is not special-cased here: the shortfall arithmetic
 * already floors it, so somebody in debt is shown the full price to buy, and
 * the command refuses them anyway.
 */
export async function fetchReleaseOffer(input: {
  userId: number;
  festivalId: number;
  reservationStatus: string;
  isOwner: boolean;
}): Promise<ReleaseOffer> {
  if (!input.isOwner) return NOT_OFFERED;
  if (!statusAllowsRelease(input.reservationStatus)) return NOT_OFFERED;

  const config = await fetchFeatureConfig(
    input.festivalId,
    "reservation_release",
    null,
  );
  if (!config || !config.enabled || !config.available) return NOT_OFFERED;

  const balances = await readCreditBalances(input.userId);

  return {
    offered: true,
    creditPrice: config.creditPrice,
    spendableBalance: balances.spendableBalance,
    shortfall: exactCreditShortfall(
      config.creditPrice,
      balances.spendableBalance,
    ),
  };
}
