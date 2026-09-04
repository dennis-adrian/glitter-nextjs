import { describe, expect, it } from "vitest";

import {
  canFundInvoiceCreditAllocation,
  calculateCreditBalances,
  exactCreditShortfall,
  invoiceCreditPlan,
} from "@/app/lib/credits/balances";

describe("credit balances", () => {
  it("keeps provisional issuance spendable, and reports how much it is", () => {
    // Credits are usable from the moment their voucher is submitted; what is
    // still under review is reported, never withheld.
    expect(
      calculateCreditBalances({
        ledgerBalance: 40,
        activeHolds: 0,
        underReviewIssuance: 40,
      }),
    ).toMatchObject({
      spendableBalance: 40,
      underReviewIssuance: 40,
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
    });
  });

  it("allows debt after a provisional spend is reversed", () => {
    expect(
      calculateCreditBalances({
        ledgerBalance: -15,
        activeHolds: 0,
        underReviewIssuance: 0,
      }),
    ).toMatchObject({ spendableBalance: -15 });
  });

  it("requires a top-up to first cover debt", () => {
    expect(exactCreditShortfall(10, -15)).toBe(25);
    expect(exactCreditShortfall(10, 7.5)).toBe(2.5);
    expect(exactCreditShortfall(10, 12)).toBe(0);
  });

  it("lets provisional credit fund an invoice, but never held or owed credit", () => {
    // Under review is spendable...
    expect(
      canFundInvoiceCreditAllocation(
        calculateCreditBalances({
          ledgerBalance: 100,
          activeHolds: 0,
          underReviewIssuance: 100,
        }),
        100,
      ),
    ).toBe(true);
    // ...debt is not, whatever else the account holds.
    expect(
      canFundInvoiceCreditAllocation(
        calculateCreditBalances({
          ledgerBalance: -1,
          activeHolds: 0,
          underReviewIssuance: 0,
        }),
        1,
      ),
    ).toBe(false);
    // ...and credit already earmarked for a feature stays earmarked.
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

  it("buys only the remainder the balance cannot cover", () => {
    expect(invoiceCreditPlan(balances(40), 150)).toMatchObject({
      applicableAmount: 40,
      shortfallAmount: 110,
    });
  });

  it("applies provisional credit to the invoice like any other", () => {
    expect(invoiceCreditPlan(balances(150, 0, 150), 150)).toMatchObject({
      applicableAmount: 150,
      shortfallAmount: 0,
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
