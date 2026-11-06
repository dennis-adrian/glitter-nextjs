import { describe, expect, it } from "vitest";

import {
  invoiceWrittenOffAmount,
  planReservationRepricing,
  repriceInvoiceAmounts,
  type ReservationRepricingInput,
} from "@/app/lib/reservations/repricing";

function invoice(originalAmount: number, discountAmount = 0, amount?: number) {
  return {
    originalAmount,
    discountAmount,
    amount: amount ?? originalAmount - discountAmount,
  };
}

function plan(overrides: Partial<ReservationRepricingInput> = {}) {
  return planReservationRepricing({
    newStandPrice: 450,
    latePartnerPrepaid: 0,
    priceAmountSnapshot: 300,
    liveInvoice: invoice(300),
    coveredAmount: 0,
    reservationStatus: "pending",
    zeroValueEntitlementApproved: false,
    ...overrides,
  });
}

describe("invoice rewrite", () => {
  it("keeps amount = original - discount", () => {
    expect(repriceInvoiceAmounts(450, invoice(300, 50))).toEqual({
      originalAmount: 450,
      discountAmount: 50,
      amount: 400,
      writtenOffAmount: 0,
    });
  });

  it("clamps a discount larger than the new gross rather than inverting the total", () => {
    expect(repriceInvoiceAmounts(120, invoice(300, 300))).toEqual({
      originalAmount: 120,
      discountAmount: 120,
      amount: 0,
      writtenOffAmount: 0,
    });
  });

  it("carries a write-off as a fixed amount off the new gross", () => {
    // Cobro 500, 200 waived through "confirmar con saldo pendiente".
    expect(repriceInvoiceAmounts(600, invoice(500, 0, 300))).toEqual({
      originalAmount: 600,
      discountAmount: 0,
      amount: 400,
      writtenOffAmount: 200,
    });
  });

  it("never lets a write-off take the amount below zero", () => {
    expect(repriceInvoiceAmounts(100, invoice(500, 0, 300)).amount).toBe(0);
  });

  it("reads the write-off a cobro carries, and nothing for a clean one", () => {
    expect(invoiceWrittenOffAmount(invoice(500, 50, 250))).toBe(200);
    expect(invoiceWrittenOffAmount(invoice(500, 50))).toBe(0);
  });

  /**
   * A reprice below the write-off clamps the amount to 0 and stores a shrunken
   * write-off; the cobro's recorded write-offs restore it on the way back.
   */
  it.each([
    // [label, row after the move down, recorded, write-off read, back at 500]
    ["Bs200 waived, through a Bs150 stand", invoice(150, 0, 0), 200, 200, 300],
    ["Bs200 waived, through a Bs0 stand", invoice(0, 0, 0), 200, 200, 300],
    // Nothing recorded (a write-off from before the event): the row's word.
    ["no events", invoice(150, 0, 0), 0, 150, 350],
  ] as const)(
    "carries the whole write-off on a round trip: %s",
    (_label, row, recorded, writtenOff, backAmount) => {
      const current = { ...row, recordedWriteOffAmount: recorded };
      expect(invoiceWrittenOffAmount(current)).toBe(writtenOff);
      expect(repriceInvoiceAmounts(500, current).amount).toBe(backAmount);
    },
  );

  it("trusts the row, not the events, once the cobro asks for something", () => {
    // An amount an admin restored since the write-off is the row's word: a
    // restore to the full 500 undid the Bs200 the events remember.
    const restored = { ...invoice(500), recordedWriteOffAmount: 200 };
    expect(invoiceWrittenOffAmount(restored)).toBe(0);
    // A write-off already carried on the row reads the same either way.
    const carried = { ...invoice(600, 0, 400), recordedWriteOffAmount: 200 };
    expect(invoiceWrittenOffAmount(carried)).toBe(200);
  });

  it("rounds to cents", () => {
    const repriced = repriceInvoiceAmounts(100.005, invoice(80, 10.004));
    expect(repriced.originalAmount).toBe(100.01);
    expect(repriced.discountAmount).toBe(10);
    expect(repriced.amount).toBe(90.01);
  });
});

