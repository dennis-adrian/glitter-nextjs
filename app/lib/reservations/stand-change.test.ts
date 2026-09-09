import { describe, expect, it } from "vitest";

import {
  isMovableReservationStatus,
  repriceInvoice,
  resolveStandChangePricing,
  resolveStandChangeSettlement,
} from "@/app/lib/reservations/stand-change";

describe("movable reservation statuses", () => {
  it("accepts exactly the statuses that occupy a stand", () => {
    expect(isMovableReservationStatus("pending")).toBe(true);
    expect(isMovableReservationStatus("verification_payment")).toBe(true);
    expect(isMovableReservationStatus("accepted")).toBe(true);
  });

  it("refuses statuses that gave the stand up", () => {
    expect(isMovableReservationStatus("rejected")).toBe(false);
    expect(isMovableReservationStatus("cancelled")).toBe(false);
    expect(isMovableReservationStatus("released")).toBe(false);
  });
});

describe("stand change pricing", () => {
  it("bills the individual price for a single participant", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 1, priceAmountSnapshot: 300 },
      { individualPrice: 450, sharedPrice: 700 },
    );
    expect(pricing.priceAmount).toBe(450);
    expect(pricing.individualPrice).toBe(450);
    expect(pricing.sharedPrice).toBe(700);
    expect(pricing.priceChanged).toBe(true);
  });

  it("bills the shared price once a partner is on the reservation", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 2, priceAmountSnapshot: 700 },
      { individualPrice: 450, sharedPrice: 700 },
    );
    expect(pricing.priceAmount).toBe(700);
    expect(pricing.priceChanged).toBe(false);
  });

  it("falls back to the individual price when the destination has no shared one", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 2, priceAmountSnapshot: 700 },
      { individualPrice: 450, sharedPrice: null },
    );
    expect(pricing.priceAmount).toBe(450);
    expect(pricing.sharedPrice).toBeNull();
    expect(pricing.priceChanged).toBe(true);
  });

  it("reports no change when the destination bills what the origin did", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 1, priceAmountSnapshot: 450 },
      { individualPrice: 450, sharedPrice: null },
    );
    expect(pricing.priceChanged).toBe(false);
  });

  it("treats a reservation with no recorded price as a change", () => {
    const pricing = resolveStandChangePricing(
      { bookedParticipantCount: 1, priceAmountSnapshot: null },
      { individualPrice: 450, sharedPrice: null },
    );
    expect(pricing.priceChanged).toBe(true);
  });
});

describe("invoice repricing", () => {
  it("keeps amount = original - discount", () => {
    const repriced = repriceInvoice(450, 50);
    expect(repriced).toEqual({
      originalAmount: 450,
      discountAmount: 50,
      amount: 400,
    });
  });

  it("clamps a discount larger than the new price rather than inverting the total", () => {
    const repriced = repriceInvoice(120, 300);
    expect(repriced).toEqual({
      originalAmount: 120,
      discountAmount: 120,
      amount: 0,
    });
  });

  it("rounds to cents", () => {
    const repriced = repriceInvoice(100.005, 10.004);
    expect(repriced.originalAmount).toBe(100.01);
    expect(repriced.discountAmount).toBe(10);
    expect(repriced.amount).toBe(90.01);
  });
});

describe("settlement resolution", () => {
  it("reports nothing to resolve when the price did not move", () => {
    expect(
      resolveStandChangeSettlement({
        newInvoiceAmount: 300,
        coveredAmount: 300,
      }),
    ).toEqual({ kind: "none" });
  });

  it("reports nothing to resolve when nothing was ever covered", () => {
    expect(
      resolveStandChangeSettlement({ newInvoiceAmount: 450, coveredAmount: 0 }),
    ).toEqual({ kind: "none" });
  });

  it("carries a balance when the new stand costs more than was covered", () => {
    expect(
      resolveStandChangeSettlement({
        newInvoiceAmount: 450,
        coveredAmount: 300,
      }),
    ).toEqual({ kind: "balance_due", outstandingAmount: 150 });
  });

  it("refunds the surplus when the new stand costs less than was covered", () => {
    expect(
      resolveStandChangeSettlement({
        newInvoiceAmount: 300,
        coveredAmount: 450,
      }),
    ).toEqual({ kind: "overpaid", refundAmount: 150 });
  });

  /**
   * Measured against what was covered, never against the old price: somebody
   * who paid half of an expensive stand and moved to a cheaper one has not
   * overpaid, and comparing prices would hand them credits they never funded.
   */
  it("does not refund a partial payer who moved somewhere cheaper", () => {
    expect(
      resolveStandChangeSettlement({
        newInvoiceAmount: 300,
        coveredAmount: 200,
      }),
    ).toEqual({ kind: "balance_due", outstandingAmount: 100 });
  });

  it("rounds to cents", () => {
    expect(
      resolveStandChangeSettlement({
        newInvoiceAmount: 100.005,
        coveredAmount: 50,
      }),
    ).toEqual({ kind: "balance_due", outstandingAmount: 50.01 });
  });
});
