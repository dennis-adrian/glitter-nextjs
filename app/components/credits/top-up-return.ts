import { type CreditWalletTopUp } from "@/app/lib/credits/queries";

export type TopUpReturn = {
  href: string;
  /** What the purchase was funding, so callers can word their own link. */
  kind: "invoice" | "feature";
};

/**
 * Where a purchase came from, and so where finishing it should lead.
 *
 * Credits are never bought from the wallet — they are bought from the thing
 * that needs them, which is always somewhere in the reservation flow: a
 * feature from the introduction screen or the map's banner, an invoice from
 * that reservation's payment page. Sending someone to their wallet after
 * paying drops them out of the flow they were in the middle of and leaves them
 * to find their way back.
 *
 * Null for a purchase that settles a negative balance: that one belongs to no
 * reservation, so the wallet really is the destination.
 */
export function topUpReturn(
  topUp: CreditWalletTopUp,
  profileId: number,
): TopUpReturn | null {
  if (topUp.invoiceFestivalId && topUp.invoiceReservationId) {
    return {
      href: `/profiles/${profileId}/festivals/${topUp.invoiceFestivalId}/reservations/${topUp.invoiceReservationId}/payments`,
      kind: "invoice",
    };
  }

  // A feature purchase stores the festival it funds, which is where the
  // participant goes back to spend it.
  if (topUp.intendedUseType === "feature" && topUp.intendedUseId) {
    return {
      href: `/profiles/${profileId}/festivals/${topUp.intendedUseId}/reservations/new`,
      kind: "feature",
    };
  }

  return null;
}