/**
 * Dennis's worked examples. A reservation on a stand priced I500 (one person)
 * / S800 (two): the owner paid the Bs500 cobro and then added a late partner,
 * paying the Bs300 shared difference in credits (plus a fee that never
 * counts). So the snapshot is 500, the headcount two, and L = 300.
 */
describe("repricing: the worked cases", () => {
  const latePartnerPaid = {
    latePartnerPrepaid: 300,
    priceAmountSnapshot: 500,
    liveInvoice: invoice(500, 0, 500),
    coveredAmount: 500,
    reservationStatus: "accepted",
  };

  it("(a) a late-partner reservation moved to an identical stand touches no money", () => {
    const result = plan({ ...latePartnerPaid, newStandPrice: 800 });
    expect(result.grossAmount).toBe(500);
    expect(result.priceChanged).toBe(false);
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(false);
    expect(result.resultingStatus).toBe("accepted");
  });

  it("(b) moved to I400/S600: cobro 300, 200 back in credits, stays accepted", () => {
    const result = plan({ ...latePartnerPaid, newStandPrice: 600 });
    expect(result.grossAmount).toBe(300);
    expect(result.newInvoiceAmount).toBe(300);
    expect(result.settlement).toEqual({ kind: "overpaid", refundAmount: 200 });
    expect(result.completesAcceptance).toBe(false);
    expect(result.resultingStatus).toBe("accepted");
  });

  it("(c) upgraded to a 1200 table: gross 900, balance 400, reopened", () => {
    const result = plan({ ...latePartnerPaid, newStandPrice: 1200 });
    expect(result.grossAmount).toBe(900);
    expect(result.newInvoiceAmount).toBe(900);
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 400,
    });
    expect(result.resultingStatus).toBe("pending");
  });

  it("(d) accepted with nothing covered owes a price rise (zero-value entitlement)", () => {
    // Discount 300 took the cobro to zero; the discount survives, so the
    // difference above it is what is owed.
    const result = plan({
      liveInvoice: invoice(300, 300),
      reservationStatus: "accepted",
    });
    expect(result.newInvoiceAmount).toBe(150);
    expect(result.confirmedAtNoCost).toBe(true);
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 150,
    });
    expect(result.resultingStatus).toBe("pending");
  });

  it("(d) an approved zero-value entitlement counts as confirmed at no cost even once the cobro is positive", () => {
    // A command that moves no money (the downgrade) can raise the amount after
    // the entitlement was approved; the reservation was still free.
    const result = plan({
      liveInvoice: invoice(300),
      reservationStatus: "accepted",
      zeroValueEntitlementApproved: true,
    });
    expect(result.confirmedAtNoCost).toBe(true);
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 450,
    });
    expect(result.resultingStatus).toBe("pending");
  });

  /**
   * Dennis's rule covers reservations confirmed at no cost, not a positive
   * cobro marked paid with no payment rows — that money came in outside the
   * system. Pre-batch behaviour: reprice only, never reopen, never refund.
   */
  it("(d') a legacy paid cobro with no payment rows moved to a dearer stand is only repriced", () => {
    const result = plan({
      liveInvoice: invoice(300),
      reservationStatus: "accepted",
    });
    expect(result.confirmedAtNoCost).toBe(false);
    expect(result.newInvoiceAmount).toBe(450);
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(false);
    expect(result.resultingStatus).toBe("accepted");
  });

  it("(d') the same legacy cobro moved to a cheaper stand is only repriced, never refunded", () => {
    const result = plan({
      priceAmountSnapshot: 300,
      liveInvoice: invoice(300),
      newStandPrice: 200,
      reservationStatus: "accepted",
    });
    expect(result.newInvoiceAmount).toBe(200);
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.resultingStatus).toBe("accepted");
  });

  it("(e) write-off kept as a fixed Bs200: cobro 500 → stand 400 is amount 200 against 300 covered, so 100 back and no reopen", () => {
    const result = plan({
      newStandPrice: 400,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500, 0, 300),
      coveredAmount: 300,
      reservationStatus: "accepted",
    });
    expect(result.writtenOffAmount).toBe(200);
    expect(result.newInvoiceAmount).toBe(200);
    expect(result.effectiveAmount).toBe(200);
    expect(result.settlement).toEqual({ kind: "overpaid", refundAmount: 100 });
    expect(result.resultingStatus).toBe("accepted");
  });

  it("(e') the same write-off on a move up only asks for the price difference", () => {
    const result = plan({
      newStandPrice: 600,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500, 0, 300),
      coveredAmount: 300,
      reservationStatus: "accepted",
    });
    expect(result.newInvoiceAmount).toBe(400);
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 100,
    });
  });

  it("(f) pending, credits cover the new amount exactly: accepted in the same step", () => {
    const result = plan({
      newStandPrice: 300,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 300,
      reservationStatus: "pending",
    });
    expect(result.owedAmount).toBe(0);
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(true);
    expect(result.resultingStatus).toBe("accepted");
  });

  it("(g) a late partner's payment above the new price comes back with the refund", () => {
    const result = plan({ ...latePartnerPaid, newStandPrice: 200 });
    expect(result.grossAmount).toBe(0);
    expect(result.newInvoiceAmount).toBe(0);
    expect(result.effectiveAmount).toBe(-100);
    // All 500 of the cobro, plus the 100 the late partner paid beyond the
    // stand's whole price.
    expect(result.settlement).toEqual({ kind: "overpaid", refundAmount: 600 });
    // The 100 is the late partner's money, not the cobro's: recorded apart so
    // the cobro's tender nets only the 500 it actually held.
    expect(result.latePartnerRefundAmount).toBe(100);
  });

  it("(g') moved back up afterwards, asks for the late partner's returned 100 too", () => {
    // After (g): the cobro's 500 fully netted (covered 0) and 100 of the late
    // partner's 300 returned (L 200), on a Bs0 cobro — confirmed at no cost.
    const result = plan({
      newStandPrice: 800,
      latePartnerPrepaid: 200,
      priceAmountSnapshot: 0,
      liveInvoice: invoice(0),
      coveredAmount: 0,
      reservationStatus: "accepted",
    });
    // 800 − (500 + 300 − 600) = 600, all of it on the cobro.
    expect(result.grossAmount).toBe(600);
    expect(result.newInvoiceAmount).toBe(600);
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 600,
    });
    expect(result.latePartnerRefundAmount).toBe(0);
  });

  it("records no late-partner part on a refund the cobro's own tender funds", () => {
    // (b): the late partner's payment is below the new price, so the whole
    // 200 comes out of the cobro.
    const result = plan({ ...latePartnerPaid, newStandPrice: 600 });
    expect(result.settlement).toEqual({ kind: "overpaid", refundAmount: 200 });
    expect(result.latePartnerRefundAmount).toBe(0);
  });
});

