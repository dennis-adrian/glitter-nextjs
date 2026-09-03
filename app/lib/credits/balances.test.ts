import { describe, expect, it } from "vitest";

import {
  canFundInvoiceCreditAllocation,
  calculateCreditBalances,
  exactCreditShortfall,
  invoiceCreditPlan,
} from "@/app/lib/credits/balances";

describe("credit balances", () => {
  it("keeps provisional issuance spendable for features but ineligible for invoices", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: 40,
        activeHolds: 0,
        underReviewIssuance: 40,
      }),
    ).toMatchObject({
      spendableBalance: 40,
      invoiceEligibleBalance: 0,
    });
  });

  it("subtracts holds without changing ledger balance", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: 50,
        activeHolds: 12.5,
        underReviewIssuance: 0,
      }),
    ).toMatchObject({
      ledgerBalance: 50,
      spendableBalance: 37.5,
      invoiceEligibleBalance: 37.5,
    });
  });

  it("allows debt after a provisional spend is reversed", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: -15,
        activeHolds: 0,
        underReviewIssuance: 0,
      }),
    ).toMatchObject({
      spendableBalance: -15,
      invoiceEligibleBalance: 0,
    });
  });

  it("requires a top-up to first cover debt", () => {
    expect(exactCreditShortfall(10, -15)).toBe(25);
    expect(exactCreditShortfall(10, 7.5)).toBe(2.5);
    expect(exactCreditShortfall(10, 12)).toBe(0);
  });

  it("does not let provisional or held credits fund an invoice", () => {
    expect(
      canFundInvoiceCreditAllocation(
        calculateCreditBalances({
          ledgerBalance: 100,
          activeHolds: 0,
          underReviewIssuance: 100,
        }),
        1,
      ),
    ).toBe(false);
    expect(
      canFundInvoiceCreditAllocation(
        calculateCreditBalances({
          ledgerBalance: 100,
          activeHolds: 30,
          underReviewIssuance: 0,
        }),
        71,
      ),
    ).toBe(false);
    expect(
      canFundInvoiceCreditAllocation(
        calculateCreditBalances({
          ledgerBalance: 100,
          activeHolds: 30,
          underReviewIssuance: 0,
        }),
        70,
      ),
    ).toBe(true);
  });
});

describe("invoiceCreditPlan", () => {
  const balances = (
    ledgerBalance: number,
    activeHolds = 0,
    underReviewIssuance = 0,
  ) =>
    calculateCreditBalances({
      ledgerBalance,
      activeHolds,
      underReviewIssuance,
    });

  it("applies at most the outstanding amount", () => {
    expect(invoiceCreditPlan(balances(200), 150)).toMatchObject({
      applicableAmount: 150,
      shortfallAmount: 0,
      debtAmount: 0,
    });
  });

  it("buys only the remainder confirmed credit cannot cover", () => {
    expect(invoiceCreditPlan(balances(40), 150)).toMatchObject({
      applicableAmount: 40,
      shortfallAmount: 110,
    });
  });

  it("treats provisional credit as unusable for the invoice", () => {
    expect(invoiceCreditPlan(balances(150, 0, 150), 150)).toMatchObject({
      applicableAmount: 0,
      shortfallAmount: 150,
    });
  });

  it("ignores held credit earmarked for a feature", () => {
    expect(invoiceCreditPlan(balances(150, 50), 150)).toMatchObject({
      applicableAmount: 100,
      shortfallAmount: 50,
    });
  });

  it("blocks application and adds debt to the shortfall", () => {
    expect(invoiceCreditPlan(balances(-25), 150)).toMatchObject({
      applicableAmount: 0,
      shortfallAmount: 175,
      debtAmount: 25,
    });
  });
});
