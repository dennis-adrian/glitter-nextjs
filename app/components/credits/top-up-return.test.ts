import { describe, expect, it } from "vitest";

import { topUpReturn } from "@/app/components/credits/top-up-return";
import type { CreditWalletTopUp } from "@/app/lib/credits/queries";

const now = new Date("2026-09-04T12:00:00Z");

function topUp(overrides: Partial<CreditWalletTopUp> = {}): CreditWalletTopUp {
  return {
    id: 1,
    amount: 20,
    status: "awaiting_voucher",
    intendedUseType: "feature",
    intendedUseId: 619,
    uploadDeadlineAt: now,
    submittedAt: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: now,
    invoiceReservationId: null,
    invoiceFestivalId: null,
    ...overrides,
  };
}

describe("topUpReturn", () => {
  /**
   * A feature is only ever bought from the introduction screen after the terms
   * or from the map's banner. Both are mid-reservation, so finishing the
   * purchase has to put the participant back there rather than in the wallet.
   */
  it("sends a feature purchase back to the reservation map", () => {
    expect(topUpReturn(topUp(), 42)).toEqual({
      href: "/profiles/42/festivals/619/reservations/new",
      kind: "feature",
    });
  });

  it("sends an invoice purchase back to that reservation's payment page", () => {
    expect(
      topUpReturn(
        topUp({
          intendedUseType: "invoice",
          intendedUseId: 7,
          invoiceFestivalId: 619,
          invoiceReservationId: 88,
        }),
        42,
      ),
    ).toEqual({
      href: "/profiles/42/festivals/619/reservations/88/payments",
      kind: "invoice",
    });
  });

  /** Settling a balance belongs to no reservation, so the wallet is the end. */
  it("has nowhere to send a debt purchase", () => {
    expect(
      topUpReturn(topUp({ intendedUseType: "debt", intendedUseId: null }), 42),
    ).toBeNull();
  });

  /**
   * The reservation an invoice purchase funded can be cancelled while the
   * purchase is still open, which is why the query returns those ids nullable.
   */
  it("has nowhere to send an invoice purchase whose reservation is gone", () => {
    expect(
      topUpReturn(
        topUp({
          intendedUseType: "invoice",
          intendedUseId: 7,
          invoiceFestivalId: null,
          invoiceReservationId: null,
        }),
        42,
      ),
    ).toBeNull();
  });

  it("has nowhere to send a feature purchase with no festival recorded", () => {
    expect(topUpReturn(topUp({ intendedUseId: null }), 42)).toBeNull();
  });
});