describe("repricing: the rules", () => {
  it("never counts the late-partner payment when nothing else changes the gross", () => {
    // Snapshot already net of L: the model is idempotent on its own output.
    const again = plan({
      newStandPrice: 800,
      latePartnerPrepaid: 300,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 0,
    });
    expect(again.priceChanged).toBe(false);
  });

  it("treats a missing snapshot as a price change", () => {
    const result = plan({ priceAmountSnapshot: null });
    expect(result.fromPrice).toBeNull();
    expect(result.priceChanged).toBe(true);
  });

  it("only moves the amount of an unpaid pending reservation", () => {
    const result = plan();
    expect(result.newInvoiceAmount).toBe(450);
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(false);
    expect(result.resultingStatus).toBe("pending");
  });

  it("only moves the amount of an unpaid pending reservation whose late partner paid part", () => {
    const result = plan({
      newStandPrice: 1200,
      latePartnerPrepaid: 300,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
    });
    expect(result.newInvoiceAmount).toBe(900);
    expect(result.settlement).toEqual({ kind: "none" });
  });

  it("reopens a partial payer on a move up", () => {
    expect(plan({ coveredAmount: 100 }).settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 350,
    });
  });

  /**
   * Measured against what was covered, never against the old price: somebody
   * who paid half of an expensive stand and moved to a cheaper one has not
   * overpaid, and comparing prices would hand them credits they never funded.
   */
  it("does not refund a partial payer who moved somewhere cheaper", () => {
    const result = plan({
      newStandPrice: 300,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 200,
    });
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 100,
    });
  });

  it("reopens a verification_payment reservation with money on it, and only reprices one without", () => {
    expect(
      plan({ coveredAmount: 100, reservationStatus: "verification_payment" })
        .resultingStatus,
    ).toBe("pending");
    // Not confirmed, so not "confirmed at no cost": nothing paid, nothing to
    // reopen for.
    const unpaid = plan({
      coveredAmount: 0,
      reservationStatus: "verification_payment",
    });
    expect(unpaid.settlement.kind).toBe("none");
    expect(unpaid.resultingStatus).toBe("verification_payment");
  });

  it("accepts a waiting reservation that a late partner's payment alone covers", () => {
    const result = plan({
      newStandPrice: 300,
      latePartnerPrepaid: 300,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 0,
      reservationStatus: "pending",
    });
    expect(result.newInvoiceAmount).toBe(0);
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(true);
  });

  it("accepts a waiting reservation it overpays, and refunds the surplus", () => {
    const result = plan({
      newStandPrice: 300,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 450,
      reservationStatus: "verification_payment",
    });
    expect(result.settlement).toEqual({ kind: "overpaid", refundAmount: 150 });
    expect(result.completesAcceptance).toBe(true);
    expect(result.resultingStatus).toBe("accepted");
  });

  it("leaves an accepted reservation that is exactly covered alone", () => {
    const result = plan({
      coveredAmount: 450,
      reservationStatus: "accepted",
    });
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(false);
    expect(result.resultingStatus).toBe("accepted");
  });

  it("does not accept a zero-amount pending cobro nobody paid anything towards", () => {
    // A full discount: the zero-value request is how that one gets confirmed.
    const result = plan({
      liveInvoice: invoice(300, 1000),
      reservationStatus: "pending",
    });
    expect(result.newInvoiceAmount).toBe(0);
    expect(result.completesAcceptance).toBe(false);
  });

  it("keeps an accepted zero-value reservation whose discount still covers the new price", () => {
    const result = plan({
      liveInvoice: invoice(300, 1000),
      reservationStatus: "accepted",
    });
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.resultingStatus).toBe("accepted");
  });

  it("never refunds more than was paid when a write-off exceeds the new price", () => {
    // 300 paid, 200 waived on a 500 cobro, moved to a stand of 100: the
    // concession leaves nothing to pay, so all 300 comes back — not 400.
    const result = plan({
      newStandPrice: 100,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500, 0, 300),
      coveredAmount: 300,
      reservationStatus: "accepted",
    });
    expect(result.newInvoiceAmount).toBe(0);
    expect(result.effectiveAmount).toBe(0);
    expect(result.settlement).toEqual({ kind: "overpaid", refundAmount: 300 });
  });

  it("settles nothing without a cobro, whatever the status", () => {
    const result = plan({
      liveInvoice: null,
      reservationStatus: "accepted",
    });
    expect(result.newInvoiceAmount).toBe(450);
    expect(result.currentInvoiceAmount).toBeNull();
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.resultingStatus).toBe("accepted");
  });

  it("settles nothing when the price did not move, even with money on it", () => {
    const result = plan({
      priceAmountSnapshot: 450,
      liveInvoice: invoice(450),
      coveredAmount: 600,
      reservationStatus: "pending",
    });
    expect(result.settlement).toEqual({ kind: "none" });
    expect(result.completesAcceptance).toBe(false);
  });

  it("clamps a negative coverage and a negative late-partner figure to zero", () => {
    const result = plan({ coveredAmount: -20, latePartnerPrepaid: -5 });
    expect(result.coveredAmount).toBe(0);
    expect(result.latePartnerPrepaid).toBe(0);
    expect(result.grossAmount).toBe(450);
  });

  it("rounds to cents", () => {
    const result = plan({
      newStandPrice: 450.005,
      coveredAmount: 300.004,
      reservationStatus: "accepted",
    });
    expect(result.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 150.01,
    });
  });
});
