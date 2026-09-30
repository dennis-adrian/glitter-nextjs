import { describe, expect, it } from "vitest";

import {
  fullTableUpgradeExpectation,
  fullTableUpgradeMatchesExpectation,
  fullTableUpgradeSuccessMessage,
  planFullTableUpgrade,
  summarizeFullTableUpgradeSettlement,
} from "@/app/lib/reservations/full-table-upgrade";

function invoice(amount: number, discountAmount = 0, originalAmount?: number) {
  return {
    originalAmount: originalAmount ?? amount + discountAmount,
    discountAmount,
    amount,
  };
}

describe("full-table upgrade plan", () => {
  it("reprices an unpaid half to the table price and settles nothing", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: invoice(300),
      coveredAmount: 0,
    });
    expect(plan).toEqual({
      fromPrice: 300,
      toPrice: 450,
      priceChanged: true,
      discountAmount: 0,
      currentInvoiceAmount: 300,
      writtenOffAmount: 0,
      newInvoiceAmount: 450,
      coveredAmount: 0,
      settlement: { kind: "none" },
    });
  });

  it("carries a balance when the half was paid and the table costs more", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: invoice(300),
      coveredAmount: 300,
    });
    expect(plan.newInvoiceAmount).toBe(450);
    expect(plan.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 150,
    });
  });

  it("hands back a surplus when more was covered than the table costs", () => {
    // Two participants paid the shared 500; the table is priced 450.
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 500,
    });
    expect(plan.settlement).toEqual({ kind: "overpaid", refundAmount: 50 });
  });

  it("settles nothing when what was covered is exactly the table amount", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 500,
      liveInvoice: invoice(500),
      coveredAmount: 450,
    });
    expect(plan.priceChanged).toBe(true);
    expect(plan.settlement).toEqual({ kind: "none" });
  });

  it("settles nothing on an accepted reservation with nothing covered", () => {
    // A zero-value entitlement: discount took the half to zero, and the
    // discount survives the reprice, so only the difference is on paper.
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: invoice(0, 300),
      coveredAmount: 0,
    });
    expect(plan.newInvoiceAmount).toBe(150);
    expect(plan.settlement).toEqual({ kind: "none" });
  });

  it("keeps the discount and clamps it to the table price", () => {
    const kept = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: invoice(250, 50),
      coveredAmount: 0,
    });
    expect(kept.discountAmount).toBe(50);
    expect(kept.currentInvoiceAmount).toBe(250);
    expect(kept.newInvoiceAmount).toBe(400);

    const clamped = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 600,
      liveInvoice: invoice(0, 600),
      coveredAmount: 0,
    });
    expect(clamped.discountAmount).toBe(450);
    expect(clamped.newInvoiceAmount).toBe(0);
  });

  it("reports an earlier write-off that the reprice does not keep", () => {
    // Admin confirmed a Bs300 cobro with 200 tendered: amount went to 200.
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: invoice(200, 0, 300),
      coveredAmount: 200,
    });
    expect(plan.currentInvoiceAmount).toBe(200);
    expect(plan.writtenOffAmount).toBe(100);
    expect(plan.newInvoiceAmount).toBe(450);
    expect(plan.settlement).toEqual({
      kind: "balance_due",
      outstandingAmount: 250,
    });
  });

  it("bills the table price when the reservation has no invoice", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: null,
      coveredAmount: 0,
    });
    expect(plan.discountAmount).toBe(0);
    expect(plan.currentInvoiceAmount).toBeNull();
    expect(plan.writtenOffAmount).toBe(0);
    expect(plan.newInvoiceAmount).toBe(450);
    expect(plan.settlement).toEqual({ kind: "none" });
  });

  it("settles nothing when the reservation already bills the table price", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 450,
      liveInvoice: invoice(450),
      coveredAmount: 600,
    });
    expect(plan.priceChanged).toBe(false);
    expect(plan.settlement).toEqual({ kind: "none" });
  });

  it("treats a missing price snapshot as a price change", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: null,
      liveInvoice: invoice(450),
      coveredAmount: 0,
    });
    expect(plan.fromPrice).toBeNull();
    expect(plan.priceChanged).toBe(true);
  });

  it("clamps a negative coverage to zero", () => {
    const plan = planFullTableUpgrade({
      tablePrice: 450,
      priceAmountSnapshot: 300,
      liveInvoice: invoice(300),
      coveredAmount: -20,
    });
    expect(plan.coveredAmount).toBe(0);
    expect(plan.settlement).toEqual({ kind: "none" });
  });
});

describe("full-table upgrade expectation", () => {
  const plan = planFullTableUpgrade({
    tablePrice: 450,
    priceAmountSnapshot: 300,
    liveInvoice: invoice(300),
    coveredAmount: 300,
  });

  it("summarizes every settlement kind with its amount", () => {
    expect(summarizeFullTableUpgradeSettlement({ kind: "none" })).toEqual({
      kind: "none",
      amount: 0,
    });
    expect(
      summarizeFullTableUpgradeSettlement({
        kind: "balance_due",
        outstandingAmount: 150,
      }),
    ).toEqual({ kind: "balance_due", amount: 150 });
    expect(
      summarizeFullTableUpgradeSettlement({
        kind: "overpaid",
        refundAmount: 50,
      }),
    ).toEqual({ kind: "overpaid", amount: 50 });
  });

  it("matches the plan it was built from", () => {
    const expected = fullTableUpgradeExpectation(plan);
    expect(expected).toEqual({
      tablePrice: 450,
      settlementKind: "balance_due",
      settlementAmount: 150,
    });
    expect(fullTableUpgradeMatchesExpectation(plan, expected)).toBe(true);
  });

  it("refuses a plan whose price, kind or amount moved", () => {
    const expected = fullTableUpgradeExpectation(plan);
    expect(
      fullTableUpgradeMatchesExpectation(plan, {
        ...expected,
        tablePrice: 500,
      }),
    ).toBe(false);
    expect(
      fullTableUpgradeMatchesExpectation(plan, {
        ...expected,
        settlementKind: "none",
      }),
    ).toBe(false);
    expect(
      fullTableUpgradeMatchesExpectation(plan, {
        ...expected,
        settlementAmount: 100,
      }),
    ).toBe(false);
  });
});

describe("full-table upgrade success message", () => {
  it("names the balance or the credits, formatted like other cobro messages", () => {
    expect(fullTableUpgradeSuccessMessage({ kind: "none", amount: 0 })).toBe(
      "La reserva ahora ocupa la mesa completa.",
    );
    expect(
      fullTableUpgradeSuccessMessage({ kind: "balance_due", amount: 150 }),
    ).toBe(
      "La reserva ahora ocupa la mesa completa. Quedó un saldo pendiente de Bs150.",
    );
    expect(
      fullTableUpgradeSuccessMessage({ kind: "overpaid", amount: 50.5 }),
    ).toBe(
      "La reserva ahora ocupa la mesa completa. Se devolvieron Bs50.5 en créditos.",
    );
  });
});
